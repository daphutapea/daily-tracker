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
  chart axis and the calendar's busy-day marks. Marks closer together than one hit area (20px with
  a mouse, 44px with a finger) share one mark with a count above it, which opens a short list.
- **Mood:** calm, dense, exact. Like a well-kept logbook, not a marketing page.

## Logo

The mark is the identity motif reduced to what still reads at 16 px: an ink tile, a ruler with five
evenly spaced ticks, and the teal "now" line crossing it right of centre, late in the day. The
wordmark is "Daily Tracker" in IBM Plex Sans SemiBold, turned into outlines so it looks the same
where the font isn't installed. Preview every version in `docs/brand/preview.html`.

| File | Use |
|---|---|
| `docs/brand/lockup-light.svg`, `lockup-dark.svg` | Mark and wordmark together: the README, documents, slides |
| `docs/brand/mark.svg` | The mark alone |
| `public/favicon.svg` | Browser tab |
| `public/apple-touch-icon.png` | A phone's home screen, full bleed (the phone rounds the corners) |
| `macos/AppIcon.png` | The Mac app, on Apple's icon grid with its shadow and a slight top-to-bottom shift |

Rules:
- All of these come from `scripts/make-logo.swift` (`npm run logo`). Change the measurements there,
  then mirror them in `src/components/Logo.tsx`, which draws the mark inside the app.
- The mark keeps its brand colours in every palette (ink tile `#0E1E33`, ruler `#8796AA`, now
  `#2DD4BF`), like an app icon. On dark surfaces it gets a faint edge (`--logo-edge`) so the tile
  doesn't dissolve into the navy.
- Large renderings (the Mac icon, the home-screen icon) use thinner strokes than the SVG. The SVG's
  strokes are tuned for a 16 px tab and look heavy at Dock size.
- In a lockup the gap between mark and name is a quarter of the mark's height, and the name is
  centred on the mark by its capital letters. Leave at least that gap clear around the whole lockup.
- Smallest sizes: the mark at 16 px, the lockup at 20 px tall. Don't recolour, stretch, outline or
  put the mark on a busy photo.

## Color

Two neutrals plus one accent. Status colors are signals, used only where something needs attention.

There are four palettes, two for each mode, picked in Settings → Appearance and saved per device.
Sage and Navy are the originals, derived from your projects. White and Charcoal were added on
15 Oct 2026 because you asked for plain white and dark variants. The teal accent stays the same in every
palette, because the teal "now" line is the identity motif. Every text pair was checked against WCAG AA
in all four palettes.

| Token | Sage (light) | White (light) | Navy (dark) | Charcoal (dark) | Use |
|---|---|---|---|---|---|
| `--bg` | `#F2F5F3` | `#FAFAFA` | `#0B1524` | `#121212` | Page |
| `--surface` | `#FFFFFF` | `#FFFFFF` | `#111E31` | `#1A1A1A` | Panels, dialogs |
| `--surface-2` | `#E9EEEB` | `#F2F2F3` | `#17263B` | `#252525` | Inputs, hovered rows, chart tracks |
| `--line` | `#D5DDD8` | `#E4E4E7` | `#24364F` | `#2E2E2E` | Panel borders, dividers, ruler ticks (decorative) |
| `--line-strong` | `#76847D` | `#7A7A84` | `#5C7290` | `#727272` | Input and checkbox borders (3:1 against surfaces) |
| `--ink` | `#0E1E33` | `#18181B` | `#E4EBF3` | `#EDEDED` | Text |
| `--ink-2` | `#3F4D5F` | `#3F3F46` | `#A9B6C6` | `#B5B5B5` | Secondary text |
| `--ink-3` | `#5A6878` | `#5E5E68` | `#8796AA` | `#8F8F8F` | Labels, hints (4.5:1 on every surface) |
| `--accent` | `#0F766E` | `#0F766E` | `#2DD4BF` | `#2DD4BF` | Primary action, "now" line, active nav, focus ring |
| `--danger` | `#B42318` | `#B42318` | `#F97066` | `#F97066` | Overdue, urgent |
| `--warn` | `#B54708` | `#B54708` | `#FDB022` | `#FDB022` | High priority, waiting |
| `--ok` | `#067647` | `#067647` | `#47CD89` | `#47CD89` | Done |

The accent shows up in four places only: the primary button, the "now" line, the active nav item,
and the focus ring (plus a faint tint of it behind selected text). Everything else that marks a state
uses ink: ticked task boxes fill with ink, native checkboxes and the checklist boxes in notes are
ink, and links inside notes are ink with an underline. Before 15 Oct 2026 those were teal, which made
the teal spread thin and the "now" line stop standing out.

