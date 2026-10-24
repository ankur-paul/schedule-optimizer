-- Assistant access (T36): trial coupons, each institute's allowance, and one usage row per model call.
--
-- The browser writes nothing here directly. The admin redeems a coupon through redeem_coupon. The /agent server
-- (T38) confirms the user with Supabase Auth, then checks each model call with agent_begin and records it with
-- agent_record; only the service role may run those two, so a browser can't skip the checks or fake usage. The text
-- of questions and answers is never stored.
-- Plan and reasons: docs/discussions/2026-10-24-ai-agent.md (Access by coupon, How it's built, Q11/Q32).

-- ── Tables ──────────────────────────────────────────────────────────────────────────────────────────────

-- Only the SHA-256 of the normalised code is kept (private.coupon_hash; server/coupons.py must match it).
create table public.agent_coupons (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  questions int not null check (questions > 0),
  days int not null check (days > 0),
  note text,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  institute_id uuid references public.institutes (id) on delete set null
);

create table public.agent_access (
  institute_id uuid primary key references public.institutes (id) on delete cascade,
  questions_left int not null check (questions_left >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Wrong coupon tries, for the limit of 10 per user per hour. redeem_coupon drops the caller's older rows.
create table public.agent_redeem_failures (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);

create index agent_redeem_failures_user_at on public.agent_redeem_failures (user_id, at);

-- One row per question, created by its first call. calls counts turns, the first included.
create table public.agent_questions (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  calls int not null default 1 check (calls between 1 and 9),
  compactions int not null default 0 check (compactions between 0 and 1)
);

create table public.agent_usage (
  id bigint generated always as identity primary key,
  question_id uuid references public.agent_questions (id) on delete set null,
  institute_id uuid not null references public.institutes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('turn', 'compact')),
  model text not null,
  input_tokens int not null check (input_tokens >= 0),
  output_tokens int not null check (output_tokens >= 0),
  cache_read_tokens int not null check (cache_read_tokens >= 0),
  cache_write_tokens int not null check (cache_write_tokens >= 0),
  cost_cents numeric(10, 4) not null check (cost_cents >= 0)
);

create index agent_usage_at on public.agent_usage (at);

alter table public.agent_coupons enable row level security;
alter table public.agent_access enable row level security;
alter table public.agent_redeem_failures enable row level security;
alter table public.agent_questions enable row level security;
alter table public.agent_usage enable row level security;

-- Members read their institute's allowance, which the panel shows before the first question. The rest is for the
-- service role, which bypasses RLS.
revoke all on
  public.agent_coupons,
  public.agent_access,
  public.agent_redeem_failures,
  public.agent_questions,
  public.agent_usage
from anon, authenticated;
grant select on public.agent_access to authenticated;

create policy "members read their institute's assistant access" on public.agent_access
for select to authenticated using (private.is_member(institute_id));

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────
-- is_member and has_current_consent read auth.uid(), which is empty when the server calls with the service role;
-- these take the user instead.

create function private.is_member_user(target_institute uuid, target_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.institute_id = target_institute and m.user_id = target_user
  );
$$;

create function private.has_current_consent_for(target_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consents c
    where c.user_id = target_user
      and c.version = (select max(p.version) from public.policy_versions p)
  );
$$;

-- Upper-case, drop spaces and dashes, drop the LTC prefix (the code itself has no L), then SHA-256 as hex.
create function private.coupon_hash(code text) returns text
language sql immutable set search_path = '' as $$
  select encode(
    sha256(convert_to(regexp_replace(regexp_replace(upper(code), '[[:space:]-]', '', 'g'), '^LTC', ''), 'UTF8')),
    'hex'
  );
$$;

revoke execute on function
  private.is_member_user(uuid, uuid),
  private.has_current_consent_for(uuid),
  private.coupon_hash(text)
from public, anon, authenticated;

-- ── Functions (RPCs) ────────────────────────────────────────────────────────────────────────────────────
-- Refusals raise 42501 (the Data API answers 403) with a message the UI shows and a hint the UI and the /agent
-- server branch on.

-- Unlocks the assistant for the caller's institute. A wrong or used code can't raise, since that would roll back
-- the failure row the try limit counts: it returns no rows, and the UI says "That coupon isn't valid."
create function public.redeem_coupon(institute_id uuid, code text)
returns table (questions_left int, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  coupon public.agent_coupons;
begin
  if not private.is_admin(redeem_coupon.institute_id) then
    raise exception 'Only the admin can redeem a coupon.' using errcode = '42501', hint = 'not_admin';
  end if;
  perform private.require_consent();

  delete from public.agent_redeem_failures f
  where f.user_id = (select auth.uid()) and f.at <= now() - interval '1 hour';
  if (select count(*) from public.agent_redeem_failures f where f.user_id = (select auth.uid())) >= 10 then
    raise exception 'Too many tries, wait an hour.' using errcode = '42501', hint = 'too_many_tries';
  end if;

  update public.agent_coupons c
  set redeemed_at = now(), redeemed_by = (select auth.uid()), institute_id = redeem_coupon.institute_id
  where c.code_hash = private.coupon_hash(redeem_coupon.code) and c.redeemed_at is null
  returning * into coupon;
  if not found then
    insert into public.agent_redeem_failures (user_id) values ((select auth.uid()));
    return;
  end if;

  -- Still current: add the questions and keep the later expiry. Expired: the old questions are gone.
  return query
  insert into public.agent_access as a (institute_id, questions_left, expires_at)
  values (redeem_coupon.institute_id, coupon.questions, now() + make_interval(days => coupon.days))
  on conflict on constraint agent_access_pkey do update set
    questions_left = case when a.expires_at > now() then a.questions_left + excluded.questions_left
                          else excluded.questions_left end,
    expires_at = greatest(a.expires_at, excluded.expires_at),
    updated_at = now()
  returning a.questions_left, a.expires_at;
end;
$$;

create type public.agent_call as (question_id uuid, call_number int, questions_left int, expires_at timestamptz);

-- Checks one model call for `user_id` (confirmed by the server) and counts it. A null question_id starts a new
-- question, which uses one of the institute's questions; call_number is that question's turn count.
create function public.agent_begin(
  user_id uuid, institute_id uuid, question_id uuid, kind text, budget_cents numeric
) returns public.agent_call
language plpgsql security definer set search_path = '' as $$
declare
  access public.agent_access;
  q public.agent_questions;
begin
  if agent_begin.kind is null or agent_begin.kind not in ('turn', 'compact') then
    raise exception 'kind must be turn or compact.' using errcode = '22023';
  end if;
  if agent_begin.question_id is null and agent_begin.kind = 'compact' then
    raise exception 'A compaction continues a question.' using errcode = '22023';
  end if;
  if agent_begin.budget_cents is null then
    raise exception 'budget_cents is required.' using errcode = '22023';
  end if;

  if not private.is_member_user(agent_begin.institute_id, agent_begin.user_id) then
    raise exception 'You''re not a member of this institute.' using errcode = '42501', hint = 'not_member';
  end if;
  if not private.has_current_consent_for(agent_begin.user_id) then
    raise exception 'Accept the current Terms first.' using errcode = '42501', hint = 'consent_required';
  end if;

  -- Locked, so two new questions at once can't both take the last one.
  select * into access from public.agent_access a where a.institute_id = agent_begin.institute_id for update;
  if not found then
    raise exception 'The assistant isn''t unlocked for this institute. The admin can redeem a trial coupon.'
      using errcode = '42501', hint = 'no_access';
  end if;
  if access.expires_at <= now() then
    raise exception 'The assistant''s access has expired. The admin can redeem a new coupon.'
      using errcode = '42501', hint = 'expired';
  end if;

  if (select coalesce(sum(u.cost_cents), 0) from public.agent_usage u
      where u.at >= date_trunc('month', now(), 'UTC')) >= agent_begin.budget_cents then
    raise exception 'The assistant is paused until next month.' using errcode = '42501', hint = 'paused';
  end if;

  if agent_begin.question_id is null then
    if access.questions_left <= 0 then
      raise exception 'This institute has used all its questions. The admin can redeem a new coupon.'
        using errcode = '42501', hint = 'used_up';
    end if;
    update public.agent_access a set questions_left = a.questions_left - 1, updated_at = now()
    where a.institute_id = access.institute_id
    returning * into access;
    insert into public.agent_questions (institute_id, user_id)
    values (agent_begin.institute_id, agent_begin.user_id)
    returning * into q;
  else
    select * into q from public.agent_questions aq where aq.id = agent_begin.question_id for update;
    if not found or q.user_id is distinct from agent_begin.user_id or q.institute_id <> agent_begin.institute_id then
      raise exception 'That question can''t be continued. Ask a new one.'
        using errcode = '42501', hint = 'unknown_question';
    end if;
    if q.started_at <= now() - interval '15 minutes' then
      raise exception 'This question has run for 15 minutes. Ask a new one.'
        using errcode = '42501', hint = 'question_closed';
    end if;
    if q.calls >= 9 then
      raise exception 'This question has used all its steps. Ask a new one.'
        using errcode = '42501', hint = 'too_many_calls';
    end if;
    if agent_begin.kind = 'compact' and q.compactions >= 1 then
      raise exception 'This chat has already been shortened once. Start a new chat.'
        using errcode = '42501', hint = 'too_many_compactions';
    end if;
    update public.agent_questions aq set
      calls = aq.calls + (agent_begin.kind = 'turn')::int,
      compactions = aq.compactions + (agent_begin.kind = 'compact')::int
    where aq.id = q.id
    returning * into q;
  end if;

  return (q.id, q.calls, access.questions_left, access.expires_at)::public.agent_call;
end;
$$;

-- Writes the usage row for one model call; the institute and user come from the question.
create function public.agent_record(
  question_id uuid,
  kind text,
  model text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  cache_write_tokens int,
  cost_cents numeric
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.agent_usage (
    question_id, institute_id, user_id, kind, model,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_cents
  )
  select q.id, q.institute_id, q.user_id, agent_record.kind, agent_record.model,
    agent_record.input_tokens, agent_record.output_tokens, agent_record.cache_read_tokens,
    agent_record.cache_write_tokens, agent_record.cost_cents
  from public.agent_questions q where q.id = agent_record.question_id;
  if not found then
    raise exception 'That question does not exist.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function
  public.redeem_coupon(uuid, text),
  public.agent_begin(uuid, uuid, uuid, text, numeric),
  public.agent_record(uuid, text, text, int, int, int, int, numeric)
from public, anon, authenticated;

grant execute on function public.redeem_coupon(uuid, text) to authenticated;
grant execute on function
  public.agent_begin(uuid, uuid, uuid, text, numeric),
  public.agent_record(uuid, text, text, int, int, int, int, numeric)
to service_role;
