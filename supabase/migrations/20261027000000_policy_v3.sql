-- Privacy Policy and Terms v3 (T39): they now cover the assistant, what it sends to Anthropic, and the usage and
-- coupon records. Ships with POLICY_VERSION 3 in web/src/legal/policy.ts. agent_begin and every save need the newest
-- version, so every signed-in user accepts v3 before the assistant can send anything.

insert into public.policy_versions (version, published_at) values (3, '2026-10-25');
