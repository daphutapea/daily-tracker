# antislop Delivery Gate: intro and transitions, v1.7 (19 Oct 2026)

Mode: after (session override). Direction: DESIGN.md. Dials: ENERGY 1 / RHYTHM 2 / MOTION 2.
Skills: core, antislop-ui, antislop-human, animate (Emil Kowalski's animation rules).

Reading this as: the opening moment of a personal daily board for one person who works in ops
monitoring, in a calm instrument-panel style, dial ENERGY 1 / RHYTHM 2 / MOTION 2.

## Gate by gate (animate skill)

| Motion | How often seen | Purpose | Decision |
|---|---|---|---|
| Intro | A few times a day at most | Delight, and covering the load | Built: CSS keyframes, about 1.5s, skippable, can be turned off |
| Home rising in after the intro | Once per launch | Hand-off from the intro | Built: 350ms, 50ms apart |
| Page change | Tens of times a day | Preventing a hard cut | Built, but subtle: opacity only, 150ms, none after a key press |
| Month or week change | Tens of times a day | Spatial: which way you went | Built: 8px and opacity, 180ms, none after a key press |
| New, restored or moved row | Occasional | Spatial: where it landed | Built: 6px and opacity, 200ms |
| Chart bars growing | Every Home visit | None that serves the data | Rejected: data you read shouldn't move for style |
| Home sections on every visit | Many times a day | None | Rejected: only after the intro |
| Anything after a key press | Up to hundreds a day | None | Rejected: keyboard stays instant |

## Block 1: Hard Gate

| Rule | Result | Evidence |
|---|---|---|
| R-02 em dash | PASS | `grep "—"` over the new and changed files finds none |
| R-03 mobile | PASS | Intro at 390 px: page width 390 of 390; all pages 360, 390 and 700 px wide at those widths |
| R-17, R-18, R-36, R-38 | PASS | The intro shows only the real date, time and the name you set |
| R-23 assets | PASS | Uses the existing mark from `docs/brand`; nothing new drawn |
| R-25 contrast | PASS | Intro text is `--ink`, `--ink-2` and `--ink-3` on `--bg`, already checked in all four palettes (lowest `--ink-3` 5.19 in Sage) |
| R-26 controls | PASS | Play it now plays the intro; the switch stores `dt-intro` = off and clears it when on |
| R-32 keyboard | PASS | Any key ends the intro at once; the overlay is `aria-hidden`, so screen readers read the app beneath |
| R-34 themes | PASS | Intro checked in Sage and Navy |
| R-35 verified | PASS | Intro holds 1.32s then fades 0.25s (measured); at the hand-off the four Home sections run `rise-in` and `data-arrive` is removed afterwards; page fade measured 0 to 1 in 150ms; after Enter on a link the transition is 0s; next month starts 8px to the side; tap skips; 10 browser tests pass, 2 of them new for the intro |
| R-37 direction | PASS | DESIGN.md, Motion section updated with every value |

## Block 2 to 4

- R-19 motion: every animation above has its purpose written down in DESIGN.md; nothing loops;
  reduced motion keeps fades and drops movement, measured: the intro leaves after 0.92s.
- Liveliness: the intro is the day ruler motif in motion, not a generic splash; one accent (the now
  line) at the key moment.
- No `transition: all`, no `scale(0)`, no `ease-in`; curves are the existing `--ease-out` and the
  new `--ease-in-out` from the skill's table; transform, opacity and clip-path only.

## Open flags for the owner

1. Feel can't be fully judged from code or screenshots. Watch the intro a few times and say if it
   feels long; the hold (1.3s) is one number in `Intro.tsx`.
2. The Mac app was not built here; the intro runs inside its web view the same way.
