# Privacy policy and consent (discussion, 24 Oct 2026)

Roadmap idea #2. Three rounds of questions; the plan below is what came out. The grilling notes at the end keep the
reasons and the options turned down.

## Plan

### What changes for the user

- **Signed out:** nothing to accept. Timetable data stays in the browser. *Generate* still calls the solver, but
  the browser replaces teacher names with their IDs first, so no personal data leaves the browser.
- **Signing in:** the sign-in dialog has an unticked box "I agree to the Terms and Privacy Policy" (both links
  open in a new tab). The Google and email-link buttons stay disabled until it is ticked. After sign-in the
  acceptance is stored with the policy version and the time.
- **Policy changes:** a material change bumps the policy version. A signed-in user whose last accepted version is
  older sees a blocking dialog with a short "what changed" list and two buttons: *Accept*, or *Sign out*, plus a
  link to delete the account. Typo fixes don't bump the version.
- **Delete account:** in the account menu, confirmed by typing your email. An admin must first hand over or
  delete each institute they run (the same rule as *Leave*). Deletion is immediate and permanent. Timetable data
  saved in the browser stays there.
- **Policy pages:** `/privacy` and `/terms`, plain pages linked from the sign-in dialog, the account menu and a
  footer. They are public, so Google's consent screen can point at them.
- **Pass #3 input:** the first time an admin uploads institute data, they confirm they are authorised by the
  institution to share staff details. The Terms already say so from this pass.

### Who is responsible for what (DPDP Act 2023)

- **Lattice is the data fiduciary** for signed-in users' own data: email, name, memberships, consent records,
  and the invite emails that admins enter.
- **For teacher names the institute is the fiduciary.** It processes staff data for employment purposes, a
  legitimate use that needs no consent (§7(i)). Once pass #3 stores that data online, Lattice acts as the
  institute's processor. Teachers are never asked for anything; the admin vouches for the upload.
- **Timing:** the DPDP Rules were notified on 13 Nov 2025. Notice, consent, security, breach and erasure duties
  (Rules 3, 5–16) apply from about 14 May 2027. Until then the IT Act's SPDI Rules apply. Nothing is legally due
  yet, but we build to the DPDP shape now.
- **Children:** Lattice is for staff; users must be 18 or older (DPDP needs verifiable parental consent below 18).

### What the policy says (v1)

It describes only what exists now: accounts, institutes, members, invites, consent records, and the solver,
which keeps nothing. Each later pass that adds a purpose updates the policy and bumps the version: online data
(#3), the AI provider (#5), payments (#6). The draft texts are in `docs/legal/`; the user approves them before
T23 builds the pages.

- **Operator:** Ankur Paul. Contact and grievances at `privacy@<domain>`; the domain is decided at deploy and
  read from `VITE_CONTACT_EMAIL`.
- **Retention:** kept until you delete it, and deletion is immediate. Pending invites are deleted after 30 days if
  unused. The policy states what Supabase's backups keep on our plan (to be checked in the dashboard: the docs
  and the pricing page disagree for free projects).
- **Export:** not in this pass. The policy offers a summary of your data by email; self-serve export comes with
  pass #3, when there is institute data to export.
