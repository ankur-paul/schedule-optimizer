-- Online timetables, their versions, the live-version pointer and the institute handle (T27).
--
-- A version is the working copy as one JSONB document. Members read timetables and versions; every write goes
-- through the security definer functions below, which check the role and that the caller accepted the current
-- policy version. Editors and the admin write; delete and the handle are admin only. The public page reads a
-- published timetable through get_published, the one function anon may call.
-- Plan and reasons: docs/discussions/2026-10-24-online-data.md.

-- ── Institute handle ────────────────────────────────────────────────────────────────────────────────────
-- The institute's part of a public link (/gndec/k7f3q9xa2m). Only set_institute_handle writes it: the rename
-- grant on institutes covers `name` alone.

create function private.handle_problem(handle text) returns text
language sql immutable set search_path = '' as $$
  select case
    when handle is null or handle !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
      then 'Use 3–30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.'
    when handle in ('assets', 'privacy', 'terms', 'api', 'published', 'admin', 'login', 'static', 'www')
      then 'That handle is reserved.'
  end;
$$;

alter table public.institutes add column handle text unique
  check (handle is null or private.handle_problem(handle) is null);

-- ── Tables ──────────────────────────────────────────────────────────────────────────────────────────────

-- 10 random characters from a–z0–9. Bytes of 252 and up are skipped so every character is equally likely.
-- 36^10 ids make a clash so unlikely that create_timetable doesn't retry.
create function private.new_public_id() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  bytes bytea;
  b int;
  id text := '';
begin
  loop
    bytes := extensions.gen_random_bytes(16);
    for i in 0 .. 15 loop
      b := get_byte(bytes, i);
      if b < 252 then
        id := id || substr(alphabet, b % 36 + 1, 1);
        if char_length(id) = 10 then
          return id;
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

create table public.timetables (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references public.institutes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  public_id text not null unique default private.new_public_id() check (public_id ~ '^[a-z0-9]{10}$'),
  latest_version int not null default 0 check (latest_version >= 0),
  live_version int check (live_version between 1 and latest_version),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index timetables_institute_name on public.timetables (institute_id, lower(name));

create table public.timetable_versions (
  timetable_id uuid not null references public.timetables (id) on delete cascade,
  version int not null check (version > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2097152),
  saved_by uuid references auth.users (id) on delete set null,
  saved_at timestamptz not null default now(),
  primary key (timetable_id, version)
);

-- The live version is always a kept one: pruning skips it, and nothing else can delete it.
alter table public.timetables add constraint timetables_live_version_kept
  foreign key (id, live_version) references public.timetable_versions (timetable_id, version);

alter table public.timetables enable row level security;
alter table public.timetable_versions enable row level security;

revoke all on public.timetables, public.timetable_versions from anon, authenticated;
grant select on public.timetables, public.timetable_versions to authenticated;

create policy "members read their timetables" on public.timetables
for select to authenticated using (private.is_member(institute_id));

-- The subquery runs under the timetables policy, so a non-member finds no institute.
create policy "members read their timetables' versions" on public.timetable_versions
for select to authenticated using (
  private.is_member((select t.institute_id from public.timetables t where t.id = timetable_id))
);

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────

create function private.can_edit(target_institute uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.institute_id = target_institute and m.user_id = (select auth.uid()) and m.role in ('admin', 'editor')
  );
$$;

-- The caller accepted the newest policy version (T24), the wording that covers saving and publishing.
create function private.has_current_consent() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consents c
    where c.user_id = (select auth.uid())
      and c.version = (select max(p.version) from public.policy_versions p)
  );
$$;

create function private.require_consent() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not private.has_current_consent() then
    raise exception 'Accept the current Terms first.' using errcode = '42501', hint = 'consent_required';
  end if;
end;
$$;

-- The institute of a timetable the caller may edit, locked for the rest of the transaction; refuses otherwise.
create function private.editable_timetable(target_timetable uuid) returns public.timetables
language plpgsql security definer set search_path = '' as $$
declare
  tt public.timetables;
begin
  select * into tt from public.timetables t where t.id = target_timetable for update;
  if not found or not private.can_edit(tt.institute_id) then
    raise exception 'Only editors and the admin can change online timetables.' using errcode = '42501';
  end if;
  perform private.require_consent();
  return tt;
end;
$$;

revoke execute on function
  private.handle_problem(text),
  private.new_public_id(),
  private.can_edit(uuid),
  private.has_current_consent(),
  private.require_consent(),
  private.editable_timetable(uuid)
from public, anon;

-- The handle check runs on every institute update, including the admin's direct rename.
grant execute on function private.handle_problem(text) to authenticated;
grant execute on function private.can_edit(uuid), private.has_current_consent() to authenticated;

-- ── Functions (RPCs) ────────────────────────────────────────────────────────────────────────────────────
-- Refusals raise 42501 (the Data API answers 403) with a message the UI can show; a hint marks the ones the UI
-- answers with a prompt (consent_required, handle_required). A name or handle clash raises 23505 (409).

create function private.raise_name_taken() returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'This institute already has a timetable with that name.' using errcode = '23505';
end;
$$;

revoke execute on function private.raise_name_taken() from public, anon;

create function public.create_timetable(institute_id uuid, name text, data jsonb)
returns table (timetable_id uuid, version int)
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  if not private.can_edit(create_timetable.institute_id) then
    raise exception 'Only editors and the admin can save timetables online.' using errcode = '42501';
  end if;
  perform private.require_consent();
  begin
    insert into public.timetables (institute_id, name, latest_version, created_by)
    values (create_timetable.institute_id, btrim(create_timetable.name), 1, auth.uid())
    returning id into new_id;
  exception when unique_violation then
    perform private.raise_name_taken();
  end;
  insert into public.timetable_versions (timetable_id, version, data, saved_by)
  values (new_id, 1, create_timetable.data, auth.uid());
  return query select new_id, 1;
