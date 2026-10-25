# T49 — Privacy policy and Terms v4
**Status:** TODO
**Lane:** D · **Prereqs:** — · **Branch:** t49-policy-v4

## Goal
The policy describes where the deployed app runs and who handles what: our server on AWS in Mumbai, Cloudflare
serving the site, Resend sending sign-in emails, and 14-day technical logs. Every signed-in user accepts it again.
Plan, *Privacy policy v4* and Q15:
[`docs/discussions/2026-10-25-deploy.md`](../docs/discussions/2026-10-25-deploy.md).

## Scope / files
- Drafts first in `docs/policy-v4/privacy.md` and `docs/policy-v4/terms.md`, as in T31 and T39.
- `web/src/legal/privacy.md`, `web/src/legal/terms.md` (if anything changes), `web/src/legal/policy.ts`
  (`POLICY_VERSION` 4, `POLICY_EFFECTIVE_DATE`, `POLICY_CHANGES[4]`).
- A migration adding `policy_versions` row 4.

## Details
- **Claude drafts, the user approves before anything is committed** to `web/src/legal/`. Set
  `BLOCKED (needs human: approve drafts)` while waiting. Write the drafts with `/no-ai-slop`.
- **Where your data is kept** gains:
  - **Our server** runs on Amazon Web Services in Mumbai, India. It receives timetable data for the solver (teachers
    as codes) and chats for the assistant, keeps neither, and writes technical logs (time, address called, result,
    duration; no timetable data, no IP address) kept for 14 days.
  - **Cloudflare** serves the website and sees visitors' IP addresses and requests, as any host does. Link its
    privacy policy and data processing terms. It also forwards mail sent to the contact address.
  - **Resend**, a US company, sends the sign-in and invite emails, so it receives the recipient's email address.
    Link its privacy policy and DPA. Check both companies' current pages while drafting and cite what you read here.
- **Retention list:** add the 14-day logs.
- **Contact:** `privacy@uselattice.app` comes from `VITE_CONTACT_EMAIL` (T51 sets it); the text doesn't hard-code it.
- **`POLICY_CHANGES[4]`:** two or three short lines, e.g. "Lattice now runs online: our server is on Amazon Web
  Services in Mumbai, Cloudflare serves the site, and Resend (a US company) sends sign-in emails."
- **Ship together:** the migration and `policy.ts` in one commit; the migration reaches each database before the web
  change is used there (dev now; production gets every migration in T51).
- **The help:** `/help/troubleshooting#consent` still matches the re-accept dialog; check it.

## Tests
- `legalText.test.ts` and the consent tests pass with version 4.
- `test_rls_consent.py` (or its equivalent): a user who accepted only v3 is refused a save; v4 passes.
- Click through: a user who accepted v3 sees the re-accept dialog with the v4 lines, accepts, and can save.

## Done when
- [ ] Drafts approved by the user
- [ ] Policy, terms, `policy.ts` and the migration committed together; the migration pushed to dev
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] FEATURES.md (if the privacy bullet names the providers), PROGRESS.md line
- [ ] Committed: `T49: policy v4`
