# Features

The app builds a clash-free weekly class timetable for a college. One coordinator enters the data and generates the timetable, then prints or exports it. Everything is saved in the browser (`localStorage`), so there is no login and no database.

The app walks through four steps: ① Setup week → ② Add data → ③ Generate → ④ View & export. Each step has a one-line hint, and non-obvious fields have ⓘ tooltips.

## ① Setup week

- **Working days.** Pick any days from Mon to Sun.
- **Periods.** Edit each period's label, start, end and kind (teaching or break), or fill the table with **Generate periods** from a start time, length and count. Every day uses the same periods.
- **Lunch candidates.** Mark the teaching periods where lunch may fall. Every section and every teacher gets at least one of them free each day.
- **Inline checks.** A period with an empty label, missing times, an end before its start, or a start before the previous period ends is highlighted. The step also needs at least one working day, one teaching period and one lunch candidate.

Changing any setting clears the current timetable and its locks, because placements refer to day and period positions.

## ② Add data

- **Sample college.** One click loads 3 departments, 9 sections, 25 teachers and the courses behind 210 sessions.
- **Excel template and import.** Download a workbook with one sheet per table (Departments, Teachers, Rooms, Sections, Courses), fill it in, and upload it. A CSV per sheet works too. An import with any error is rejected as a whole and lists the problems by row, e.g. `Courses row 7: teacher "Sharma" not found`. A valid import asks before it replaces the current data.
- **Export.** Download the current data as `.xlsx` in the same template format.
- **Edit tables.** Tabs for Courses, Sections, Teachers, Rooms and Departments, with add, edit and delete.
- **Rooms.** A room is a classroom or a lab. A room with no department is shared by everyone; a room with a department serves only that department. A lab course can require one specific lab.
- **Lab batches.** A section can split into batches. Each batch gets its own lab sessions, batches can be in different labs at the same time, and each batch can have its own lab teacher.
- **Data checks.** The summary shows counts, load bars for the busiest sections, and two kinds of problems. Missing references, a session with no eligible room, or a lab longer than any run of consecutive teaching periods block **Next**. A section or teacher booked for more periods than the week has gives a warning, and so does a room pool booked beyond its periods: a lab that courses require, the classrooms or labs one department may use (its own plus shared ones), or all rooms of a type.

## ③ Generate

- **Engine choice.**
  - *Auto* (default) tries the server first and falls back to the browser.
  - *Exact* uses the CP-SAT solver on the Python server (FastAPI + OR-Tools). It finds the best timetable or proves none exists. The sample college solves to the optimum (score 18) in about 10 s.
  - *Fast* runs a heuristic in a Web Worker, so the page stays responsive. It places the most constrained sessions first, restarts with different random seeds, then improves the result by moving and swapping sessions. On the sample it places all 210 sessions with score 18 in about 1.5 s.
- **Time limit.** A slider from 5 to 60 s (default 20). A dot shows whether the solver server is online, and a timer counts the elapsed seconds.
- **Automatic fallback.** In Auto mode, the heuristic takes over when the server is unreachable, times out, errors, or reports the input infeasible. For infeasible input it returns a partial timetable.
- **Unplaced sessions.** Any session that could not be placed is listed with the reason, such as the teacher or room that blocked it.
- **Verification badge.** A TypeScript validator re-checks every result against the hard rules, whichever engine produced it, and the badge reads e.g. `✓ Verified: 0 clashes · engine: CP-SAT (optimal)`. The score is also recomputed in the browser, so both engines are scored by the same code.

## ④ View & export

- **Timetable grid.** One week grid with a Section / Teacher / Room switcher, a searchable picker grouped by department, and previous/next buttons. Labs span their periods, each subject has its own colour, and parallel batch labs stack in one cell.
- **Session details.** Hover a cell for a tooltip; click it for subject, section, batch, teacher, room and time.
- **Lock and regenerate.** In the details dialog, **Lock here** pins a session to its slot (shown with 🔒 and a thick border). **Regenerate (keep N locked)**, in steps ③ and ④, re-solves everything else with the engine chosen in step ③. Locks that no longer fit the data, such as a deleted room or two locks that clash, are dropped with a warning before solving. **Clear all locks** removes them all.
- **Drag and drop.** In the Section view, drag a class to another slot. Free slots turn green and show how the score would change; the rest turn red, and the dragged card says why (e.g. "Dr. Meera Iyer teaches CSE B Database Systems at Tue P3"). A lab grabbed by its second period lands one period earlier, so it goes where it looks. A drop is re-checked by the validator, then the class is moved, locked there and the score updated, with an **Undo** in the toast. Unplaced sessions can be dragged onto the grid the same way. Step ④ shows the verified badge, so you can see the timetable is still clash-free.
- **Stats panel.**
  - Quality score, broken down by soft rule, with a tooltip for each rule.
  - Room utilisation bars, with a headline figure for shared rooms.
  - A sortable teacher load table with per-day bars and Highest/Lowest badges.
- **Print / PDF.** **Print this timetable** prints the current view; **Print all sections** prints one A4 landscape page per section. Subject colours are kept and app controls are hidden. Use the browser's *Save as PDF* to get a file. A heading line (e.g. college and semester) is printed at the top and saved with the data.
- **CSV.** Downloads every placement as one row: section, batch, day, periods, time, subject, kind, teacher, room. It opens cleanly in Excel.

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
- CP-SAT needs about 2 s before its first solution on the sample, so very short limits can fail and fall back to the heuristic.
- *Exact* mode with the server off shows an error and keeps the previous result. Only *Auto* falls back.
- A lock that blocks every other slot shows up as unplaced sessions rather than a dropped lock.
- Printouts don't show the 🔒 marker.

- Drag and drop works in the Section view only, with a mouse; there is no keyboard dragging (use *Lock here* instead).

## Not built yet

- Vercel deploy with an in-browser glpk.js solver (T14).