end;
$$;

-- Adds a version on top of `base_version`, the one the caller opened. If someone saved since, raises LT409 with
-- the latest version, who saved it and when as JSON in the detail; retrying with that version as the base
-- overwrites. Keeps the newest 20 versions plus the live one.
create function public.save_timetable(timetable_id uuid, data jsonb, base_version int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  tt public.timetables := private.editable_timetable(save_timetable.timetable_id);
  latest record;
  new_version int := tt.latest_version + 1;
begin
  if tt.latest_version is distinct from save_timetable.base_version then
    select v.version, v.saved_by, coalesce(p.name, p.email) as saved_by_name, v.saved_at into latest
    from public.timetable_versions v left join public.profiles p on p.user_id = v.saved_by
    where v.timetable_id = tt.id and v.version = tt.latest_version;
    raise exception 'Someone saved this timetable since you opened it.' using
      errcode = 'LT409',
      detail = jsonb_build_object(
        'latest_version', latest.version,
        'saved_by', latest.saved_by,
        'saved_by_name', latest.saved_by_name,
        'saved_at', latest.saved_at
      )::text;
  end if;
  insert into public.timetable_versions (timetable_id, version, data, saved_by)
  values (tt.id, new_version, save_timetable.data, auth.uid());
  update public.timetables t set latest_version = new_version where t.id = tt.id;
  delete from public.timetable_versions v
  where v.timetable_id = tt.id
    and v.version <= new_version - 20
    and v.version is distinct from tt.live_version;
  return new_version;
end;
$$;

create function public.rename_timetable(timetable_id uuid, name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tt public.timetables := private.editable_timetable(rename_timetable.timetable_id);
begin
  update public.timetables t set name = btrim(rename_timetable.name) where t.id = tt.id;
exception when unique_violation then
  perform private.raise_name_taken();
end;
$$;

-- Its versions go with it, and its public link stops working.
create function public.delete_timetable(timetable_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin((select t.institute_id from public.timetables t where t.id = delete_timetable.timetable_id)) then
    raise exception 'Only the admin can delete a timetable.' using errcode = '42501';
  end if;
  perform private.require_consent();
  delete from public.timetables t where t.id = delete_timetable.timetable_id;
end;
$$;

-- Points the public link at `version`: Publish passes the latest, Make live any kept one.
create function public.publish_timetable(timetable_id uuid, version int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tt public.timetables := private.editable_timetable(publish_timetable.timetable_id);
  version_data jsonb;
begin
  select v.data into version_data from public.timetable_versions v
  where v.timetable_id = tt.id and v.version = publish_timetable.version;
  if not found then
    raise exception 'That version is no longer kept.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(version_data -> 'result'), 'null') = 'null' then
    raise exception 'Generate the timetable before publishing it.' using errcode = '22023';
  end if;
  if (select i.handle from public.institutes i where i.id = tt.institute_id) is null then
    raise exception 'The institute needs a handle for its links. Ask the admin to set one.'
      using errcode = '42501', hint = 'handle_required';
  end if;
  update public.timetables t set live_version = publish_timetable.version where t.id = tt.id;
end;
$$;

create function public.unpublish_timetable(timetable_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  tt public.timetables := private.editable_timetable(unpublish_timetable.timetable_id);
begin
  update public.timetables t set live_version = null where t.id = tt.id;
end;
$$;

-- Lower-cases and trims. Old links keep working after a change, since the public id finds the timetable.
create function public.set_institute_handle(institute_id uuid, handle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  clean text := lower(btrim(set_institute_handle.handle));
  problem text := private.handle_problem(clean);
begin
  if not private.is_admin(set_institute_handle.institute_id) then
    raise exception 'Only the admin can set the institute''s handle.' using errcode = '42501';
  end if;
  perform private.require_consent();
  if problem is not null then
    raise exception '%', problem using errcode = '22023';
  end if;
  update public.institutes i set handle = clean where i.id = set_institute_handle.institute_id;
exception when unique_violation then
  raise exception 'That handle is taken.' using errcode = '23505';
end;
$$;

-- What the public page shows: nothing unless the timetable is published. Locks stay private.
create function public.get_published(public_id text)
returns table (institute_name text, handle text, timetable_name text, saved_at timestamptz, data jsonb)
language sql stable security definer set search_path = '' as $$
  select i.name, i.handle, t.name, v.saved_at, v.data - 'locks'
  from public.timetables t
  join public.institutes i on i.id = t.institute_id
  join public.timetable_versions v on v.timetable_id = t.id and v.version = t.live_version
  where t.public_id = get_published.public_id;
$$;

revoke execute on function
  public.create_timetable(uuid, text, jsonb),
  public.save_timetable(uuid, jsonb, int),
  public.rename_timetable(uuid, text),
  public.delete_timetable(uuid),
  public.publish_timetable(uuid, int),
  public.unpublish_timetable(uuid),
  public.set_institute_handle(uuid, text),
  public.get_published(text)
from public, anon, authenticated;

grant execute on function
  public.create_timetable(uuid, text, jsonb),
  public.save_timetable(uuid, jsonb, int),
  public.rename_timetable(uuid, text),
  public.delete_timetable(uuid),
  public.publish_timetable(uuid, int),
  public.unpublish_timetable(uuid),
  public.set_institute_handle(uuid, text)
to authenticated;

grant execute on function public.get_published(text) to anon, authenticated;
