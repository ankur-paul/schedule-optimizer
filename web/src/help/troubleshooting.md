# Troubleshooting

Fixes for the problems people run into most.

## The solver is offline {#solver-offline}

Step ③ shows an amber banner, "Exact solver is offline", and the main button reads **Make a quick draft**.

The exact solver runs on Lattice's server, and your browser can't reach it. Lattice checks again every 5 seconds, and the banner goes away by itself once the solver answers.

- **Check your internet connection.** Then click the *Exact solver: offline* dot to check again at once.
- **Wait a minute and check again.** The server may be restarting.
- **Make a quick draft meanwhile.** It's made in your browser and needs no server. It may score a little worse, and it can't tell you that a timetable is impossible. You can regenerate with the exact solver later. See [The exact solver and the quick draft](/help/generate#engines).

Your data stays in your browser either way, so nothing is lost while the solver is away.

## The email link didn't arrive {#email-link}

You asked for a sign-in link (or a confirmation link) and nothing came.

- **Check the spam or junk folder**, and any "Updates" or "Promotions" tab.
- **Check the address.** The dialog says "Check your inbox at …". If that's wrong, close it and type the address again.
- **Wait a few minutes before asking again.** Lattice can send only a limited number of emails an hour, so asking many times in a row can make it worse.
- **Use Google instead**, if you have a Google account: *Continue with Google* needs no email.

If the link arrived but says "That sign-in link has expired or was already used. Ask for a new one.", ask for a new link and open the newest one. A link works once.

If you open the link in a different browser from the one you asked in, you're signed in there, and Lattice asks you to accept the Terms and Privacy Policy again.

## "Only the admin can do that" {#admin-only}

Each institute has one admin. Only the admin can manage members, rename the institute, set its link name or delete it, and viewers can't save or publish timetables. Lattice hides these actions from people who can't use them, so this message usually means your role changed after the menu was last loaded: someone changed your role, removed you, or made someone else the admin. The database then refuses, and you see "Only the admin can do that."

- **Check your role.** Open the avatar menu again: it shows the active institute, your role and who the admin is, such as "Editor · admin is Dr. Meera Iyer".
- **Check the institute.** If you belong to more than one, the action applies to the active one. Switch in the avatar menu.
- **Ask the admin.** They can do it, change your role, or make you the admin.

## The import was rejected {#import-rejected}

A red card says "3 problems in college.xlsx" and "Nothing was imported."

An import is all or nothing: one bad row stops the whole file, so your current data is never half replaced. Each line names the sheet and row, such as `Courses row 7: teacher "Sharma" not found in Teachers sheet`. Fix those rows in Excel and upload the file again.

- The workbook needs four sheets named **Teachers**, **Rooms**, **Sections** and **Courses**, with the template's header row. Start from **Template** if you're unsure.
- Most errors are names that don't match between sheets. The name in a course row must match a row on the other sheet; capitals and extra spaces don't matter, but "Dr. Sharma" and "Anita Sharma" are different names.
- "Could not read the file" means the file isn't a spreadsheet Lattice can open. Save it as `.xlsx` and try again.

Each message is explained in [Import errors](/help/data#import-errors).

## Couldn't finish on a short time limit {#short-limit}

Step ③ says "No timetable found in time" and "The exact solver didn't find a timetable within 5 s."

The exact solver needs a couple of seconds to set up before it finds its first timetable, and a large college needs longer. With a short time limit it can run out before it has anything to show.

- Click **Try again with 10 s** (the button doubles the limit each time), or raise the slider under **Advanced: time limit**. The default 20 s is enough for the sample college.
- The solver stops as soon as it proves the best timetable, so a long limit doesn't always mean a long wait.
- If it still runs out at 120 s, your data may be very tight. Look at the warnings in step ②'s [data checks](/help/data#data-checks), or click **Make a quick draft instead**.
