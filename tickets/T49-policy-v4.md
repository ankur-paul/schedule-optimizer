# T49 — Privacy policy and Terms v4
**Status:** DONE
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

## Drafting notes (25 Oct 2026)
- **Draft:** [`docs/policy-v4/privacy.md`](../docs/policy-v4/privacy.md), from v3. The terms don't change, so they
  have no draft; they move to v4 with the policy.
- **Read while drafting:**
  - Cloudflare [privacy policy](https://www.cloudflare.com/privacypolicy/) (effective 4 Nov 2025): for traffic
    through its network and for customer logs it is a processor; it sees visitors' IP addresses and traffic data; it
    gives no retention period for them.
  - Cloudflare [data processing addendum](https://www.cloudflare.com/cloudflare-customer-dpa/) (v6.4, effective
    3 Apr 2026): Cloudflare is a processor; it forms part of the Self-Serve Subscription Agreement.
  - Resend [privacy policy](https://resend.com/legal/privacy-policy) (updated 27 Aug 2026): covers resend.com
    visitors only; data may be processed in the US.
  - Resend [data processing addendum](https://resend.com/legal/dpa) (updated 31 Dec 2025): Resend is a processor;
    "primary processing operations take place in the United States"; customer data deleted within 90 days of
    the agreement ending.
  - Resend [pricing](https://resend.com/pricing): the free plan has 30-day data retention for emails and logs.
- **Found while drafting:** Lattice emails no invites (the admin tells the person to sign in), so Resend sends only
  the sign-in link and T26's confirmation link; the draft says so instead of "sign-in and invite emails". Resend
  keeps its email log for 30 days, so the retention list names it. The "replaced by a code" line holds for imported
  teachers only once T46 lands (Q16); T51 needs both, so v4 can't go live before it.
- **Proposed `POLICY_CHANGES[4]`:**
  - "Lattice now runs online: our server is on Amazon Web Services in Mumbai, Cloudflare serves the website, and
    Resend, a US company, sends the sign-in emails."
  - "Our server logs each request's time, address, result and duration, with no timetable data or IP address, and
    deletes the logs after 14 days."
- **Approved 25 Oct 2026** as drafted, with both `POLICY_CHANGES[4]` lines. The migration was pushed to dev by the
  user (the auto-mode check refused `db push`).
- **Clicked through** on the dev project with a throwaway admin who had accepted only v3 (session put into
  localStorage, as in T44; deleted afterwards): the *We've updated* dialog listed both v4 lines, *Accept* closed
  it, and *Save online* then saved to the institute. `/privacy` shows Version 4 with the new links.

## Tests
- `legalText.test.ts` and the consent tests pass with version 4.
- `test_rls_consent.py` (or its equivalent): a user who accepted only v3 is refused a save; v4 passes.
- Click through: a user who accepted v3 sees the re-accept dialog with the v4 lines, accepts, and can save.

## Done when
- [x] Drafts approved by the user
- [x] Policy, terms, `policy.ts` and the migration committed together; the migration pushed to dev
- [x] Tests above pass; full suite and `npx tsc -b` green
- [x] FEATURES.md (if the privacy bullet names the providers), PROGRESS.md line
- [x] Committed: `T49: policy v4`
