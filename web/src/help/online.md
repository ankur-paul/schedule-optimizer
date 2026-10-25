# Online and institutes

Sign in to save timetables online, share them with your institute and publish them at a public link. All of this is
optional: signed out, Lattice does everything else, and your data stays in your browser.

## Signing in

Click **Sign in** at the top right. Tick *I agree to the Terms and Privacy Policy*, then choose one:

- **Continue with Google** takes you to Google and back.
- **Email me a sign-in link**: type your address and Lattice emails you a link. Open it in the same browser and you
  are signed in. The link works once, within an hour.

Signed in, the button becomes your picture (or your initials). Its menu has your institutes, *Help*, *Privacy*,
*Terms* and **Sign out**. You stay signed in after a reload.

Signing in or out never changes the timetable data in your browser. If the Terms or Privacy Policy change, or you
open the email link in a different browser, Lattice asks you to accept them before you go on (see
[the consent dialog](/help/troubleshooting#consent)).

## Institutes and roles {#institutes}

An institute is the group of people who work on a college's timetables, such as "GNDEC Ludhiana". Timetables you
save online belong to an institute, and every member can open them.

**Joining.** The institute's admin invites you by email address. Nothing is emailed: the next time you sign in with
that address, you join at once and see "You joined GNDEC Ludhiana as editor". Google and the email link both work, as
long as the address is the one the admin typed.

**Creating one.** If you sign in with no institute and no invite, Lattice offers *Create an institute*. Give it a
name and you become its admin. *Not now* stops it opening by itself in that browser; *Create institute…* in the
account menu opens it again.

The account menu shows the institute you're working in, your role in it and who its admin is, e.g. "Editor · admin
is Dr. Meera Iyer (meera\@gndec.ac.in)". If you belong to two or more, pick one under *Switch institute*. *Open from…*
in the status menu lists the timetables of the institute picked here.

![The account menu of an editor: GNDEC Ludhiana, "Editor · admin is Dr. Meera Iyer", Leave institute, Create institute, Help, Privacy, Terms and Sign out](/help/account-menu.png)

Each institute has exactly one admin. Everyone else is an editor or a viewer:

| You can… | Admin | Editor | Viewer |
|---|:-:|:-:|:-:|
| Open saved timetables and their versions | ✓ | ✓ | ✓ |
| Save online, save as a new timetable, rename a timetable | ✓ | ✓ | |
| Publish, make a version live, unpublish | ✓ | ✓ | |
| Delete a timetable | ✓ | | |
| Invite people, change roles, remove members, make someone else admin | ✓ | | |
| Rename the institute, set its link name, delete it | ✓ | | |
| Leave the institute | | ✓ | ✓ |

A viewer can still change the working copy in their own browser, to try something out, but can't save it online.
The status line then says "view only".

**Managing members (admin).** Open *Members…* in the account menu. Each member has a role (*Editor* or *Viewer*),
*Make admin* and *Remove*. To invite someone, type the address they'll sign in with, pick a role and click
**Invite**, then tell them to sign in. You can cancel a pending invite until it's used. *Make admin* hands the role
over and makes you an editor; it asks you to confirm from your email first (see
[Leaving and deleting](#leaving-and-deleting)).

![The Members dialog: the admin first, then each member with a role select, Make admin and Remove, a pending invite and the invite form](/help/members-dialog.png)

The database checks every action against your role; the menus only hide what you can't do. If your role changes
while you have Lattice open, the menus catch up the next time you open the account menu. Until then, an action your
new role doesn't allow says ["Only the admin can do that."](/help/troubleshooting#admin-only)

## Saving online

What you see in Lattice is your **working copy**, kept in this browser. The status line at the top, left of the
account button, says where it stands:

- "On this device only": it isn't linked to anything online.
- "CSE odd sem 2026 · GNDEC": it is linked to that online timetable. "· unsaved changes", with an amber dot, means
  you've changed it since you last saved or opened it.

Nothing you enter goes online until an admin or editor clicks *Save online*. To save:

1. Click the status line, then **Save online…**.
2. Pick the institute (only those where you are admin or editor are listed) and give the timetable a name. It starts
   as your print heading, or "Timetable".
3. Click **Save online**. Your working copy is now linked to the new timetable.

After that, **Save online** in the same menu saves your changes as a new version of that timetable.

A save sends the week setup, departments, teachers with their names, rooms, sections, courses, locked classes, the
generated timetable and the print heading. The step you're on and the time limit stay on your device. A timetable
over 2 MB is too big to save online.

![The status menu of a saved, published timetable: Save online, Save as new timetable, Publish again, Versions, Open from GNDEC Ludhiana, Rename and Work on this device only](/help/online-menu.png)

The rest of the status menu:

- **Save as new timetable…** saves your working copy as a separate timetable, named "… (copy)" unless you change it,
  and links to that one instead.
- **Open from GNDEC…** lists the institute's timetables with their latest version, who saved it and when, and a
  *Live* badge on published ones. Opening one replaces your working copy, so if you have unsaved work Lattice asks
  *Replace your working copy?* first.
- **Rename…** renames the timetable online.
- **Work on this device only** drops the link and keeps your data. The online timetable isn't touched. *Start over*
  in the header drops the link too, along with all the data.

Signed out, the status line stays, and the menu says *Sign in to save online*.

## When someone saved first {#conflicts}

Two editors can open the same timetable. Each works on their own working copy: Lattice doesn't merge their changes
or show them live, but it checks for a clash when you save.

If someone saved since you opened or last saved it, *Save online* stops and shows "CSE odd sem 2026 changed online",
with who saved and when: "Changed online by Dr. Meera Iyer at 09:42 since you opened it." You can:

- **Overwrite**: your working copy becomes the newest version. Theirs isn't lost; it stays in the
  [version list](#versions).
- **Save as new timetable…**: keep both, with yours under a new name.
- **Cancel**: save nothing. To take their changes instead, use *Open from…* (your unsaved changes are lost).

![The conflict dialog: "CSE odd sem 2026 changed online", with Cancel, Save as new timetable and Overwrite](/help/online-conflict.png)

If the dialog says *Can't save to …* instead, the timetable was deleted or you can no longer edit it, for example
after the admin made you a viewer. Your working copy is unchanged, and *Save as new timetable…* puts it online under
a new name.

## Versions

Every *Save online* adds a numbered version. Lattice keeps the last 20, plus the one the public link shows if it's
older.

Click the status line, then **Versions…** (or *Versions* next to a timetable in *Open from…*). Each row reads like
"Version 4 · Dr. Meera Iyer · 24 Oct, 10:42", newest first, with a *Live* badge on the published one.

![The Versions dialog: the public link showing version 5 with Unpublish, Copy and Open, then versions 6 to 1 with Make live and Open](/help/online-versions.png)

- **Open** loads that version into your working copy. An older version opens with unsaved changes, so *Save online*
  restores it as the newest version.
- **Make live** (admin and editors) points the public link at that version at once, without opening it. Use it to
  go back to an earlier timetable.
- **Unpublish…** (admin and editors) is above the list when the timetable is published.

Viewers see the list and *Open*.

The list doesn't show which versions have a generated timetable. *Make live* on one without refuses with a message.

## Publishing and the public link {#publishing}

Publishing lets students and teachers see the timetable at a link, such as `/gndec/k7f3q9xa2m`, without signing in.

1. Generate the timetable. *Publish* is greyed out until there is one.
2. Click the status line, then **Publish**. If you have unsaved changes, Lattice asks *Save online first?*, because
   the link always shows a saved version; **Save and publish** does both.
3. Copy the link from the *Published version 6* dialog and share it.

**The link name.** The first part of the link (`gndec`) is the institute's link name, and only the admin sets it. An
admin who publishes before setting one is asked to choose it there and then, and publishing carries on. An editor is
told to ask the admin. The admin can also set or change it from *Link name…* in the account menu. It takes 3–30
lowercase letters, digits or hyphens, not starting or ending with a hyphen, and a few words such as `help` and
`privacy` are reserved. Links shared before a change keep working.

**After publishing**, the status line adds "· published" and the menu offers **Publish again**, which points the same
link at the version in your working copy. The link itself never changes. To show an older version, use *Make live*
in [Versions](#versions). **Unpublish…** takes the page down until you publish again; the link then says "This
timetable isn't published."

The public page shows the institute's name, the timetable's name and print heading, when it was last updated, and
every section's, teacher's and room's timetable, including teachers' names. It doesn't show locked classes or who
saved it. On a phone it shows one day at a time.

Anyone who has the link can open it, pass it on, copy the page or print it. Search engines are asked not to list it.
Unpublishing or deleting takes the page down at once, but it can't recall copies people already made, so publish
only what your institution wants made public.

## The assistant {#assistant}

The **Assistant** button in the header opens a panel on the right (full screen on a phone) where you can ask
questions in your own words, in any language:

- about using Lattice: "How do I lock a class?"
- about your own timetable: "Why can't this be built?", "Why is CSE-3A's lab unplaced?", "Where does the score of
  34 come from?", "When is Dr. Meera Iyer free on Tuesday?"

It looks at your working copy as it is now, unsaved changes included, and lists what it looked at while it works
("Looked at CSE-3A's week"). Its answers link to the help sections they rely on. It declines questions that aren't
about Lattice or your timetables.

![The assistant panel: "143 questions left · until 23 Nov", the question "Where does the score of 18 come from?", "Looked at the score", and an answer naming the batches waiting during labs in ECE A and ME A](/help/assistant-panel.png)

**Its answers can be wrong**, so check them against the timetable before acting on them. It changes nothing by
itself: see [Changes from the assistant](#assistant-changes).

**Ask about this.** Signed in, the problem cards in step ③ (each *Can't be built* reason, *Couldn't finish*, each
group of unplaced classes) and each data check in step ② have an *Ask about this* link. It opens the panel and asks
about that card, with its details.

**Who can use it.** Any member of an institute (admin, editor or viewer) once the institute has access. The panel
uses the institute your working copy is linked to; otherwise the one picked at the top of the panel. Until the
institute has access the panel says so:

- **The admin** sees a coupon box. Type the trial coupon (`LTC-XXXX-XXXX-XXXX-XXXX`; case, spaces and dashes don't
  matter) and click **Unlock**. *Request a trial coupon* shows the email to send us, with your institute filled in;
  say what you'll use it for. **Open in Gmail** opens it in a new tab, from the first Google account signed in to your
  browser (Gmail doesn't show which; the email lands in that account's Sent). **Open email app** hands it to your
  computer's or phone's mail app (on a phone this button comes first). If neither works, copy the address, subject and message one by one with their
  **Copy** buttons, or select the text by hand, and paste them into any email. After 10 wrong coupons, wait an hour.
- **Editors and viewers** see who the admin is, to ask them.

**The allowance.** A coupon gives the institute a number of questions and a number of days, such as 200 questions
over 30 days, shared by all its members. The panel's header shows what's left, e.g. "143 questions left · until 23
Nov", in amber under 20 questions or 3 days. Each question you type counts once, however many things the assistant
looks up to answer it. A second coupon adds its questions and keeps the later end date. When the questions or the
days run out, the panel locks again and your chat stays on screen. If it says *paused until next month*, the
service's monthly limit was reached for everyone.

**The chat** stays in this browser tab only and is gone when you reload. **New chat** clears it. In a long chat,
the assistant summarises the earlier part every 20 questions so it can keep going; you still see the whole chat.
Enter sends, Shift+Enter adds a new line, Esc closes the panel.

**Privacy.** Your questions and what the assistant looks up are sent to Anthropic, which runs the AI model, with
teachers' names replaced by codes; a misspelt name in a question isn't replaced. A new teacher's name you type
("add teacher Ravi Sharma") is sent as you typed it, since it isn't in your data yet. Chats aren't stored. See the
[Privacy Policy](/privacy).

### Changes from the assistant {#assistant-changes}

Ask the assistant to change something, such as "Move CSE-3A's Database Systems lecture off Monday", "Add a room
LH-5 and regenerate" or "Save this online", and it shows a **change card** in the chat instead of changing it: a
summary, one line per change, and **Apply** and **Discard**. Nothing changes until you click *Apply*.

![A change card: "Changes #1", the summary, a move of CSE A's Data Structures lecture to Tue P1 locked there, Save online as version 7, the note that Undo restores only the working copy, and Apply and Discard](/help/assistant-card.png)

It can propose:

- **Your working copy:** add, change or remove departments, teachers, rooms, sections and courses; change the week
  (this clears the timetable and its locks, and the card says so); lock and unlock classes; move and swap classes,
  which locks them in their new place as [drag and drop](/help/timetable#drag-and-drop) does; regenerate; load the
  sample college; open a timetable from your institute.
- **Online** (admin and editors): *Save online*, *Save as new timetable*, rename, publish and *Make live*.

Every role can use it, since changes land in your own working copy. A viewer isn't offered online changes.

**The card** is checked before you see it: moves and swaps keep every hard rule, and online changes suit your role
and the timetable's versions. It also lists any new data checks the changes cause (you can still apply it, as with
edits by hand), warns when it would replace unsaved work (*Load sample*, opening a timetable), and, when it has
online changes, says "Undo restores your working copy; the saved version stays online".

**Apply** takes the whole card; to leave a change out, ask again ("do it without the room"). Lattice first checks
the card again against your working copy as it is now. If it no longer fits, because you changed something since, the
card says *Out of date: ask again* and nothing changes; an older card that still fits can be applied. Then it:

1. makes the working-copy changes;
2. runs **Generate** if the card has it, exactly as the button does, and shows the score before and after under the
   card, e.g. "Score 34 → 28 · 0 unplaced", or what went wrong with *See why*;
3. makes the online changes, in order.

If a step fails it stops there: the steps before it stay done, and the card marks the failed step and why. If
someone saved the timetable since you opened it, save by hand (see [When someone saved first](#conflicts)).
*Apply* and *Discard* don't use a question; the assistant hears what happened at the start of your next question.

**Undo.** Applying a card first takes a snapshot, so **Undo** at the top of the page ("Undo: assistant changes #3")
puts your data, timetable and locks back as they were. See [Undo and Redo](/help/timetable#undo). Online steps
aren't undone: a saved version, a rename or a publish stays online; to show an older version again, use *Make live*
in [Versions](#versions). Undo is lost when you reload.

**What stays manual.** The assistant doesn't do anything that Undo or *Make live* can't take back, or that changes
who can reach your institute. Ask and it gives you the steps instead:

- deleting a timetable or the institute, leaving the institute, handing over the admin role
  ([Leaving and deleting](#leaving-and-deleting));
- inviting someone, cancelling an invite, changing a role, removing a member ([Managing members](#institutes));
- changing the institute's link name ([Publishing](#publishing)) and unpublishing ([Versions](#versions));
- *Overwrite* after someone else's save ([When someone saved first](#conflicts));
- a *Save online* that would delete an old version: Lattice keeps the last 20, so once there are 20 the next save
  deletes the oldest one that isn't live. Click *Save online* yourself.

## Leaving and deleting

**Delete a timetable (admin).** With it open, click the status line, then **Delete…**, and type its name. This
deletes every version online, for everyone, and takes down its public link. Your working copy stays on your device.

**Leave an institute (editor or viewer).** Choose *Leave institute…* in the account menu. To come back you'll need a
new invite. The timetables belong to the institute, so the ones you saved stay.

**Hand over the admin role.** The admin can't leave. To step down, open *Members…* and click *Make admin* next to
someone; you become an editor and can then leave. Or delete the institute.

*Leave institute* and *Make admin* ask you to confirm from your email, unless you signed in with an email link in
the last 10 minutes. Click **Email me a link** in the *Confirm from your email* dialog, then open the link within the
hour. It signs you in again and asks once more before it acts. Google users get the email too.

**Delete an institute (admin).** Choose *Delete institute…* in the account menu and type its name. Every member loses
access, pending invites are cancelled, and all its timetables are deleted. The data in your browser isn't affected.

To delete your account, write to the contact address in the [Privacy Policy](/privacy). An admin first has to make
someone else admin or delete the institute.
