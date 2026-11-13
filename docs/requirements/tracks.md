# Tracks (TRK)

Where the referee went and how hard they worked in a match: GPS and heart rate, from whatever recorded them. Every source is converted into one LawFive track format and the server works out the figures, so a match looks the same whichever watch recorded it. Tracks show on the website's match page and in the Android and iPhone apps (TRK-14); the Garmin watch app records its own (TRK-7).

## The track and its figures

- **TRK-1** A match report can have one track:
  - its start time, then GPS (latitude, longitude, optional accuracy, and the speed the watch measured where it did) and heart rate as two separate series, each with its own times (milliseconds after the start, always increasing); either can be missing;
  - samples kept as recorded, up to about one a second, for up to 12 hours (43,200 samples) a series;
  - its source (LawFive watch, RefSix, FIT, GPX, TCX, Apple Health, Health Connect, Strava or other), device and app;
  - when known, the pitch: the two corners of one touchline and the center spot, marked by the referee or found automatically.
- **TRK-2** The API uploads a match report's track (replacing any it had), fetches it with its figures, and deletes it. API keys need match reports read, or read and write. The server takes only the LawFive format; each source is converted before upload.
- **TRK-3** The server works out the figures each time a track is fetched, so better math applies to old matches too. They cover the periods played (from the match report's period start times, else the whole track), in total and per period:
  - distance (the sum of the steps between points) and top speed;
  - time and distance in five speed bands: walking (under 7 km/h), jogging (7–13), running (13–18), high speed (18–21) and sprinting (21 and over), at the default sprint speed (TRK-11);
  - sprints: 2 seconds or more at sprinting speed;
  - average and highest heart rate, and time in five zones: 50–60, 60–70, 70–80, 80–90, and 90% and over of the maximum heart rate (TRK-4).

  Steps that don't count: more than 15 s apart (gaps, such as a paused recording); faster than 10 m/s (GPS errors); and travel, more than 120 m in any 30 seconds or 21 km/h or more for 6 s, whatever the sprint speed (a period left running on the way back to the car).

  Speeds are the watch's own where the track has them (FIT files, and Garmin's TCX), measured from GPS Doppler and motion sensors; otherwise they come from positions averaged over 3 seconds, to take out GPS jitter. The bands and thresholds are a first guess, to be tuned against more matches.
- **TRK-4** Settings has **Maximum heart rate** (bpm), empty by default. Heart-rate zones need it; without it the match page says where to set it.
- **TRK-11** **Sprint speed**, in Settings → Fitness under Maximum heart rate, on the website and both phones: 21 km/h by default, from 15 to 35, in the user's units. The other bands scale with it at the same shares as by default (jogging at a third, running at 13/21, high speed at 6/7), with a preview of where each starts. The figures, Stats, the map's colors and the replay use it. Travel detection stays at 21 km/h, so a lower sprint speed never turns a long run into a drive.

## Getting a track

