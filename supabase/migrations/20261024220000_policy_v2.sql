-- Privacy Policy and Terms v2 (T31): they now cover saving timetables online and publishing them. Ships with
-- POLICY_VERSION 2 in web/src/legal/policy.ts. Saving and publishing need the newest version (T27's check), so
-- every signed-in user accepts v2 before they can save again.

insert into public.policy_versions (version, published_at) values (2, '2026-10-24');
