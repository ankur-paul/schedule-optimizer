-- The newest migration applied to this database (T50). The deploy calls it with the anon key and stops when
-- production is behind supabase/migrations (scripts/smoke.sh migrations); the keep-alive calls it so the free
-- project never pauses. It reveals only a timestamp, e.g. '20261029000000'.

create function public.schema_version() returns text
language sql stable security definer set search_path = '' as $$
  select max(version) from supabase_migrations.schema_migrations;
$$;

revoke execute on function public.schema_version() from public, anon, authenticated;
grant execute on function public.schema_version() to anon, authenticated;
