# T39 — Privacy policy and Terms v3
**Status:** BLOCKED (needs human: approve drafts)
**Lane:** D · **Prereqs:** T36 · **Branch:** t39-policy-v3

## Goal
The policy describes the assistant, Anthropic's part in it and the coupon and usage records. Every signed-in user
accepts it again before the panel (T40) can send anything. Plan, Privacy and Q13:
[`docs/discussions/2026-10-24-ai-agent.md`](../docs/discussions/2026-10-24-ai-agent.md).

## Scope / files
- `web/src/legal/privacy.md`, `web/src/legal/terms.md`, `web/src/legal/policy.ts` (`POLICY_VERSION` 3,
  `POLICY_EFFECTIVE_DATE`, `POLICY_CHANGES[3]`).
- A migration adding `policy_versions` row 3.
- Drafts first in `docs/policy-v3/privacy.md` and `docs/policy-v3/terms.md`, as in T31.

## Details
- **Claude drafts, the user approves before anything is committed** to `web/src/legal/`. Set
  `BLOCKED (needs human: approve drafts)` while waiting. Write the drafts with `/no-ai-slop`.
- **Privacy policy:**
  - The assistant is optional and only for institutes with access.
  - What goes to Anthropic (a US company, processing in the US): the user's questions with teacher names replaced
    by codes, and the timetable details the assistant looks up. Section, room and course names are sent as they are.
  - That we don't store chats; they stay in the browser tab.
  - How long Anthropic keeps API data, and that it doesn't train on it. Check Anthropic's current commercial terms
    and data retention page while drafting, and cite what you read in the ticket.
  - **The usage records:** time, user, institute, token counts and cost, never text. Say how long they are kept,
    and that the user ID is removed when an account is deleted.
  - **Coupon records:** which institute redeemed a coupon, who, and when.
  - The `mailto:` request goes to the operator's inbox like any email.
- **Terms:** the assistant can be wrong, so check its answers. Coupons are a free trial, can be withdrawn, and have
  no cash value. Don't paste other people's personal details into questions.
- **`POLICY_CHANGES[3]`:** two or three short lines for the re-accept dialog, e.g. "The optional assistant sends
  your questions and the timetable details it looks up to Anthropic in the US. Teachers' names are replaced by codes
  first, and we don't store your chats."
- **Ship together:** the app and the database must agree on the version, so the migration and `policy.ts` go in one
  commit and the migration is pushed before the web change is used (as in T31).
- **The help:** `/help/troubleshooting#consent` describes the re-accept dialog. Check that it still matches.

## Drafting notes (25 Oct 2026)
- **Drafts:** [`docs/policy-v3/privacy.md`](../docs/policy-v3/privacy.md) and
  [`docs/policy-v3/terms.md`](../docs/policy-v3/terms.md), from v2 with the assistant added.
- **Read while drafting:**
  - [How long do you store my organization's data?](https://privacy.claude.com/en/articles/7996866-how-long-does-anthropic-store-my-organizations-data)
    (updated 1 Jul 2026): API inputs and outputs deleted within 30 days; flagged Usage Policy violations kept up to
    2 years (classifier scores up to 7); longer where the law requires.
  - [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (effective 17 Jun 2025), section B:
    "Anthropic may not train models on Customer Content from Services."
  - [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention): prompt
    caching stores no prompts or outputs, only KV cache and hashes in memory for the cache lifetime; retained data
    is never used for training without permission.
  - [Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency): workspace geo (storage at
    rest) is US only. **Inference defaults to `global`**, which may run in any geography; `inference_geo: "us"` keeps
    it in the US at 1.1× the price.
- **Found while drafting:** T37's `maskText` catches only a teacher's full name or ID, so the policy says a surname
  alone or a misspelling goes through. The usage, question and coupon rows have no deletion job: they stay until
  the institute is deleted, with user IDs set to null on account deletion.
- **Proposed `POLICY_CHANGES[3]`:**
  - "The optional assistant sends your questions and the timetable details it looks up to Anthropic in the US.
    Teachers' names are replaced by codes first, and we don't store your chats."
  - "We record how many questions each institute asks and what they cost, never the text, and who redeemed each
    trial coupon."
  - "The assistant can be wrong, so check its answers. Trial coupons are free and can be withdrawn."

## Tests
- The existing `legalText` and consent tests pass with version 3.
- Click through: a signed-in user sees the re-accept dialog with the v3 lines; *Accept* records it; saving online
  still works after; `agent_begin` (T36) refuses a user who has accepted only v2.

## Done when
- [ ] Drafts approved by the user
- [ ] Migration applied; `POLICY_VERSION` 3 in the app; re-accept works
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] PROGRESS.md line; FEATURES.md updated (policy v3)
- [ ] Committed: `T39: privacy policy and terms v3`
