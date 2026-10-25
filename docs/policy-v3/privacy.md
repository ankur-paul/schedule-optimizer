# Privacy Policy

Version {{POLICY_VERSION}} · effective {{EFFECTIVE_DATE}}

Lattice makes weekly class timetables for colleges. {{OPERATOR_NAME}} ("we") runs it. Send questions or complaints
to {{CONTACT_EMAIL}}.

## If you don't sign in

You can use Lattice without an account.

- The data you enter (week setup, departments, teachers, rooms, sections, courses, timetables) is saved in your
  browser. It leaves the browser only when you generate a timetable.
- When you click *Generate timetable*, your browser sends that data to our solver server, with each teacher's name
  replaced by a code. The solver returns the timetable and doesn't store or log what you sent.

## If you sign in

Signing in is optional. It lets you create or join an institute, work on it with others, save its timetables
online, and ask the assistant about them if your institute has access to it.

### What we store

| Data | Where it comes from | Why |
|---|---|---|
| Your email address | You, or your Google account | To sign you in and match you to invites |
| Your name and profile picture link | Your Google account, if you sign in with Google | To show other members of your institutes who you are |
| The institutes you create or join, and your role in each (admin, editor, viewer) | You and your institute's admin | To decide what you can see and change |
| Invites: an email address and a role | Typed in by an institute's admin | So that person joins the institute when they sign in |
| Timetables saved online: the week setup, departments, teachers (with their names), rooms, sections, courses, locked classes, the timetable and its print heading, as numbered versions of a named timetable | An admin or editor who clicks *Save online* | So the institute's members can open and work on the same timetable |
| Who saved each version, and when | Recorded when a version is saved | To show members who changed what, and to warn before one save overwrites another |
| When you accepted these terms, and which version | You | To record that you agreed, and to ask again when they change |
| Assistant usage: for each question, when it was asked, who asked it and for which institute; for each step of the answer, the model used, the number of tokens sent and received, and what it cost. Never the text of a question or an answer | Recorded when you ask the assistant | To count questions against the institute's allowance, to pause the assistant when the month's budget runs out, and to know what it costs to run |
| Coupons: which institute redeemed each trial coupon, who redeemed it, and when | Recorded when an admin redeems a coupon | To unlock the assistant for that institute and track its allowance |
| Wrong coupon tries: who and when | Recorded when a coupon code doesn't work | To allow at most 10 wrong tries an hour |
| Sign-in records (time, IP address, browser) | Our sign-in provider | Security, and to stop abuse |

We use this data to sign you in, manage institutes and members, store, share and publish timetables, and run the
assistant, and for nothing else. We don't sell it or use it for ads.

### Saving timetables online

Nothing you enter goes online until an admin or editor clicks *Save online*. Each save adds a new version of that
timetable. We keep its last 20 versions, plus the published one if it is older; older versions are deleted
automatically when a new one is saved.

### Teachers and other people in your timetables

A timetable names teachers and the classes they teach. For that data your institution decides what is collected and
why, and we store and process it on its behalf, only to run Lattice for it. A teacher who wants to see, correct or
remove their details should ask their institution first; we help the institution answer. You can also write to us
at {{CONTACT_EMAIL}}.

### Who can see it

- Every member of an institute (admin, editors and viewers) can open its saved timetables and their versions,
  including teachers' names. Admins and editors can save, rename and publish them; only the admin can delete one.
- An institute's admin sees each member's name and email, and the institute's pending invites.
- Editors and viewers see the admin's name and email, so they know whom to ask.
- Members see the name or email of whoever saved each version.
- We can see all of it when we run and fix Lattice.

### Published timetables

An admin or editor can publish a saved version. It can then be opened at a public link, such as
`/gndec/k7f3q9xa2m`, by **anyone who has the link, without signing in**. The page shows the institute's name, the
timetable's name and print heading, when it was last updated, and every section's, teacher's and room's timetable,
including teachers' names. It doesn't show locked classes or who saved it.

The link is hard to guess, and the page asks search engines not to list it, but anyone who has it can pass it on,
copy the page or print it. Unpublishing or deleting the timetable takes the page down at once; it can't recall
copies people already made.

### The assistant

The assistant is optional. It answers questions about Lattice and your institute's timetables, for members of an
institute whose admin has redeemed a trial coupon.

