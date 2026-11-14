# Recording (ACT)

The workout a watch records during a match, and keeping the match app open until the match is over. This covers every watch: Garmin, Wear OS and Apple Watch.

## The workout

- **ACT-1** The watch records a soccer workout with GPS while the match clock runs:
  - Garmin: a soccer activity, saved to Garmin Connect like any other workout.
  - Apple Watch: an Apple Health soccer workout with its route (WCH-7).
  - Wear OS: a Health Connect soccer exercise, saved by the Android phone app (WCH-7).
- **ACT-2** Recording pauses during half-time and resumes when the next period starts. It also pauses while a match is suspended (TMR-13).
- **ACT-4** The workout is saved automatically at full time.
- **ACT-5** **The watch finds its position before kickoff,** so the track has it from the first second of play.
  - GPS starts as soon as the match is set up, at "Who kicks off?", and heart rate too where the watch warms it up. Canceling the match before kickoff turns them off again.
  - Until the first kickoff, the kickoff screens say **GPS searching** in gray, then **GPS ready** in green once a usable position arrives, low on the screen under the Start button. Later kickoffs don't show it, as GPS is already running.
  - It shows only when the match will record a position: on Wear OS and Apple Watch, with Record track on and location allowed; on Garmin, always, as its activity keeps GPS. With Record track off, the workout still uses GPS for its distance where location is allowed, so it warms up all the same, without the line.
  - Garmin: the watch's location events, from the match's creation. Wear OS: Health Services' warm-up for the soccer exercise, with heart rate and location as each is allowed and as the watch's soccer exercise measures them, run in the match's foreground service from setup so it carries on with the screen off; its location availability says searching or ready, and a warm-up the watch ends early is started again. Where the watch's soccer exercise has no location, its GPS starts straight at setup, ready once a fresh position is within 25 m, as on Apple Watch, and stays on through the breaks. Apple Watch: the workout session prepared at setup (when Health is allowed), and Core Location started then with Record track on, ready once a fresh position is within 25 m, as Garmin's usable; after the app starts again mid-setup, the warm-up starts again.

## Staying in the match

- **ACT-3** The app can't be left by accident mid-match. Back and sideways swipes open the game menu, and the only ways out are Cancel match (before kickoff) or ending the match, both confirmed. If the watch closes the app anyway, the match carries on when it reopens (TMR-8, R-5).

## Status

Everything above is built. ACT-5's warm-up on Wear OS and Apple Watch is unproven on real watches (R-13). WCH-7 covers the Wear OS and Apple Watch workouts.
