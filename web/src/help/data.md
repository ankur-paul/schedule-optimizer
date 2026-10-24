# Your data

The week (step ①) and the college (step ②): departments, teachers, rooms, sections and courses, and how to bring them in from Excel.

## The week: days, periods and breaks {#week}

Step ① sets the bell schedule. Every working day uses the same periods.

1. Under **Working days**, click the days that have classes. A new setup starts with Mon–Fri.
2. Under **Periods**, fill in the **Generate periods** form: when the first period starts, how long a period is, how many teaching periods there are, and where the short break goes. **Create periods** builds the table. You can then edit any row's label, start, end and kind (*teaching* or *break*), move rows up and down, or add and remove them.
3. Under **Lunch candidates**, tick the periods where lunch may fall (see [Lunch candidates](#lunch-candidates)).

Things to know:

- A break is free time for everyone, like a tea break. Nothing is placed in it, and a lab can't run across it. Lunch is not a break: it's a teaching period that is kept free.
- A row turns red when its label is empty, a time is missing, it ends before it starts, or it starts before the previous period ends. **Next** stays disabled until the step has at least one working day, one teaching period and one lunch candidate.
- **Changing anything in step ① clears the timetable and its locks**, because a placed class is stored by its day and period. Settle the week before you generate.

## The Excel template and import {#excel}

If your data is already in a spreadsheet, the template is the quickest way in.

1. In step ②, click **Template** to download `timetable-template.xlsx`. It has four sheets, **Teachers**, **Rooms**, **Sections** and **Courses**, each with two example rows.
2. Replace the example rows with your own. Keep the header row.
3. Click **Choose file** and pick the workbook. You can also upload one CSV per sheet, named `Teachers.csv`, `Rooms.csv`, `Sections.csv` and `Courses.csv`; select them all at once.
4. If the file is fine, a card says "*file* looks good" and what it found. Click **Import**. It replaces all current teachers, rooms, sections and courses, so it asks first if you already have data.

The columns:

| Sheet | Columns |
|---|---|
| Teachers | Name, Department |
| Rooms | Name, Type (`classroom` or `lab`), Department (blank for a shared room) |
| Sections | Name, Department, Lab Batches |
| Courses | Section, Subject, Teacher, Lectures/Week, Lab Sessions/Week, Lab Length, Lab Room, Batch Teachers |

Things to know:

- There is no Departments sheet. Departments are made from the names in the Department columns, so spell each one the same way everywhere. Capitals and extra spaces don't matter.
- A course row points at the other sheets by name: its Section must be a name on the Sections sheet, its Teacher a name on the Teachers sheet, and so on.
- Lab Length is in periods and defaults to 2. Lab Room is optional (see [Departments and rooms](#rooms)). Batch Teachers lists one name per batch, in batch order, separated by commas (see [Lab batches](#lab-batches)).
- **Export current data** downloads what you have now in the same format. To change many rows at once, export, edit in Excel and import again.

## Import errors

If anything in the file is wrong, nothing is imported. A red card lists the problems, each with its sheet and its row number as Excel shows it (the header is row 1), such as `Courses row 7: teacher "Sharma" not found in Teachers sheet`.

Fix those rows in your file and upload it again. The usual causes:

- **`Missing sheet "Rooms"`**: the workbook needs all four sheets, with those names. For CSV files the file name is the sheet name.
- **`… not found in Teachers sheet`** (or Sections, or Rooms): the name in the course row matches no row on that sheet. Look for a different spelling, a title such as "Dr." on one side only, or a missing row.
- **`… is listed twice`**: two rows on one sheet have the same name, or one section has the same subject twice.
- **`… must be a whole number ≥ 0`**: a number column holds text, a decimal or a negative number.
- **`needs at least one lecture or lab session per week`**: Lectures/Week and Lab Sessions/Week are both 0 or empty.
- **`"X" is a classroom, not a lab`** or **`lab "X" belongs to another department`**: a Lab Room must be a lab that is shared or owned by the section's department.
- **`Batch Teachers lists 1 name(s) but "CSE A" has 2 batch(es)`**: give one name per batch, or leave the cell empty so the course teacher takes every batch.

The card shows the first 15 problems. Once you fix those, upload again to see any others.

## Departments and rooms {#rooms}

Departments decide which rooms a section may use.

- A room is a **classroom** or a **lab**. Lectures go in classrooms and labs go in labs.
- A room **with a department** is used only by that department's sections.
- A room **with no department** (*Shared (any department)* in the Rooms tab) can be used by any section. Seminar halls and central labs are usually shared.
- A course's **Lab room** pins its labs to one lab. Leave it on *Any eligible lab* to let the solver choose. The list offers only labs the section may use.

Things to know:

- Each department needs enough rooms of each type for its sections, counting its own rooms and the shared ones. If it doesn't have them, the [data checks](#data-checks) warn you.
- Pinning many courses to one lab often makes a timetable impossible. Pin a lab only when the course needs that room.
- Deleting a room that courses use asks first. Those courses then use any eligible lab.

## Lab batches and batch teachers {#lab-batches}

A section can split into batches for labs, for example when a lab has fewer seats than the section has students.

- Set **Lab batches** on the section in the Sections tab: 1 means no split, 2 means two batches, and so on.
- Each batch gets its own lab sessions. **Labs/wk** on a course counts sessions per batch, so 1 lab a week in a section with 2 batches puts 2 lab sessions in the timetable.
- Batches of one section can be in different labs at the same time. A whole-section lecture clashes with every batch.
- **Batch teachers**: by default the course teacher takes every batch's lab. To give a batch its own lab teacher, click the Batch teachers cell in the Courses tab and pick a teacher for that batch. The cell then lists only the batches with their own teacher.

Things to know:

- While one batch is in a lab and another has nothing, the score goes up by 3 for each waiting period (*Batches waiting during labs*, see [the score](/help/timetable#score)). It stays low when the other batch has a lab of another subject at the same time.
- In the Courses tab, filtering by a teacher also shows the courses where they take only one batch's lab.

## Lunch candidates

Lunch candidates are the teaching periods where lunch may fall. Every section and every teacher gets at least one of them free each day. You pick them in step ①.

- Pick two or three periods next to each other. With only one, every section and every teacher has lunch in that period, and the timetable has less room to move.
- Classes still go in lunch candidates, as long as each section and each teacher keeps one of them free that day.
- A free lunch candidate doesn't count as a gap in the score.
- The load figures in step ② hold back one period a day for lunch, so "25/35" means 25 periods needed out of 35 free.

## The data checks {#data-checks}

Below the import cards, step ② sums up the data: counts, a load bar for each of the busiest sections, and any problems.

A load bar compares the periods a section needs each week with the periods it has free (teaching periods × days, minus one lunch period a day). For a split section it counts the busiest batch, because batch labs can run at the same time. The Teachers and Sections tabs show the same figure in their **Load** column.

Problems come in two kinds:

- **Problems to fix before generating** (red) block **Next**: a teacher, room or section with no name or department, a course with no section, subject or teacher, a lab room that is missing or isn't a lab, a batch teacher who was deleted, a course no room may host, or a lab longer than the longest run of teaching periods without a break.
- **Probably too full** (amber) is a warning, and you can still generate. A section or teacher needs more periods than the week has free, or a group of rooms is booked for more periods than it has: one lab that courses require, the classrooms or labs one department may use, or all rooms of one type.

A warning almost always means the timetable can't be built in full. Step ③ repeats the warnings under *Before you start*, each with a fix button. The usual fixes are in [Can't be built](/help/generate#cant-be-built).

When nothing is wrong, it says "Data looks complete. Every section fits in the week."