When you ask a question, your browser sends it, together with the chat so far, to our server, which passes it to
Anthropic, the company whose Claude model writes the answers. To answer, the assistant looks things up in the
timetable open in your browser, such as a section's week, when a room is free or why a class couldn't be placed,
and those details are sent too. When you click *Ask about this* on a problem, that problem's details are attached
to your question.

Before anything leaves your browser, each teacher's name is replaced by a code such as `T-K3X9Q`, in the timetable
details and in what you type, and the panel turns the codes back into names on your screen. Only a teacher's full
name, spelt as in your data, is caught: a surname on its own or a misspelt name is sent as you typed it. Section,
room and course names are sent as they are.

We don't store your chats. A chat stays in the open browser tab until you click *New chat* or close the tab. Our
server passes it on and keeps none of it. We record only the usage numbers listed in the table above.

To ask for a trial coupon, *Request a trial coupon* opens an email to us in your own email app, filled in with
your institute's name and its link name (such as `gndec`). We receive it like any other email, and it stays in our
inbox until you ask us to delete it.

### Invites

When an admin invites you, we store your email address before you have signed up. We don't email you; the admin
tells you to sign in. An unused invite stays until it's used or the admin cancels it.

## Where your data is kept

- **Supabase** stores accounts, institutes and saved timetables in its Mumbai region, on Amazon Web Services in
  India. It handles the data for us under its
  [data processing terms](https://supabase.com/legal/customer-resources/data-processing-addendum) and uses these
  [subprocessors](https://supabase.com/legal/customer-resources/subprocessor-list).
- **Google** handles sign-in if you choose *Sign in with Google*. We receive your name, email address and profile
  picture link, and use them only for the purposes in the table above.
- **Anthropic**, a US company, runs the Claude model behind the assistant and receives what the assistant sends, as
  described above. Its [commercial terms](https://www.anthropic.com/legal/commercial-terms) say it doesn't train its
  models on this data, and its
  [retention policy](https://privacy.claude.com/en/articles/7996866-how-long-does-anthropic-store-my-organizations-data)
  says it deletes it within 30 days in most cases.
- Our **server** receives timetable data for the solver and chats for the assistant, both without teacher names,
  and keeps nothing.

Connections use HTTPS, and database rules limit each person to the institutes they belong to. Published pages are
the one exception, as described above.

## Browser storage

Lattice saves your timetable data, which online timetable it is linked to, and your sign-in session in your
browser's storage. The assistant's chat is kept only while its tab is open. Lattice has no advertising or tracking
cookies and no analytics.

## How long we keep it

- Your account and memberships: until you ask us to delete your account.
- Invites: until they're used or cancelled.
- Saved timetables: until the admin deletes the timetable or the institute. Deleting a timetable deletes all its
  versions and takes down its public link; deleting an institute deletes all its timetables.
- Timetables belong to the institute, so they stay when you leave it or delete your account; your name is removed
  from the versions you saved.
- Assistant usage and coupon records: until the institute is deleted, so its question counts and costs add up.
  Deleting your account removes your user ID from them; deleting an institute deletes its usage records and removes
  it from the coupons it redeemed.
- Wrong coupon tries: they count for an hour, and are deleted the next time you try a coupon after that, or with
  your account.
- Assistant chats: we keep none. Anthropic keeps what it received under its retention policy, linked above.
- Deleting is immediate. Copies in our database host's backups are erased within 7 days.

## Your rights

You can:

- ask us to delete your account by writing to {{CONTACT_EMAIL}}. We do it within 30 days. An institute's admin
  must first make someone else admin or delete the institute. Deleting your account also withdraws your consent;
- ask for a summary of the personal data we hold about you, and who we've shared it with, by writing to
  {{CONTACT_EMAIL}};
- correct your data. Your name comes from your Google account: change it there and Lattice picks it up the next
  time you sign in. For anything else, write to us;
- name someone to use these rights for you if you die or can't act yourself, by writing to us;
- complain to {{CONTACT_EMAIL}}. We reply within 30 days. If our answer doesn't settle it, you can complain to the
  Data Protection Board of India.

## Age

Lattice is for college staff. You must be 18 or older to sign in.

## Changes to this policy

When we change what we collect or why, we publish a new version here and ask you to accept it the next time you
use Lattice signed in. Small fixes, such as typos, don't change the version.
