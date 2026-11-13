# Laws of the Game quiz (QUIZ)

A quiz on the Laws of the Game, on the website, both phone apps and lawfive.app (SITE-9). The format of its questions is in [QUIZ.md](../QUIZ.md).

## The questions

- **QUIZ-1** **The questions are data**, in `schema/quiz/questions-<language>.json` ([schema/quiz/](../../schema/quiz/)), checked by the schema's tests and served to signed-in apps by `GET /v1/quiz`, so a wrong answer is fixed with a new server image rather than a new app.
  - Only `active` questions go out.
  - The phone apps keep the last copy and have one built in, so the quiz works at a ground without signal, and with an older server that doesn't serve them.
  - English only for now.

## Taking the quiz

- **QUIZ-2** **Choosing**: Easy, Medium, Hard or Mixed (all three together), and 5, 10, 15 or 20 questions. A count higher than the questions at that level can't be chosen. An attempt's questions are random, and so is the order of their options, except True then False.
- **QUIZ-3** **Answering**: one question at a time.
  - Radio buttons, or checkboxes and "Select all that apply" for a question with several right answers, which counts only with every right option and no others.
  - **Check answer** shows what was right, why (for the right options and the one picked), Correct or Not quite, and the Law and section as a link to it, then **Next question**.
- **QUIZ-4** **Throughout**: a running total ("Question 3 of 10", "2 correct", and a bar with a green or red piece per question). Each step slides in as the last leaves, respecting reduced motion. **Start over** is there at every step, asking first once something's been answered. An attempt survives going to another tab, and goes when the app closes.
- **QUIZ-5** **The result**:
  - The score and a verdict by share right: Flawless at 100%, Great from 80%, Solid from 60%, Needs improvement from 40%, Rough day from 20%, Sent off below. A line chosen at random teases a little at the low end, and a yellow or red card shows for the lowest three.
  - How each Law went, weakest first, linking to it; and what was missed, with the right answers.
  - **Go again** picks new questions with the same choices; **Change the settings** goes back to the start.
- **QUIZ-6** **Nothing's saved**: no scores on the account or the phone.

## Its place

- **QUIZ-7** Under Templates: in the website's sidebar, and in More on the phones and at phone width on the website, never on a bottom bar. The website at phone width keeps its five tabs (Matches, Venues, Referees, Stats, More). The quiz says its questions are written for LawFive from the Laws, not official and not endorsed by The IFAB. No IFAB or FIFA logos.

## Status

QUIZ-1 to QUIZ-7 are built on the website, Android and iPhone.

Not built yet:
- Saved scores, and a history of weakest Laws over time (QUIZ-6).
- Questions in other languages.
