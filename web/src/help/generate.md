# Generating a timetable

How Lattice builds the timetable in step ③, and what to do when it can't.

## What to aim for {#aims}

The **Aims** button next to Generate in step ③ opens five aims, one switch each. The button says how many are on, such as *Aims: 4 of 5*. They are the soft rules: things a timetable may do but shouldn't. Each aim that's on adds points to the [score](/help/timetable#score) when it's missed, and Generate looks for the timetable with the lowest score. The hard rules, such as no clashes and lunch for everyone, always apply and have no switch.

| Aim | In the score |
|---|---|
| Spread each subject across the week | Same subject twice in a day |
| At most 3 periods in a row for a teacher | Teachers with long runs |
| No free periods between a section's classes | Free periods between classes |
| Keep a section's batches busy at the same time | Batches waiting during labs |
| Finish each day as early as possible | Late finish |

![The Aims: 4 of 5 button and its open list: five switches, the first four on and Finish each day as early as possible off, each with an ⓘ](/help/aims-popover.png)

The first four are on to begin with, and *Finish each day as early as possible* is off. The ⓘ next to each says how many points it costs.

- **Flipping a switch keeps your timetable and its locks.** The score is counted again at once under the new switches, and "Preferences changed: regenerate to use them" appears next to the main button. Generate again to get a timetable made for them. The line goes away after the next run, or if you flip the switches back.
- An aim that's off reads *Off* in the score, not 0, and adds nothing to the total.
- The switches are saved with your data, in your browser and in [online versions](/help/online), so another editor who opens the timetable regenerates it the same way. **Undo** brings back switches that the assistant changed; a switch you flip yourself has no undo step, so flip it back.
- Turning an aim off can let Generate do better on the others, which is why *Finish each day as early as possible* starts off: with it on, the exact solver does much worse on the other four in 20 s. With it off, Generate doesn't mind a section starting late or a teacher waiting for a last class.
- The switches are greyed out while a run is going.

## The exact solver and the quick draft {#engines}

Lattice has two ways to build a timetable.

- **The exact solver** runs on Lattice's server. **Generate timetable** asks it. It either finds the best timetable your data allows or proves that none exists. On the sample college it finds the best one within 20 seconds.
- **A quick draft** is made in your browser in at most 5 seconds. It places the hardest classes first, then moves and swaps classes to improve the score. On the sample college it scores as well as the exact solver. It can't prove that a timetable is the best or that none exists, it may score worse on other data, and if it can't place every class it gives you a [partial timetable](#partial).

A quick draft runs only when you click a button that says so: **Make a quick draft** while the solver is offline, **Make a partial timetable** after *Can't be built*, or **Make a quick draft instead** after *Couldn't finish*. Lattice never switches to it on its own.

The dot at the top right of the card says *Exact solver: online* or *offline*, and is checked again every 5 seconds. Click it to check at once. If the solver is offline, see [The solver is offline](/help/troubleshooting#solver-offline).

Whichever way it was made, every timetable is checked again in your browser against the hard rules (no clashes for teachers, sections or rooms, the right rooms, labs in one piece, nothing in a break, lunch for everyone). The green badge "✓ Timetable ready · 0 clashes (independently checked)" means that check passed.

**Cancel** stops a run. Your previous timetable stays.

Before it sends anything, your browser replaces teacher names with codes, so the solver never sees a name.

## The time limit {#time-limit}

The exact solver searches for at most 20 seconds. There is no setting for it. While it runs, the button reads *Generating…* with "7 s of up to 20 s".

- The solver stops early once it has proved it has the best timetable. Then the result card says "The best possible timetable".
- If time runs out first, you get the best timetable it found, "The best timetable found in 20 s", and a **Try longer: 40 s** button. A longer search may lower the score.
- If time runs out before it finds any timetable, you get [No timetable found in time](#couldnt-finish) with **Try again with 40 s**. Each retry doubles the limit, up to 120 s.
- When a longer search finishes with a timetable, Lattice keeps using that limit for later runs, so a large college doesn't run out of time first every time you regenerate. Reloading the page goes back to 20 s.

A quick draft uses at most 5 seconds.

## Can't be built

A red card, *This timetable can't be built*, means the exact solver proved that no timetable can follow every hard rule with this data. Nothing was changed, and your previous timetable is kept.

The card lists the likely causes, most likely first, each with a fix button. A fix button opens step ② on the right tab, with the Courses tab filtered to the section or teacher concerned, or opens step ④ for the locks. Fix the data, come back to step ③ and generate again. The card stays until the next run, even after you've fixed the data.

If you want a timetable now, **Make a partial timetable** places as many classes as fit and lists the rest. See [Partial timetables](#partial).

Each cause, what it means, and the usual fix:

### No room they may use {#no-room}

"No room may host 2 classes: …". No room of the right type is open to these classes: no classroom for a lecture, or no lab for a lab, that is shared or owned by the section's department.

Fix: add a room of that type for the department, or share an existing one by setting its department to *Shared (any department)* in the Rooms tab. See [Departments and rooms](/help/data#rooms).

### A lab is too long {#lab-too-long}

"A lab is longer than any run of teaching periods without a break: …". A 3-period lab can't fit if a break comes after every 2 teaching periods.

Fix: shorten the lab (Lab length in the Courses tab), or move a break in step ① so there is a long enough run of periods.

### Classes that can't be placed anywhere {#no-slot}

"3 classes can't be placed anywhere: …". There's no day, period and room these classes could ever use, for a reason other than the two above.

Fix: check their course in the Courses tab, especially the lab room.

### A locked class is in a slot it can't use {#bad-lock}

A class you locked sits somewhere it may no longer go, for example in a room its section may not use after you changed the rooms.

Fix: **Clear all locks** in step ④, or unlock that class, then generate again.

### Locks make it impossible {#locks}

"Your 4 locked classes make it impossible; without locks the timetable can be built." Each lock is fine on its own, but together they leave no room for the rest. If the check without locks ran out of time, the card says the locks *may* be the cause.

Fix: **Clear all locks** in step ④, or unlock some of them, then generate again. See [Locks and Regenerate](/help/timetable#locks).

### A section has too many periods {#section-load}

"CSE A needs 37 periods a week; only 35 are free after one lunch period a day." The section's lectures and labs (its busiest batch, for labs) need more periods than the week has.

Fix: cut that many periods from its lectures or labs. The fix button opens its courses. Or add a teaching period or a working day in step ①.

### A teacher has too many periods {#teacher-load}

"Dr. Meera Iyer teaches 38 periods a week; only 35 are free after one lunch period a day."

Fix: move some of their lectures or batch labs to another teacher. The fix button opens their courses.

### Rooms are booked beyond their periods {#room-load}

The rooms of one kind can't hold all the classes that need them:

- **One required lab**: "Physics Lab is required for 45 lab periods a week; it has only 40." Too many courses pin their labs to it. Fix: let some of those courses use *Any eligible lab*.
- **One department's rooms**: "Mechanical Engineering sections need 90 lab periods a week; the 2 labs they may use have only 80." Fix: add a room for that department, or share one.
- **All rooms of one type**: "All sections need 340 classroom periods a week; the 8 classrooms have only 320." Fix: add rooms of that type.

### No single cause

"No single cause found: the rules conflict in combination." Every check above passed, but the rules still can't all be met at once. Things that usually help:

- Fewer lab sessions. Each needs a run of free periods in a free lab, for every batch.
- More lunch candidates in step ①, so lunch can move out of the way.
- Fewer required lab rooms: let labs use any eligible lab.

## Couldn't finish

A card with an ⓘ icon means the exact solver gave no answer. Your previous timetable is unchanged. There are three kinds:

- **No timetable found in time**: the time limit ran out before it found any timetable. **Try again with 40 s** doubles the limit, up to 120 s. See [No timetable found in time](/help/troubleshooting#short-limit).
- **Couldn't reach the exact solver**: the solver service didn't answer. It may have stopped. **Try again** when the dot shows *online*. See [The solver is offline](/help/troubleshooting#solver-offline).
- **The exact solver failed**: something went wrong on the solver service. The ⓘ next to the title has the details. **Try again**, and if it keeps failing, report the details.

Every kind also offers **Make a quick draft instead**, which makes a timetable in your browser.

## Partial timetables {#partial}

A partial timetable has some classes placed and the rest listed as not placed. It's a quick draft, made after *Can't be built*, *Couldn't finish*, or while the solver is offline. An amber card says "Partial: 17 of 237 classes not placed" and checks the placed classes: they still have 0 clashes.

The classes that didn't fit are grouped by reason. Open a group to see its classes. After *Can't be built*, **Back to the reasons** shows that card again.

You can go on to step ④ with a partial timetable. There, each section lists its missing classes under the grid. Drag one onto a green slot to place it yourself (see [Drag and drop](/help/timetable#drag-and-drop)), or fix the data and generate again. Printouts leave missing classes out.

What each group means. Two groups, *No room they may use* and *Lab longer than any run of teaching periods*, are classes that can never be placed: see [No room they may use](#no-room) and [A lab is too long](#lab-too-long) above.

### Teacher already busy {#teacher-busy}

The class's teacher was already teaching in the slots the class could have used. Their week is too full or too tightly packed. Move some of their classes to another teacher, or give the week more periods.

### Section already busy {#section-busy}

The section already had a class in the slots that were left. It probably needs more periods than the week has; see [A section has too many periods](#section-load).

### No free room at those times {#no-free-room}

A room of the right type existed, but every one the class may use was taken at the times left. Add or share a room, or let labs use *Any eligible lab*; see [Rooms are booked beyond their periods](#room-load).

### Would take the last free lunch period {#last-lunch}

The only slots left were the last free lunch candidate of the day for the section or teacher, and lunch must stay free. Tick another lunch candidate in step ①; see [Lunch candidates](/help/data#lunch-candidates).

### Other reasons {#other-reasons}

The draft couldn't name one reason. Try the exact solver if it's online, or look at the class's course.
