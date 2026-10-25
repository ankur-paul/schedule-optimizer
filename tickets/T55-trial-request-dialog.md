# T55 — Trial coupon request dialog
**Status:** IN PROGRESS
**Lane:** A · **Prereqs:** — · **Branch:** t55-trial-request-dialog

## Goal
*Request a trial coupon* works for admins without a mail app. Today it is a bare `mailto:` link, which does nothing
on lab PCs, Windows without a mail app set up and Chromebooks, and the user can't tell why. The always-visible "No
email app?" line copies one `To:/Subject:` blob that has to be cut apart again in webmail. Instead, the link opens a
small dialog: open the email in Gmail or in the mail app, or copy the address, subject and message one by one.

## Scope / files
- `web/src/features/assistant/format.ts`: `trialGmailUrl(to, institute, account?)`; export the subject and
  `trialBody` for the copy rows. `trialRequestText` goes if nothing else uses it.
- `web/src/features/assistant/AssistantPanel.tsx`: *Request a trial coupon* becomes a link-styled button opening the
  dialog (`@/components/ui/dialog`); `ContactLine` and the "No email app?" line go.
- Help: `web/src/help/online.md`, the coupon box paragraph (around line 197). No screenshot shows the coupon box, so
  `npm run help:shots` only if that changes.
- Privacy: the *Request a trial coupon* sentence (see Details).
- FEATURES.md (the Assistant bullet's coupon part), PROGRESS.md.

## Details
- **The dialog,** titled "Request a trial coupon":
  - One line: "Send us this email and we'll reply with a coupon." (Ask the user before promising a reply time.)
  - Two buttons: **Open in Gmail** and **Open email app** (the existing `trialMailto`). Gmail is the primary
    button; on touch-first devices (`(pointer: coarse)`) *Open email app* is, since `mailto:` hands off to the phone's
    mail app reliably and Gmail on the web is clumsy there.
  - "Or copy it into any email:", then three read-only rows, **To**, **Subject** and **Message**, each with its own
    *Copy*. The values stay `select-all` text, so they can be copied by hand when the clipboard fails.
  - Neither button closes the dialog: if the mail app does nothing, the copy rows are still there. ✕ and Esc close it.
  - *Copy* shows ✓ "Copied" in place for about 2 s rather than a toast, which can land behind the panel. On a
    clipboard error, a line in the dialog says to select the text and copy it by hand.
- **Gmail:** `https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…`, opened in a new tab
  (`target="_blank" rel="noopener noreferrer"`). Encode with `encodeURIComponent`, as `trialMailto` does, so spaces
  stay spaces and newlines become `%0A`. Add `authuser=<signed-in email>` so Gmail picks the right account when
  several are signed in; check in a browser with two Google accounts that it opens the signed-in user's, and drop it
  if it doesn't help. The Gmail address is a fixed third-party URL, not one of ours, so it isn't an env var.
- **The message is unchanged:** institute name, handle (link name) and "What will you use it for?".
- **Still hidden** without `VITE_CONTACT_EMAIL` or a membership, as now.
- **Privacy:** the policy says *Request a trial coupon* "opens an email to us in your own email app". It becomes
  "opens an email to us in Gmail or your own email app, or gives you the text to copy". What is sent and who
  receives it don't change. The sentence is in `web/src/legal/privacy.md` and in T49's v4 draft
  (`docs/policy-v4/privacy.md` on `t49-policy-v4`). If T49 isn't merged yet, ask the user to put the new wording into
  the v4 draft rather than editing it here; if it is merged, ask the user whether the wording change needs a policy
  version.

## Not in this ticket
- An Outlook (`outlook.office.com/mail/deeplink/compose`) button: add it if an institute asks; the copy rows cover it.
- Typing the "What will you use it for?" answer in the dialog.
- A request form that goes to our server instead of email.

## Tests
- `trialGmailUrl`: the address, subject and body round-trip through `URL`/`URLSearchParams`; newlines as `%0A`, no
  `+` for spaces; a handle that is `null` reads "(not set)"; `authuser` only when an account is given.
- The copy rows' text matches what `trialMailto` sends (same subject and body).
- Click through: the dialog from the locked panel as admin; *Open in Gmail* opens a filled compose window; *Open
  email app* with and without a mail app; each *Copy* and its ✓; Esc and ✕; phone width (the panel is full screen
  there), with *Open email app* first; editors and viewers still see the ask-your-admin line, not the dialog.

## Done when
- [x] Dialog, Gmail link and copy rows as above; "No email app?" line removed
- [ ] Tests above pass; full suite and `npx tsc -b` green
- [ ] Help paragraph, privacy wording (or the T49 note), FEATURES.md, PROGRESS.md
- [ ] Committed: `T55: trial coupon request dialog`
