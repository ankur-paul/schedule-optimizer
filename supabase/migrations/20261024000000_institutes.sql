-- Institutes, memberships, invites and profiles (T20).
--
-- Row-level security is the only place roles are enforced; the browser just hides buttons. Reads go through the
-- policies below. Writes other than renaming an institute and adding or removing its invites go through the
-- security definer functions at the end, so `memberships` and `profiles` have no write policies or grants.
-- Plan and reasons: docs/discussions/2026-10-22-auth-and-roles.md.

-- Helpers live in `private`, which the Data API doesn't expose, so they can't be called as RPCs.
create schema if not exists private;
grant usage on schema private to authenticated;

create type public.member_role as enum ('admin', 'editor', 'viewer');

-- ── Tables ──────────────────────────────────────────────────────────────────────────────────────────────

create table public.institutes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  institute_id uuid not null references public.institutes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  primary key (institute_id, user_id)
);

-- Exactly one admin per institute: at most one here, and the functions never remove the last one.
create unique index memberships_one_admin on public.memberships (institute_id) where role = 'admin';
create index memberships_user_id on public.memberships (user_id);

create table public.invites (
  institute_id uuid not null references public.institutes (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role public.member_role not null check (role <> 'admin'),
  created_at timestamptz not null default now(),
  primary key (institute_id, email)
);

create index invites_email on public.invites (email);

-- Names and emails of users, since the browser can't read auth.users. Filled by a trigger on auth.users.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text
);

alter table public.institutes enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.profiles enable row level security;

-- Supabase grants everything on new public tables to anon and authenticated; take it back and grant only what
-- the policies below are for. service_role keeps its grants and bypasses RLS.
revoke all on public.institutes, public.memberships, public.invites, public.profiles from anon, authenticated;
grant select on public.institutes, public.memberships, public.invites, public.profiles to authenticated;
grant update (name) on public.institutes to authenticated;
grant insert (institute_id, email, role), delete on public.invites to authenticated;

-- Invites store the email lower-cased and trimmed, so they match the sign-in email whatever the admin typed.
create function private.normalize_invite_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$$;

create trigger invites_normalize_email before insert or update of email on public.invites
for each row execute function private.normalize_invite_email();

-- ── Profiles from auth.users ────────────────────────────────────────────────────────────────────────────

create function private.sync_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (user_id) do update set email = excluded.email, name = excluded.name;
  return new;
end;
$$;

create trigger on_auth_user_saved after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.sync_profile();