- **TRK-7** **The Garmin app records its own track**, on by default; **Record track** in Settings → Account (and the phone settings) turns it off.
  - GPS (with the watch's speed) and heart rate about once a second, from kickoff to the end of each period, not the breaks.
  - Saved as it goes in 5-minute chunks (about 100 KB for a 90-minute match), so closing the app mid-match keeps it (TMR-8). If storage fills, recording stops and what was recorded is kept. Restarting (PRE-6) or canceling the match throws it away.
  - Uploaded after the match, a chunk a request, through the same sync (SYNC-4); the full-time screen says "Sending track…" or "Track uploads when phone is near" until it's in. A watch not yet linked sends it with the match once linked. The last 3 tracks wait on the watch; beyond that the oldest is dropped.
  - It carries each period's kickoff time, for the figures (TRK-3), and the kickoff direction when recorded (PRE-8), for heatmaps (TRK-9).
  - A match that already has a track from a file keeps it; a file can still replace the watch's (TRK-8).
  - Storage over a whole match, and upload time through a real phone, are still to be checked on a real watch (R-6).
- **TRK-6** **RefSix import** (the separate `lawfive-refsix-exporter`) brings each match's GPS track, heart rate and pitch across. It drops points without a position, keeps the last point where several share a time, and leaves out accuracy, which RefSix always gives as 1.
- **TRK-8** **Activity files** on the website: a played match's page takes a FIT, GPX or TCX file from any watch or app (from Garmin Connect, Export Original, zipped or not, or Export to GPX or TCX), one match at a time. It's converted in the browser and previewed before anything is saved:
  - when and on what it was recorded, how many positions and heart-rate readings, and the distance;
  - a warning when the match's kickoff isn't in the recording (or up to an hour before it began), to catch the wrong file;
  - for a match with a track, what it replaces, and the button says Replace. A track is replaced as a whole; the match page offers "Replace from a file";
  - for a match without a match report (one added on the web), one is made, with the score asked for. Its periods are the stretches the recording ran, split where it paused (or, for files that don't say, where nothing was logged for a minute or more), each of 2 minutes or more, with extra time after the format's periods. A recording never paused has no periods, so the figures cover all of it.
- **TRK-12 (Later)** More sources: Strava, with tracks arriving by themselves (each server, self-hosted ones too, needs its own Strava API app); Apple Health and Health Connect in the phone apps.

## On the match page

- **TRK-5** A played match with a track gets a **Movement and heart rate** card: the main figures (distance, top speed, sprints, average and highest heart rate); a map of the track during the periods, colored by speed band, with the pitch outlined (dashed when found, TRK-9); a heart-rate chart with the periods marked; each period's figures; time in each speed band and zone; and where on the pitch the time went (TRK-9). Distances and speeds follow the Settings unit.
- **TRK-10** **Replay** on the map: a dot where the referee was, with a fading trail of the last minute in speed colors over the faint full track.
  - 30× by default (10×, 30×, 60× or 120×), through the periods only. A scrubber jumps anywhere and steps by keyboard.
  - A panel in the map's corner shows heart rate (with its zone), speed, the match clock and the score at that moment.
  - Goals and cards (sin bins among them, EVT-12) are marked on the scrubber; clicking one jumps there. A goal holds the replay 3 seconds, with a GOAL banner (team, new score, minute), a ring pulsing from the marker and the score flashing; a card holds it 2 seconds with a smaller yellow or red banner (a sin bin's yellow with its length, a second sin bin's red). Banners show only during the hold.
  - A heart-rate strip above the scrubber while the replay is on (always in full screen): zones shaded, periods marked, a dot at the replay's moment, clickable. The heart-rate chart follows the replay too, and moving along it moves the marker.
  - Full screen, on phones' browsers too.
  - The marker glides along positions averaged over 3 seconds; where there's no GPS it waits and says so. With reduced motion it moves a step a second.
  - lawfive.app has a playable replay of a made-up match (SITE-8).
- **TRK-15** **Marks on the replay's timeline:** a goal is a round dot in the scoring team's color (brand green for none), ringed in the page's text color so white and black kits show in light and dark. Cards are upright yellow and red rectangles, so shape tells a red team's goal from a red card. A sin bin's (EVT-12) is the yellow one with a dark band across its middle; a second sin bin's is red.

## The pitch and heatmaps

- **TRK-9** **Heatmaps on a drawing of the pitch**, and figures across matches.
  - **Which pitch:** the track's own (marked by the referee, or from RefSix), else one from corners walked on the watch (TRK-13), else one found from the track by the referee's role (no role counts as referee). A found pitch is dashed on the map.
  - **Found for a referee**, assuming the standard left-wing diagonal (seen from above, bottom left to top right, the assistants at bottom right and top left): the pitch's length is the area covered turned back about 27°, centered where they stood at the kickoffs and sized from how far they went. A referee who ran the other diagonal gets a pitch about 50° out.
  - **Found for an assistant:** their strip along one touchline over one half is the touchline; the end where they stood at kickoffs is the halfway line (else the end nearer the venue's pin for the pitch); the pitch is on their left as they face the goal line of their half. A reverse diagonal puts it on the wrong side, to move by hand.
  - **Fourth official:** no pitch is found and there's no heatmap.
  - **Adjusting it on the map** (Adjust the pitch): handles move it (the center spot), turn it and set its length (a goal line's middle) and width (a touchline's middle). Save keeps it as marked; a marked pitch can go back to the one found.
  - **Where on the pitch**, on the match page: the time in the periods on a grid, with room beyond the touchlines for an assistant's run, painted as contour bands on the grass (green to pale mint) under the chalk markings, with the pitch's length and width in meters, or yards where distances are in miles (WEB-24). For the match or each period; the website shows a cell's time on hover.
    - It's the ground seen from above, never mirrored.
    - As referee, with the kickoff direction (PRE-8), it's turned so the first kickoff team attacks left to right, and says so ("STR kicked off attacking →"). Each goal line shows the team attacking from that end, on its color with an arrow, for each period of normal time (none for extra time, which has its own toss). Without the direction it's drawn as the pitch lies, with no teams.
    - As an assistant, it's turned so their touchline is at the bottom ("Your touchline at the bottom"), so every assistant match looks alike; the teams show when the direction is known.
  - **Stats** (STAT-8): time in each speed band across games, and a heatmap of the games with GPS on a standard pitch (each scaled to it, turned as above), one for referee and one for assistant, never mixed, with a switch when there are both. Its table is the share of time in each third of the length and width.
- **TRK-13** **Marking the pitch's corners on the watch**, walking the field before or after a match. **Mark pitch**, on a downloaded match (UI-19) or a played match in History (UI-17), asks for each corner in turn; Start (or a tap) marks it from a few seconds of averaged GPS. Two to four corners, in any order; after the second, Back saves them.
  - **Four:** the rectangle that fits best.
  - **Three:** the corner nearest a right angle is between the others; the fourth completes the rectangle.
  - **Two:** one side, giving direction and length; which side and the other measurement come from the pitch found (TRK-9).

  They're sent at the next sync (SYNC-12) and kept, dated, with the match and with the venue's pitch, if it has one. A pitch's corners apply to matches kicking off after they were marked, as fields move between seasons; a later marking takes over from then. The match they were marked for always uses them. A pitch adjusted on the map still wins.

## On the phones

- **TRK-14** **A match's track on Android and iPhone**, as on the web: the route in speed bands with the pitch on a map; the replay (TRK-10) with play, pause and stop, 10× to 120×, goals and cards on the scrubber, the clock, score, heart rate and speed over the map, and a banner on each goal and card; adjusting the pitch by dragging handles, saved to the server; the heatmap on the grass for the match or each period, saying which way a team attacked; the heart-rate chart, read under a finger, and time in each zone.
  - The server sends the heatmap's grid with the track, and each phone draws the bands as the website does, checked against a shared case ([`web/test/contours-case.json`](../../web/test/contours-case.json)).
  - Not on the phones: the heart-rate strip, full screen, and a cell's time on hover.
  - A track the phone couldn't fetch (no signal, or the server out of reach) is asked for again after the next sync that reaches the server, pull to refresh included, keeping what's shown meanwhile. The server's answer that there's none is final.

## Status

Everything above is built: the format, API and figures, the match page, replay and heatmaps, RefSix import, activity files, recording and pitch corners on the Garmin watch, and tracks on both phones.

Not built yet:

- Strava, Apple Health and Health Connect as sources (TRK-12).
- The heart-rate strip and full screen on the phones (TRK-14).
- A track asked for again after a sync hasn't been seen without signal on a real phone.
- The Garmin watch's storage and upload over a whole match, on a real watch (R-6).
