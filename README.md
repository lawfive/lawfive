# LawFive

<img src="web/public/icon.svg" alt="The LawFive L5 mark" height="64">

A product for soccer referees, named after Law 5 ("The Referee") of the Laws of the Game ([lawfive.app](https://lawfive.app)): watch apps that run the match clocks, score, cards and activity recording; phone apps and a website for setting up matches, syncing them to the watch and reviewing them afterward. Open source and self-hostable: the apps can connect to your own server (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

| Folder | What it is | Where it stands |
|---|---|---|
| [watch-garmin/](watch-garmin/) | Garmin Connect IQ watch app (Monkey C) | In use on a real watch, installed over USB; not in the Connect IQ Store yet |
| [mobile/android/](mobile/android/) | Android app (Kotlin, Compose) | In use on a real phone, installed over USB; not on Google Play yet |
| [mobile/android/wear/](mobile/android/wear/) | Wear OS watch app | Built; run on an emulator and a Galaxy Watch4 |
| [mobile/ios/](mobile/ios/) | iPhone app (Swift, SwiftUI) | Built; run on simulators and once on an iPad, not yet on an iPhone |
| [mobile/ios/LawFiveWatch/](mobile/ios/LawFiveWatch/) | Apple Watch app | Built; run only on a simulator so far |
| [server/](server/) | API, accounts, sync and background jobs; serves the web UI; one Docker image for self-hosting and the hosted service | Live; see the [API reference](schema/generated/API.md) |
| [web/](web/) | The web UI (React): matches, match reports (with movement and heart rate), templates, venues, referees, competitions, stats, a Laws of the Game quiz, settings | Live, served by the server |
| [schema/](schema/) | Shared data model and API description: Zod definitions, generated JSON Schema, OpenAPI, Kotlin and Swift, examples, misconduct codes | In use by everything above |
| [relay/](relay/) | Push relay, at push.lawfive.app, which notifications go through (Cloudflare Workers) | Live; tried on an emulator so far |
| [site/](site/) | Marketing website, at lawfive.app: static pages, with the quiz, the match screen setup, Try a match and the replay built in from `web/` | Live |
| [docs-site/](docs-site/) | Docs for self-hosters and developers, at [lawfive.dev](https://lawfive.dev) | Live |
| [docs/](docs/) | [Requirements](docs/requirements/), [architecture](docs/ARCHITECTURE.md), the [match data fields](docs/MATCH_CONFIG.md), the [quiz format](docs/QUIZ.md), [plans](docs/plans/) | The requirements are the source of truth for behavior |
| [DESIGN.md](DESIGN.md) | How LawFive looks, on every device | |
| `compose.yaml`, `.env.example` | Run your own server with Docker: `cp .env.example .env`, set `AUTH_SECRET`, `docker compose up -d`, then open it; a wizard walks you through the rest, with a code from `docker compose logs server` | See the [server README](server/README.md) |

To try the web UI with sample data and no database: `pnpm install`, then `pnpm demo` in `server/` and `pnpm dev` in `web/`, and open http://localhost:5173 (sign in as `demo@lawfive.dev` / `lawfive-demo`).

Open source under the Apache License 2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)). To help, see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately to security@lawfive.app, as [SECURITY.md](SECURITY.md) describes.
