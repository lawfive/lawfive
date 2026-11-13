# Weather (WX)

Forecasts for matches, and the weather a match was played in. The server works them out; the website and both phones show them in full, and the watch's start menu in a word.

## Forecasts on the server

- **WX-1** A match whose pitch or venue is placed on the map gets the weather for its kickoff: a forecast from about 16 days before, updated as kickoff gets closer, and once it's over the weather it was played in. The data is Open-Meteo's (free without a key for non-commercial use; the hosted service needs a paid plan or its own copy). A server setting (`WEATHER_URL`) points elsewhere or switches weather off.
- **WX-2** Only the server fetches forecasts, within a daily limit (`WEATHER_DAILY_LIMIT`, default 5,000 of the free 10,000 calls).
  - Forecasts are kept by place, in squares about 5 km across shared by every match there.
  - They're fetched only for places with a scheduled match in the next 16 days: every 2 hours within 2 days of the next match, every 6 hours within a week, daily beyond. Up to 50 places go in one request.
  - Saving a match or a venue fetches its forecast within about a minute.
- **WX-6** Once a match is over, its weather is kept with it and later forecasts don't change it. A match moved to another kickoff gets a forecast again.
- **WX-10** A played or abandoned match that has a place on the map but no kept weather (imported, or entered afterward) gets the weather it was played in from Open-Meteo's historical data (`WEATHER_HISTORY_URL`, `off` to switch it off), worked out and kept as in WX-3 and WX-6. The server fetches it a few at a time alongside the forecasts, within the same daily limit, one call per match. A match it couldn't get weather for is tried again a day later.

## A match's weather

- **WX-3** A match's weather is:
  - the most significant condition while it's played (sunny or clear, partly cloudy, cloudy, fog, drizzle, rain, snow, thunderstorms; a sun or moon by daylight at kickoff);
  - the temperature and feels-like temperature at kickoff;
  - the highest chance of rain, the rain from an hour before kickoff to the end, and the rain in the 24 hours before that;
  - the strongest gust, and the conditions hour by hour.
- **WX-4** Risk badges, amber when possible and red when likely, each with a sentence explaining it. "During" means from an hour before kickoff to the end of the match (from its format, without extra time). They're rough rules, not predictions:

  | Badge | Possible | Likely |
  |---|---|---|
  | Wet field | 12 mm (½ in) of rain in the 24 hours before | 25 mm (1 in) |
  | Rain | 5 mm during, or a 70% chance in any hour | 10 mm during |
  | Storms | a thunderstorm forecast during | with a 50% chance of rain or more |
  | Snow | any snow before or during | 2 cm |
  | Heat | feels like 32 °C (90 °F) while playing | 38 °C (100 °F) |

## Where it shows

- **WX-5** On the website:
  - The match list shows an icon and temperature under each kickoff time, and the badges for scheduled matches (tap for the reason).
  - The match page shows the weather under the scoreboard on a slab (WEB-28), labeled Forecast or Weather: the icon, temperature and condition at kickoff, the feels-like temperature, the chance of rain (a forecast) or the rain that fell (a played match), the gusts, and the risk badges. **Details** opens the rest: rain before and during, hour by hour, the risks spelled out, when it was updated, and the credit.
  - An upcoming match without a forecast says why in the same place (no place on the map, or more than about two weeks away).
  - Temperatures follow Settings; rain is in inches and wind in mph for accounts set to miles. Icons are Phosphor's weather icons, with a clear day's sun and a storm in amber.
- **WX-9** The phones show the same weather as the website, from `GET /v1/weather`: the icon and temperature under each kickoff in the match lists and on the next match, the risk badges for scheduled matches (tap for the reason), and the match page's strip with Details. What was fetched last is kept on the phone, so a forecast is there at a ground without signal.
- **WX-11** The phones notify of a new weather risk before a match: PUSH-5.
- **WX-7** On the watch, a downloaded match's start-menu line includes the forecast, "Thu 9:00 AM · 54° rain · Twin Creeks", in the account's temperature unit.

## Credits and licenses

- **WX-8** The weather credits Open-Meteo (CC BY 4.0) with its details, in the match page's weather Details. Settings has a **Data and licenses** page (`/settings/licenses`) listing the data services the server uses (weather, maps, satellite imagery, address search) with their licenses, and the open-source software LawFive is built with.
- **WX-12 (Draft)** Data and licenses carries the notices the libraries' licenses ask for, beyond WX-8's list of names and license links (MIT, BSD and Apache 2.0 want the copyright notice and license text with each copy, and Apache 2.0 a library's own `NOTICE`).
  - On both phones, a **Full license texts** row at the end opens each bundled library's copyright line and full license. On Android it's built from what Gradle bundles (for example with AboutLibraries), so it stays current; on the iPhone it's a short list kept by hand: Garmin's SDK, Phosphor and the fonts.
  - The watches say where to find them: "Licenses: see Data and licenses on your phone or the website".
  - Needed before the first public store release.

## Status

Forecasts, risks and past weather on the server, the website, both phones, the watch's start-menu line, Data and licenses, and risk notifications on Android are built.

Not built yet:
- Risk notifications on the iPhone (WX-11, PUSH-5).
- The full license texts on the phones and the watches' pointer to them (WX-12).
