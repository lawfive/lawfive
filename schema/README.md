# LawFive: schema

The shared data model (matches, match templates, match records from the watch, venues, competitions, referees, user settings, misconduct codes) and the description of the server's API: every endpoint with what it takes and returns. The server, the web UI and the phone apps use it; the Garmin app is checked against its example files. [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#data-model) explains the model; [docs/MATCH_CONFIG.md](../docs/MATCH_CONFIG.md) is the readable guide to a match's fields. The generated files also feed lawfive.dev's API reference.

## Commands

Needs Node 24 or later (it runs the TypeScript directly) and pnpm. From this folder:

```sh
pnpm install     # once
pnpm test        # type check, the tests, then pnpm lint:api
pnpm lint:api    # check generated/openapi.json with Redocly (redocly.yaml; deliberate exceptions in .redocly.lint-ignore.yaml)
pnpm generate    # rewrite generated/ after changing src/ (the tests fail until you do)
```

## Layout

| Path | What it is |
|---|---|
| `src/` | The definitions, in TypeScript with [Zod](https://zod.dev): the source of truth. `endpoints.ts` is every endpoint and `api.ts` the API's own types (errors, sync pages, the watch's formats). Shared by the server and web app: `track.ts` (track format and figures), `pitch.ts` (finding and turning a pitch for heatmaps), `stats.ts` (the stats answer and which games match a filter), `names.ts` (comparing names), `shortNames.ts` (a team's short name), `importColumns.ts`, `quiz.ts`, `screen.ts` (the match screen's choices), `format.ts` (the match format), `result.ts` (correcting a result), `demoTrack.ts` (the made-up track for the demo and lawfive.app's replay) and `garminModels.ts` (Garmin's watch names). `generate.ts`, `kotlin.ts` and `swift.ts` write `generated/`. |
| `generated/json-schema/` | One JSON Schema (draft 2020-12) file per type. |
| `generated/openapi.json` | The API as OpenAPI 3.1, with the types as components, for code generation and API tools. |
| `generated/API.md` | The API reference to read. |
| `generated/agents/` | The same reference as small Markdown pages for AI agents, with `llms.txt` listing them ([agent descriptions](../docs/requirements/agent-descriptions.md)). lawfive.dev publishes them. |
| `generated/kotlin/`, `generated/swift/` | The API's types for the Android and iPhone apps. |
| `generated/fixtures/` | The demo account's and a new account's data, as the API answers the phones, for their snapshot tests. Written by `pnpm fixtures` in `server/`; `pnpm generate` leaves it alone. |
| `generated/match-cases.json`, `generated/kotlin-tests/`, `generated/swift-tests/` | The match cases as each copy's tests read them; `pnpm generate` also writes them into the iPhone's tests and the Garmin app's (`watch-garmin/source/MatchCases.mc`). |
| `guides/` | Worked examples of using the API, by hand, copied into `generated/agents/`. `server/test/guides.test.ts` runs their code, so change it with them. |
| `examples/` | Example records, named `<Type>.<description>.json`. Each must parse as its type. |
| `quiz/` | The quiz's questions, one file per language ([docs/QUIZ.md](../docs/QUIZ.md)). `pnpm generate` copies English to the iPhone app. |
| `match-cases/` | The match rules' shared cases (see below). |
| `short-names.json` | Cases for a team's short name: `src/shortNames.ts` runs them, and `pnpm generate` copies them into Android's and the iPhone's tests (`generated/kotlin-tests/`, `mobile/ios/LawFiveTests/`) for their ports in `Format.kt` and `Format.swift`. |
| `misconduct/` | Misconduct code schemes (IFAB, US Soccer, The FA) as data. To add one, add its file and import it in `src/misconduct.ts`; a test checks every file is imported. |
| `scripts/` | `generate.ts` (behind `pnpm generate`) and `garminModels.ts`, which reads the Connect IQ SDK's device files. |
| `test/` | Examples, misconduct files, ranges, the API description, tracks, pitches, the match screen, the quiz, stats filters, and that `generated/` is up to date. |

## Conventions

- Every stored record has `id` (a UUID made by the device that created it), `version`, `updatedAt` and, once deleted, `deletedAt`.
- Durations are whole seconds (`periodSec`, `lengthSec`); colors are `#RRGGBB`; times are ISO 8601 with a UTC offset.
- Format ranges match the watch's, so any match the server sends can run on it.
- Event times are `period` plus `periodSec` (seconds since that period's kickoff), so they don't depend on the clock style. `when` says whether the event was in play, before kickoff, at a break, after full time or in the shoot-out.
- `/v1` only grows: add optional fields rather than renaming or removing, and apps ignore fields they don't know ([versions](../docs/requirements/versions.md)).

## Match cases

The match rules exist in seven copies: the three watches' engines (`watch-garmin/source/Match.mc`, `mobile/android/wear/.../MatchEngine.kt`, `mobile/ios/LawFiveWatch/MatchEngine.swift`), Try a match's (`web/src/match/engine.ts`) and the clocks the website and phones draw for the match screen setup (`web/src/watchPreview.ts`, `WatchPreview.kt`, `WatchPreview.swift`). `match-cases/*.json` says once what they must all do, checked by `src/matchCases.ts`:

- **screen** cases: a moment of a 2 × 45 match (period, time into it, stoppage, the halfway break) and what the screen shows then (the clock, the second clock, added time, the ring, the pills, the break clock). Every copy runs them. The watches play the moment out as steps (`screenAsSteps` in `src/matchCasesGenerate.ts`) and check all but the pills, which belong to the pictures.
- **match** cases: a format (left out, it's 2 × 45 with nothing switched on) and a screen (left out, in both kinds, it's one clock counting up through the match, with time left for the second and break clocks), then steps. Each step is at a time from the first kickoff (`"12:34"`), with actions (`"start"`, `{ "event": "G", "team": "home", "player": 9 }`) and what's expected after them (`phase`, `score`, `clock`, `last`, `alert`…). Only what's given is checked, and `null` means "nothing there". `alert` checks what a tick at that time fires. The three watches and Try a match run them.

To add a case, add it to its area's file, run `pnpm generate`, then run every copy: `pnpm test:watches` from the repo root (the watches, Android and the iPhone, each where its tools are installed) and `pnpm test` in `web/`. A difference is a bug in one copy, or in the case.

A new action or expectation goes in `src/matchCases.ts` and each runner: `watch-garmin/source/MatchCasesTests.mc`, `mobile/android/wear/src/test/.../MatchCasesTest.kt`, `mobile/ios/LawFiveWatchEngineTests/CaseRunner.swift`, and for screen cases the pictures' runners (`web/test/matchCases.test.ts`, `MatchCasesTest.kt`, `MatchCasesTests.swift`). What's particular to one app (saving, the compass, labels) stays in its own tests.