## Type

- **IBM Plex Sans** (variable, self-hosted). Reason: the clock, counts and times are the core content,
  and Plex has clear tabular figures and a slightly engineered voice that suits someone who reads
  alert boards all day. It also separates this tool from FinChat's Inter.
- Numbers use `font-variant-numeric: tabular-nums` so the clock and counts don't jitter.
- Scale: 12 / 13 / 14 (body) / 16 / 20 / 28, plus the clock at 56 on desktop and 40 on phone.
- No uppercase wide-tracked labels. Section labels are sentence case, 13px, `--ink-3`.

## Shape and depth

- Radius: 6px for controls, 10px for panels, round only for avatar initials and Tracky's send button.
  One exception: Tracky's message bubbles and message box use 16px, because the chat layout borrows
  its shape from the chat apps people know, and at 6px the box reads as a form field.
- Panels are flat with a 1px `--line` border. Shadow is reserved for things that float above the page:
  dialogs, popovers, toasts.
- No gradients, glass, glow, grids or decorative rings.

## Layout

- Desktop: left sidebar (navigation plus quick links), content max 1200px.
- Phone: a bottom tab bar replaces the sidebar; quick links move into Settings > Links.
- Home order: header (greeting, clock, quick buttons, the Ask Tracky field, day ruler); then Today (the focal point) beside
  Next 7 days; then In progress and waiting beside the month; then Numbers (counts, tasks finished per
  day, deadlines met, open tasks by status and priority). The numbers sit last on purpose: they are
  the review, the agenda is the work.
- Tracky is the assistant's name, used wherever the feature is named (the dialog title, the sidebar's
  Ask Tracky button, the Mac menu). It answers in the first person and, asked, says it runs on Gemini.
  Its field looks like a text field on Home, because that is what it asks for: a sentence. Cmd+K
  (Ctrl+K) opens it from anywhere; the shortcut is shown beside the field and the sidebar button.
- Tracky is a chat, laid out like Claude and ChatGPT because that is the shape people already know
  for talking to an assistant, in this app's own colors and type. Your messages sit on the right in a
  `--surface-2` bubble; Tracky's answers sit on the left under the logo mark and its name, with no
  bubble, so the drafts inside them read as content rather than chat chrome. The message box is
  pinned to the bottom and grows to about eight lines. The dialog has a fixed height (760px on a
  computer, 94% of the screen on a phone), so the thread scrolls and the box never moves. After you
  send, your message moves to the top of the view with the answer under it.
- Drafts are one line each, with the day ruler's mark (diamond for a deadline, bar for an event):
  title, then kind, time, place, reminder, priority and project. The pencil opens every field; a draft
  that can't be added as it is opens by itself. Older answers in the thread shrink to a plain list.
- Tracky advises as well as drafts. Its answers keep their line breaks; lists are lines starting
  with "- ". Each answer ends with a quiet line naming the model that wrote it.
- Enter sends, Shift+Enter starts a new line, and text being composed with an input method is left
  alone. On a phone Return starts a new line and the send button sends.
- The chat is kept on the device (the last 60 messages and any drafts not yet added) until New chat
  or `/clear`. `/compact` replaces it with Tracky's own few-line summary, marked "Earlier chat,
  compacted", which Tracky reads as context from then on. Typing / lists the commands above the box.
- The sidebar folds into a 60px icon rail with every label as a tooltip and for screen readers, and
  its right edge drags between 200 and 360px; narrower than 150px folds it. The edge is a keyboard
  separator too. Its state is kept per device.
- Overdue rows carry a quiet text button, Tomorrow, at the right. Overdue is the one state where the
  next action is nearly always the same, so it gets a shortcut; other rows stay clean. Every move
  offers Undo in its toast rather than asking first: moving is easy to reverse, so a question would
  only slow it down.
- Deleting doesn't ask "Are you sure?"; it deletes and offers Undo for 8 seconds. A question before
  every delete trains you to click OK without reading, and an Undo is there for the one time it
  matters. Discarding unsaved edits still asks, because those can't be brought back.
- In the Mac app, the menu bar icon is the system's `checklist` symbol, drawn as a template so it
  matches the other icons in light and dark menu bars.
- Weekly review is its own page rather than more panels on Home. Home is for the day; the review is
  something you read once a week, so it gets the room to list every finished and slipped task.
- Icons: Phosphor at bold weight, 16 to 18px, only where a label alone is slower to scan (navigation,
  editor toolbar, row actions). Every icon-only button carries a text label for screen readers.
- The favicon, the phone's home-screen icon and the Mac app icon are all the logo mark (see Logo).

## Motion (dial 2)

