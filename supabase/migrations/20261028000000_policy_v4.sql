-- Privacy Policy and Terms v4 (T49): the policy now says where the deployed app runs (our server on AWS in Mumbai),
-- names Cloudflare and Resend, and lists the 14-day request logs. Ships with POLICY_VERSION 4 in
-- web/src/legal/policy.ts. Every save needs the newest version, so every signed-in user accepts v4 again.

insert into public.policy_versions (version, published_at) values (4, '2026-10-25');
