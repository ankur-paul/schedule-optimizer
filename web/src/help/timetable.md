# Reading the timetable

Step ④: browsing the timetable, the score, locks, drag and drop, and printing.

## Browsing the timetable {#views}

Step ④ shows one week grid at a time.

- **Section**, **Teacher** and **Room** at the top left switch what the grid is for. The picker next to them lists every section, teacher or room by department, and you can type to search it. The arrows step to the previous or next one.
- Each subject has its own colour. A lab spans its periods. When batches of a section are in labs at the same time, their cards stack in one cell, marked B1, B2 and so on.
- The striped column is a break. Periods marked with a plate icon are lunch candidates.
- Click a class to see its subject, section, batch, teacher, room and time.
- Below the grid, **Room utilisation** shows how much of the week each room is in use, and **Teacher load** shows each teacher's periods per day. Click a column heading in the teacher table to sort it.

## The score and the soft rules {#score}

Every timetable Lattice makes follows the hard rules: no clashes, the right rooms, labs in one piece, lunch for everyone. The **score** measures the rest: things that are allowed but make the week worse. Lower is better and 0 is perfect.

Each soft rule adds points:

| Rule | Points | What counts |
|---|---|---|
| Same subject twice in a day | 10 per extra lecture | A second lecture of the same course on one day |
| Teachers with long runs | 5 per extra period | Each period a teacher teaches beyond 3 in a row. A break ends the run. |
| Free periods between classes | 2 per free period | An idle period between a section's first and last class of the day. Lunch candidates don't count. |
| Batches waiting during labs | 3 per batch-period | A period where one batch of a split section is in a lab and another batch has nothing |

Step ③ shows the score with a box per rule, and step ④ shows it as one line of chips under the badge. A chip turns amber when its rule costs points. Each box or chip also says what was counted, such as "6 batch-periods".

Things to know:

- The sample college scores 18 at best: 6 periods where a batch waits during the other batch's lab. Some points are often unavoidable.
- The same score means the same thing whichever way the timetable was made, because your browser recounts it.
- To lower the score, give the exact solver more time (**Try longer** in step ③), or look at what the points come from. Batch waiting time drops when the batches have labs of different subjects at the same time.

## Locks and Regenerate {#locks}

A lock pins a class to its slot and room, so the next run keeps it there and rearranges everything else around it.

1. Hover over a class in the grid and click the lock in its corner. You can also click the class and choose **Lock here**. A locked class shows a 🔒 and a thick border.
2. Lock as many classes as you like, for example a teacher who can only come on Monday mornings.
3. Click **Regenerate (keep 3 locked)**, in step ③ or ④. The exact solver rebuilds the rest of the timetable around the locks. While the solver is offline the button reads **Regenerate as quick draft**.

To unlock one class, click its lock again or choose **Unlock** in its details. **Clear all locks** removes them all.

![The CSE A timetable in step ④, with the Database Systems lecture on Monday P2 locked: a lock in its corner and a thick border](/help/grid-locked-class.png)

Things to know:

- If Regenerate fails, your timetable stays as it was. A message says why, such as "Can't be built with these locks.", with **See why →**, which opens the reasons in step ③. A red line above the grid offers **Clear all locks** until the next run. See [Locks make it impossible](/help/generate#locks).
- Locks that no longer fit the data, such as a class in a room you deleted or two locks that clash, are dropped before the run, with a message saying which.
- Changing the week in step ① clears all locks.
- Printouts don't show the 🔒.

## Drag and drop

You can move a class by hand in the **Section** view.

1. Drag a class card. Slots it could move to turn green and show how the score would change. The rest turn red, and the card you're dragging says why, such as "Dr. Meera Iyer teaches CSE B Database Systems at Tue P3".
2. Drop it on a green slot. The class moves there and is locked, and the score updates.
3. To put it back, click **Undo** in the message that appears, or the Undo arrow at the top of the page. See [Undo and Redo](#undo).

Things to know:

- A lab dragged by its second period lands one period earlier, so it goes where it looks like it will.
- Classes that couldn't be placed are listed under the grid of their section. Drag them onto a green slot the same way.
- Every drop is checked against the hard rules, so the badge above the grid still says 0 clashes.
- Dragging works with a mouse, in the Section view only. With a keyboard, use **Lock here** and **Regenerate** instead.

## Undo and Redo {#undo}

Once you have moved a class, an Undo arrow appears at the top of the page, next to **Start over**. Hover over it to see what it will undo, such as "Undo: move CSE A Operating Systems to Mon P8".

- Click it, or press **Ctrl+Z** (**⌘Z** on a Mac), to put things back as they were before that change. A message says what was undone.
- After an undo, a Redo arrow appears. Click it, or press **Ctrl+Shift+Z** (**⇧⌘Z**), to make the change again.
- You can go back up to 20 changes. Making a new change after an undo clears Redo.

Things to know:

- Drag-and-drop moves go on the list. Edits in the step ② tables, changes to the week in step ①, and **Generate** don't, so you can't undo them on their own.
- An undo puts back the whole timetable, data and locks as they were before the change. A table edit you made after that change is undone with it.
- Ctrl+Z inside a text box undoes your typing there, as usual, not the last change.
- The list is lost when you reload the page.
- If the timetable is saved online, Undo changes only the copy in your browser. The status at the top then shows unsaved changes until you save again.

## Print and CSV {#print}

**Print** is the main button in step ④. It opens a small panel:

1. Type the **Heading on printouts**, such as your college name and semester. It's printed under each timetable's title and saved with your data.
2. Choose **This timetable** to print the grid you're looking at, or **All sections** to print every section, one A4 landscape page each.
3. In your browser's print dialog, pick a printer, or *Save as PDF* to get a file.

![The Print panel open in step ④, with the heading "GNDEC Ludhiana · Semester 5, 2026" and the This timetable and All sections buttons](/help/print-panel.png)

Printouts keep the subject colours and leave out buttons, messages and the score. If some classes aren't placed, the panel warns you that they won't appear.

**CSV**, next to Print, downloads `timetable.csv`: one row per class with its section, batch, day, periods, time, subject, kind (lecture or lab), teacher and room. It opens in Excel.
