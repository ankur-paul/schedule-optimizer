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
| 1 | [Authentication and roles](#1-authentication-and-roles) | idea | — |
| 2 | [Privacy policy and consent](#2-privacy-policy-and-consent) | idea | 1 |
| 3 | [Store institute data online](#3-store-institute-data-online) | idea | 1, 2 |
| 4 | [Help page](#4-help-page) | idea | — (best after the UI settles) |
| 5 | [AI agent](#5-ai-agent) | idea | 1, 3, 4 |
| 6 | [Paid AI agent (Razorpay)](#6-paid-ai-agent-razorpay) | idea | 1, 5 |
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
- **Payments after the agent works.** There is nothing to charge for until then.
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

Open questions:
- Which roles beyond admin: editor (can change data), viewer (teachers/students reading timetables)? Do viewers log
  in at all, or keep the v1 no-login read-only views via a share link?
- Is the unit an institute with several members, or one account per person?
- Login methods: Google, email + password, email magic link?
- Build it or use a hosted provider (Supabase Auth, Firebase Auth, Clerk, Cognito)?
- Does the app still work logged out, as v1 does today?

## 2. Privacy policy and consent

Original list: #9. A policy page and an accept step saying what is stored, where, for how long, and that it is used
only to generate timetables.

Open questions:
- When is it shown: at sign-up, or the first time data is about to be uploaded?
- What if the policy changes later (re-accept)?
- Account and data deletion, and data export: needed for the policy to be honest.
- If the agent sends data to an AI provider, the policy must say so.

## 3. Store institute data online

Original list: #3. Institute details and data (teachers, rooms, courses, timetables) saved online once the user
approves.

Open questions:
- Which database, and does it come with the auth choice?
- How does it sit with `localStorage`: online is the source of truth, or local first with sync?
- Upload of existing local data on first login.
- Several admins editing at once: last write wins, or locking?
- Saved timetable versions (history, restore)?

## 4. Help page

Original list: #10. A help page with tutorials, linked from the hard-to-understand parts of the app. The ⓘ tooltips
could carry the "Learn more" links.

Open questions:
- Which sections need it most? Candidates: Excel import, batches and labs, locks, the "can't be built" causes, soft
  rules and the score.
- Text and screenshots, or short videos/GIFs?
- Written so the agent (section 5) can use it as a source?

## 5. AI agent

Original list: #2. Answers questions about the app and the user's data, and changes the data and timetables.

Open questions:
- Which model and provider? The API key stays on the server.
- Which actions does it get as tools (add a teacher, move a class, lock a cell, regenerate)? Does every change need
  the user to confirm it first, and can it be undone?
- What roles may use it, and may it act on everything that role can?
- Ship read-only Q&A first and write actions second?
- Cost per user, and limits until section 6 exists.

## 6. Paid AI agent (Razorpay)

Original list: #5. Make the agent a paid feature.

Open questions:
- Subscription, prepaid credits, or a free quota then paid?
- Charged per institute or per user?
- Razorpay live mode needs KYC with business or individual documents and a public site with policy pages (terms,
  refunds, contact). Who will be the registered merchant?
- Webhook handling on the server to grant access after payment.

## 7. First-login walkthrough

Original list: #8. A guided tour the first time a user logs in.

Open questions:
- Library (react-joyride, driver.js, Shepherd) or hand-built?
- Can it be skipped and replayed later (from the help page)?
- Does it load the sample college so the tour has something to show?

## 8. Deploy the solver and the web app

Original list: #6 and #7. Full discussion so far, covering AWS Lambda for the solver, Vercel Hobby for the web app
and the code changes needed before any deploy: [`discussions/2026-10-22-deployment.md`](discussions/2026-10-22-deployment.md).

Open questions:
- Cloudflare Pages or Vercel for the web app? Vercel Hobby is for non-commercial use only, which clashes with the paid
  agent (section 6). Cloudflare Pages' free plan allows commercial use.
- Where do the new APIs (auth, data, agent) run: the same Lambda as the solver, a separate function, or a hosted
  backend service?
- Did the Lambda memory limit increase go through?

Collected by the passes above (env vars, services, public URLs needed):
- (none yet)
