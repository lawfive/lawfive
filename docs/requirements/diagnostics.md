# Diagnostics (DIAG)

What each match keeps about how its recording went, for tracing problems. It's collected on every watch and kept by the server.

## How the recording went

- **DIAG-1** **Each match keeps how the recording went.**
  - What it holds: the watch's battery at each period's kickoff and end (so the last reading is full time), the app and watch software versions, how many times the app started again mid-match, and on Garmin how long the first GPS fix took and how many track samples had none.
  - It goes up with the match, is stored on the match report, and comes back in the API and exports.
  - In the apps it shows only in Stats' **Your watches** (STAT-15), as the battery a match used on each watch, beside the watch that recorded it (the match report's device). Wear OS sends its model, and the Apple Watch its hardware identifier (such as `Watch7,3`).
  - It's never on a shared match's page.
  - A reading the server can't use is dropped, never the match.

## Status

DIAG-1 is built: kept with each match, in the API and exports, and in the apps as the battery in Stats' Your watches.

Not built yet:
- Battery readings over a whole match haven't been checked on a real watch (R-13).