- **No legal review yet.** Recorded under Known issues; get a review before charging money (#6).

### Data model (`supabase/migrations/`)

- `policy_versions(version, published_at)`: one row per published version, added by a migration whenever the
  version is bumped.
- `consents(user_id, version, accepted_at)`, primary key `(user_id, version)`, `on delete cascade` from
  `auth.users`. Users read their own rows. Inserts go only through `record_consent(version)`, which needs the
  version to exist in `policy_versions` and sets the time itself.
- `delete_account()`: refuses while the caller is the admin of any institute (naming them); otherwise it deletes
  the caller from `auth.users`. Memberships, the profile and consent rows go with it by cascade, and
  `institutes.created_by` becomes null.
- Invite expiry: `accept_invites()` skips and deletes invites older than 30 days; a daily `pg_cron` job deletes
  the rest.

### Tickets

- **T22 Strip teacher names before solving** (Prereqs: —). Ready now, runs alongside T21.
- **T23 Privacy and terms pages** (Prereqs: —). Ready now once the drafts are approved. Static Vite pages plus
  the footer.
- **T24 Consent at sign-in and re-accept** (Prereqs: T21, T23). Schema, checkbox, gate dialog.
- **T25 Delete account and invite expiry** (Prereqs: T21).

T24 and T25 wait for T21 because they edit the same account menu and sign-in code.

### Env vars and services (copy to the roadmap's deploy list)

- Web: `VITE_CONTACT_EMAIL` (public), shown on the policy pages.
- A domain we own for `privacy@<domain>`; the same domain serves the SMTP sender.
- Public `/privacy` and `/terms` URLs go into Google's OAuth Branding page. Google's user-data policy wants the
  privacy policy to say how Google account data is used.
- Check Supabase's backup retention and `pg_cron` on the production plan; the policy text depends on both.

## Facts checked (24 Oct 2026)

- **DPDP Rules 2025:** notified 13 Nov 2025. Rules 1, 2 and 17–21 apply at once, Rule 4 (consent managers) after a
  year, and Rules 3, 5–16, 22 and 23 after 18 months. Rule 3's notice must stand alone, be in plain language,
  itemise the data and purposes, and link to how to withdraw consent, use your rights and complain to the Board.
  Secondary summaries, not the gazette text.
  [Storyboard18](https://www.storyboard18.com/digital/breaking-govt-notifies-final-dpdp-rules-sets-staggered-rollout-with-key-obligations-for-data-fiduciaries-84201.htm) ·
  [Mondaq](https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified)
- **§7(i) employment:** employers may process employee data without consent for employment purposes; its scope is
  debated.
  [Bar & Bench](https://www.barandbench.com/view-point/navigating-legitimate-use-exemption-employee-data-digital-personal-data-protection-act-2023) ·
  [Mondaq](https://webiis10.mondaq.com/india/data-protection/1755320/is-consent-required-to-process-employees-personal-data-under-the-dpdp-act)
- **Supabase:** a DPA that binds on accepting its terms, and a subprocessor list (AWS, Cloudflare, Google, Fly.io,
  Sentry, GitHub, …). The backup docs say free projects get daily backups; the pricing page says free has none.
  `pg_cron` on free is claimed by a third party only.
  [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) ·
  [subprocessors](https://supabase.com/legal/subprocessor-list/June-1-2026.pdf) ·
  [backups](https://supabase.com/docs/guides/platform/backups.md) · [pricing](https://supabase.com/pricing)
- **Code:** the server never reads `name` (it works on IDs), so stripping teacher names needs no contract change.
  The app has no analytics or tracking scripts.

## Grilling notes

- **Q1 Consent at sign-in, plus an admin confirmation at first upload (#3).** Signing in already stores the email
  in Supabase, so the notice must come before the click, not at the first upload. A checkbox is a clear
  affirmative action. Rejected: sign-in only (the admin never vouches for staff data); a "By continuing you
  agree" line (weaker consent).
- **Q2 Strip teacher names before `/solve`.** The solver needs only IDs, so signed-out mode sends no personal data
  and needs no consent. Rejected: a notice under Generate; leaving it to deploy.
- **Q3 / Q5 Operator is Ankur Paul, contact `privacy@<domain>`.** The user has a domain to give; until then the
  address comes from `VITE_CONTACT_EMAIL`. Rejected: no person named (Razorpay needs a real merchant anyway).
- **Q4 Static Vite pages** at `/privacy` and `/terms`, readable without JavaScript. Rejected: an in-app dialog (no
  public URL for Google); a router (the auth pass chose no routing).
- **Q6 A version bump forces re-accept**, with Accept or Sign out. Every acceptance is kept as a row. Rejected: a
  dismissible "policy updated" banner.
- **Q7 Self-serve account deletion; admins hand over first.** Rejected: cascading deletion of the admin's
  institutes (wipes others' shared work); deletion by email request.
- **Q8 No export in this pass.** The access right is met by a summary sent on request; self-serve export arrives
  with institute data in #3.
- **Q9 Kept until deleted; invites expire after 30 days.** An invite holds someone else's email, and that person
  may never sign up. Rejected: purging inactive accounts (needs a scheduler and a real email sender; revisit at
  deploy); invites that never expire.
- **Q10 Privacy policy plus short Terms.** The Terms carry the admin's promise that they may share staff data, plus
  acceptable use and no warranty. Refund and pricing terms come with Razorpay (#6).
- **Q11 The policy describes only what exists.** Each later pass bumps the version, so users re-accept for real
  changes. Rejected: a future-proof policy full of "we may" clauses.
- **Q12 Claude drafts, the user reviews.** No legal review yet; noted as a known issue before #6.
