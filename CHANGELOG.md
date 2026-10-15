# Changelog

## v1.5 (2026-10-16)

### Added
- A morning summary and a weekly review as Mac notifications, at the times you pick under Settings → Summaries. The morning one says how many tasks are overdue and due and how many events you have, then lists the first few by time. The weekly one says what you finished, how many deadlines slipped, and what’s planned for the week after.
- Also alert me on my iPhone, in Settings → Mac app. Reminders and summaries go into a “Daily Tracker” calendar in your iCloud, and iCloud brings each alert to your iPhone and an Apple Watch. Turning it off removes the entries still ahead.
- Under a reminder, the task and event dialogs say where it will reach you.
- Quick add reads notes typed in a hurry: misspellings, shorthand such as tmrw, nxt or bsk, words run together, and times like 1500, 0930 or 5.30pm. Titles come back spelled properly, in the note’s language.
- Ten typo-heavy notes in the Quick add test set, which now has 34. gemini-3.5-flash-lite passes all 34.

### Removed
- Telegram: the Settings section, linking a bot and a chat, the server jobs that sent the messages, and their database functions and columns. No chat was ever linked, so nothing was lost.

### Changed
- The summary settings no longer wait for Telegram to be linked; they work as soon as the Mac app is installed.
- Every title Quick add drafts starts with a capital letter.

### Fixed
- Quick add copied misspellings into titles, for example “quarterly reveiw” or “kirim lapran ke pak budi”. Dates and times were already read correctly.

### Known limitations
- Summaries are written by the Mac app from your data as it last saw it. If the app was closed when something changed, a summary can be out of date.
- With iPhone alerts on, your Mac shows the calendar’s alert instead of the app’s own notification, so those alerts have no Mark done or Snooze buttons.
- The Mac app has to be running to bring changes into the calendar. Alerts already there still reach the iPhone while the Mac sleeps.
- Without iCloud Calendars turned on for this Mac, the calendar stays on the Mac and nothing reaches the iPhone.

## v1.4 (2026-10-16)

### Added
- Mac notifications. Reminders for the next two weeks are handed to macOS, so they arrive even when the window is closed or the app has quit.
- A task’s notification has Mark done and Snooze 10 minutes; an event’s has Snooze 10 minutes. Clicking a notification opens the task or event.
- While the window is in front, the reminder shows inside the app instead, so it never appears twice.
- Closing the window keeps Daily Tracker running in the menu bar. Its menu opens the app or Quick add, shows the next reminder, and turns Open at Login on or off.
- Settings → Mac app turns notifications off, asks macOS for permission, sends a test notification, and turns the Dock badge on or off. It appears only in the Mac app.
- Settings… in the app menu, with Cmd+, like other Mac apps.
- Settings → Your data → Download a copy saves every task, note, event, project, quick link and your settings as one JSON file. In the Mac app it opens a Save dialog.
- Overdue tasks have a Tomorrow button that moves the deadline to the same time tomorrow. A reminder moves with it and is sent again.
- When two or more tasks are overdue, the Overdue heading on Home and on the Tasks page has Move all to tomorrow.
- The Slipped panel on the Review page moves the tasks still open to next Monday.
- Every move shows Undo for 8 seconds, which puts the deadlines and reminders back as they were.
- Undo after deleting a task, event or note: for 8 seconds, it brings the item back exactly as it was.
- ⌥⌘T in any app brings Daily Tracker forward with Quick add open.
- The menu bar menu lists what’s left today and how many tasks are overdue. Clicking a line opens it.
- The Dock icon shows how many tasks are past their deadline. It can be turned off in Settings → Mac app.
- A logo: the day ruler with the teal “now” line on an ink tile, beside “Daily Tracker” in IBM Plex Sans. It appears in the sidebar, on the sign-in screen, in the browser tab, on a phone’s home screen, as the Mac app’s icon and at the top of the README. One script, `npm run logo`, draws every version.
- The Mac app keeps a short log at ~/Library/Logs/DailyTracker.log: when ⌥⌘T is set up, each press, and when the app quits. It shows at a glance why the shortcut didn’t respond.
- Browser tests for adding and ticking a task, moving tasks, deleting with Undo, Quick add and the export, and checks on GitHub that run them, with the type check, lint, unit tests and build, on every push.
- The Quick add test set can run in parts (`--part 1/2`, then `--part 2/2`) for a model whose free allowance is smaller than the set. The parts merge into one score.

