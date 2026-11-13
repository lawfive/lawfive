# People and access (USR)

Who can use a server, for self-hosters and the hosted service alike. Accounts are made on the website, and the admin parts are on the website only (APP-8).

## Admins and sign-up

- **USR-1** **Admins** are named by email in the server's `ADMIN_EMAILS` (not changeable in the web app), or made by another admin, who can also take it away; nobody changes their own. Admins invite people (USR-3), approve or decline new accounts (USR-4) and make admins; otherwise they use LawFive like anyone else and see only their own matches.
- **USR-2** `SIGN_UP` says who can make an account: **open** (anyone; the default), **approval** (anyone, but an admin approves the account before it's used) or **closed** (by invitation only). The hosted service uses approval.
  - The sign-in page follows it: "Create an account", with a note when an admin approves new accounts, or "New accounts are by invitation." `/signup` opens on Create an account (the phones link there, APP-2), unless sign-up is closed.
  - An address in `ADMIN_EMAILS` signs up as anyone does, then waits for approval even when sign-up is open, unless it has an invitation (SEC-8).
- **USR-8** **A new server's first account.** While nobody has an account, the website opens on the setup wizard (ADM-5), whatever `SIGN_UP` says. The first account is active and an admin, and needs the setup code from the server's logs, `ADMIN_EMAILS` or not (SEC-8). So a new server needs its logs but no other console.
- **USR-3** **Invitations.** An admin invites someone from the People page, with an optional name and email.
  - The link makes an account whatever `SIGN_UP` says, active at once. It works once, for 14 days.
  - With an email, only that address can use it (the form fills it in and locks it); without one, anyone with the link can.
  - The admin copies or shares the link (it stays copyable), or has it emailed (USR-5).
  - Unused invitations can be canceled; used and expired ones stay listed, faded, for a while. An address that already has an account can't be invited.
- **USR-4** With approval, a new account **waits**. It can sign in but sees only a "Waiting for approval" page (which opens up by itself once approved), and can't reach any data, make API keys or link a watch. Admins see waiting accounts at the top of the People page, with **Approve** and **Decline** (which deletes the account; they can sign up again), and a count beside People (a dot on the More tab on phones).
- **USR-6** The **People** page (admins only) lists who's waiting, the invitations, and the members with when they joined, who invited them and when they were last active, and Admin and You badges.

## Email

- **USR-5** Email is optional (`SMTP_URL`, `MAIL_FROM`, or set by an admin, ADM-1). With it, invitations can be emailed, admins hear when someone is waiting, and people hear when they're approved. Without it, admins send invitation links themselves. An email's HTML part opens with the website's board (the L5 mark and LAWFIVE, WEB-25) as a picture inside the email, so it shows without loading remote images; with pictures off, "LawFive" shows instead.

## Managing accounts

- **USR-7** Accounts after they're made:
  - **Forgotten password.** With email, "Forgot your password?" sends a link that works once, for an hour, and the answer is the same whether or not there's an account; without email, the page says to ask an admin. An admin can also make a **reset link** from the account's menu on the People page, working once for 24 hours. Devices already signed in stay signed in (R-14).
  - **Suspend.** An admin can suspend an account (not their own, one waiting, or one `ADMIN_EMAILS` makes an admin). It's signed out everywhere (linked watches need linking again), can't sign in ("This account is suspended"), and its API keys and calendar feed stop working. Its data is kept, and lifting the suspension lets it back in. It stays in the members list, marked.
  - **Delete.** An admin can delete an account (not their own, or one `ADMIN_EMAILS` makes an admin) after typing its email: everything in it goes, for good.
  - **Your own account**, in Settings → Account: change the password (with the current one); change the email (with the password, USR-9), but not to or from an address in `ADMIN_EMAILS`; change the name (USR-10); and delete the account (with the password; refused for the only admin while there are other accounts), in a dialog that lists what goes and offers Download my data first.
  - **Who can sign up** can be chosen on the People page too. `SIGN_UP` set in the environment fixes it and the page shows it locked; otherwise the admin's choice is used, open until one is made (ADM-1).
- **USR-9** **Confirming a new email.** With email, a change sends a link to the new address, and the address changes only when it's followed: once, within 24 hours, signed in or not, signing nobody in.
  - Until then the old address works, and Settings → You shows "Check {new} for a link", until when, and Cancel. Asking again replaces the link.
  - On following it, the server checks again that the address is free and not in `ADMIN_EMAILS`, and tells the old address once it changes. Other devices stay signed in (R-14).
  - `/confirm-email/<token>` confirms as it opens: "Your email is now {email}", or the server's reason with a link to Settings.
  - Without email, the change is made at once with the password.
- **USR-10** **Your name** can be changed in Settings → You: 1 to 100 characters, spaces at either end trimmed, as at sign-up.

## Status

Everything above is built. USR-9 and USR-10 are on both phones too.

Not built yet:
- Signing in with Google or Apple.
- The email header checked in real mail apps (Gmail on the web and app, Apple Mail, Outlook), light and dark.
- USR-9 tried with a real SMTP server.
