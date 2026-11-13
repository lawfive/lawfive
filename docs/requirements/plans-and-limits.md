# Plans and limits (PLAN)

What each account may use, set by whoever runs the server: a self-hoster sharing with friends keeps it from filling up, and the hosted service gets a free plan and, later, a paid one (A-4). Plans are managed on the website; the phones show an account's plan and use.

## Plans

- **PLAN-1** **Plans** are named sets of limits, each with a **code** (lowercase letters, digits and hyphens, unique, made from the name and kept on renaming) to look it up by in the API and invitations. Admins manage them in Settings → Server → **Plans**; a plan in use can't be deleted. The **default** plan takes new accounts and any given no plan. A new server starts with **Standard** (`standard`): 20 API keys, 10 webhooks, and `ACCOUNT_STORAGE_LIMIT_MB`'s storage when set.
- **PLAN-2** **What a plan limits**, each empty for no limit or 0 for none: matches, referees and venues kept; megabytes of photos and tracks (SEC-6); the largest photo (within the server's 10 MB) and the largest import or restore file (within the server's own limits); watches and phones (PLAN-7); notifications a day; API keys, and their requests a minute and a day (PLAN-8); webhooks, by number; assignor calendars (FEED-10); and address searches a day (PLAN-11). Weather isn't limited by plan: forecasts are shared by place, so `WEATHER_DAILY_LIMIT` is its only control (WX-2).
- **PLAN-3** **Every account is in one plan**, admins included, shown on its People row and changed from its menu (Change plan), optionally until a last day and then another plan (the default if none is chosen). There are no per-person exceptions: for a one-off, an admin makes a plan.
- **PLAN-5** **Trials and plans that end.** A plan set until a day ends at midnight at the end of that day in the account's time zone (PLAN-9), and the account moves to the next plan on its own, already counting as it until the move. An invitation can carry a plan for some days, and Plans → New accounts can start every new account on a trial of another plan for some days. Each change of plan is kept (from, to, when, and why: sign-up, invitation, an admin, or the last one ending) and shown to admins, so they can see who has had a trial; trials aren't limited to one each.

## Limits

- **PLAN-4** **Over a limit, nothing is lost.** Adding more is refused until the account is under it again; what's there stays and can be changed.
  - The refusal is 403, naming the limit in words: "Your plan allows 20 API keys. Delete one first, or ask an admin of this server for a bigger plan."
  - Matches and tracks recorded on a watch are never refused.
  - An import that would go over saves nothing, and its dry run says so first. A restore adds what fits and lists the rest under problems.
- **PLAN-7** **Watches and phones** count toward the devices limit, as the Devices list shows them; browsers never do. At the limit, linking a watch and signing in on a phone are refused, saying to unlink one in Settings → Devices.
- **PLAN-8** **Requests and notifications.** An account's API keys share one count, a minute and a day (from midnight UTC), so more keys don't get round it; over either answers 429 with Retry-After. Notifications a day are counted across the account's phones, inside the push relay's own limits (PUSH-1); one over the limit isn't sent, as if the relay were busy. These counts live in the server's memory and start again when it restarts.
- **PLAN-11** **Address searches a day** for finding a venue on the map (`GET /v1/geocode`), every search counting, cached or not, from midnight UTC. Plans made before this limit have none. Over it, the website and both phones say so, and that a pin can still be placed by hand; Settings shows today's searches against it. Whatever the plan, an account has at most two searches waiting at once, so it can't fill the server's one-a-second queue.

## What people see

- **PLAN-6** Settings shows the account's plan, when it ends and what follows, and its use of each limit that fills up, with a bar (yellow from 80%, red when full; storage always). Per-day limits give no warning, only the refusal. From a week before a plan ends, a notice across the top of the website says when and what follows, until it's hidden on that browser; with email (USR-5), the server also emails a week and a day before.
- **PLAN-9** **An account's time zone** (`timeZone` in the settings record), UTC until set.
  - It's filled in from the first browser or phone that syncs, and changed on the website. The phones show it ("set by your phone" when it's theirs) and offer their own when it differs.
  - Phones fill it in only on a server that lists `plans` in `GET /v1/meta`, as an older server drops the field and it would sync over and over. A phone that makes the settings record (APP-4) puts its zone in it.
  - Its hint everywhere: "For games from your assignor's calendar that don't say their time zone, and when a plan ends (at midnight here)." (FEED-4).
- **PLAN-10** **The phones** show the plan, its use and the time zone in Settings, as the website does; making and changing plans is left to the website (APP-8).

## Status

Everything above is built on the server, the website, Android and the iPhone.

Not built yet:
- Checked on a real phone (R-20).
- Assignor connections as a limit, once they exist.