insert into public.profiles (user_id, email, name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
from auth.users
on conflict (user_id) do nothing;

-- ── Policy helpers ──────────────────────────────────────────────────────────────────────────────────────
-- security definer so they read memberships without its own policies, which would otherwise recurse.

create function private.is_member(target_institute uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.institute_id = target_institute and m.user_id = (select auth.uid())
  );
$$;

create function private.is_admin(target_institute uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.institute_id = target_institute and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

-- The caller may see `target_user`'s profile if target is the admin of an institute the caller is in, or a
-- member of an institute the caller is admin of.
create function private.can_see_profile(target_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships theirs
    join public.memberships mine on mine.institute_id = theirs.institute_id
    where theirs.user_id = target_user
      and mine.user_id = (select auth.uid())
      and (theirs.role = 'admin' or mine.role = 'admin')
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_member(uuid), private.is_admin(uuid), private.can_see_profile(uuid)
  to authenticated;

-- ── Policies ────────────────────────────────────────────────────────────────────────────────────────────

create policy "members read their institutes" on public.institutes
for select to authenticated using (private.is_member(id));

create policy "admin renames the institute" on public.institutes
for update to authenticated using (private.is_admin(id)) with check (private.is_admin(id));

create policy "read own, admin's and (as admin) all memberships" on public.memberships
for select to authenticated using (
  user_id = (select auth.uid())
  or (role = 'admin' and private.is_member(institute_id))
  or private.is_admin(institute_id)
);

create policy "admin reads invites" on public.invites
for select to authenticated using (private.is_admin(institute_id));

create policy "admin adds invites" on public.invites
for insert to authenticated with check (private.is_admin(institute_id));

create policy "admin removes invites" on public.invites
for delete to authenticated using (private.is_admin(institute_id));

create policy "read own and institute-mates' profiles" on public.profiles
for select to authenticated using (
  user_id = (select auth.uid()) or private.can_see_profile(user_id)
);

-- ── Functions (RPCs) ────────────────────────────────────────────────────────────────────────────────────
-- Each checks the caller with auth.uid(). Refusals raise 42501 (the Data API answers 403) with a message the
-- UI can show.

create function public.create_institute(name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
begin
  if caller is null then
    raise exception 'Sign in to create an institute.' using errcode = '42501';
  end if;
  insert into public.institutes (name, created_by)
  values (btrim(create_institute.name), caller)
  returning id into new_id;
  insert into public.memberships (institute_id, user_id, role) values (new_id, caller, 'admin');
  return new_id;
end;
$$;

-- Turns the invites for the caller's confirmed email into memberships and deletes them. Returns the
-- institutes joined; an invite to an institute the caller is already in is deleted without a row.
create function public.accept_invites()
returns table (institute_id uuid, institute_name text, role public.member_role)
language sql security definer set search_path = '' as $$
  with me as (
    select u.id, lower(u.email) as email
    from auth.users u
    where u.id = (select auth.uid()) and u.email is not null and u.email_confirmed_at is not null
  ),
  taken as (
    delete from public.invites i using me where i.email = me.email
    returning i.institute_id, i.role
  ),
  joined as (
    insert into public.memberships (institute_id, user_id, role)
    select t.institute_id, me.id, t.role from taken t cross join me
    on conflict do nothing
    returning memberships.institute_id, memberships.role
  )
  select j.institute_id, inst.name, j.role
  from joined j join public.institutes inst on inst.id = j.institute_id
  order by inst.name;
$$;

create function public.set_member_role(institute_id uuid, user_id uuid, role public.member_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(set_member_role.institute_id) then
    raise exception 'Only the admin can change roles.' using errcode = '42501';
  end if;
  if set_member_role.role = 'admin' then
    raise exception 'Use make_admin to hand over the admin role.' using errcode = '42501';
  end if;
  update public.memberships m set role = set_member_role.role
  where m.institute_id = set_member_role.institute_id
    and m.user_id = set_member_role.user_id
    and m.role <> 'admin';
  if not found then
    raise exception 'That user is not a member, or is the admin.' using errcode = '42501';
  end if;
end;
$$;

-- Hands the admin role to another member; the caller becomes an editor.
create function public.make_admin(institute_id uuid, user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(make_admin.institute_id) then
    raise exception 'Only the admin can hand over the admin role.' using errcode = '42501';
  end if;
  if make_admin.user_id = auth.uid() or not exists (
    select 1 from public.memberships m
    where m.institute_id = make_admin.institute_id and m.user_id = make_admin.user_id
  ) then
    raise exception 'The new admin must be another member of the institute.' using errcode = '42501';
  end if;
  -- Demote first: the one-admin index allows a single admin row at any moment.
  update public.memberships m set role = 'editor'
  where m.institute_id = make_admin.institute_id and m.user_id = auth.uid();
  update public.memberships m set role = 'admin'
  where m.institute_id = make_admin.institute_id and m.user_id = make_admin.user_id;
end;
$$;

create function public.remove_member(institute_id uuid, user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(remove_member.institute_id) then
    raise exception 'Only the admin can remove members.' using errcode = '42501';
  end if;
  delete from public.memberships m
  where m.institute_id = remove_member.institute_id
    and m.user_id = remove_member.user_id
    and m.role <> 'admin';
  if not found then
    raise exception 'That user is not a member, or is the admin.' using errcode = '42501';
  end if;
end;
$$;

create function public.leave_institute(institute_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_admin(leave_institute.institute_id) then
    raise exception 'Hand the admin role to another member before leaving.' using errcode = '42501';
  end if;
  delete from public.memberships m
  where m.institute_id = leave_institute.institute_id and m.user_id = auth.uid();
  if not found then
    raise exception 'You are not a member of that institute.' using errcode = '42501';
  end if;
end;
$$;

-- Memberships and invites go with it (on delete cascade).
create function public.delete_institute(institute_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(delete_institute.institute_id) then
    raise exception 'Only the admin can delete the institute.' using errcode = '42501';
  end if;
  delete from public.institutes i where i.id = delete_institute.institute_id;
end;
$$;

-- Public tables with RLS off. The guard test calls it with the service key and expects no rows.
create function public.tables_without_rls() returns setof text
language sql stable set search_path = '' as $$
  select c.relname::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  order by 1;
$$;

revoke execute on function
  public.create_institute(text),
  public.accept_invites(),
  public.set_member_role(uuid, uuid, public.member_role),
  public.make_admin(uuid, uuid),
  public.remove_member(uuid, uuid),
  public.leave_institute(uuid),
  public.delete_institute(uuid),
  public.tables_without_rls()
from public, anon, authenticated;

grant execute on function
  public.create_institute(text),
  public.accept_invites(),
  public.set_member_role(uuid, uuid, public.member_role),
  public.make_admin(uuid, uuid),
  public.remove_member(uuid, uuid),
  public.leave_institute(uuid),
  public.delete_institute(uuid)
to authenticated;

grant execute on function public.tables_without_rls() to service_role;
