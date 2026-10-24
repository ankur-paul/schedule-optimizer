# Store institute data online (discussion, 24 Oct 2026)

Roadmap idea #3. Grilled over four rounds; the plan below is what came out. The grilling notes at the end keep the
reasons and the options turned down.

## Plan

### What changes for the user

- **The device comes first.** The browser keeps one **working copy**, the same `localStorage` data as v1, and the
  app works on it signed in or out. Nothing goes online until someone clicks **Save online**.
- **Save online** uploads the working copy as a new **version** of an online timetable. The first save asks for an
  institute and a timetable name; from then on the working copy is **linked** to that timetable and each *Save
  online* adds a version to it. *Save as new timetable* starts another one.
- **Open from institute** lists the active institute's timetables and downloads one into the working copy, asking
  first if the working copy has changes that were never saved online.
- A header line shows where the working copy stands: "CSE odd sem 2026 · GNDEC · unsaved changes", or "On this
  device only".
- **Two editors:** *Save online* checks that nobody saved the timetable since you opened it. If someone did: "Changed
  online by A at 10:42 since you opened it" with *Overwrite*, *Save as new timetable* or *Cancel*. Nothing is merged.
- **Publish** makes the latest saved version **live** at a public link, `<site>/<handle>/<id>`, e.g.
  `/gndec/k7f3q9xa2m`. Students and teachers open it without signing in. The link never changes; publishing again
  updates what it shows, and the page says "Updated 24 Oct 2026".
- **Versions** lists a timetable's saved versions (number, who, when, which one is live) with *Open* (load into the
  working copy), *Make live* (the link switches to that version at once, the undo for a wrong publish) and
  *Unpublish*.
- **The public page** has a Section / Teacher / Room picker and the step ④ grids, read-only and printable. On a
  phone it shows one day at a time with day tabs, opening on today. It is marked `noindex`.
- Signing in or out still leaves the working copy alone.

### Roles

| Role | Online timetables |
|---|---|
| Admin | everything an editor can, plus delete a timetable (type its name) and set the institute's handle |
| Editor | open, save, save as new, rename, publish, make live, unpublish |
| Viewer | open and view versions; changes nothing online. They may still edit the working copy on their own device. |

- **Handle:** the institute's part of the link (`gndec`): lowercase letters, digits and `-`, 3–30 characters, unique
  across Lattice, a few words reserved (`assets`, `privacy`, `terms`, …). The admin picks it the first time anyone
  in the institute publishes; an editor who publishes first is told to ask the admin. The admin can change it; old
  links keep working because the random id finds the timetable.

### What a version holds

The working copy's settings, departments, teachers, rooms, sections, courses, locks, result and print heading, as
one JSONB document of at most 2 MB. `step` and `timeLimitSec` stay with the device. A version may have no result;
publishing needs one.

Supabase keeps the **last 20 versions** of each timetable, plus the live one if it is older. Deleting a timetable
deletes all its versions and takes its link down; deleting the institute deletes its timetables.

### Privacy

- Policy **v2** covers storing data online, who can see it per role, publishing (public to anyone with the link, not
  indexed), the 20-version limit and what deleting removes. The version bump makes every signed-in user accept
  again.
- The Terms line "when you add details about other people … you confirm that your institution allows you to do so"
  widens to cover saving online and publishing. It **replaces** pass #2's separate "admin confirms at first upload"
  step (Q24).
- The database refuses saves and publishes from a user who hasn't accepted the current policy version, so every
  saver has a consent row for the wording that covers it.
- Self-serve export is **cut** from this pass; the policy keeps offering a summary by email.

### Where it runs

Same as the auth pass: the browser calls Supabase directly with the user's token; RLS and `security definer`
functions are the rule book. The public page calls one function, `get_published`, as `anon`.

Supabase Storage serves HTML as plain text, so a published timetable is not an uploaded HTML file. The web app gets
one more static page, `published.html` (like `/privacy`), which reads the live version through `get_published` and
renders it. The dev server and the host rewrite `/<handle>/<id>` to it.

### Data model (`supabase/migrations/`)

- `institutes.handle`: nullable, unique, format-checked, reserved words refused.
- `timetables(id, institute_id, name, public_id, latest_version, live_version, created_by, created_at)`: name
  unique per institute (ignoring case), `public_id` a random 10-character id made at creation.
- `timetable_versions(timetable_id, version, data jsonb, saved_by, saved_at)`, primary key
  `(timetable_id, version)`, `data` at most 2 MB.
- Members read both tables (the version list reads without `data`). All writes go through functions: create, save
  (with the version check, then prune to 20 plus live), rename, delete, publish/make live, unpublish, set handle.
  Editors and the admin write; viewers and non-members are refused; delete and handle are admin only.
- `get_published(public_id)` for `anon`: the institute name and current handle, the timetable name, the live
  version's time and its data without locks. Nothing when it isn't published.

