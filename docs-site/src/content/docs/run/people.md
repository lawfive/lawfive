---
title: People and sign-up
description: Choose who can make an account on your server, and manage admins, invitations and approvals.
---

## Who can join

An admin chooses this on the **People** page, or you can fix it with `SIGN_UP` in `.env`.

| Setting | What it means |
|---|---|
| `open` | Anyone can make an account. This is the default. |
| `approval` | Anyone can sign up, but an admin approves each account before it can be used. |
| `closed` | Only people an admin invites. |

Everyone sees only their own matches. Admins are no exception: being an admin doesn't let anyone see other people's matches.

:::caution[Upgrading from an older server]
`SIGN_UP` in the environment beats a choice made on the People page, and the old `.env.example` set `SIGN_UP=open`. If you chose differently on that page, remove the line or set it to your choice before upgrading.
:::

## Admins

Admins can invite people, approve or decline new accounts, and make other accounts admins. They can't change their own admin status.

`ADMIN_EMAILS` in `.env` names admins by address, comma-separated. They can't be changed in the web app. An account for one of those addresses signs up like anyone else's, then waits for an existing admin's approval even when sign-up is open, unless it came with an invitation: nothing confirms the address belongs to whoever typed it. It's optional: the first account on a new server becomes an admin either way, with the setup code from the logs.

## Inviting someone

On **People**, make an invitation with an optional name and email.

- It works once, for 14 days, and makes an account whatever the sign-up setting says.
- With an email, only that address can use it. Without one, anyone with the link can, once.
- You can copy the link, share it as a QR code that the phone app scans, or have it emailed if [email is set up](/run/services/#email).
- Unused invitations can be canceled.

## Approving accounts

With `SIGN_UP=approval`, a new account can sign in but sees only a waiting page until it's approved. It can't reach any data, make API keys or link a watch.

Waiting accounts are at the top of **People**, with **Approve** and **Decline**. Declining deletes the account, and they can sign up again. If email is set up, admins are told when someone is waiting, and people are told when they're approved.

## Plans and limits

What each account may use is set by **plans**, in Settings → Server → **Plans**. A plan is a name, a short code (such as `free` or `pro`, kept when the plan is renamed) and a set of limits. Leave a limit empty for no limit, or set it to 0 to allow none at all:

- matches, referees and venues kept, and megabytes of photos and tracks;
- the largest photo, and the largest file brought in (an import or restoring an export);
- watches and phones signed in at once (browsers don't count);
- phone notifications a day;
- API keys, their requests a minute and a day (all of an account's keys together), webhooks, and assignor calendars (calendar links from ArbiterSports and other assignor systems, each read every 30 minutes);
- address searches a day, for finding a venue on the map. Every search counts, and a pin can always be placed by hand. However the plans are set, one account has at most two searches waiting at once, as the server sends them on one a second.

Weather isn't limited per plan, as forecasts are shared by everyone at a place; `WEATHER_DAILY_LIMIT` covers the whole server.

Everyone is in one plan. A new server starts with **Standard**, the default, with 20 API keys and 10 webhooks; if `ACCOUNT_STORAGE_LIMIT_MB` is set, that's its storage. Make another plan the default to change what new accounts get, and anyone you haven't put in a plan follows it.

On **People**, **Change plan** in a member's menu puts them in another, optionally until a day and then another plan, which is how a trial works: "Pro until December 2, then Free". A plan ends at midnight at the end of that day in their time zone. An invitation can carry a plan for some days too, and Plans → **New accounts** can start everyone who signs up with a trial. Each change is kept, so you can see who has had a trial.

Over a limit, nothing is taken away: adding more of that thing is refused, with a message naming the limit, until they're under it again. Matches and tracks recorded on a watch are always kept. People see their plan and what they're using in Settings, a notice from a week before it ends, and an email a week and a day before if [email is set up](/run/services/#email).

:::note
API requests, notifications and address searches are counted in the server's memory, so restarting it starts the day's counts again.
:::

## Forgotten passwords

With email set up, people can reset their own password. Without it, an admin makes a password reset link on **People** and sends it however they like.

Admins can also suspend and delete accounts there.

People change their own name, email and password in **Settings**. With email set up, a new email is confirmed by a link sent to it, which works once within 24 hours; until it's followed, the old address keeps working. Without email, the password alone changes it.

## Wrong passwords

After 5 wrong passwords in a row for an email address, signing in with it is locked for a minute. Each wrong password after a lock ends doubles it, to at most an hour, and even the right password waits until it ends. This counts every address the same, with an account or without, so it never shows who has one. Watches and phones already signed in carry on as before.

The lock ends sooner when the person resets their password, or when an admin chooses **Unlock** beside them on **People**, where a locked account shows **Locked until** and the time. With email set up, the account's owner is told the first time it locks in a day.

:::note
Resetting a password doesn't end the account's other sessions. To end them, use **Sign out everywhere else** in Settings, which is also offered on the phones.
:::
