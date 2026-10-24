# Features

Lattice builds a clash-free weekly class timetable for a college. One coordinator enters the data and generates the timetable, then prints or exports it. Everything is saved in the browser (`localStorage`). Signing in is optional. Signed in, you can create or join institutes, manage members as an institute's admin, and save the timetable online to an institute so other members can open it. Nothing goes online until someone clicks *Save online*.

The app walks through four steps: ① Setup week → ② Add data → ③ Generate → ④ View & export. Each step has a one-line hint, and non-obvious fields have ⓘ tooltips. On a narrow screen the stepper shows step numbers and the current step's name.

The header shows the Lattice logo (a 3×3 timetable grid with an L filled in) and name; the browser tab uses the same mark as its icon, a dark tile in a light browser and a light tile in a dark one (`web/public/logo.svg`, `logo-light.svg`).

## Account

- **Sign in (optional).** A **Sign in** button in the header opens a dialog with an unticked *I agree to the Terms and Privacy Policy* box (both linked, opening in a new tab), *Continue with Google* and *Email me a sign-in link* ("Check your inbox at …"). Both buttons stay disabled until the box is ticked. Signed in, the button becomes an avatar (Google's picture, or initials) whose menu shows your name (or email), *Privacy*, *Terms* and **Sign out**. The session survives a reload.
- **Consent.** Every acceptance of the Terms and Privacy Policy is recorded with its version and time. The box ticked at sign-in is recorded when you come back from Google or the email link. Without that (an email link opened in another browser, or an account from before consent existed), a dialog *Before you continue* blocks the account until you choose *Accept* or *Sign out*; it has no close button and ignores Esc and outside clicks. When the policy version goes up, signed-in users get the same dialog titled *We've updated our Terms and Privacy Policy*, with a *What changed* list. Nothing else happens to the account, including joining institutes from invites, until it is accepted.
- **Signed out is the full app.** Signing in or out never touches the timetable data in the browser. Without `web/.env.local` (set up by `scripts/setup-auth.sh`) there is no Sign in button at all.
- An expired or reused email link shows a toast asking for a new one.
- **Institutes.** On every sign-in, pending invites for your email are accepted at once, with a toast like "You joined GNDEC Ludhiana as editor". With no institute and no invite, a *Create institute* dialog asks for a name, with *Not now* (it then won't open by itself again in that browser). The avatar menu shows the active institute, your role and its admin ("Editor · admin is Dr. Meera Iyer (meera@…)"), and *Create institute…*. With two or more institutes it lists them to switch; the choice is remembered per browser, falling back to the first institute if it's gone.
- **Roles.** Each institute has exactly one admin, plus editors and viewers. Editors and viewers see their role and who the admin is, and can *Leave institute* (after a confirm). Only the admin sees *Members…*, *Rename…* and *Delete institute…* (type the name to confirm). Roles are enforced by the database; a refusal shows as a plain-words toast such as "Only the admin can do that."
- **Members (admin).** The admin first, then everyone else with name, email and a role select (editor/viewer), *Make admin* (hands the role over; you become an editor) and *Remove*. Pending invites have *Cancel*. The invite form takes an email and a role, says to use the address they'll sign in with, and rejects a malformed address, an existing member or one already invited before calling the database. No invite email is sent; tell them to sign in.
- **Online timetables.** A status line in the header, left of the avatar, shows where the working copy stands: "On this device only", or the linked online timetable and its institute ("CSE odd sem 2026 · GNDEC"), plus "· unsaved changes" (with an amber dot) or "· view only" for viewers. On a narrow screen only the icon shows. Its menu:
  - *Save online*: the first time, a dialog picks the institute (where you are admin or editor, starting with the active one) and the name (the print heading, else "Timetable"), then links the working copy to the new timetable. After that it adds a version. If someone saved since you opened it: "Changed online by A at 10:42 since you opened it" with *Overwrite*, *Save as new timetable…* or *Cancel*. If the timetable was deleted or you lost edit access, it says so and offers *Save as new timetable…*. A network error is a toast; nothing changes.
  - *Save as new timetable…* (name defaults to "<name> (copy)"), *Open from <institute>…* (name, latest version, who saved it and when, a *Live* badge for published ones; opening over unsaved work asks *Replace your working copy?*), *Rename…* (admin and editors), *Delete…* (admin, type the name; drops the link, keeps the working copy) and *Work on this device only* (drops the link, keeps the data).
  - Viewers can open timetables but get no write actions. Signed out, the line stays and *Save online* says to sign in. *Start over* drops the link; everything else (import, sample, edits, generate) only marks unsaved changes. The link survives a reload. Step and time limit stay on the device.
- **Email confirmation.** *Make admin* and *Leave institute* need you to have signed in by email link in the last 10 minutes; the database refuses them otherwise. If you haven't, a *Confirm from your email* dialog emails a sign-in link to your own address (Google users too). Opening it, in the same tab or a new one, signs you in again and asks *Make X the admin of Y?* (or *Leave Y?*) once more before doing it.
- **Privacy Policy and Terms.** *Privacy* and *Terms* links under every step open `/privacy` and `/terms` in a new tab: plain pages with the Lattice header and *Back to Lattice*, readable without JavaScript and printable on A4. The text comes from `web/src/legal/privacy.md` and `terms.md`, with the version, effective date, operator and contact address (`VITE_CONTACT_EMAIL`) filled in at build time; without that variable the pages say "(contact address not set)".

## ① Setup week

- **Working days.** Pick any days from Mon to Sun. A new setup starts with Mon–Fri ticked and no periods.
- **Periods.** Edit each period's label, start, end and kind (teaching or break), or fill the table with **Generate periods** from a start time, length and count. The form is open while there are no periods. Every day uses the same periods.
- **Lunch candidates.** Mark the teaching periods where lunch may fall. Every section and every teacher gets at least one of them free each day.
- **Inline checks.** A period with an empty label, missing times, an end before its start, or a start before the previous period ends is highlighted. The step also needs at least one working day, one teaching period and one lunch candidate.

Changing any setting clears the current timetable and its locks, because placements refer to day and period positions.

## ② Add data

- **Sample college.** One click loads 3 departments, 9 sections, 25 teachers and the courses behind 210 sessions.
- **Excel template and import.** Download a workbook with one sheet per table (Departments, Teachers, Rooms, Sections, Courses), fill it in, and upload it. A CSV per sheet works too. An import with any error is rejected as a whole and lists the problems by row, e.g. `Courses row 7: teacher "Sharma" not found`. A valid import asks before it replaces the current data.
- **Export.** Download the current data as `.xlsx` in the same template format.
- **Edit tables.** Tabs for Departments, Rooms, Teachers, Sections and Courses, in the order the data depends on, with add, edit and delete. The step opens on Departments while there is no data and on Courses once courses exist. Courses can be filtered by section (the same searchable picker as step ④) and by teacher (a teacher's courses include those where they only take one batch's lab); the filters reset on reload.
- **Rooms.** A room is a classroom or a lab. A room with no department is shared by everyone; a room with a department serves only that department. A lab course can require one specific lab.
- **Lab batches.** A section can split into batches. Each batch gets its own lab sessions, batches can be in different labs at the same time, and each batch can have its own lab teacher. In the Courses table, the batch teachers cell lists only the batches with their own teacher and opens a small form with one picker per batch.
- **Data checks.** The summary shows counts, load bars for the busiest sections, and two kinds of problems. Missing references, a session with no eligible room, or a lab longer than any run of consecutive teaching periods block **Next**. A section or teacher booked for more periods than the week has gives a warning, and so does a room pool booked beyond its periods: a lab that courses require, the classrooms or labs one department may use (its own plus shared ones), or all rooms of a type.

## ③ Generate

- **Exact solver only.** **Generate timetable** asks the exact solver (OR-Tools CP-SAT on the Python server). It finds the best timetable or proves none exists; the sample college solves to the optimum (score 18) in about 10 s. There is no engine picker and no silent fallback: the browser's quick draft runs only from a button that says *quick draft* or *partial*. The browser replaces teacher names with their ids before sending the data, so the solver never receives a name; the server logs no request bodies.
- **Server status.** A dot reads *Exact solver: online / offline* and is re-checked every 5 s. While it is offline an amber banner says a quick draft will be made in the browser instead (in dev builds it also shows the command that starts the server), and the main button reads **Make a quick draft**. When the server comes back the banner goes and the button returns to *Generate timetable*.
- **Quick draft.** A heuristic in a Web Worker: it places the most constrained sessions first, restarts with different random seeds, then improves the result by moving and swapping sessions. On the sample it places all 210 sessions with score 18 in about 1.5 s (it uses at most 5 s).
- **Before you start.** Section, teacher and room loads that exceed the week (from step ②'s checks) are listed above the button with a fix link each. They never block Generate.
- **Time limit.** Under *Advanced: time limit*, a slider from 5 to 120 s (default 20). While a run is going the button reads *Generating…* with "7 s of up to 20 s".
- **Cancel.** **Cancel** next to *Generating…* (or *Regenerating…* in step ④) stops the run and never starts a quick draft; the previous timetable stays.
- **One main button.** **Generate timetable** is the main button until a timetable exists; then **Next: View & export** takes over and Regenerate turns into an outlined button. **Next** stays disabled until there is a timetable and while a run is going. A finished run scrolls its result into view.
- **Timetable ready.** A green card: *best possible* when the solver proved the optimum, or *best found in 20 s* with **Try longer: 40 s** (doubling, up to 120 s).
- **Can't be built.** When the solver proves the data impossible, a red card says so (and that nothing was changed), with the top 5 causes and *+N more*: classes with no room or no long enough run of periods, locks in slots they can't use, locks that make it impossible (re-checked without them for up to 5 s), then section, teacher and room loads by how far over they are. Each cause has a fix button that opens step ② on the right tab, with the Courses filter set to the section or teacher, or step ④ to clear the locks. With no single cause it says the rules conflict in combination and lists general suggestions. **Make a partial timetable** below makes a quick draft that places what fits.
- **Couldn't finish.** When the solver runs out of time, can't be reached or fails, a neutral card says what happened and that the previous timetable is unchanged. A timeout offers **Try again with 40 s** (hidden at 120 s); every kind offers *Make a quick draft instead*.
- **Partial timetable.** An amber card: "Partial: 17 of 237 classes not placed", how it was made, 0 clashes among placed classes, and the unplaced classes grouped by cause (teacher busy, section busy, no free room, no room they may use, lab too long, last lunch period) in collapsible groups. After *Can't be built* it has **Back to the reasons**. Next is allowed.
- **Verification badge.** A TypeScript validator re-checks every result against the hard rules, whichever engine produced it: `✓ Timetable ready · 0 clashes (independently checked)`, or `Partial: N classes not placed · 0 clashes among placed classes`. The score is also recomputed in the browser, so both engines are scored by the same code. Each soft rule shows its points and what was counted, e.g. "Batches waiting during labs · 18 pts · 6 batch-periods", with the same wording in steps ③ and ④.
- **Wording.** Coordinators read "Exact solver" and "Quick draft"; "CP-SAT" appears only in ⓘ tooltips.

## ④ View & export

- **Timetable grid.** One week grid with a Section / Teacher / Room switcher, a searchable picker grouped by department, and previous/next buttons. Labs span their periods, each subject has its own colour (subjects in one section get colours as far apart as the palette allows), and parallel batch labs stack in one cell. The break column reads BREAK and shows its times on hover.
- **Session details.** Click a class for subject, section, batch, teacher, room and time. Screen readers read the whole class from the card.
- **Lock and regenerate.** The lock button in a card's corner, or **Lock here** in the details dialog, pins a session to its slot (shown with 🔒 and a thick border). The button appears on hover or keyboard focus and stays visible on locked classes. **Regenerate (keep N locked)**, in steps ③ and ④, re-solves everything else with the exact solver (while it is offline the button reads *Regenerate as quick draft*). A Regenerate that fails keeps the timetable and toasts "Can't be built with these locks." (or "Couldn't finish in time.") with *See why →* to step ③'s card; while the failure stands, a red line above the grid offers **Clear all locks** and *See why →*. Locks that no longer fit the data, such as a deleted room or two locks that clash, are dropped with a warning before solving. **Clear all locks** removes them all.
- **Drag and drop.** In the Section view, drag a class to another slot. Free slots turn green and show how the score would change; the rest turn red, and the dragged card says why (e.g. "Dr. Meera Iyer teaches CSE B Database Systems at Tue P3"). A lab grabbed by its second period lands one period earlier, so it goes where it looks. A drop is re-checked by the validator, then the class is moved, locked there and the score updated, with an **Undo** in the toast. Unplaced sessions can be dragged onto the grid the same way. Step ④ shows the verified badge, so you can see the timetable is still clash-free.
- **Stats panel.**
  - Quality score as one line under the verified badge: the total and a chip per soft rule, amber when the rule costs points.
  - Room utilisation bars across the full width in two columns, with a headline figure for shared rooms.
  - A sortable teacher load table with per-day bars (labelled Mo, Tu, We…) and Highest/Lowest badges. It shows the top 10 teachers, with **Show all** for the rest.
- **Partial banner.** While the timetable has unplaced classes, an amber banner above the grid says how many and that they can be dragged in; the badge turns amber too.
- **Print / PDF.** **Print** is the main button in step ④. It opens a small panel with the heading printed at the top (e.g. college and semester, saved with the data) and two choices: **This timetable** prints the current view, **All sections** prints one A4 landscape page per section. Subject colours are kept and app controls, toasts and tooltips are hidden. Use the browser's *Save as PDF* to get a file. With unplaced classes the panel warns that they won't appear on printouts.
- **CSV.** The CSV button next to Print (with the outlined Regenerate) downloads every placement as one row: section, batch, day, periods, time, subject, kind, teacher, room. It opens cleanly in Excel.

## Scheduling rules

Hard rules, which a valid timetable never breaks:

| ID | Rule |
|---|---|
| H1 | A teacher is in one session at a time. |
| H2 | A section is in one session at a time. A whole-section class clashes with every batch; two batch labs clash only if they are the same batch. |
| H3 | A room hosts one session at a time. |
| H4 | The room type matches the session, the room is shared or owned by the section's department, and a lab that requires a specific room gets it. |
| H5 | Every session is placed exactly once, or listed as unplaced with a reason. |
| H6 | A lab fills consecutive teaching periods on one day and never spans a break. |
| H7 | Nothing is placed in a break. |
| H8 | Every section and every teacher has a free lunch-candidate period each day. |

Soft rules, which add to the score (lower is better):

| ID | Rule | Penalty |
|---|---|---|
| S1 | The same subject lectured more than once a day | 10 per extra lecture |
| S2 | A teacher teaching more than 3 periods in a row | 5 per period beyond 3 |
| S3 | Idle periods in a section's day, not counting lunch candidates | 2 per period |
| S4 | One batch idle while another batch of the section is in a lab | 3 per idle batch-period |

## Known limits

- The heuristic runs until its time limit unless it reaches score 0, and its results vary slightly between runs.
- The exact solver needs about 2 s before its first solution on the sample, so very short limits end in *Couldn't finish*; heavily over-booked data can also take longer than 5 s to prove impossible.
- A *Can't be built* or *Couldn't finish* card stays until the next run, even after the data is fixed.
- A complete quick draft gets no special label and no *Improve with exact solver* button.
- A lock that blocks every other slot shows up as unplaced sessions rather than a dropped lock.
- Printouts don't show the 🔒 marker.
- Cancelling a CP-SAT run only stops the browser waiting. The server keeps solving until its time limit and its answer is ignored.
- Sign-in emails come from Supabase's built-in sender, which reaches only the Supabase project's team members, 2 emails an hour. Google sign-in works only for accounts listed as test users in Google Cloud. Both open up in the deploy pass.
- Viewers can still edit the working copy in their own browser; they just can't save it online. Someone else's save shows up only when you open the timetable or save (the conflict check), not live, and two editors' changes are never merged.
- The email confirmation is a link, not a 6-digit code, because the built-in sender's templates can't be edited on the free plan. Like sign-in emails, it reaches only the Supabase team, 2 an hour; both change in the deploy pass.
- Changes made by someone else (a new role, a removal, a deleted institute) show up when you next open the account menu, not live.
- The Privacy Policy and Terms haven't been reviewed by a lawyer.
- Consent covers signing in only; the wording for saving online and publishing comes with policy v2 (T31). A policy bump needs a migration row plus `POLICY_VERSION` and `POLICY_CHANGES` in `web/src/legal/policy.ts`; the app and database must agree, or no one can accept the new version.
- Drag and drop works in the Section view only, with a mouse; there is no keyboard dragging (use *Lock here* instead).

## Not built yet

- Vercel deploy with an in-browser glpk.js solver (T14).
- The version list, *Publish* and the public timetable page (T29, T30).