### Tests

Pytest marked `supabase`, per role (admin, editor, viewer, non-member, signed out) for every table and function, as
in the auth pass. Vitest for the pure logic: working-copy ↔ version document, the unsaved-changes check, handle
rules, URL building and parsing, the public page's day-tab choice.

### Tickets

- **T27 Schema and RLS** (Prereqs: —). Tables, functions, pruning, `get_published`, the policy check, tests.
- **T28 Save and open** (Prereqs: T27). The working-copy link, header status, Save online, Save as new, the conflict
  dialog, Open from institute, rename and delete, viewer limits.
- **T29 Versions and publish** (Prereqs: T28). Versions dialog, Publish, copy link, the handle prompt and setting.
- **T30 Public timetable page** (Prereqs: T27). `published.html`, the dev rewrite, picker, phone layout, print.
  Runs alongside T28.
- **T31 Policy v2** (Prereqs: T29, T30). Claude drafts the texts, the user approves, a migration publishes v2.

### Env vars and services (copy to the roadmap's deploy list)

- No new env vars. The public link is built from the page's own origin.
- The host rewrites two-segment paths `/<handle>/<id>` to `published.html`, leaving `/assets/*` and real files
  alone (Vercel `rewrites`, Cloudflare Pages `_redirects`).
- A paused free Supabase project breaks every published link, not only sign-in. Production needs a project that
  doesn't pause, or a keep-alive.

### Not in this pass

- Export of institute data (cut, Q5).
- Live updates: you see someone else's save when you open the timetable or hit the conflict check.
- Merging two editors' changes.
- Offline editing of online data; the working copy is the offline story.
- Schools (fixed classrooms, teacher availability, option groups, double periods, different day shapes): raised
  during the discussion, set aside for now.

## Grilling notes

- **Q1 One JSONB document per version.** The app already handles its state as one object, validation lives in
  TypeScript and Pydantic, and a save writes one row. Nothing planned needs SQL over single teachers; the agent (#5)
  can edit the document on the server. Rejected: a table per entity (a lot of schema, RLS and sync code).
- **Q2 Device first, upload on request.** Data stays on the device and goes online only when the user clicks *Save
  online*. Rejected: online as the source of truth while an institute is selected; local first with background
  sync (merge logic, conflicts on reconnect).
- **Q3 Several named timetables per institute,** one per semester or department.
- **Q4 Share links are in this pass,** as a published page. The user's first idea was
  `<site>/<institute-username>/<YYYYMMDD>`; dates collide when two timetables are published on one day, are easy to
  guess (every past timetable, with teacher names, could be found), and a republish would need a new link. See Q10.
- **Q5 No export.** Skipped by the user; the policy's summary by email stays.
- **Q6 One working copy, linked to at most one online timetable,** with *Save online* and *Open from institute*,
  and a header status line.
- **Q7 Version check on save** with *Overwrite*, *Save as new* or *Cancel*. Rejected: last write wins silently;
  locking.
- **Q8 Viewers** open and view but can't write online; on their own device they can still change the working copy.
- **Q10 One stable link per timetable,** `/<handle>/<random id>`; republishing updates it and the date shows on the
  page.
- **Q13 The public page** shows section, teacher and room views; the admin and editors publish; *Publish* publishes
  the saved version and asks to save first when there are unsaved changes.
- **Versions (raised by the user after Q13):** a wrong publish must be undoable at once. Folded into Q15.
- **Q15 Saves make versions, publishing points the link at one.** *Make live* is the rollback, *Open* recovers an
  old version, and *Overwrite* (Q7) loses nothing.
- **Q16 Keep the last 20 versions plus the live one.** Rejected: keep everything until deleted.
- **Q17 The admin sets the handle,** prompted at the first publish, changeable later.
- **Q18 A version holds** the data, locks, result and print heading; step and time limit stay on the device.
- **Q19 Editors and the admin rename; only the admin deletes,** by typing the name.
- **Q20 Policy v2,** drafted by Claude and approved by the user, published in the last ticket.
- **Q21 Phone layout:** one day at a time with day tabs, opening on today.
- **Q22 2 MB per version,** enforced by the database, so a buggy client can't fill the free 500 MB.
- **Q23 Five tickets,** T27–T31.
- **Q24 Dropped: a separate admin confirmation before the first upload.** The user asked why the Terms line
  shouldn't cover it. It already says the user confirms their institution allows them to add other people's
  details; v2 widens it to saving and publishing, every signed-in user re-accepts it, and the database refuses
  saves without that consent. A separate prompt would add a blocked state for editors without a stronger record.
  This reverses pass #2's "admin confirms at first upload".
- **Schools (side question):** the model fits simple schools but lacks fixed classrooms per class, teacher
  availability, parallel option groups, non-lab double periods and different day shapes. The user set it aside.
