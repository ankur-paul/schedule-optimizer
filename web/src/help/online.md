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
