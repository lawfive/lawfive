# Laws of the Game quiz data

The question bank for the referee quiz, based on the IFAB Laws of the Game. The questions live in data, not app code, so they can be added, fixed or retired without a code change. What the apps do with them is in [quiz](requirements/quiz.md).

## Files

One file per language in [schema/quiz/](../schema/quiz/): `questions-<language>.json` (such as `questions-en.json`, `questions-es.json`). The server sends them to the apps (`GET /v1/quiz`). After changing one, run `pnpm generate` in `schema/`, which also updates the copy bundled in the iPhone app; the Android app bundles the folder as it is. `pnpm test` there checks each file against the rules below.

A question keeps the same `id` in every language, so a translation always links back to the original.

## Top-level fields

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | number | Format version. Bump it only for a structural change that breaks the apps. |
| `language` | string | Language code: `en`, `es`, `fr` and so on. |
| `edition` | string | The Laws edition the questions are based on, such as `2026/27`. |
| `effectiveDate` | string | When that edition took effect (`YYYY-MM-DD`). |
| `source` | object | `title` and `url` of the official Laws document used. |
| `laws` | array | One entry per Law. |
| `protocols` | array | Protocols and guidelines from the Laws' "Notes and modifications" section. |
| `questions` | array | The questions. |

### `laws[]`

| Field | Type | Meaning |
|---|---|---|
| `law` | number | Law number, 1–17. |
| `title` | string | The Law's title in this file's language. |
| `url` | string | That Law on the IFAB website. |

Questions point to a Law by number only, so when IFAB changes its URLs they're fixed here once.

### `protocols[]`

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable identifier, such as `time-limited-substitution`. |
| `title` | string | The protocol's title in this file's language. |
| `relatedLaws` | number[] | The Laws it belongs to. |
| `url` | string or null | Link to the protocol. If `null`, link to the first related Law. |

## Questions

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable ID, such as `L12-004` (Law 12, question 4). Never reuse or renumber one. |
| `status` | string | `active`, `draft` or `retired`. Apps show only `active` questions. |
| `type` | string | `single`, `multiple` or `true_false` (below). |
| `difficulty` | string | `easy`, `medium` or `hard`. |
| `refs` | array | What the question is based on: each item is `{ "law": 12, "section": "4" }` or `{ "protocol": "countdown" }`. `section` is `null` for a Law's introductory text. The first item is the main reference. |
| `tags` | string[] | Topics for filtering, such as `offside`, `sanctions`, `scenario`, `new-2026-27`. |
| `question` | string | The question text. |
| `options` | array | The answer choices. |
| `editionAdded` | string | The edition the question was written for. |
| `lastReviewed` | string | The edition it was last checked against. |

### `options[]`

| Field | Type | Meaning |
|---|---|---|
| `id` | string | `a`, `b`, `c`, `d`; unique within the question. |
| `text` | string | The answer text. |
| `correct` | boolean | Whether this option is a correct answer. |
| `explanation` | string | Why it's right or wrong, shown after answering. |

## Question types

- **`single`**: exactly one correct option. Radio buttons.
- **`multiple`**: two or more correct options ("select all that apply"). Checkboxes. The answer is correct only if every correct option and no wrong one is picked.
- **`true_false`**: always two options, `True` then `False`, one correct. Never shuffled.

Options for `single` and `multiple` are stored in random order, so the right answer isn't always `a`. Apps may shuffle them again.

## Showing the reference

The link under each answer comes from the question's first `refs` item:

- **A Law:** show "Law 12.4 – Fouls and Misconduct" and link to that Law's `url`. IFAB's pages have no reliable section anchors, so the link goes to the Law and the text gives the section.
- **A protocol:** show its `title` and link to its `url`, or to its first related Law if `url` is `null`.

Results aren't saved yet. Kept by `id` and by Law, they could show a referee their weakest Laws over time; a "What's new" quiz can filter on the `new-2026-27` tag.

## A new edition

When IFAB publishes a new edition:

1. Update `edition`, `effectiveDate`, `source` and any changed `laws` or `protocols` URLs.
2. Review every question whose `lastReviewed` is older than the new edition.
3. For each, set `lastReviewed` to the new edition, edit it, or set `status` to `retired`.
4. Add questions for changed Laws, with `editionAdded` set to the new edition and a tag such as `new-2027-28`.

## A new language

1. Copy `questions-en.json` to `questions-<code>.json` and set `language`.
2. Translate `laws[].title`, `protocols[].title`, `question`, each option's `text` and `explanation`, and use language-specific URLs where they exist.
3. Keep every `id`, `refs`, `correct`, `difficulty` and `tags` value unchanged.

Where translations differ, the English Laws are authoritative.

## Content rules

- Write questions and explanations in your own words. Don't paste text from the Laws book; IFAB doesn't allow reproduction without permission. Cite the Law and section, and link to it.
- Don't use IFAB or FIFA logos, and don't present the quiz as official or endorsed.
- Check every new or changed answer against the current Laws before setting it to `active`.
