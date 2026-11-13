# Web app (WEB)

How the website looks, moves and lays out its pages, beyond what each feature's own area says. It covers the website; where a requirement says so, the Android and iPhone apps do the same. The look itself (colors, type, components, layout) is set out in [DESIGN.md](../../DESIGN.md).

## The look

- **WEB-24** **Pitch & Scoreboard**, as DESIGN.md sets out: the page is the pitch, figures sit on stadium boards, teams are kits, cards are physical cards (yellow and red only for cards), dense content sits on chalk panels. Every page has its own treatment, quieter where it's a form.
  - Light and dark follow the system.
  - Every page's title, and the hero figures sitting directly on the grass, take a hard offset shadow, on phones too. Nothing else does.
  - On wide screens the stadium board runs across the top and stays as the page scrolls (WEB-31). Under 820px a bottom tab bar takes its place.
  - The pitch heatmap is painted on the grass (TRK-9), with a Less → More key and the pitch's length and width marked outside the touchlines in the person's units (whole meters, or whole yards where distances are in miles).
  - lawfive.dev (SITE-12), lawfive.app (SITE-13), Android (APP-27) and the iPhone (IOS-13) follow it. The watches' running screens keep their own look.
- **WEB-25** **The L5 logo**: a heavy italic L and a 5 with a darker fold at its foot, drawn as shapes.
  - The favicon and install icons are the mark on the stadium board, the same in light and dark, the fold left out under 24px.
  - The board across the top shows the mark beside the LAWFIVE wordmark; the sign-in pages, setup wizard and shared match page show the lockup, with a tapered line under the name.
  - The website's QR codes carry the mark at their center.
  - It's every app's icon (UI-14, APP-24, APP-27, IOS-13, WCH-6; the iPhone's with iOS 18's dark and tinted icons), heads the emails (USR-5), and is used by lawfive.dev and lawfive.app.
- **WEB-28** **The slab**, Stats' section style (a dark board with a chalk title tab and a mint tag saying what's counted), also holds, on the website and both phones:
  - A match's track: **The running** (tagged The periods, or Whole recording without period start times) with the distance, top speed, sprints and heart rate; and **Where on the pitch**, the heatmap. The map, heart rate and each period's table stay chalk panels.
  - A match's weather: **Weather** (or **Forecast** before the match), tagged At kickoff, with the rain that fell once played in place of the chance of rain.
  - A venue's and a referee's figures: **At this venue** and **Working together**, tagged since the first match played ("Since Sep 2026"), with See matches (on the phones it scrolls down to the matches on the page).
  - The quiz's score: **Your score**, then **By Law** (Weakest first).
  - lawfive.app's closer look, replay and quiz (SITE-9, SITE-13).
  - Never forms, settings, lists, long text, the match list or the next match's board.
  - On a phone the figures are rows, and on the narrowest a date never breaks across lines.
- **WEB-5** **Cards are drawn as cards**, not icons: a played match in the list shows a small yellow and red card with how many were shown (a second caution counts as one of each, as in Stats). Stats' Discipline starts with large cards (cautions, second cautions, send-offs) with totals and how many a game, and the goals.
- **WEB-6** On a phone, the browser's bars and the installed app's status and navigation bars take the page's background, so it runs edge to edge in one color. Content keeps clear of the bars and cutouts, and scrolls under a band of the page's color at the top, never under the clock.

## Motion and loading

- **WEB-1** **Motion**, short and purposeful (buttons press in, rows rise in, numbers count up, cards are dealt in, the countdown's figures drop in as they change; DESIGN.md lists it). Nothing moves for anyone whose system asks for less motion.
- **WEB-7** An empty match list's pitch markings are chalked in as it appears, once and in under a second: the center circle draws round from the top, then the halfway line runs out both ways from the center spot. With less motion asked for, they're simply there.
- **WEB-8** **Loading placeholders**: faint shapes laid out like the Stats page and a match page (and its Movement and heart rate while the track loads after the rest), and under a venue map until it has drawn. A line-marker's sweep passes across them over and over; with less motion asked for, they stay still. The Stats and match page shapes appear only once loading has taken 0.3 s.
- **WEB-9** **The loading pitch**, wherever something waits without placeholders: a small pitch marked out in faint brand green, line by line, over and over, where the content will be or small in a row. It appears only after 0.3 s, and is still with less motion asked for. Busy buttons keep their own words ("Saving…").

## Getting around

- **WEB-31** **The navigation**, on the website, Android and iPhone: the stadium board and the phone's tab bar have Matches, Venues, Referees, Stats and More.
  - More holds, in groups divided by a rule: Competitions, Templates, Quiz, Try a match (and Settings on the phone's More page; on the board it's the gear); Link a watch, Get the app, Help (WEB-29); and for admins, under **Admin**, People, Plans and Server settings.
  - More is lit on the pages it leads to, the server's own pages included; the gear on Settings and its personal pages.
  - Link a watch, Get the app and Try a match have no back link to Settings, as they're reached from several places.
- **WEB-18** The main pages come in the order Matches, Venues, Referees, Stats, then Competitions, Templates and Quiz (under More). The logo goes to Matches.
- **WEB-16** **Back goes where you came from**, on the website and both phones.
  - A referee's or venue's page opened from a match has a back link naming that match; opened from the match list or Stats, it names those; from its own list, the list. Editing and coming out again keeps the way back.
  - The full page opens, never a card over the match.
  - A back link to one record says what it is, a dot, then its name, cut short with … when it doesn't fit: **Match · Strikers U12 v Rovers U12** (or the match's own name), **Venue · Twin Creeks**, **Referee · Sam Rivera**. A list's is its name (**Referees**).
  - The iPhone keeps iOS's chevron with no words, and names the page the same way in its long-press menu and for VoiceOver.
