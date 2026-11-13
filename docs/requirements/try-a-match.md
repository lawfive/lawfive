# Try a match (DEMO)

A watch in the browser that runs a real match, so a referee can see how LawFive works on the watch before a game, or before installing it. It's on the website (`/try`, signed in) and on lawfive.app (`https://lawfive.app/try`, no sign-in, SITE-9); the phones open lawfive.app's.

## The watch

- **DEMO-1** **Try a match** draws a watch with its own controls and screens and runs a whole match on it: the kickoff choice, the three clock styles (UI-21 to UI-23, UI-25), stoppage, the halfway break, added time and its alert, goals with player numbers, cards, undo, half-time, extra time and its toss, the shoot-out and full time. Nothing is saved to the account.
  - The watches: a Garmin, as **Five buttons** (Forerunner, fēnix, epix) or **Venu** (a touch screen and two buttons); Wear OS; Apple Watch.
  - Signed in, it starts on the watch the account used most recently (a Venu as the Venu), with a switch to the others. On lawfive.app it starts on a five-button Garmin and the visitor picks.
- **DEMO-2** **The match rules are one more copy** of the watches', in TypeScript, tested with the same shared match cases ([`schema/match-cases/`](../../schema/match-cases/), WCH-2). The match screen setup's pictures take their clock text from it. A difference from a watch is a bug in one of them.
- **DEMO-7** **Kickoff direction isn't played**, as it needs the watch's compass: its row in the game menu shows a picture of the screen and says how it works on a real watch. The picture is drawn, so the page loads nothing from elsewhere. Marking the pitch is done from a watch's History, which isn't in the demo.

## Controls

- **DEMO-3** **Its controls are the watch's.**
  - Clicking a drawn button presses it, anywhere within 44 px across, though the button is drawn smaller.
  - Dragging on the screen swipes, even if it ends off the watch, without selecting or dragging anything on the page or leaving a focus ring.
  - A five-button Garmin's screen takes taps and swipes too, as its touch screen does.
  - Team swipes follow the account (INP-10), and a swipe right goes back (WCH-9).
  - The keyboard works unless a field has focus. On a five-button Garmin the arrows are Up and Down, Enter is Start and Escape is Back. On the touch watches an arrow swipes the arrow's way, shown by a finger crossing the screen (in a menu or number, ↑ and ↓ move through it), and Enter taps. On a computer, **Your keyboard is the watch** says which key does what.
  - Alerts silence on the first press (VIB-6), shake the drawn watch and buzz a phone where the browser can, except for anyone who has asked for less motion.
- **DEMO-5** **Time** is real time by default, with 1×, 10× and 60×, and **Skip to** the halfway break, the end of the period and the end of half-time, a few seconds before each. The time of day is the visitor's.
- **DEMO-6** **Hints and a tour, always on.**
  - Beside each button a hint says what it does now, with its key. Under the watch, a row for each of the screen's taps and swipes, and on a phone the buttons' too.
  - **The tour** is a card above the watch that can't be skipped: about eight steps through a half (who kicks off, starting, a goal, a yellow card, a stoppage, the halfway break, time up, ending the half, half-time), each waiting until it's done, with its control ringed on the watch and its hint marked **This step**. **Restart the tour** starts it again.
  - At the end it offers a level cup match's last seconds, for extra time and the shoot-out.
  - **Start the match over** is always there, and starts the tour over with it.

## The account's match

- **DEMO-4** **The account's own setup**: its match screen (or, opened from the match screen setup, the one being set up, unsaved, with the way back keeping the changes), its team swipes, and the next planned match's format, teams and colors, or a made-up match when there's none. Beside the watch, **Match screen** says which it is in a line, with **Change** (or **Back to it**, from the setup). On lawfive.app, Change goes down to the setup under the watch.
- **DEMO-8** **Where it's reached** on the website: Settings → Match screen's **Try a match**, the match screen setup's **Try it in a match** under its pictures, and Get the app (signed in: "see how a match runs on the watch before you install"). The phones' rows open lawfive.app's page (DEMO-9).
- **DEMO-9** **Try a match from an address**: lawfive.app's page takes the watch and the match screen in its address, under the API's names.
  - `?watch=garmin|venu|wearos|apple`, with the match screen's choices (UI-21: `clocks`, `mainClock`, `secondClock`, `breakClock`, `edge`, `names`) and team swipes (`teamSwipes`, INP-10).
  - Anything missing or not understood is the page's own default: a five-button Garmin, and the visitor's own or the default screen.
  - No names, teams or matches go in it, so the match is the page's made-up one, and it works the same for every server, self-hosted too.
  - Given a match screen, the page shows it without Change, and the setup under the watch gives way to "Your match screen, from LawFive. Change it in Settings → Match screen.", so nothing seems to change the account's.
  - The phones open it with the account's choices and linked watch (a five-button Garmin with none) from SYNC-15's Try a match, Settings → Match screen's **Try a match** ("On lawfive.app: your watch with this screen. Nothing is saved.") and More's ("The watch app, on lawfive.app"), in the app's own browser view, so closing it comes back to LawFive.
  - The website and both phones build and read the address by one rule, tested on the same cases ([`schema/test/screen.test.ts`](../../schema/test/screen.test.ts)).
  - The website's own `/try` (signed in, DEMO-4) takes `?watch=` too, for SYNC-15's row on the website.

## Status

DEMO-1 to DEMO-9 are built on the website and lawfive.app, with the match rules passing the shared match cases; the phones open lawfive.app's page.

Not built yet:

- DEMO-9 from the phones, and the phones' Match screen card, haven't been seen on a real phone.
- Differences from the watches, to fix (DEMO-2):
  - Start during a due break only silences the alert (VIB-6).
  - Change kickoff and Cancel match don't ask for confirmation (PRE-3).
  - The game menu offers the kickoff direction and coin toss at every kickoff, has no coin toss before a shoot-out (PRE-9), and lacks Start 2H, Undo, End match and Abandon match where the watches have them.
  - The break says "Kickoff: the toss" for "New toss for kickoff" (ET-7).
  - A swipe silences an alert, which no watch does.
