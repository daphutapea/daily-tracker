# antislop Delivery Gate: Daily Tracker v1 (15 Oct 2026)

Mode: during (global preference). Direction: DESIGN.md, derived from the owner's own projects
(FinChat, Topic Pulse), not stated by the owner. Dials: ENERGY 1 / RHYTHM 2 / MOTION 2.

Reading this as: a personal daily board for one person who works in ops monitoring, in a calm
instrument-panel style, dial ENERGY 1 / RHYTHM 2 / MOTION 2.

## Block 1: Hard Gate

| Rule | Result | Evidence |
|---|---|---|
| R-02 em dash | PASS | `grep -rn "—" src DESIGN.md README.md` finds none in UI text |
| R-03 mobile | PASS | At 375px: Home, Tasks board, Calendar, Notes editor measured `scrollWidth == innerWidth`; dialogs become bottom sheets; tap targets 44px on coarse pointers |
| R-17 numbers | PASS | Every count and chart is computed from the owner's own rows; nothing is invented |
| R-18 testimonials | PASS | None |
| R-23 assets | PASS with flag | No logo or avatar was made (product name as text, greeting uses the typed name). The favicon is a labelled placeholder in DESIGN.md |
| R-24 navigation | PASS | Six nav items, six real routes; unknown paths redirect Home |
| R-25 contrast | PASS | WCAG formula run on every text pair in both themes; lowest is `--accent` on `--surface-2` light at 4.66 |
| R-26 controls | PASS | Every button opens, saves, toggles, links or deletes; see click-through |
| R-27 states | PASS | Each data view has loading text, an error with Retry, and an empty state that names the next action |
| R-28 FAQ | PASS | None |
| R-32 keyboard | PASS | Skip link, visible 2px accent focus ring (checked on nav and rows), native `<dialog>` closes on Escape, Cmd/Ctrl+Enter saves dialogs; board drag has a keyboard path through the task dialog's Status field |
| R-33 patch scripts | PASS | Features live in source; no patch scripts in the repo |
| R-34 themes | PASS | Light and dark both clicked through; theme switch suppresses transitions so colors swap in one frame |
| R-35 verified | PASS | Built, run, clicked through against a local Supabase stack; console has no app errors (see below) |
| R-36 claims | PASS | None |
| R-37 direction | PASS with flag | DESIGN.md states where the direction came from and invites edits |
| R-38 real content | PASS | Link suggestions are labelled as coming from the tools the owner's projects use |

## Click-through (local stack, 15 Oct 2026)

- Sign in → Home loads; wrong password shows a plain-language error
- Add task (title, High, 1 hour before, link without https, notes with a 3x3 table, Add row) → saved; link stored as `https://…`; appears in Today and on the day ruler
- Task checkbox → done (strikethrough, count drops); untick → back
- Open task → edit loads saved values and table; status In progress → moves to "In progress and waiting"
- Add event 14:00 to 15:00 with location and 10 min reminder → in Today agenda and day ruler
- Tasks: search "VM" filters; Done chip; Board drag To do → In progress updates status; card click opens; Escape closes
- Notes: new note, title and body autosave ("Saved 09:16"), Pin → pinned marker in list
- Calendar: month grid, select a day → day panel; marks for deadlines and events
- Links: suggestion chip adds Gmail; form adds GitHub (scheme added); move up reorders sidebar
- Settings: name saved (greeting updates), project added, invalid bot token rejected with a message and no unhandled rejection, Light/Dark/System switch
- In-app reminder toast fired at the reminder time with an Open action
- Database checks (SQL): single-owner trigger blocks a second account; RLS blocks anon; Telegram columns not writable by the client; dispatcher sends task, event and digest messages once (stubbed sender); link poll finds the chat that sent the code
- Hosted project: cron job `dispatch-reminders` succeeding every minute

Console: the only remaining entries are the browser refusing Gmail's favicon (`ERR_BLOCKED_BY_RESPONSE`, Google blocks cross-site embedding); the app falls back to an initial.

## Block 2: Purpose-Gate

| Rule | Result | Reason written |
|---|---|---|
| R-01 gradients/glow | PASS | None used |
| R-04 icons | PASS | Phosphor bold at 16 to 18px, only on nav, toolbar and row actions (DESIGN.md) |
| R-06 type | PASS | IBM Plex Sans for tabular figures and an engineered voice (DESIGN.md) |
| R-07 background | PASS | None |
| R-08 arrows | PASS | None decorative |
| R-09 badges | PASS | Only real states: Overdue, Urgent, High, Done |
| R-10 glass | PASS | None |
| R-12 shadow | PASS | Only dialogs, toasts, tooltips and a dragged card |
| R-13 glow | PASS | None |
| R-14 cards | PASS | Panels sized by job: Today wide, Next 7 days narrow, stats small |
| R-19 motion | PASS | Dialog scale/fade 200ms, phone sheet 260ms, press scale, check fill; no loops; reduced motion drops movement |
| R-22 illustrations | PASS | None |

## Block 3: Liveliness

- Dials declared and held: yes (ENERGY 1 / RHYTHM 2 / MOTION 2)
- Focal point: the Today agenda on Home; the active list or board elsewhere
- Whitespace: panels grouped by job with larger gaps between groups than inside them
- One accent: primary button, "now" line, active nav icon, focus ring
- Identity motif: the 24-hour day ruler, echoed in chart ticks and calendar marks
- Design Read declared: yes (top of this file)

## Block 4: Craftsmanship and Quality Locks

All answers no: no AI-default decisions without a reason, no dead controls, no template sections, holds up across states, themes, breakpoints and keyboard, no fabricated content, no template layout, radius varies (6 / 10 / round avatar-only), CTAs name the action ("Add task", "Save task", "Link Telegram"), no buzzwords, palette is two neutrals plus one accent plus status colors, not a clone of another product, every major choice has its reason in DESIGN.md.

## Open flags for the owner

1. Direction was derived from your projects. Change DESIGN.md if it isn't you.
2. Favicon is a placeholder.
3. Telegram was verified with a stubbed sender only; the real check is your **Send a test message**.
