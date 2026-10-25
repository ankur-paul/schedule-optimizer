# Troubleshooting

Fixes for the problems people run into most.

## The solver is offline {#solver-offline}

Step ③ shows an amber banner, "Exact solver is offline", and the main button reads **Make a quick draft**.

The exact solver runs on Lattice's server, and your browser can't reach it. Lattice checks again every 5 seconds, and the banner goes away by itself once the solver answers.

- **Check your internet connection.** Then click the *Exact solver: offline* dot to check again at once.
- **Wait a minute and check again.** The server may be restarting.
- **Make a quick draft meanwhile.** It's made in your browser and needs no server. It may score a little worse, and it can't tell you that a timetable is impossible. You can regenerate with the exact solver later. See [The exact solver and the quick draft](/help/generate#engines).

Your data stays in your browser either way, so nothing is lost while the solver is away.

The solver sleeps when nobody has used it for a while and takes a few seconds to wake up. Lattice wakes it as soon as you open the site, so it's usually ready by step ③.

## "The solver was updated at a different time from this page" {#solver-version}

Step ③ shows this grey line when the solver on the server and the page in your browser come from different updates of Lattice. They may then disagree about the data they exchange.

- **Reload the page.** You get the newest page, which matches the solver. Your data stays in your browser.
- **If the line stays after a reload,** the solver is still being updated. You can still generate, but results may be wrong. Every timetable is checked again in your browser, and a broken rule shows on the result card.

## The email link didn't arrive {#email-link}

The sign-in link usually arrives within a minute. If it doesn't:

- Look in your spam or junk folder, and in any tab that sorts "updates" or "promotions".
- Check the address under "Check your inbox at …". If it's wrong, click *Use a different email*.
- "Too many sign-in emails for now" means you asked too often. Wait a while, or use *Continue with Google*.

Opening the link:

- "That sign-in link has expired or was already used" means the link is over an hour old, or you opened it before.
  Ask for a new one.
- Open it in the browser where you use Lattice. Your timetable data lives in that browser, so another browser signs
  you in with an empty working copy. The first time, it also asks you to accept the Terms again, because the box you
  ticked was in the first browser.
- Some college mail systems open links to scan them, which uses the link up before you click it. If every link says
  it has expired, use *Continue with Google* instead.

The links that confirm *Leave institute* and *Make admin* work the same way, and expire after an hour too.

## "Only the admin can do that" {#admin-only}

The database refused something your role doesn't allow. Usually:

- You're an editor or viewer, and the action is the admin's: managing members, renaming the institute, setting its
  link name, deleting it, or deleting a timetable. Open the account menu: the line under the institute's name says
  who the admin is.
- The admin changed your role or removed you while Lattice was open. Close and reopen the account menu to see your
  role now.

See [Institutes and roles](/help/online#institutes) for who can do what. "Your sign-in has expired. Sign in again."
is different: sign out and back in.

## "Changed online by …" {#changed-online}

Someone saved the timetable online after you opened it, so your *Save online* stopped instead of overwriting their
work. The dialog names them and says when. Choose:

- **Overwrite** to make your working copy the newest version. Theirs stays in *Versions…*, so you can open it later.
- **Save as new timetable…** to keep both.
- **Cancel**, then *Open from…*, to take their version instead and lose your unsaved changes.

To avoid it, agree who edits when, and open the timetable again before you start. See
[When someone saved first](/help/online#conflicts).

## "Before you continue" or "We've updated our Terms" {#consent}

This dialog asks you to accept the Terms and Privacy Policy. It has no close button: choose **Accept** to use your
account, or **Sign out** to carry on signed out. Either way, the data in your browser stays as it is.

It appears when:

- the Terms or Privacy Policy have a new version since you last accepted. The dialog lists what changed.
- you signed in without ticking the box in this browser, for example by opening the email link in another browser.

Until you accept, your account does nothing else: invites wait and the institute menu doesn't load. If a save says
"Accept the current Terms first.", the policy changed while Lattice was open. Reload the page and accept.

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
