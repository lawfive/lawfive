# Plan: mileage from home to the pitch

**Status:** Proposed, not built. The model: a home address for the referee, a mileage rate on the competition or template that a match can override, and a match's mileage as the distance from home to its venue times that rate. Its requirements are drafted under [Proposed requirements](#proposed-requirements), to move into [docs/requirements/](../requirements/) when it's built.

## In short

The referee sets a **home address** (private, in Settings). Every match then carries the **miles driven** to it, worked out from home to its venue by a routing service, with a day's matches treated as **one trip** (home → each venue in kickoff order → home), so three matches at one venue count the drive once. A **rate** on the competition or template (or the match) turns those miles into **reimbursement**, paid with the fee. **Stats** show the miles driven in the year beside what was reimbursed, and the **export** has both, for taxes. The number is always the referee's to change.

Not in this plan: expenses (parking, tolls, meals), distance bands and flat amounts, GPS logging of drives.

## What's already there

- **Fees:** a match has `fee` (`amount`, `currency`, `paid`, `schema/src/records.ts`), filled from its template or its competition's template (`MatchTemplate.defaults.fee`; a competition's `templateId`). Marked paid on the website, the phones and the watch (SYNC-11). Stats count earned, paid and owed (STAT-6); the export has fee and paid (STAT-12).
- **Venues:** `address` and `position` (the parking position, used for Directions, WEB-14); a pitch has its own position inside the venue.
- **Settings:** `currency` and `distanceUnit` (miles or km), so the rate and the miles follow them.
- **Address search:** `GET /v1/geocode` finds an address's position on the server, counted against the plan's address searches a day (PLAN-11). A home address uses the same.
- **Outside services:** the server already calls Open-Meteo for weather (WX) and a geocoder, with credits on Data and licenses; self-hosters run without any key they don't set.

## Proposed behavior

### Home address

**Settings → You → Home address** (website and both phones): an address found with the address search, kept as its text and position, shown only to its owner (never on a shared match, never to an API key, never in an export but the account's own download). Clearing it clears nothing already worked out. Changing it works the miles out again for matches from today on; past matches keep theirs.

**Nothing is worked out without it**, as there's no use storing data that isn't used. No address, no miles, no routing requests. Anyone who touches mileage without one (a rate on a template, competition or match; a match's miles; Stats' Fees and mileage) is asked for it there: "Set your home address to work out mileage", with the field right there, and the page carries on once it's set. Once it's set, the current year's matches are worked out too, so the year's total is right from the start; earlier years are left as they are.

### The rate

A **mileage rate** beside the fee, in the same places: a template's defaults (and so a competition's, through its template) and the match form. It's an amount per mile or per km (the account's distance unit) in the fee's currency, with **round trip** (the default) or **one way**. A match made from a template or competition takes its rate as it takes the fee; changing it on the match changes only that match. No rate means the league doesn't pay mileage; the miles still count.

### A match's miles: a day's trip

For each day, the matches the referee is on (not canceled, with a venue that has a position), in kickoff order, make **one trip**: home → the first venue → each next different venue → home.

- **Each leg belongs to the first match at the venue it drives to**, and the drive home belongs to the first match at the day's last venue.
  - Three matches at one venue, 10 miles from home: the first match has **20 mi**, the other two "With the 10:00 match's trip" and 0.
  - Venue A then venue B: A's first match has home → A; B's first match has A → B and B → home.
- With a one-way rate, a match is paid for the legs out only (its share of home → venue); the miles shown and counted stay the miles driven.
- Adding, moving, canceling or changing the venue of a match works its day out again. Matches whose miles were changed by hand keep them, and the day's other legs are worked out around them as if driven.
- A match more than 300 miles (500 km) from home is left blank, as a likely wrong address, for the referee to fill in.

### How a distance is worked out

