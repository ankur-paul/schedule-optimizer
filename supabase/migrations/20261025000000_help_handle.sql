-- Help pages (T32): /help/<page> has the shape of a public link (/<handle>/<id>), so `help` joins the reserved
-- handles. handle_problem backs the check constraint on institutes.handle, which doesn't recheck existing rows when
-- the function changes, so refuse here if an institute already holds it.

do $$
begin
  if exists (select 1 from public.institutes where handle = 'help') then
    raise exception 'An institute already has the handle "help", which /help now needs. Change that institute''s handle, then run this migration again.';
  end if;
end;
$$;

create or replace function private.handle_problem(handle text) returns text
language sql immutable set search_path = '' as $$
  select case
    when handle is null or handle !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
      then 'Use 3–30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.'
    when handle in ('assets', 'privacy', 'terms', 'api', 'published', 'admin', 'login', 'static', 'www', 'help')
      then 'That handle is reserved.'
  end;
$$;
