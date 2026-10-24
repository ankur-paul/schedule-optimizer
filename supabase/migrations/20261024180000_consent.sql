-- Consent to the Terms and Privacy Policy (T24).
--
-- Every acceptance is kept as a row, one per user and policy version. The browser records one only through
-- record_consent, which sets the user and time itself. Bumping the policy = a migration that adds a
-- policy_versions row, plus POLICY_VERSION and POLICY_CHANGES in web/src/legal/policy.ts.
-- Plan and reasons: docs/discussions/2026-10-24-privacy-and-consent.md (Q1, Q6).

create table public.policy_versions (
  version int primary key check (version > 0),
  published_at timestamptz not null default now()
);

create table public.consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  version int not null references public.policy_versions (version),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.policy_versions enable row level security;
alter table public.consents enable row level security;

-- Only reads are granted; rows come from migrations (policy_versions) and record_consent (consents).
revoke all on public.policy_versions, public.consents from anon, authenticated;
grant select on public.policy_versions to anon, authenticated;
grant select on public.consents to authenticated;

create policy "Anyone reads the policy versions" on public.policy_versions
for select to anon, authenticated using (true);

create policy "Users read their own consents" on public.consents
for select to authenticated using (user_id = (select auth.uid()));

insert into public.policy_versions (version, published_at) values (1, '2026-10-24');

-- Records that the caller accepted `version`. Accepting the same version again keeps the first time.
create function public.record_consent(version int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.policy_versions p where p.version = record_consent.version) then
    raise exception 'That policy version does not exist.' using errcode = '22023';
  end if;
  insert into public.consents (user_id, version) values (auth.uid(), record_consent.version)
  on conflict do nothing;
end;
$$;

revoke execute on function public.record_consent(int) from public, anon, authenticated;
grant execute on function public.record_consent(int) to authenticated;