- **Driving distance** from a routing service: [openrouteservice](https://openrouteservice.org) (open source, OpenStreetMap; free key: 2,000 routes and 500 matrices a day, 40 a minute; a matrix covers up to 3,500 pairs). A whole day is one matrix request.
- **Cached per pair of positions** on the server, so a home-to-venue distance is asked for once, until either moves.
- **Without the service** (no key, over the day's limit, no answer): straight-line distance × 1.3, shown as "about 13 mi", and worked out properly later when the service answers.
- **Hosted service:** LawFive's key. **Self-hosted:** `ROUTING_API_KEY` in the server's settings for driving distance; without it, straight-line for everyone.
- **Typed in:** a match's miles can always be changed, on the website and the phones; "Work it out again" puts it back to automatic.
- Credits on Data and licenses: openrouteservice and OpenStreetMap.

### Reimbursement

A match with a rate and miles has **mileage**: miles × rate (the share out with a one-way rate). It's paid with the fee, so it shares the fee's **paid / owed** and adds to the match's total ("$40 + $8.50 mileage"). The watch's paid toggle covers both. For leagues that pay mileage on its own, a competition's **Mileage paid separately**, giving its matches' mileage its own paid / owed, is later, if a referee needs it.

### Where it shows

- **A match's page** (website and phones): beside the fee, "20 mi · $8.50 mileage" (or "20 mi" with no rate, or "With the 10:00 match's trip"), with Change.
- **The match form:** the rate, under the fee.
- **Stats (STAT-6):** Fees becomes **Fees and mileage**: miles driven in the period (all of them, rate or not), mileage reimbursed, paid and owed including it. The export (STAT-12) adds miles and mileage columns.
- **Not on the watch.**

### Privacy

A home address is new personal data: `site/public/privacy.html`, both `PrivacyInfo.xcprivacy` files and the stores' privacy answers change (CONTRIBUTING.md's keep-in-step table), and the privacy page says the home address and venue positions go to the routing service to work out distances.

## Proposed requirements

Drafts, as **MILE-n**:

- **MILE-1** Home address in Settings → You, private, found with the address search; setting it first works out the current year's matches, changing it works out future matches again. Without it nothing is worked out or stored, and touching anything about mileage asks for it.
- **MILE-2** A mileage rate (per mile or km, round trip or one way) on templates (and competitions through them) and matches, filled as the fee is.
- **MILE-3** A day's matches are one trip; each leg belongs to the first match at the venue it drives to, the drive home to the first match at the day's last venue.
- **MILE-4** Driving distance from openrouteservice, cached per pair, a day in one request; straight-line × 1.3 as "about" without it; self-hosters set `ROUTING_API_KEY`.
- **MILE-5** A match's miles can be changed by hand, and put back to automatic; hand-set miles are kept when the day is worked out again.
- **MILE-6** Mileage = miles × rate, paid with the fee (one paid / owed), on the match's page and form.
- **MILE-7** Stats' Fees and mileage, and the export's columns.
- **MILE-8** Privacy: the privacy page, the apps' privacy files and stores' answers; credits on Data and licenses.

## The work, in order

1. **Schema and server:** the home address on settings; the rate on `Fee` (or beside it) for templates and matches; miles, mileage and "set by hand" on a match; the routing client with its cache table and the straight-line fallback; working out a day's trip whenever a match or the address changes; a migration (`pnpm db:generate`); endpoints in `schema/src/endpoints.ts`; tests for the trip rule (one venue, two venues, canceled, hand-set, one way).
2. **Website:** Settings' home address, the match form's rate, the match page's line with Change, Stats' Fees and mileage, the export.
3. **Android and iPhone:** the same, offline as everything else; the phones' Stats ports (`StatsMath.kt`, `StatsMath.swift`) and charts; the fixtures (`pnpm fixtures`).
4. **Privacy and docs:** privacy page, `PrivacyInfo.xcprivacy`, Data and licenses, lawfive.app's `schedule.html`, lawfive.dev (the self-hosting settings page for `ROUTING_API_KEY`).

About 2 to 3 days across the parts, most of it in the server's trip rule and Stats.

## Checks

- A real season: a Saturday with three matches at one venue, and a day with two venues, against what the leagues actually paid.
- Driving distances against a map app for a few venues.
- The hosted service's use of the routing key in its first weeks.
