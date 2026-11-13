# Stats (STAT)

Reports on the matches you've refereed, in the **Stats** tab of the website, the Android app and the iPhone app. The server works them out (`GET /v1/stats`), so every app shows the same figures.

## What counts

- **STAT-16** **One rule for counting games:** a match played or abandoned that has a kickoff. Every count of games uses it: Stats, the match list's "played", and the played counts on venues, referees, competitions and templates. A game's distance is one figure wherever it's shown: the average over every game with a distance, tracked or from the watch's report.
- **STAT-1** Everything on the page follows the filters at the top, kept in the page's address:
  - **When:** All time (the default), Last 12 months, each year you have games in, or From / To dates, by each match's own local date.
  - **Gender:** all, or one your games have (Male, Female, Co-ed).
  - **Competition:** all, or one.
- **STAT-5** More filters: **Role** (all, referee, assistant, fourth official), **Tag** and **Venue**, each listing only what your games have.
- **STAT-11** **Click through:** a venue, referee, age group, month or role in the charts opens the match list showing exactly those games (with the page's filters), saying what it's narrowed to, with a way to clear it. Both use one definition of which games match.

## The website's sections

The website's Stats takes the broadcast stats package's look (WEB-24). Charts use LawFive's green, with green, amber and blue for roles and genders, checked for color-blind readers.

- **STAT-2** Tiles: games (with how many were abandoned); games as center referee, with the share; total distance (in the Settings unit), with how many games it covers; average distance per game; referees worked with (distinct people on your crews, saved or only named); pitches (counting a venue as one when a match has no pitch), with how many venues.
- **STAT-3** Charts, each with its numbers in a table too:
  - **Role:** games as Referee, Assistant referee (AR1 and AR2 together, with the split) and Fourth official, plus Not set.
  - **Distance by role:** the average per game in each role, and the longest and shortest games, linked. Distance is the track's (TRK-3) when the match report has one, otherwise the report's own.
  - **Games by month**, stacked by role.
  - **Distance over time:** the running total, a point for each game.
  - **Busiest times:** kickoff hour by day of the week, brighter for more games, in each match's own time zone; turned on a narrow screen, as on the phones.
  - **Age groups** (U8, U10 … then adult ones), stacked by gender, beside each one's added time and cards a game (STAT-7, STAT-9).
  - **Where:** the ten venues (with the pitch, when known) with the most games, each venue and pitch ranked on its own.
  - **Weather:** games with rain (1 mm or more from an hour before kickoff to the end) against dry ones, the hottest, coldest and windiest games (linked), and the average kickoff temperature (WX-6). Past matches without weather get it from historical data (WX-10).
  - **Temperature:** games in each band of kickoff temperature (10 °F or 5 °C wide).
  - **Referees:** the ten you've worked with most, linked to their page when saved.
- **STAT-6** **Fees:** earned in the period, paid and still owed, by month and by the competitions that paid most. In the Settings currency; fees in other currencies are counted separately and named.
- **STAT-7** **Discipline**, from the match reports' events: cautions and send-offs (second cautions count as both) and goals per game; cards per game by age group and by competition; the misconduct codes used most. Sin bins count too; a second sin bin also counts as a send-off (EVT-12).
- **STAT-8** **Fitness**, for games with a track, worked out as on the match page (TRK-3): distance and average heart rate per game over time, sprints per game, the time in each speed band and heart-rate zone (with a maximum heart rate set, TRK-4), and where on the pitch the time went (TRK-9), with a heatmap for each role, as their tracks look nothing alike.
- **STAT-9** **Added time:** the average time played beyond each period's length, overall, by period, by age group and by competition. Left out: periods of abandoned games, periods more than 15 minutes over (left running), periods whose match clock was corrected (TMR-14), and matches whose clock stops (TMR-15).
- **STAT-10** **Year by year:** each year's games, games as center referee, distance, referees worked with, venues and fees.
- **STAT-15** **Your watches:** each watch the games were recorded on, most games first, with its games and how much battery a match used.
  - Named as people know them (Garmin Venu 2, Galaxy Watch4, Apple Watch Series 9), a watch's regional versions and sizes as one. An unknown Apple Watch is "Apple Watch"; an unknown Wear OS watch goes by the model it gives.
  - The main figure is battery **an hour**, from the first kickoff to the last period's end, breaks included, worked out across the games together, so short and long games compare fairly. **A game** is the plain average. Both say how many games they come from.
  - The battery is the reading at the first kickoff less the one at the end (DIAG-1). A game without both readings and both times, or where the battery went up, counts only as a game; a watch with no readings shows a dash.
  - Games entered on the website, imported, or from a watch that didn't say which it was aren't included.
- **STAT-12** **Export:** a CSV of the filtered games (`GET /v1/stats/games.csv`): date, kickoff, competition, teams, score, role, venue, pitch, age group, gender, distance, average heart rate, kickoff temperature, rain, cards, added time, fee and whether it's paid.
- **STAT-4** The tab is in the sidebar, and on the bottom bar at phone width. API keys with matches read get the stats and the CSV (KEY-3), holding only what their scopes allow:
  - without match reports, nothing from reports or tracks (distance, discipline, added time, fitness, heatmaps, Your watches);
  - without settings, no heart-rate zones, and the standard sprint speed;
  - without venues, referees or competitions, the lists naming them are empty while the counts stay, as are the CSV's venue, pitch and competition columns.

## On the phones

- **STAT-13** Android and the iPhone have a **Stats** tab between Referees and More.
  - Filters: **When** (All time, Last 12 months and each year with games) and **Role**. The other filters stay on the website.
  - The last answer for each of the newest 12 sets of filters is kept, so the tab works without signal ("Offline · from" when). New filters keep the last numbers up, faded, until the answer comes; pulling down asks again.
  - Values are written on the charts, and a tap on a column, point or stretch says what's in it. Each chart has a spoken summary for TalkBack and VoiceOver in place of the tables.
  - Only direct links: a game opens its match, a venue its page, a saved referee theirs.
  - **Full stats** at the bottom opens the website, for added time, more filters, the tables and the CSV.
- **STAT-14** The phones show the website's sections in the broadcast stats package's look (APP-27, IOS-13), simpler where a phone needs it:
  - **Cards shown** gives the cards and their rates, without discipline's charts or misconduct codes; goals go in the ticker.
  - Fees without the months chart; Games a month for the newest 12 months only, so it never scrolls.
  - **Where on the pitch** painted on the grass (TRK-14) with a Referee / Assistant switch.
  - Fitness without the per-game charts; year by year only with two or more years.
  - Busiest times always turned, days across and hours down, so seven columns fit.
  - No added time.
  - Figures sized to their room don't grow with the phone's text size; words do.

## Status

Everything above is built on the website, Android and the iPhone, except STAT-16's single distance average.

Not built yet:
- STAT-16's one distance average on the server, and the counts and distance using it.
- Checked on real phones (R-12).
- Your watches' battery figures from real watches, and the Apple Watch's hardware identifier read on a real one (R-13).
- Busiest times turned with a very wide range of kickoff hours.
