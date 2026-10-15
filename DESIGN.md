# Daily Tracker: design direction

**Where this came from.** You didn't write a brief, so this is pulled from your own projects, not
invented: the ink navy `#0E1E33` and teal accent from FinChat's web UI, and the green-grey surface
`#F3F6F4` from Topic Pulse's Streamlit theme. Change any line here and the app should follow it.

Dial: ENERGY 1 / RHYTHM 2 / MOTION 2

Reading this as: a personal daily board for one person who works in ops monitoring, in a calm
instrument-panel style, dial ENERGY 1 / RHYTHM 2 / MOTION 2.

## Identity

- **Job of the home screen:** answer "what do I do next, and what's left today?" in one glance.
  The agenda for today is the page. Counts and charts are supporting detail below it.
- **Identity motif: the day ruler.** A 24-hour strip with hour ticks, a teal "now" line, and marks
  for today's deadlines and events. It sits in the header and is the one thing that makes this board
  read as a time instrument rather than a generic dashboard. The same tick language appears on the
  chart axis and the calendar's busy-day marks.
- **Mood:** calm, dense, exact. Like a well-kept logbook, not a marketing page.

## Color

Two neutrals plus one accent. Status colors are signals, used only where something needs attention.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F2F5F3` | `#0B1524` | Page |
| `--surface` | `#FFFFFF` | `#111E31` | Panels, dialogs |
| `--surface-2` | `#E9EEEB` | `#17263B` | Inputs, hovered rows, chart tracks |
| `--line` | `#D5DDD8` | `#24364F` | Panel borders, dividers, ruler ticks (decorative) |
| `--line-strong` | `#76847D` | `#5C7290` | Input and checkbox borders (3:1 against surfaces) |
| `--ink` | `#0E1E33` | `#E4EBF3` | Text |
| `--ink-2` | `#3F4D5F` | `#A9B6C6` | Secondary text |
| `--ink-3` | `#5A6878` | `#8796AA` | Labels, hints (still 4.5:1 on `--bg`) |
| `--accent` | `#0F766E` | `#2DD4BF` | Primary action, "now" line, active nav, focus ring |
| `--danger` | `#B42318` | `#F97066` | Overdue, urgent |
| `--warn` | `#B54708` | `#FDB022` | High priority, waiting |
| `--ok` | `#067647` | `#47CD89` | Done |

The accent shows up in four places only: the primary button, the "now" line, the active nav item,
and the focus ring.

## Type

- **IBM Plex Sans** (variable, self-hosted). Reason: the clock, counts and times are the core content,
  and Plex has clear tabular figures and a slightly engineered voice that suits someone who reads
  alert boards all day. It also separates this tool from FinChat's Inter.
- Numbers use `font-variant-numeric: tabular-nums` so the clock and counts don't jitter.
- Scale: 12 / 13 / 14 (body) / 16 / 20 / 28, plus the clock at 56 on desktop and 40 on phone.
- No uppercase wide-tracked labels. Section labels are sentence case, 13px, `--ink-3`.

## Shape and depth

- Radius: 6px for controls, 10px for panels, round only for avatar initials.
- Panels are flat with a 1px `--line` border. Shadow is reserved for things that float above the page:
  dialogs, popovers, toasts.
- No gradients, glass, glow, grids or decorative rings.

## Layout

- Desktop: left sidebar (navigation plus quick links), content max 1200px.
- Phone: a bottom tab bar replaces the sidebar; quick links move into Settings > Links.
- Home order: header (greeting, clock, quick add, day ruler); then Today (the focal point) beside
  Next 7 days; then In progress and waiting beside the month; then Numbers (counts, tasks finished per
  day, deadlines met, open tasks by status and priority). The numbers sit last on purpose: they are
  the review, the agenda is the work.
- Icons: Phosphor at bold weight, 16 to 18px, only where a label alone is slower to scan (navigation,
  editor toolbar, row actions). Every icon-only button carries a text label for screen readers.
- Favicon: a placeholder drawn from the day ruler (ink tile, ticks, teal "now" line). Replace it
  if you have a mark you prefer.

## Motion (dial 2)

- Dialogs: 200ms scale from 0.97 plus fade, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`; exit 150ms.
- Phone dialogs slide up as a sheet: 260ms, `cubic-bezier(0.32, 0.72, 0, 1)`.
- Buttons: `scale(0.97)` on press, 120ms.
- Ticking a task done: the check fills, the row fades to its done state over 180ms.
- Nothing loops. Keyboard shortcuts open things instantly with no animation.
- `prefers-reduced-motion`: keep fades, drop movement.

## Copy

- English, plain, short. Buttons say what they do: "Add task", "Save task", "Link Telegram".
- Empty states say why it's empty and give the one action that fills it.
- No emoji in the interface.
