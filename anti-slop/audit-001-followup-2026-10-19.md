# antislop audit 001, follow-up (19 Oct 2026)

Approved: 1 to 9. Not touched: 10 to 16. Shipped as v1.6, together with the rename of Quick add to
Tracky that the owner asked for.

| # | Result | Evidence |
|---|---|---|
| 1 | Fixed | At 390 x 844 a toast now spans y 703 to 776; the tab bar starts at 788. Sonner gets a bottom offset of the tab bar plus the safe area below 768 px (`--toast-bottom` in `index.css`). |
| 2 | Fixed | Three tasks at 17:00 show one mark labelled 3; clicking it lists all three, Escape closes the list and returns focus to the mark, and each entry opens its task. Marks are 44 px on touch. |
| 3 | Fixed | Settings no longer shows the time zone row or the Telegram line; `useTimeZoneSync` and the stale comment are gone. |
| 4 | Fixed | No tappable control under 44 px on Home, Tasks or Settings at 390 px (the two 16 px checkboxes sit inside 44 px labels). |
| 5 | Fixed | An event draft read as "Room 4" shows a Where field holding "Room 4", editable before Add. |
| 6 | Fixed | Setting a draft to end at 09:00 after a 10:00 start shows "The end is before the start." and disables Add. The AI's own answers were already filtered for this; the gap was edits on the card. |
| 7 | Fixed | 09:00 to 10:00, start moved to 16:00: the end becomes 17:00. |
| 8 | Fixed | Deadline 22 Oct 17:00 with "1 hour before", moved to 24 Oct 09:00: the reminder becomes 24 Oct 08:00 and the preset stays selected. |
| 9 | Fixed | New note, then leave without typing: the note count goes back to what it was. A note with a title is kept. |

## Correction to the audit

The audit said there was no horizontal overflow at 390 px. That was wrong: the check compared the
page width with the viewport after the phone had already zoomed out to fit. The real layout width was
402 px on Home and Review, caused by the hidden tooltip over the last bar of "Tasks finished per day".
It is also why the toast in finding 1 ran off the bottom. Fixed in v1.6; every page now measures
exactly 360, 390 and 700 px wide at those widths.

## Checks

Typecheck, lint, 23 unit tests, build, and the 8 browser tests against a local Supabase stack all
pass. The Mac app's menu label changed to "Ask Tracky…" but was not built here (no macOS in this
environment). Tracky's new instructions were not run against Gemini (no API key here); the unit tests
check the prompt text, and `npm run eval:quick-add` will check it against real answers.