### Changed
- Deleting a task, event or note no longer asks first. Undo replaces the question.
- Every page except Home loads its code the first time you open it, so the app starts with about 80 kB less to download. The page you’re on stays up until the next one is ready.
- “Overdue” labels, today’s date and the charts update by themselves as time passes, instead of only when something else on the page changes.
- The Mac app’s icon is now the logo, in place of the earlier placeholder.
- `npm run app` reopens Daily Tracker after installing if it was open before, so a rebuild no longer leaves ⌥⌘T, the menu bar and the reminder sync switched off.

### Known limitations
- macOS holds up to 50 reminders from the next two weeks at a time. Later ones are handed over as they come into range, while the app is running.
- A change made on another device reaches the Mac’s reminders only while the Mac app is running. A task finished elsewhere while the app was closed still sends its notification.
- A snoozed notification still comes back even if the task is finished in the meantime.
- macOS asks once whether Daily Tracker may show notifications. If the answer was no, turn them on in System Settings → Notifications → Daily Tracker.
- Open at Login may need approving once in System Settings → General → Login Items.
- ⌥⌘T only works while Daily Tracker is running. Closing the window keeps it running; quitting with ⌘Q turns the shortcut off until the app is opened again. Open at Login keeps it on from startup.
- ⌥⌘T takes priority over the same shortcut inside other apps, such as Show/Hide Toolbar in Finder and Mail. If another app has already claimed it system-wide, it does nothing; ⌘K inside the app still works.

## v1.3 (2026-10-15)

### Added
- Quick add: write what’s coming up in a sentence, in English or Bahasa Indonesia, and the AI drafts the tasks and events. Open it from the field on Home, the Quick add button in the sidebar, or Cmd+K from any page.
- Each draft is a card you can change or remove before anything is saved. Nothing is added until you press Add.
- A draft event that overlaps one already in your calendar says so on its card.
- A drafted task with a day but no time is due at 17:00, the same as a task added by hand.
- Quick add runs on Gemini’s free tier through a server function in your Supabase project, so the API key never reaches the browser or the Mac app. It asks gemini-3.6-flash first and moves to the lite models when that model’s daily allowance is used up.
- While the AI reads a note, a short line sweeps along the bottom of the note. It shows only when the wait passes 300ms.
- Draft cards rise into place one after another, 40ms apart.
- A Review page shows one week at a time: tasks finished per day, what you finished, which deadlines slipped, and what is planned for the week after. The arrows step back through earlier weeks.
- A Weekly review link next to Numbers on Home.
- An optional weekly review message on Telegram, sent on the day and time you pick. It stays off until Telegram is linked.
- A gold set of 24 notes measures how often Quick add reads a note correctly: `npm run eval:quick-add`.
- Settings → Account shows which version is running.

### Changed
- Ticked task boxes, checkboxes and links in notes are dark ink instead of teal. Teal is kept for the main button, the “now” line, the current page in the menu and the focus ring, so the “now” line stands out again.
- Settings step 3 under Telegram is now Summaries, holding both the morning summary and the weekly review message.
- Quick add opened with Cmd+K appears at once. Opened with a click, it keeps the usual dialog animation.
- On a computer, Quick add opens near the top of the window and grows downward when the drafts arrive, instead of jumping up to re-center. Phones keep the bottom sheet.
- The AI’s one-line reply rises in with the drafts instead of fading in on its own.

