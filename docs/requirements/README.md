# Requirements

What LawFive does, area by area: the watch apps, the phone apps, the website and the server. These files are the source of truth for behavior; how each part is built is in its own README, and how the parts fit together is in [ARCHITECTURE.md](../ARCHITECTURE.md). Terms are in the [glossary](glossary.md).

## How to read them

- Every requirement has a stable ID, its area's code and a number (`TMR-3`). Code comments, commits and issues refer to them. IDs are never reused or renumbered.
- A requirement with no label is agreed: build to it. Others are labeled:
  - **Draft**: wanted, with details still to settle.
  - **Proposed**: suggested, waiting for a yes or no.
  - **Later**: wanted, but not yet.
  - **Dropped**: no longer wanted, kept so its ID isn't reused.
- Each file ends with its **Status**: what's built and what isn't yet. What still needs checking on real hardware is in [risks](risks.md).

## The match, on the watch

| Area | Code | |
|---|---|---|
| [Supported devices](devices.md) | DEV | The watches LawFive runs on |
| [Match setup](match-setup.md) | SET | Quick match, Create match, formats and planned matches |
| [Pre-match](pre-match.md) | PRE | The kickoff screen, the coin toss and the kickoff direction |
| [Timers](timers.md) | TMR | The match, stoppage and break clocks |
| [Extra time and penalties](extra-time.md) | ET | Extra time, golden goal and shoot-outs |
| [Alerts](alerts.md) | VIB | Vibrations at the period's end, breaks and stoppages |
| [Controls](controls.md) | INP | Buttons, touch and the game menu |
| [Match events](match-events.md) | EVT | Goals, cards, sin bins, injuries and Undo |
| [Match screen](match-screen.md) | UI | What the watch shows, and the match screen setup |
| [Recording](recording.md) | ACT | The watch's activity, with GPS |
| [Wear OS and Apple Watch](wear-os-and-apple-watch.md) | WCH | The two other watch apps |
| [Try a match](try-a-match.md) | DEMO | The watch in the browser |

## Matches, data and sync

| Area | Code | |
|---|---|---|
| [Data and export](data-export.md) | DATA | The match record, the report and exports |
| [Correcting a result](correcting-results.md) | RES | Editing a played match |
| [Sync](sync.md) | SYNC | Linking watches and syncing them with the account |
| [Tracks](tracks.md) | TRK | Position and heart rate: heatmaps, replays and figures |
| [Stats](stats.md) | STAT | Figures and charts across matches |
| [Weather](weather.md) | WX | Forecasts and weather risks |
| [Photos and files](photos.md) | FILE | Photos on matches, venues and referees |
| [Importing](importing.md) | IMP | Matches from spreadsheets and other apps |
| [Merging](merging.md) | DUP | Duplicate venues, referees and matches |
| [Calendar feed](calendar-feed.md) | CAL | A referee's matches in their own calendar |
| [Assignor calendars](assignor-calendars.md) | FEED | Matches from an assignor's calendar feed |
| [Integration notifications](integration-notifications.md) | NOTE | Notices when an integration changes a match |

## The apps and the website

| Area | Code | |
|---|---|---|
| [Web app](web-app.md) | WEB | The website's pages and how they behave |
| [Android](android.md) | APP | The Android app |
| [iPhone](iphone.md) | IOS | The iPhone app |
| [Did you know](tips.md) | TIP | Tips in the apps |
| [Quiz](quiz.md) | QUIZ | The Laws of the Game quiz |
| [Marketing site](marketing-site.md) | SITE | lawfive.app, its legal pages and the hosted service |

## The server

| Area | Code | |
|---|---|---|
| [People and access](people.md) | USR | Accounts, sign-up, sharing and admins |
| [Plans and limits](plans-and-limits.md) | PLAN | Account limits |
| [Server settings](server-settings.md) | ADM | Settings and the setup wizard |
| [Security](security.md) | SEC | Sign-in limits, headers and secrets |
| [Push relay](push-relay.md) | PUSH | Notifications through push.lawfive.app |
| [API keys](api-keys.md) | KEY | Keys for scripts and other apps |
| [Webhooks](webhooks.md) | HOOK | Calls to other services when records change |
| [API descriptions for agents](agent-descriptions.md) | AGT | The API described for AI agents and tools |
| [Diagnostics](diagnostics.md) | DIAG | Readings that help find problems |
| [Versions](versions.md) | VER | Version numbers from git |

## Changing them

A change in behavior changes its requirement in the same piece of work: a new ID for something new (the next number in its area), an edit for something changed, and the Status updated. A question that needs deciding goes in a GitHub issue; questions Q-1 to Q-25 have been used and answered.