- **WEB-22** **Browser tab titles** name the page first and LawFive last: "Matches · LawFive".
  - A match adds its short date: "Rovers v Strikers · Sat, Nov 7 · LawFive" (its own name instead of the teams when it has one). A shared match is titled as the match page; the report is "Report · Rovers v Strikers · Sat, Nov 7".
  - Edit pages name what's being edited, as saved ("Edit Champion Stadium"). The rest use their heading ("New match", "Sign in").
- **WEB-13** **Signing out**: the account at the right of the board opens a menu with the name and email and Sign out. On a phone, the More page starts with the same. Settings has Sign out too.
- **WEB-29** **Help**, with the same words everywhere: a **Help** row ("Questions, and how to reach us") opening lawfive.app's support page (`https://lawfive.app/support`, SITE-11) in a new tab. It's in the website's More, Settings → About and under the sign-in card, and in both phone apps' More and Settings → About. Self-hosted servers link to the same page.

## The match list

- **WEB-2** The list starts with the **next match** (the soonest scheduled one still to kick off): "Next match" (or "Today"), the kickoff time, the day, a countdown (days, hours and minutes, dropping units that reach zero), the teams, venue and competition, the officials line (WEB-20) and the forecast with its risks. Its time and its kits open the match.
  - Under it, one line of figures: matches in the next 7 days, fees owed (and for how many matches) and matches played.
  - Neither shows when the list is narrowed from Stats.
