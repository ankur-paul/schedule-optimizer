# Your first timetable

A five-minute walk through the sample college: load it, generate a timetable, lock a class and print.

## Load the sample college {#load-sample}

The sample college has 3 departments, 9 sections, 25 teachers and 18 rooms, with the courses behind 210 classes a week. It's the quickest way to see what Lattice does before you type in your own data.

1. Open Lattice. It starts at step ① *Setup week*.
2. In the row of steps at the top, click **Add data** (step ②).
3. In the *Load sample college* card, click **Load sample**.

![The three cards at the top of step ②: Load sample college, Download template and Upload your file](/help/data-entry-cards.png)

The sample fills in step ① too: Monday to Friday, eight 50-minute periods from 09:00 with a break after P2, and P4, P5 and P6 as lunch candidates. If you already had data, Lattice asks before replacing it.

## Look at the data checks {#data-checks}

Below the cards, a summary shows how much data there is and how full the busiest sections are.

![The data summary for the sample college: 3 departments, 25 teachers, 18 rooms, 9 sections and 54 courses, load bars such as ME A 26/35, and "Data looks complete. Every section fits in the week."](/help/data-checks.png)

"26/35" means ME A needs 26 periods a week and has 35 free. A red bar would mean a section needs more periods than the week has. With your own data, this is where problems show up first; see [The data checks](/help/data#data-checks).

Below the summary are the tables. Open the **Courses** tab and pick *CSE A* in the section filter: it has six courses, and batch 2 of the Data Structures lab has its own teacher.

Click **Next: Generate**.

## Generate

1. Check the dot at the top right of the card. It should say *Exact solver: online*.
2. Click **Generate timetable**. The button reads *Generating…*, with the time next to it: "7 s of up to 20 s".

![The Exact solver card in step ③, with the dot saying Exact solver: online and the Generate timetable button](/help/generate-card.png)

If the dot says *offline*, the button reads **Make a quick draft** instead. Click it: your browser makes the timetable in a few seconds. See [The solver is offline](/help/troubleshooting#solver-offline) for why.

## Read the score

When the run ends, a green card says *Timetable ready*.

![The Timetable ready card: "The best possible timetable, found by the exact solver", the badge "Timetable ready · 0 clashes (independently checked)", and the score with its points per rule](/help/timetable-ready.png)

- **The badge** says there are 0 clashes. Lattice checked the timetable again in your browser against every hard rule.
- **"The best possible timetable"** means the solver proved nothing better exists. If it ran out of time first, the card says "best found in 20 s" and offers **Try longer**.
- **The score** counts what makes a week worse without breaking a rule. Lower is better. The sample scores 18: six times, one batch of a section waits while the other is in a lab. See [The score and the soft rules](/help/timetable#score).

Click **Next: View & export**.

## Lock a class and regenerate {#lock}

Step ④ shows the CSE A timetable. Use **Section**, **Teacher** and **Room** at the top to switch, and the picker or the arrows to move between sections.

1. Hover over a class and click the lock in its corner. The card gets a 🔒 and a thick border.
2. Click **Regenerate (keep 1 locked)**.

![The CSE A timetable with the Database Systems lecture on Monday P2 locked](/help/grid-locked-class.png)

The solver builds a new timetable around the locked class, and a message says how it went: how many sessions were placed and the new score. The locked class hasn't moved. Use locks for the classes that must stay where they are, then let Lattice arrange the rest. See [Locks and Regenerate](/help/timetable#locks).

## Print

1. Click **Print**.
2. Type a heading, such as "GNDEC Ludhiana · Semester 5, 2026".
3. Click **This timetable** for the grid on screen, or **All sections** for one page per section.
4. In your browser's print dialog, choose a printer, or *Save as PDF*.

![The Print panel with the heading field and the This timetable and All sections buttons](/help/print-panel.png)

To do the same with your own college, start with [the Excel template](/help/data#excel).
