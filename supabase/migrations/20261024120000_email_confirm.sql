-- Make admin and Leave institute need a recent email confirmation (T26).
--
-- "Recent" means the caller's token records an email-link sign-in (`amr` method otp or magiclink) from the last
-- 10 minutes. A token refresh keeps the original sign-in time, so an old session can't pass by refreshing. The
-- browser sends the link with signInWithOtp; a 6-digit code can replace the link once we have our own sender.

create function private.email_confirmed_recently() returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) as entry
    where entry ->> 'method' in ('otp', 'magiclink')
      and (entry ->> 'timestamp') ~ '^\d+$'
      and (entry ->> 'timestamp')::bigint >= extract(epoch from now() - interval '10 minutes')
  );
$$;

revoke execute on function private.email_confirmed_recently() from public, anon;
grant execute on function private.email_confirmed_recently() to authenticated;

-- Same as T20's, plus the email check once the role and target are known to be right.
create or replace function public.make_admin(institute_id uuid, user_id uuid) returns void
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
  if not private.email_confirmed_recently() then
    raise exception 'Confirm from your email first.' using errcode = '42501', hint = 'email_confirmation_required';
  end if;
  -- Demote first: the one-admin index allows a single admin row at any moment.
  update public.memberships m set role = 'editor'
  where m.institute_id = make_admin.institute_id and m.user_id = auth.uid();
  update public.memberships m set role = 'admin'
  where m.institute_id = make_admin.institute_id and m.user_id = make_admin.user_id;
end;
$$;

create or replace function public.leave_institute(institute_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_admin(leave_institute.institute_id) then
    raise exception 'Hand the admin role to another member before leaving.' using errcode = '42501';
  end if;
  if not private.is_member(leave_institute.institute_id) then
    raise exception 'You are not a member of that institute.' using errcode = '42501';
  end if;
  if not private.email_confirmed_recently() then
    raise exception 'Confirm from your email first.' using errcode = '42501', hint = 'email_confirmation_required';
  end if;
  delete from public.memberships m
  where m.institute_id = leave_institute.institute_id and m.user_id = auth.uid();
end;
$$;
