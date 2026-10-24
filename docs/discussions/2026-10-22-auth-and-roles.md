# Authentication and roles (discussion, 22–24 Oct 2026)

Roadmap idea #1. Grilled over five rounds; the plan below is what came out. The grilling notes at the end keep the
reasons and the options turned down.

## Plan

### What changes for the user

- The app still works **signed out**, exactly as v1: data in `localStorage`, no account. A **Sign in** button sits
  in the header; signing in unlocks the online features of later passes (saved data, sharing, the agent).
- Sign in with **Google** or an **email link**. No passwords.
- After the first sign-in, with no institute and no pending invite, a dialog asks for an **institute** name
  ("GNDEC Ludhiana"); *Not now* closes it and the account menu offers *Create institute* later. Anyone signed in
  may create one and becomes its admin.
- The **admin** opens **Members** and invites people by email as editor or viewer. When someone signs in with that
  email (either method) they join at once, with a toast "You joined GNDEC Ludhiana as editor". We send no invite
  emails; the admin tells them to sign in.
- A user can be in several institutes; the header switcher shows only then.
- Signing in or out leaves `localStorage` alone.

### Roles

| Role | Can (once pass #3 stores data online) |
|---|---|
| Admin | everything an editor can, plus manage members, hand over the admin role, rename or delete the institute; later buys AI credits (#6) |
| Editor | change data, generate, lock, print/export; later spends AI credits |
| Viewer | read timetables, data and stats, print/export; changes nothing |

- **Exactly one admin per institute**, the point of contact. *Make admin* hands the role to an existing member,
  who becomes admin while the old admin becomes an editor. The admin can't leave without handing over.
- Only the admin sees **Members**. Editors and viewers see their role and who the admin is.
- In this pass a role only decides who manages members. Read-only mode for viewers comes in #3 with the data.
- **Teachers and students don't log in.** They read a published timetable through a share link (pass #3).

### Where roles are enforced

Postgres row-level security (RLS) in Supabase is the only rule book. The browser talks to Supabase directly with
the user's token and hides buttons it may not use, which is cosmetic. Later server work (the agent, #5) goes
through FastAPI, which forwards the user's token so RLS applies to it too. The service-role key is used only where
there is no user (the Razorpay webhook, #6). Rules RLS can't express as a policy (one admin, handover, auto-join,
leave, delete) are Postgres functions.

### Provider: Supabase, Mumbai

Auth plus Postgres, free plan. One hosted dev project now; the second free slot is kept for production.

### Data model (`supabase/migrations/`, applied with `npx supabase db push`)

- `institutes(id, name, created_by, created_at)`
- `memberships(institute_id, user_id, role)`, role in `admin | editor | viewer`, exactly one admin per institute
- `invites(institute_id, email, role)`, role in `editor | viewer`
- members' display name and email, readable by their institute's admin, since the browser can't read Supabase's
  own user table (email-link users have no name, so the email is shown)
- functions: create institute, auto-join on sign-in, change role, make admin, remove, leave, delete institute

### Tests

Pytest in `server/tests/`, marked `supabase`: one test that fails if any table lacks RLS, and per-role tests
(admin, editor, viewer, non-member) for every table and function. They create and delete throwaway users through
the admin API, and skip when `SUPABASE_URL` and the service key aren't in `server/.env`, so the suite passes
offline. Front-end logic gets Vitest tests as usual.

### Not in this pass

- Timetable data online, role limits on it, share links (#3).
- Consent, policy, account deletion and data export (#2). No deploy gate is needed: everything stays on the
  laptop until the deploy pass, which comes after #2.
- Microsoft sign-in.
- Auth on `/solve`: signed-out users must reach the solver, so any gate is the deploy pass's call.
- The real-user email sender. Supabase's built-in one reaches only the project's team (2 an hour), enough to
  build and test.

### Setup only a human can do

Creating the Supabase project, the Google Cloud OAuth client and its redirect URLs, logging the CLI in, and
copying keys into `.env` files. Each ticket that needs one ships a bash wizard (the `wizard` skill) that walks
through it.

### Env vars and services (copy to the roadmap's deploy list)

- Web: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public by design; RLS guards the data).
- Server and tests: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret, never in the web bundle).
- Supabase project in Mumbai (a second one for production).
- Google OAuth client; redirect URLs for localhost now and the public domain at deploy.
- At deploy: an SMTP sender with a domain we own, so email links reach real users.

### Tickets

- **T19 Sign-in** (Prereqs: —). Supabase client and env vars, Google and email-link sign-in, sign-out, header
  account menu, `web/.env.example`. With the env vars missing, the Sign in button doesn't show and the app runs as
  v1. Wizard: create the project, set up Google OAuth, fill `web/.env.local`.
- **T20 Schema and RLS** (Prereqs: —). The tables, functions and policies above, with the Pytest suite. Wizard:
  log the Supabase CLI in, link the project (creating it if T19's wizard hasn't run yet), fill `server/.env`.
- **T21 Institutes and members UI** (Prereqs: T19, T20). Create-institute dialog, switcher, admin-only Members
  dialog (invite, change role, remove, make admin), the "your role · admin is X" line, leave, delete (type the
  name), auto-join toast.

## Provider facts (checked 22 Oct 2026, providers' own pages)

- **Supabase free:** 50K auth MAU, 500 MB DB, 2 active projects (paused ones don't count). Pauses after 7 days of
  low activity; resume by hand from the dashboard. Built-in email sends 2/hour and only to the project's team, so
  real magic links need custom SMTP; since 3 Jun 2026 free projects on the default sender can't edit email
  templates. Google OAuth included. Mumbai (ap-south-1) is a listed region, free-plan availability not stated.
  Branching (hosted test DBs) is Pro only. Local stack: `supabase start` needs Docker; the experimental
  `supabase stack` runs on Podman or a native runtime (Linux glibc 2.35+).
  [pausing](https://supabase.com/docs/guides/platform/project-pausing) ·
  [pricing](https://supabase.com/pricing) · [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) ·
  [runtimes](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes)
- **Firebase Spark:** 50K MAU; email-link sign-in only **5 emails a day**. Firestore in Mumbai or Delhi.
  [limits](https://firebase.google.com/docs/auth/limits)
- **Clerk free:** 50K users, organizations included (Admin/Member roles, 20 members per org), **US-only data, no
  region choice**. [security](https://clerk.com/security)

## Grilling notes

- **Q4 Deploy gate until consent:** not needed as a rule. Everything runs on the laptop until the deploy pass,
  which comes after #2 anyway. Pass #1 works against a dev project with only our own accounts in it.
- **Q1 Signed-out mode stays.** Signing in is optional and only unlocks online features. It follows that the
  solver can't require a login; any gate on `/solve` is the deploy pass's call.
- **Q2 Institutes with members**, each member with a role.
- **Q3 Teachers and students never log in**; read-only share link in pass #3.
- **Q5 RLS is the one rule book (option C).** The browser talks to Supabase directly with the user's token. Later
  server work (agent #5) goes through FastAPI, which forwards the user's token so RLS still applies; the
  service-role key is used only where there is no user (Razorpay webhook #6). Guarded by a test that every table
  has RLS on, and per-role tests (viewer, editor, admin, non-member). Rules like "one admin" live in Postgres
  functions. Rejected: FastAPI as gatekeeper with the service key (every save through Lambda, two rule books, one
  missed check exposes everything).
- **Q6 Supabase** (Mumbai). Clerk is US-only; Firebase's document store fits relational data poorly.
- **Q7 Google sign-in only** in this pass. Magic links come in the deploy pass with a custom SMTP sender.
  *Reopened in round 3, see below.*
- **Q8 Three roles: admin, editor, viewer.** The admin is the institute's point of contact: decides who gets
  access and with which role, revokes it, and (pass #6) buys the AI credits that editors then spend. Input for #6:
  billing is per institute and only the admin pays. Viewers who want to log in are invited; the rest use the
  share link.
- **Q9 A user can belong to several institutes**; the switcher shows only when there is more than one.
- **Q11 One hosted dev Supabase project** (Mumbai); the second free slot is kept for production. Migrations in
  `supabase/migrations/`, applied with `npx supabase db push`. RLS tests are Pytest tests in `server/tests/`
  marked `supabase`, creating and deleting throwaway users; they skip when `SUPABASE_URL` and the service key are
  not in `server/.env`, so the suite still passes offline. Rejected: the experimental no-container local stack.
- **Q12 Sign-in and sign-out leave `localStorage` alone** in this pass; data ownership is pass #3's question.
- **Q13 Account UI is a header menu plus dialogs**, no new page or routing. Sign in → avatar menu (institute,
  switcher, Members, sign out). First sign-in with no institute and no invite asks for an institute name, with
  *Not now*. **Only the admin sees Members**; editors and viewers see their own role and who the admin is, so
  they know whom to ask.
- **Q14 Leave institute and delete institute are in this pass** (delete needs the name typed). Account deletion
  and data export belong to pass #2.
- **Q7 (reopened) Google plus email link in this pass.** gndec.ac.in mail runs on its own server (MX
  `mx7.gndec.ac.in`, an `.invalid.outlook.com` fallback), so Google-only would lock out college addresses. The
  built-in sender reaches the project's team, enough to build and test; the real-user SMTP sender (needs a domain
  we own) comes at deploy. No Microsoft sign-in. Free projects on the default sender can't edit email templates,
  so it is a link for now; a 6-digit code can be weighed at deploy.
- **Q10 Invites match the sign-in email**, whichever method is used. The admin invites the address the person will
  sign in with.
- **Q15 Exactly one admin per institute.** The admin can do everything an editor can, plus manage members and the
  institute. *Make admin* hands the role to an existing member and makes the old admin an editor. The admin can't
  leave without handing over. An admin who leaves the college without handing over is fixed by hand in the
  Supabase dashboard. Invites are for editor or viewer only.
- **Q16 Invites are accepted automatically** on sign-in, with a toast. A wrong invite is harmless: leave, or the
  admin removes it. Rejected: an Accept/Decline prompt.
- **Q17 Anyone signed in can create an institute.** No approval step; a per-user cap or payments can come if abuse
  shows up.
- **Q18 No read-only mode over local data.** Roles only govern members in this pass; viewer limits arrive with the
  data in #3.
- **Q19 Three tickets:** T19 sign-in and T20 schema/RLS in parallel, then T21 the UI.
- **Q20 One-time setup is done by the user** through a wizard in T19, and T20 gets its own wizard for the CLI link
  and the server keys.