### Fixed
- Reading a note left keyboard focus nowhere. The review now starts at the first card, and Edit note puts you back in the note.
- The note was disabled while the AI read it, which dropped focus. It is now read-only for that time and keeps focus.
- Removing a draft card dropped focus. It now moves to the card that took its place, the one above, or Edit note when no cards are left.
- After you removed every card, the dialog said the AI had found nothing, and the button read “Add 0 items”. It now says you removed them, and the button reads Add.
- On a phone, Quick add no longer suggests pressing Cmd+Enter.
- Quick add marked events with a time as all day, and dropped reminders and projects the note gave. Gemini wrote the fields in alphabetical order, deciding all day before the time, and skipped fields it could leave out. The order is now set, with the time first, and every field must be answered.
- When Google’s AI was busy (503), Quick add stopped with an error instead of trying the next model. It now moves on to the next model.
- Reaching Google’s per-minute limit was reported as the day’s allowance being used up. It now says the AI is busy and to try again in a minute.

### Known limitations
- Quick add needs a Gemini API key saved in Supabase. Until then it says the AI isn’t set up.
- gemini-3.6-flash allows 20 free requests a day. After that, Quick add uses the lite models, and only when all three are used up do items have to be added by hand until the next day.
- On the free tier, Google may use what you send to improve its products. Quick add sends only the note, the date and time, your time zone and your project names.
- Quick add can only add items. It can’t make repeating items or change and delete existing ones.
- Events have no project in the tracker, so Quick add offers a project on tasks only.
- The gold set has been run once: 24 of 24 on gemini-3.5-flash-lite. gemini-3.6-flash has not been measured since the fixes, and its 20 requests a day are fewer than the 24 notes. The notes were written for the set, not taken from real use.
- The weekly review message needs Telegram, which is not linked yet.

## v1.2 (2026-10-15)

### Added
- Quick links can be reordered by dragging. In the sidebar, drag a link up or down; a plain click still opens it.
- On the Links page, drag the grip at the left of a row, or press and hold it on a phone.
- From the keyboard, tab to a grip, press Space, move with the arrow keys and press Space again to drop it.
- The new order saves at once and shows on every device.

### Changed
- The arrow buttons that moved links on the Links page are replaced by dragging.

## v1.1 (2026-10-15)

### Added
- A Mac app. Press Cmd+Space, type Daily Tracker and press Return. It has its own window and Dock icon, and you stay signed in between launches.
- Links clicked inside the Mac app open in your normal browser.
- `npm run app` builds the Mac app, checks that it loads and installs it in your Applications folder.
- Two more colour sets: White for light mode and Charcoal for dark mode, beside Sage and Navy.
- Settings → Appearance shows a small preview card for each colour set. The choice is saved on each device.

### Changed
- Everything you tap sinks slightly while pressed: buttons, chips, view toggles, editor tools, palette cards, stat tiles, calendar days and the phone tab bar.
- Content that replaces a loading message fades in once instead of appearing in one cut.
- On the board, a dragged card lifts into a floating copy while the original dims in place.
- Switching colour sets changes every colour in one frame, without a fade.

### Fixed
- A card dropped in another board column flew back to its old column before jumping to the new one. It now settles where it was dropped.

## v1.0 (2026-10-15)

### Added
- Home answers what is left today: the date and time, Add task, Add event and New note, and a ruler for the day with deadlines, events and a teal “now” line.
- Home panels: Today, Next 7 days, In progress and waiting, a small month, and Numbers with tasks finished per day, deadlines met and open tasks by status and priority.
- Tasks with a status, priority, project, deadline, reminder, links and notes.
- A task list grouped into Overdue, Today, Tomorrow, Next 7 days, Later and No deadline, with search and filters kept in the page address.
- A task board with To do, In progress, Waiting and Done columns. Dragging a card changes its status.
- Notes that save themselves a second after you stop typing, with pinning, projects and search.
- A notes editor with headings, lists, checklists, tables and text alignment, shared with task notes.
- A calendar month starting on Monday, with each day’s events and deadlines and a side panel for the selected day.
- Events with a start, an optional end, all day, a place, a reminder and details.
- Quick links to the sites you open every day, in the sidebar on a computer and on Home on a phone.
- Telegram reminders from your own bot, and an optional morning summary of overdue tasks, today’s deadlines and today’s events.
- A reminder pop-up in the corner of the screen while the app is open.
- One account only. Every table has row level security, so only that account can read or change its rows.

### Known limitations
- Tasks and events can’t repeat.
- The app is not online yet. It runs on your computer, and the project is ready for Vercel.