- **WEB-27** **The next match folds to a strip**, on the website and both phones: a caret folds it to one strip (the day and time, the teams' badges and the countdown, the whole strip opening the match) and opens it again. The choice is kept in the account's settings, so it's the same everywhere; open when not set. The phones save it at once and send it when they can.
- **WEB-3** Each match is a **team-sheet row**: the two kits down its left edge (home over away; a black or white kit outlined where it would vanish, a team with no color a gray band), and the kickoff like a fixture board, the day over the date ("Fri" over "Oct 30", or "Today", with the year when it isn't this year), the time large, the forecast under it. A played match shows the score with the losing side muted (on penalties when level).
- **WEB-26** **Recent under Upcoming**, on the website and both phones: when Upcoming isn't searched or narrowed by a tag, it ends with **Recent**, the last three matches played ("The last 3 of 7"), then a button to all of them ("All 7 past matches") that opens Past.
- **WEB-10** **Tags** show as chips in a layer under the search box while it has focus, over the list rather than moving it. Tapping one filters the list, and the chosen tag shows in the search box with a ✕ to clear it. Coming back to Matches from a match returns to the list as it was left: the tab, the search, the tag and a narrowing from Stats.
- **WEB-32** **Get ready**, on Matches until every row is done or it's hidden: "Get ready", tagged "N of 5 done", with five rows that tick themselves.
  - **Link your watch**, with How to get it on lawfive.dev: done when the account has a watch.
  - **Get the phone app**: done when an Android phone or iPhone is signed in.
  - **Your units and time zone**, showing the guess, with Change and They're right: done when confirmed, or when they differ from the browser's guess.
  - **Bring in your games**: Connect a calendar (opening Add calendar in Settings) and Add a match, or Import on a server without assignor calendars. Done when there's a match or an assignor calendar.
  - **Choose your match screen**: done when one is chosen.
  - Hiding it and They're right are kept in the account's settings.
  - With no matches at all, the figures, search and tabs are hidden. While it shows, the empty match list has none of its own buttons, even once Bring in your games is done, so a new account sees each once.
  - The phones show the same, with Turn on reminders in place of Get the phone app.
- **WEB-4** **Pitch markings**: an empty match list has the center circle, center spot and halfway line faint behind its message (WEB-7). The sign-in, invitation and waiting cards sit in the page's center circle on the halfway line.
- **WEB-17** **An empty list says what it's for**, the same on the website and both phones: faint pitch lines behind, a small picture of what the list holds, a title, one line on why you'd use it, and a way to add the first. A search that finds nothing is plain words, with no picture.
  - Upcoming and Past matches have the lines alone. Upcoming offers Add a match and Import matches, Past Import matches. Until a watch is linked (or while that can't be told, offline), Upcoming asks to link one, with **Link your watch**. No buttons while Get ready shows (WEB-32).
  - The pictures: Venues a pitch with a map pin, Referees the diagonal system, Competitions a bracket, Templates two periods with the break between.

## Officials, referees and places

- **WEB-11** **Officials in order**: a match's crew, in the list and on the match page, is always Referee, AR1, AR2, 4th, with the account's own referee in their place (marked "you"). It's **4th** wherever officials are shown, and **4th official** only where a form offers the roles. **Add an official** picks the first role nobody has yet, on the website and phones.
- **WEB-20** **The officials line**, on the phones' match rows and the next match card everywhere (the website's rows show chips, WEB-11): one muted line under the venue, each role then the official's surname, in WEB-11's order with "you" in place, cut with an ellipsis. The match page has full names.
  - The surname is worked out from a referee's name as schedules write it: anything in brackets or after a spaced dash is a grade and left out ("Sam Rivera (Grade 7)"); the part before a comma is the surname ("Rivera, Sam"); Jr., Sr., II, III and IV are skipped; lowercase particles are kept ("de la Cruz"). A name it can't make sense of shows whole.
  - The referee's **Shown as** field overrides the guess (shown in it until something is typed). Merging keeps it (DUP-4).
- **WEB-23** **Call**, **Text** and **Email** buttons, in one group, are how to reach a referee wherever one appears except their own profile, which alone shows the number and address: the referee popover on a match (with words), a match's crew and the Referees list (icons alone), on the website and both phones.
  - Only the buttons a referee has details for show.
  - On the website each button's tooltip gives the number or address, and Call and Text show on computers too.
  - The merge and duplicate screens keep the details as text, to tell two entries apart.
- **WEB-14** **Directions**, everywhere a place is shown (the next match, a match's venue, a venue's page, and the phones' match pages, lists and notifications): one **Directions** button opening the pitch's map position (or the venue's, or its address when neither is placed) for directions from where the referee is. It's hidden when there's nowhere to go.
  - It opens the maps app chosen in Settings, **Directions open in**: **Automatic** (Apple Maps in the iPhone app, Google Maps on the website and Android), **Google** or **Apple**, saved with the account. Nothing opens OpenStreetMap.
  - Google Maps opens its app when installed, else the browser. On Android it shows the route rather than starting navigation.
  - When the iPhone won't open Apple Maps (Screen Time can block it), the app says so, with what to change, and offers Google Maps.

## Forms and settings

- **WEB-12** **Forms**:
  - Adding a tag to a match, venue or referee offers the tags used on others of its kind, narrowed by what's typed, in a layer over what's below.
  - Outlook and Notes boxes grow with their text, up to most of the screen, then scroll.
  - In a picker, **New** stays in view under the list while it scrolls.
  - New venue in the match form looks the place up as Find on map does: one place found creates it there; with several, choosing one does; with none, Create without the map.
  - Typing in these dialogs isn't lost to Escape or a click outside.
- **WEB-15** **The match format form**, for matches and templates, is in labeled groups: **Time** (periods, period length, half-time, team size; the match clock is in the match screen, TMR-11), **Halfway break**, **If the score is level** (extra time, penalty shoot-out) and **On the watch** (track stoppage, goal scorers, goal types). From 640 px wide the last three sit in two columns under Time. What only matters with a switch on opens under that switch: the break's length, Add the break to stoppage (TMR-12), and extra time's periods and length.
- **WEB-21** **The match form's sections**, on the website and both phones: **When and where** (kickoff, status, venue, pitch, competition; the phones' age group and gender too), **Details** (match name, match number, assignor (SET-15), tags), **Officials**, and **Fee and notes** (fee, outlook, notes).
- **WEB-30** **A match needs a team name or a kickoff**, on the website and both phones: Save with no home or away name and no kickoff doesn't save, and says "Add a team name or a kickoff time to save this match." where it's seen (on the website at the top of Teams, scrolled to; on the phones above the Save bar). A match already saved without either (a watch's quick match) can still be edited and saved.
- **WEB-19** **Custom team colors**, on the website and both phones: the pickers offer the watch's eight colors (SET-14), then **Custom**, which opens a color picker (the browser's, Apple's on the iPhone, LawFive's own on Android with a hue and brightness area and a hex field) and saves `#RRGGBB`. Custom then shows its swatch and hex. Watches with 64-color screens show the nearest color they have (R-8), so it can look like one of the eight.
- **WEB-33** **Settings in groups**, in this order: You (name, email, password, time zone, where you're signed in), Your watch (linked watches, the match screen with Try a match and Change, team swipes), Match day (the calendar feed, with its options once it's on; directions), New matches (usual role, usual format, misconduct codes), Units and money, Fitness (maximum heart rate; sprint speed under Advanced), Your games coming in (assignor calendars), Your data (download, restore, the plan and what it uses, delete account), For developers, folded (API keys, webhooks, their limits), About (version, Help, privacy and terms, licenses), and Server (admins).
  - On the website an index of the groups stays on the left on wide screens, and is chips at the top under 960px.
  - Each group has an anchor: #you, #watch, #match-day, #new-matches, #units, #fitness, #assignor-calendars, #data, #developers, #about, #server.
  - The phones use the same groups and order, without For developers and Server.

## Status

Everything above is built on the website, and on Android and the iPhone where a requirement says so.

Not built yet:

- Apple's color picker (WEB-19) hasn't been tried on a real iPhone.