- The intro, when the app opens (once per browser session, every launch of the Mac app): the mark
  and name rise in (300ms), the day ruler draws left to right (`clip-path`, 500ms from 150ms,
  `cubic-bezier(0.77, 0, 0.175, 1)`), the teal "now" line travels from 00:00 to the current time
  (600ms from 350ms, same curve), and the greeting rises in at 500ms. At 1.3s the layer fades out
  (250ms) and Home's four sections rise in after it, 50ms apart (350ms each). It is the one place
  with motion for delight, because it is seen a few times a day at most and covers the app while it
  loads. A click fades it out early; a key press removes it at once. It can be turned off in
  Settings → Appearance. CSS keyframes, so it stays smooth while the app loads underneath.
- Dialogs: 200ms scale from 0.97 plus fade, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`; exit 150ms.
- Phone dialogs slide up as a sheet: 260ms, `cubic-bezier(0.32, 0.72, 0, 1)`.
- Buttons: `scale(0.97)` on press, 120ms. Everything else you tap gets the same press (chips, view
  toggles, editor tools, palette cards, stat tiles, calendar days, the phone tab bar) through `.press`,
  150ms with the ease-out curve. The checkbox box sinks to 0.9 instead, because it is small.
- Ticking a task done: the check fills, the row fades to its done state over 150ms.
- Content that replaces a loading message fades in once (opacity only, 200ms) so the swap isn't a
  hard cut. Refetches don't repeat it.
- Changing page fades the new page in: 150ms, opacity only, because it happens many times a day.
  Moving between notes or task filters isn't a page change. Switching the Tasks list and board
  fades the same way.
- The next or previous month (Calendar, Home's month) or week (Review) slides 8px in from the side
  you moved towards, with a fade: 180ms ease-out. It shows which way you went.
- A task, event or note you just added, restored with Undo, or moved to another day rises into its
  list once: 6px and opacity, 200ms ease-out. It shows where it landed. Rows leaving a list don't
  animate.
- Nothing animates for data you are reading: chart bars, counts and meters appear as they are.
- The day ruler's list of shared marks grows out of the corner nearest its mark: 150ms, opacity and
  scale from 0.97, ease-out.
- Board drag: the card lifts into a floating copy (shadow, scale 1.02) while the original dims in
  place; on drop the copy settles into its new column in 200ms with ease-out.
- Switching palettes never animates; colors change in one frame.
- Nothing loops, with one exception: while Tracky works, a band of light sweeps across its status
  ("Reading…", "Compacting the chat…"), from `--ink-3` through `--ink` (1.6s, linear), as Claude shows
  when it thinks. A wait of one to several seconds with nothing moving looks frozen; a database load
  of a tenth of a second doesn't, which is why other loading states stay as text. It appears only
  after 300ms, so a quick answer never flashes it, and after four seconds the status says it is still
  working.
- Tracky's answer appears word by word, like Claude's: each word fades in from a 2px blur over 180ms,
  about 25ms after the one before, capped so the whole answer takes at most 650ms. The answer is
  already there in full (screen readers and copying get it whole); only its appearance is paced.
  Then its drafts rise into place (4px and opacity, 200ms ease-out), 40ms apart, capped at 160ms, so
  they read as separate things to check. Only answers that just arrived do this: reopening Tracky or
  restoring the chat shows everything at once. Your own message appears at once, because you sent it
  with a key.
- The sidebar folding or opening from its button slides the page into place: the layout changes at
  once and a transform carries the content from where it was (200ms, `cubic-bezier(0.77, 0, 0.175,
  1)`); the labels fade back in over 150ms. From ⌘\, or with reduced motion, it just changes.
  Dragging the edge follows the pointer with no easing. Removing a draft is instant: a fade would still leave the
  cards below jumping up. Opening a draft's fields is instant too.
- Keyboard shortcuts open things instantly with no animation: Tracky opened with Cmd+K skips the
  dialog's scale and fade, while the same dialog opened by a click still animates. The same goes
  for pages and months: after a key press (Tab and Enter on a link, Cmd+,) they change without the
  fade or slide. `lib/motion.ts` notes whether the last input was a key or a pointer.
- `prefers-reduced-motion`: keep fades, drop movement. Tracky's drafts only fade, its answers appear
  whole, and its status doesn't shimmer. The intro shows the ruler, the line and the greeting in place
  and fades them in, then leaves after 0.9s. Months, weeks and new rows only fade, and the sidebar
  folds without sliding the page.

## Copy

- English, plain, short. Buttons say what they do: "Add task", "Save task", "Download a copy".
- Empty states say why it's empty and give the one action that fills it.
- No emoji in the interface.
