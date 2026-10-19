# Tracky evaluation

How often the AI reads a note correctly, measured against notes whose right answer was worked out by
hand first.

**Latest result: 34/34 on gemini-3.5-flash-lite, one run on 16 Oct 2026, typo notes included.**
gemini-3.6-flash is nearly through: all 25 notes graded so far were right, and 9 typo notes are still
to run. Read the [Limitations](#limitations) before quoting either.

## Why

Tracky shows every draft for you to check before anything is saved, so a misread date can't land
in your calendar silently. That doesn't tell you how often you'll have to fix one. A model that gets
Friday wrong one time in five would still feel broken. This set answers how often it's right, and
which kinds of note it gets wrong.

## The gold set

[`gold_set.json`](gold_set.json) has 34 notes. Every case is read at the same moment: Thursday
15 October 2026, 09:00, Jakarta time, with the projects ATLAS, FinChat and Personal. That way
"tomorrow" and "next Friday" each have one right answer. The `note` on each case says how that answer
was reached, so you can check it instead of trusting it.

| Kind | What it tests | Cases |
|---|---|---:|
| `task` | Deadlines, priority words, projects, a task with no date | 8 |
| `event` | Times, ranges, all-day, reminders, "next Friday", Indonesian | 8 |
| `multi` | Several items in one note, each keeping its own details | 3 |
| `either` | Notes that can fairly be a task or an event; the kind isn't graded | 2 |
| `refusal` | **Notes with nothing to add. It must return no items, not invent one.** | 3 |
| `typo` | Notes typed fast: misspellings, shorthand (tmrw, nxt, bsk), words run together, times like 1500 or 5.30pm. Titles must come back spelled properly. | 10 |

## The grader

[`grade.ts`](grade.ts) pairs each expected item with a returned one by words in its title, then
compares only the fields the case names. A case passes only when the number of items is exactly right
and every named field matches. `null` in the gold set means the field must come back empty. A list
means any of its values is fine, for example `"priority": ["high", "urgent"]` for *penting*.

Titles are checked loosely on purpose (`"title_has": ["dennis"]`), because "Sync with Dennis" and
"Dennis sync" are both fine. Some cases also check what a title leaves out, such as the day.

## Results

| Date | Model | Passed | Notes |
|---|---|---:|---|
| 18 Oct 2026 | gemini-3.6-flash | 25/25 so far | `--remaining`, adding 14/14 to the 11 from 16 Oct. Every kind passed, including the 3 refusals and the first typo note ("Sync with Mr. Dennis", 15:00 to 16:00, then "Work on ATLAS improvements"). 7 requests got a 503 and the allowance ran out with 9 typo notes left. |
| 16 Oct 2026 | gemini-3.6-flash | 11/11 so far | Part 1, after all the fixes. Every note it answered was right. 8 of the day's 20 requests got a 503 from Google, so one note stayed busy after its retries and the allowance ran out with 5 notes of part 1 left. The other 23 notes are still to run. |
| 16 Oct 2026 | gemini-3.5-flash-lite | 34/34 | One run, after the typo round below. Every kind passed, all 10 typo notes included. |
| 16 Oct 2026 | gemini-3.5-flash-lite | 7/10 typo notes | The typo notes alone, before the typo round: dates and times right, misspellings copied into titles. |
| 15 Oct 2026 | gemini-3.5-flash-lite | 24/24 | One run, after the fixes below. Every kind passed, including all 3 refusals. |
| 15 Oct 2026 | gemini-3.6-flash | 5/11 | Before the fixes. 10 more notes got a 503 from Google and were not graded, then the free daily limit of 20 requests stopped the run. |

Details of the latest run per model are in `results-<model>.json`.

## What the first run found

The first run scored badly, and the reasons were in the code, not the model:

1. **Timed events came back as all day, and reminders and projects went missing.** Gemini writes
   JSON fields in alphabetical order unless told otherwise, so it decided `all_day` before it had
   written the title or the time, then left the time empty to match. It also left out optional
   fields even when the note gave them. Every field is now required (empty allowed), and the order is
   set so the time comes before `all_day`. With the fix, the flight note that had come back as all day
   came back right: 06:40, reminder 60 minutes.
2. **A busy model (503) stopped Quick add** instead of trying the next model. Google returned 503 for
   10 of the 21 requests that evening. It now moves to the next model, and the eval retries a busy
   model twice before counting the case.
3. **Any 429 was reported as the day's allowance being used up.** Google uses 429 for its per-minute
   limit too. The quota id tells them apart, and a per-minute limit now says to try again in a
   minute.

## The typo round

Notes are often typed fast, for example "Sync me with mr. dennis at 1500 till 1600, then work on ATLAS
imrpovementsd again". Ten notes like that were added. The first six already passed, so four harder
ones followed, and the grader now also checks that a misspelling doesn't end up in a title.

Before the change, 7 of the 10 passed. In every failure the date and time were right but the title was
the typo copied over: "quarterly reveiw", "kirim lapran ke pak budi", "Rapat sm tim". The prompt had
asked for titles that "keep the note's language", which the model took as "keep the words as typed".
It now says notes are typed fast, lists the kinds of slip to expect, and asks for titles written
properly in the same language. Its examples are deliberately different from the test notes, so the
score isn't the prompt grading itself. The function also capitalises the first letter of every
title. After the change all 34 passed, and the titles read "Quarterly review", "Kirim laporan ke Pak
Budi", "Rapat sama tim" and "Call Mom" (from "callmom").

## Running it

Put your key in `supabase/functions/.env`, which Git ignores:

```
GEMINI_API_KEY=your-key-here
```

Then:

```bash
npm run eval:quick-add
```

Options: `--model` (default `gemini-3.6-flash`), `--runs 3` to repeat the set and find flaky cases,
`--pause 6` seconds between requests to stay inside the free tier's per-minute limit, `--only id1,id2`
to rerun some cases, and `--part 1/2` to run the first half (then `--part 2/2` on another day) for a
model whose free allowance is smaller than the set. `--remaining` runs only the notes that model has no
graded answer for yet, which is the easiest way to finish a set over several days. Parts, `--only` and
`--remaining` merge into the model's results file, so they add up to one score. One run is 34 requests
out of the model's free daily allowance. Each run writes `results-<model>.json` with every failure and
what the model returned.

When Google answers 503 (busy), the note is retried twice, 20 seconds apart. If it is still busy, the
note is skipped and not graded, since that says nothing about the answer. `--remaining` picks it up
next time.

It calls the same `proposeItems()` the server function uses, against one model with no fallback, so
the score belongs to the model you named.

The grader has its own tests, which need no key:

```bash
npm run test:functions
```

## Limitations

- The notes were written for this set, not taken from your own use. Replace or add cases with notes
  you actually type, especially the ones it gets wrong.
- 34 cases can show a model is unreliable. They can't prove it's reliable.
- Everything is read on one Thursday morning. Notes written late at night, or across a month or year
  end, aren't covered.
- Free-tier models change without notice. A score is for the model on the day it ran.
- The 34/34 is one run. Run `--runs 3` to see whether any case passes only sometimes.
- gemini-3.6-flash allows 20 free requests a day, fewer than the 34 notes, so measuring it takes at
  least two days. Requests answered with 503 (Google busy) count against the allowance too: about a
  third of them on both 16 and 18 Oct. Run `--remaining` each day until nothing is left. The allowance resets at midnight
  Pacific time, which is 14:00 in Jakarta.
