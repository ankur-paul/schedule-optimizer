# Version 2 roadmap

Version 1 (T00–T18) is a single-user app: no login, data in `localStorage`, solver run locally. Version 2 takes it
online. Ideas were collected on 22 Oct 2026.

Each idea is big enough to need its own pass, the same way v1 was built:

1. **Discuss** it and save the notes in `docs/discussions/YYYY-MM-DD-<topic>.md`.
2. **Plan**: update `PLAN.md` where a v1 decision changes. Several will, since §1 says "no database, no auth" and
   "teachers/students get read-only views (no login)".
3. **Ticket** it as T19 onward in `tickets/`, then build.

Tick an idea's status here when its pass moves on. Keep the open questions short; the answers go in the discussion file.

## Order

| # | Idea | Status | Needs |
|---|---|---|---|
| 1 | [Authentication and roles](#1-authentication-and-roles) | built: T19–T21 | — |
| 2 | [Privacy policy and consent](#2-privacy-policy-and-consent) | built: T22–T24 | 1 |
| 3 | [Store institute data online](#3-store-institute-data-online) | built: T27–T31 | 1, 2 |
| 4 | [Help page](#4-help-page) | built: T32–T35 | — |
| 5 | [AI agent](#5-ai-agent) | planned: T36–T40 | 1, 3, 4 |
| 5b | [AI agent: write actions](#5b-ai-agent-write-actions) | idea | 5 |
| 6 | [Access by coupon](#6-access-by-coupon) | planned with #5: T36, T40 | 1, 5 |
| 7 | [First-login walkthrough](#7-first-login-walkthrough) | idea | the rest of the UI |
| 8 | [Deploy the solver and the web app](#8-deploy-the-solver-and-the-web-app) | discussed, not planned | everything above |

Why this order:

- **Auth and roles together.** Roles need a logged-in user. The auth provider also affects step 3: a hosted one
  such as Supabase comes with a database.
- **Consent before storage.** Data must not leave the browser until the user has read and accepted how it is
  stored and used (India's DPDP Act 2023 applies to teacher names and similar personal data).
- **Help before the agent.** The help pages can double as the agent's knowledge base for answering questions.
- **The agent after storage.** For the agent to change data and timetables safely it needs to know who is asking,
  what they may change (roles), and a server-side copy of the data it can edit and undo.
- **Payments after the agent works.** There is nothing to charge for until then. (24 Oct: payments became trial
  coupons, built with the agent; see #6.)
- **Walkthrough after the UI is done.** It tours the finished UI (login, consent, agent). If we build it earlier,
  we redo it.
- **Deploy at the end** (decided 22 Oct), once the app is built. To keep that step small, every pass follows the
  checklist below.

The help page has no hard prerequisite and can run in parallel with any of 1–3.

## Keep it deployable (every pass)

The deploy should come down to public URLs, env vars and a Dockerfile. So while building:

- No hard-coded URLs, origins, keys or secrets: read them from env vars (`VITE_*` on the web, `os.environ` on the
  server). Secrets never go in the web bundle.
- Server code keeps no state in memory between requests (sessions, chat history, rate limits go in the database),
  because the server may run on AWS Lambda, which starts and stops copies of it as it likes.
- Prefer hosted services (auth, database) that are already online in development, over local-only stand-ins.
- Anything that needs a public URL (Razorpay webhooks, OAuth redirect URLs) is listed in the deploy section below
  and tested locally through a tunnel.
- Note each new env var and external service in the deploy section below as it is added.

## 1. Authentication and roles

Original list: #1 and #4. An admin creates and manages an institute's timetable.

Discussed 22–24 Oct: [`discussions/2026-10-22-auth-and-roles.md`](discussions/2026-10-22-auth-and-roles.md).
In short: Supabase (Mumbai) with Google or email-link sign-in, optional (signed out still works as v1);
institutes with exactly one admin plus editors and viewers, joined by email invite; roles enforced only by
Postgres RLS; teachers and students never log in. Tickets T19–T21.

## 2. Privacy policy and consent

Original list: #9. A policy page and an accept step saying what is stored, where, for how long, and that it is used
only to generate timetables.

Discussed 24 Oct: [`discussions/2026-10-24-privacy-and-consent.md`](discussions/2026-10-24-privacy-and-consent.md).
Summary:
- **Signed out:** the browser strips teacher names before `/solve`, so nothing personal leaves it and there is
  nothing to accept.
- **Signing in:** the sign-in dialog has a required checkbox, and each acceptance is recorded with the policy
  version.
- **Policy changes:** a version bump makes signed-in users accept again.
- **Deletion:** on request by email, done by hand within 30 days; an admin hands over first. Invites stay
  until used or cancelled. (Self-serve deletion and invite expiry, T25, were dropped on 24 Oct.)
- **Pages:** static `/privacy` and `/terms`. The policy names Ankur Paul as the operator, with a
  `privacy@<domain>` contact.
- **Export:** cut in #3; the policy offers a summary by email.

The policy describes only what exists, so every later pass that adds a purpose bumps it. The texts are
in `web/src/legal/` and served at `/privacy` and `/terms` (T23). Tickets T22–T24.

## 3. Store institute data online

Original list: #3. Institute details and data (teachers, rooms, courses, timetables) saved online once the user
approves.

Discussed 24 Oct: [`discussions/2026-10-24-online-data.md`](discussions/2026-10-24-online-data.md). Summary:
- **Device first:** the browser keeps one working copy (the v1 data). *Save online* uploads it as a new version of
  a named timetable in an institute; *Open from institute* downloads one. A header line shows the link and unsaved
  changes.
- **Storage:** one JSONB document per version (at most 2 MB), the last 20 versions kept plus the live one.
- **Two editors:** a version check on save offers *Overwrite*, *Save as new* or *Cancel*.
- **Roles:** viewers open but never write online; editors save and publish; the admin also deletes and sets the
  institute's handle.
- **Publishing:** a stable public link `/<handle>/<random id>` points at one version; *Make live* rolls back at
  once. The public page has section, teacher and room views and a one-day phone layout.
- **Privacy:** policy v2; the Terms line on other people's details replaces pass #2's admin confirmation at first
  upload, and the database refuses saves without consent to the current version. Export is cut.

Tickets T27–T31.

## 4. Help page

Original list: #10. A help page with tutorials, linked from the hard-to-understand parts of the app. The ⓘ tooltips
could carry the "Learn more" links.

Discussed 24 Oct: [`discussions/2026-10-24-help-page.md`](discussions/2026-10-24-help-page.md). Summary:
- **Pages:** static `/help` plus `/help/start` (a 5-minute tutorial on the sample college), `data`, `generate`,
  `timetable`, `online` and `troubleshooting`, built from Markdown like `/privacy`. English, text and screenshots,
  written with `/no-ai-slop`. Opened in a new tab.
- **Links:** problem cards and import errors, ⓘ tooltips where the help says more, step hints, footer and account
  menu, all through one checked `helpHref`.
- **Upkeep:** a CLAUDE.md rule (UI changes update the help), a link test, and `npm run help:shots` (Playwright, a
  fixed sample timetable) to retake screenshots.
- **The agent (#5)** reads the same Markdown files.
- `help` becomes a reserved handle, since `/help/<page>` looks like a public link.

Tickets T32–T35.

## 5. AI agent

Original list: #2. Answers questions about the app and the user's data, and changes the data and timetables.

Discussed 24 Oct: [`discussions/2026-10-24-ai-agent.md`](discussions/2026-10-24-ai-agent.md). Summary:
- **Read-only first:** a side panel answers how-to questions and explains the user's own data (causes, unplaced
  classes, the score, free periods). It changes nothing; write actions are #5b.
- **Who:** signed-in members of an institute (any role) whose institute has access through a coupon (#6).
- **How:** the browser drives the loop over its working copy; `POST /agent` on the FastAPI app makes one Claude
  call per request. Six read-only tools run in the browser; teacher names become IDs before anything is sent.
- **Model:** Claude Opus 5.5 at low effort, the full help text in a cached system prompt, no streaming. History
  stays in the browser and is compacted every 20 questions; at most 8 tool rounds per question.
- **Checks and cost:** the server confirms the user with Supabase Auth, then service-role-only database functions
  check membership, consent, access and limits, and record usage rows (numbers only, never chat text).
  `AGENT_MONTHLY_USD` (default $10) stops it for everyone; an Anthropic spend limit is the backstop.
- **Privacy:** policy v3 names Anthropic (US); everyone accepts again.
- **Deploy:** the same image runs as a second, small Lambda function for `/agent`.

Tickets T36–T40.

## 5b. AI agent: write actions

Split from #5 on 24 Oct. The assistant changes data and timetables (add a teacher, move a class, lock, regenerate).

Open questions:
- Undo: the store has no undo today, only the toast after a drag. A snapshot before each change?
- Does every change need the user to confirm it first?
- Which roles may make changes through it? Viewers may edit their own working copy today.

## 6. Access by coupon

Original list: #5, "Paid AI agent (Razorpay)". Reworked on 24 Oct in the agent discussion
([`discussions/2026-10-24-ai-agent.md`](discussions/2026-10-24-ai-agent.md)):
- **No AI without access, and access comes from trial coupons.** Razorpay is dropped for now, which also removes
  the KYC and merchant question.
- **A coupon unlocks an institute**, redeemed by its admin. It carries a question allowance and a number of days
  (default 200 questions over 30 days); further coupons add up.
- **Codes** are 16 random characters, stored only as SHA-256 hashes, single-use, 10 wrong tries per user per hour.
- **The operator issues them** with `server/scripts/issue_coupon.py` and emails them by hand. Users ask through a
  *Request a trial coupon* `mailto:` link.

Built in T36 and T40. A paid plan (Razorpay or similar) is a possible later idea; the usage rows will give its
pricing real cost-per-question numbers.

## 7. First-login walkthrough

Original list: #8. A guided tour the first time a user logs in.

Open questions:
- The tour includes the assistant panel (#5).
- Library (react-joyride, driver.js, Shepherd) or hand-built?
- Can it be skipped and replayed later (from the help page)?
- Does it load the sample college so the tour has something to show?

## 8. Deploy the solver and the web app

Original list: #6 and #7. Full discussion so far, covering AWS Lambda for the solver, Vercel Hobby for the web app
and the code changes needed before any deploy: [`discussions/2026-10-22-deployment.md`](discussions/2026-10-22-deployment.md).

Open questions:
- Cloudflare Pages or Vercel for the web app? Vercel Hobby is for non-commercial use only. That clashed with a paid
  agent, but #6 became free trial coupons on 24 Oct, so it matters only if paid plans come back. Cloudflare Pages'
  free plan allows commercial use.
- ~~Where do the new APIs (auth, data, agent) run?~~ Auth and data are Supabase; the agent is a route on the FastAPI
  app, deployed as a second Lambda function from the same image (agent pass).
- Did the Lambda memory limit increase go through?

Collected by the passes above (env vars, services, public URLs needed):
- Supabase project in Mumbai (`ap-south-1`); a second one for production (auth pass).
- Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public by design).
- Server and tests: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret).
- Google OAuth client: add the public domain to its redirect URLs and to Supabase's redirect allow-list. Publish
  the Google consent screen (it is in Testing, so only listed test users can sign in); publishing needs the app's
  home page and privacy policy URLs on our domain (from pass #2) in its Branding page, and set Supabase's Site URL
  to the public domain (it is `http://localhost:5173` now).
- SMTP sender with a domain we own, so email sign-in links reach real users (the built-in one reaches only the
  project's team). Free Supabase projects pause after 7 days without traffic: resume before a demo.
- Web: `VITE_CONTACT_EMAIL` for the policy pages (privacy pass). The domain also gives `privacy@<domain>` and the
  SMTP sender.
- Public `/privacy` and `/terms` (static Vite pages, `privacy.html` and `terms.html` in `dist/`) go into Google's
  OAuth Branding page. The host must serve them without `.html`: Cloudflare Pages does by default, Vercel needs
  `"cleanUrls": true` in `vercel.json`. `npm run dev` and `npm run preview` already do.
- Check Supabase's backup retention and `pg_cron` on the production plan; the privacy policy depends on both. It
  says backups are erased within 7 days (Pro keeps 7 days, Free none); Team (14 days) or Enterprise (up to 30)
  means a policy edit.
- Public timetable links (online-data pass): the host rewrites two-segment paths `/<handle>/<id>` to
  `published.html`, leaving `/assets/*` and real files alone (Vercel `rewrites`, Cloudflare Pages `_redirects`).
  `npm run dev` and `npm run preview` already do (T30). The link is built from the page's origin, so no env var.
- Help pages (help pass): the host serves `/help` and `/help/<page>` without `.html` (`help.html` and
  `help/<page>.html` in `dist/`), and the public-link rewrite skips `/help/*`. No new env vars.
- A paused free Supabase project breaks every published timetable link, not just sign-in: production needs a
  project that doesn't pause, or a keep-alive.
- Agent (agent pass): server env `ANTHROPIC_API_KEY` (secret), `AGENT_MONTHLY_USD` (default 10), and
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (secret), now needed at runtime, not only in tests. Web env
  `VITE_AGENT_URL` (defaults to `VITE_SOLVER_URL`). Optional: `AGENT_HELP_DIR` (default the repo's
  `web/src/help`). `CORS_ORIGINS` (T38) lists the web app's origins, comma-separated; unset, the server allows any
  localhost port, which only suits development.
- The same container image runs as a second Lambda function (about 512 MB) serving `/agent`, so waiting on Anthropic
  isn't billed at the solver's memory size and chats don't use the solver's 10 concurrency slots. CORS allows the
  `Authorization` header from the web origin. The image includes `web/src/help/*.md` and `shared/agent-tools.json`.
- Anthropic account: set a monthly spend limit; check its API data retention against what policy v3 says.
