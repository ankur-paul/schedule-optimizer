# Version 2 roadmap

Version 1 (T00–T18) is a single-user app: no login, data in `localStorage`, solver run locally. Version 2 takes it
online. Ideas were collected on 22 Oct 2026.

Each idea is big enough to need its own pass, the same way v1 was built:

1. **Discuss** it and save the notes in `docs/discussions/YYYY-MM-DD-<topic>.md`.
2. **Plan**: update `PLAN.md` where a v1 decision changes. Several will: §1 says "no database, no auth" and
   "teachers/students get read-only views (no login)".
3. **Ticket** it as T19 onward in `tickets/`, then build.

Tick an idea's status here when its pass moves on. Keep the open questions short; the answers go in the discussion file.

## Order

| # | Idea | Status | Needs |
|---|---|---|---|
| 1 | [Deploy the solver and the web app](#1-deploy-the-solver-and-the-web-app) | discussed, not planned | — |
| 2 | [Authentication and roles](#2-authentication-and-roles) | idea | 1 |
| 3 | [Privacy policy and consent](#3-privacy-policy-and-consent) | idea | 2 |
| 4 | [Store institute data online](#4-store-institute-data-online) | idea | 2, 3 |
| 5 | [Help page](#5-help-page) | idea | — (best after the UI settles) |
| 6 | [AI agent](#6-ai-agent) | idea | 2, 4, 5 |
| 7 | [Paid AI agent (Razorpay)](#7-paid-ai-agent-razorpay) | idea | 2, 6 |
| 8 | [First-login walkthrough](#8-first-login-walkthrough) | idea | the rest of the UI |

Why this order:

- **Deploy first.** Everything after it assumes a public backend. It is already half-discussed, it ships v1 to real
  users as it is, and it fixes the hosting choice before auth and a database are built on top of it.
- **Auth and roles together.** A role means nothing without knowing who is logged in, and the auth provider choice
  (for example a hosted one with a database attached) shapes how data is stored in step 4.
- **Consent before storage.** Data must not leave the browser until the user has read and accepted how it is
  stored and used (India's DPDP Act 2023 applies to teacher names and similar personal data).
- **Help before the agent.** The help pages can double as the agent's knowledge base for answering questions.
- **The agent after storage.** For the agent to change data and timetables safely it needs to know who is asking,
  what they may change (roles), and a server-side copy of the data it can edit and undo.
- **Payments after the agent works.** There is nothing to charge for until then.
- **Walkthrough last.** It tours the finished UI (login, consent, agent); built earlier, it would be redone.

The help page has no hard prerequisite and can run in parallel with any of 2–4.

## 1. Deploy the solver and the web app

Ideas 6 and 7 from the list. Full discussion so far: [`discussions/2026-10-22-deployment.md`](discussions/2026-10-22-deployment.md)
(AWS Lambda for the solver, Vercel Hobby for the web app, the code changes needed before any deploy).

Open questions:
- Cloudflare Pages or Vercel for the web app? Vercel Hobby is **non-commercial only**, which clashes with idea 7
  (paid agent). Cloudflare Pages' free plan allows commercial use.
- Where do the new APIs (auth, data, agent) run: the same Lambda as the solver, a separate function, or a hosted
  backend service?
- Did the Lambda memory limit increase go through?

## 2. Authentication and roles

Ideas 1 and 4. An **admin** creates and manages an institute's timetable.

Open questions:
- Which roles beyond admin: editor (can change data), viewer (teachers/students reading timetables)? Do viewers log
  in at all, or keep the v1 no-login read-only views via a share link?
- Is the unit an **institute** with several members, or one account per person?
- Login methods: Google, email + password, email magic link?
- Build it or use a hosted provider (Supabase Auth, Firebase Auth, Clerk, Cognito)?
- Does the app still work logged out, as v1 does today?

## 3. Privacy policy and consent

Idea 9. A policy page and an accept step saying what is stored, where, for how long, and that it is used only to
generate timetables.

Open questions:
- When is it shown: at sign-up, or the first time data is about to be uploaded?
- What if the policy changes later (re-accept)?
- Account and data deletion, and data export: needed for the policy to be honest.
- If the agent sends data to an AI provider, the policy must say so.

## 4. Store institute data online

Idea 3. Institute details and data (teachers, rooms, courses, timetables) saved online once the user approves.

Open questions:
- Which database, and does it come with the auth choice?
- How does it sit with `localStorage`: online is the source of truth, or local first with sync?
- Upload of existing local data on first login.
- Several admins editing at once: last write wins, or locking?
- Saved timetable versions (history, restore)?

## 5. Help page

Idea 10. A help page with tutorials, linked from the hard-to-understand parts of the app (the ⓘ tooltips are a
natural place for "Learn more" links).

Open questions:
- Which sections need it most? Candidates: Excel import, batches and labs, locks, the "can't be built" causes, soft
  rules and the score.
- Text and screenshots, or short videos/GIFs?
- Written so the agent (idea 6) can use it as a source?

## 6. AI agent

Idea 2. Answers questions about the app and the user's data, and can make changes to the data and timetables.

Open questions:
- Which model and provider; the API key stays on the server.
- Which actions does it get as tools (add a teacher, move a class, lock a cell, regenerate)? Does every change need
  the user to confirm it first, and can it be undone?
- What roles may use it, and may it act on everything that role can?
- Ship read-only Q&A first and write actions second?
- Cost per user, and limits until idea 7 exists.

## 7. Paid AI agent (Razorpay)

Idea 5. Make the agent a paid feature.

Open questions:
- Subscription, prepaid credits, or a free quota then paid?
- Charged per institute or per user?
- Razorpay live mode needs KYC with business or individual documents and a public site with policy pages (terms,
  refunds, contact). Who will be the registered merchant?
- Webhook handling on the server to grant access after payment.

## 8. First-login walkthrough

Idea 8. A guided tour the first time a user logs in.

Open questions:
- Library (react-joyride, driver.js, Shepherd) or hand-built?
- Can it be skipped and replayed later (from the help page)?
- Does it load the sample college so the tour has something to show?
