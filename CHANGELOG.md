# Changelog

## v1.11 (2026-10-22)

### Added
- An iPhone app. It's the same tracker as on the Mac, with the pages inside the app, so nothing has to be put online, and the same data. Reminders and summaries arrive as iPhone notifications with Mark done and Snooze, the icon shows how many tasks are overdue, and the strip behind the status bar takes the page's colour. It also refreshes them in the background, so a task added on the Mac reaches the phone's reminders without opening the app there; iOS decides how often. `npm run iphone` installs it from the Mac over a cable; with a free Apple ID it needs renewing every 7 days the same way.
- Tracky changes what you've already saved. Ask it to move the ATLAS report to Friday, mark the invoice done, cancel the dentist or push everything overdue to tomorrow, and each change shows as a card with the old and new values: "Deadline Wed 21 Oct, 17:00 → Fri 23 Oct, 17:00". Nothing changes until you press Make 2 changes (or Add 1, change 2 when there are drafts too). Undo sits on the message that says what changed. Follow-ups build on changes still on screen, and the cross on a card drops it.
- Repeating tasks. Set Repeat on a task with a deadline: every day, weekday, week, month or year. When you finish it, the next one is added, due on the next day the rule allows that is still ahead, with its reminder the same time before it. Unticking takes the next one back. A small repeat mark shows in lists.
- Repeating events. Set Repeat on an event and its next three months are written into the calendar as ordinary events, with more added as time passes. Open one later and pick This event or This and later ones before you save or delete; Delete these comes with Undo.
- Tracky drafts repeating tasks and events: "standup every weekday at 10", "pay rent on the 1st of every month".
- Weekly backups in the Mac app. A copy of everything goes to iCloud Drive, in a folder called Daily Tracker Backups (Documents when iCloud Drive is off), once a week. The eight newest are kept; older ones go to the Trash. Settings → Your data shows the last one, with Back up now and Show backups.
- Restore from a backup, in Settings → Your data. Pick a backup file and it shows what it holds and what isn't in the tracker now, then adds only that back. Nothing you have is changed or removed, and finished tasks keep the day they were finished.

### Changed
- The Tracky test set has 60 notes, up from 34. New ones check replies such as "make it 4pm", changes to saved items, a vague request where Tracky should ask which one, advice, /compact, who Tracky is, and repeating items. Each results file now records which prompt it measured, so results from two prompts are never added up as one score.
- Calendar's add buttons read Task and Event, like Home's. Review's last panel is "Week of 27 Oct". The board's hint says to press and hold a card on a phone. The meter under Numbers reads "Due today, including done", since the count above it leaves finished tasks out.

### Fixed
- A snoozed reminder came back after you'd finished the task. Finishing or deleting a task now cancels its snoozed reminder and clears its notification from Notification Center.
- With Reduce motion on, a dialog on a phone appeared and vanished with no transition. It now fades.
- The dialog close button, the month arrows and other plain icon buttons showed nothing when you pointed at them.
- Screen readers skipped the label on Home's clock.

### Known limitations
- Repeating events are written while the app is open. If it stays closed for about three months, the calendar runs out of them until it's opened again.
- Changing a series with This and later ones rewrites the later events, so changes made to one of them on its own are replaced.
- A monthly task due on the 29th to 31st moves to the last day of a shorter month and stays on that day after. Monthly events don't.
- Tracky can't change how something repeats; do that in the event or task.
- Undo for Tracky's changes lasts until the next message in the chat.
- Weekly backups need the Mac app. In a browser or the iPhone app, use Download a copy, which opens the share sheet on the phone.
- The iPhone app's background refresh runs when iOS allows, usually a few times a day, and only with Background App Refresh on. A change made on the Mac minutes before a reminder may not reach the phone in time unless you open the app there.

## v1.10 (2026-10-19)

### Added
- More color, in all four palettes. Home's header is a band of brand navy holding the day ruler, and each color means one thing everywhere: red overdue or urgent, amber High priority, green done, sky In progress, plum Waiting, indigo events, teal now and today. Urgent and High are tinted tags, statuses are small colored dots beside their names, the counts have tinted icons, and the charts use the same colors. The intro and the palette previews in Settings use the new band.
- A teal Now line in Today, between what has passed and what is next.
- In the Mac app, ⌘T opens Tracky (⌘K still works). A browser keeps ⌘T for a new tab, so there it stays ⌘K.

### Changed
- Home fits on one screen on a computer. The counts sit right under the header; below them Today with In progress and waiting, then Next 7 days, then the month with Numbers, which shows one chart at a time (Finished, Deadlines, Open). A panel with more than fits scrolls inside itself, so no panel is stretched and the page doesn't scroll. In a medium window the panels sit in two columns, and on a phone they stack, with long lists cut short behind Show more.
- Waiting is plum instead of amber, so amber means High priority only.
- Segmented controls (List and Board, the Numbers charts) are toggle buttons, and the chosen one has a border, so it stands out from the others.

## v1.9 (2026-10-19)

### Added
- Tracky’s answers appear word by word, the way Claude’s do, in well under a second, and its drafts rise in after them. While it works, a band of light sweeps across “Reading…”; after four seconds it says it is still working.
- The chat is kept on this device, so it is still there after closing Tracky or quitting the app, with any drafts not yet added.
- `/compact` and `/clear`, typed into Tracky’s box as in Claude Code. `/compact` replaces the chat with Tracky’s short summary of it, keeping the drafts and the gist; `/clear` starts a new chat. Typing / lists them; the arrow keys pick one, and Tab or Enter fills it in. The Compact and New chat buttons at the top do the same. Signing out forgets the chat.
- On a computer, the sidebar folds into a strip of icons, as Claude’s does: its button at the top, or ⌘\. Drag its edge to make it wider or narrower, or far enough left to fold it; double-click the edge for the standard width. It remembers how you left it, and on a narrow window it never takes more than 28% of the width.

### Changed
- Everything that still said Quick add is now Tracky, including the server function, which is now `tracky`. Deploy `tracky` with `npx supabase functions deploy tracky` before the new version goes live, then update the web app and the Mac app and reload open tabs. Only after that remove the old function with `npx supabase functions delete quick-add`; [the setup guide](docs/SETUP.md#turn-on-tracky-free-gemini-key) has the steps.

### Fixed
- Adding, removing, discarding or editing drafts while Tracky was reading a follow-up could bring them back with its answer, so a draft could be saved twice. The drafts now wait, dimmed, until the answer arrives, and you can’t send while drafts are being added.
- Typing a year with five digits into a draft’s date blanked the app.
- Pressing Enter to confirm a word in a Japanese, Chinese or Korean input method sent the message in Safari and the Mac app.
- A task draft without a deadline read “Task, due No date”, and an event without a start time showed 17:00.
- Try again cleared what you were typing, and with no connection Tracky showed a code error instead of saying so.
- A “thanks” or a question no longer risks emptying the drafts, Tracky keeps titles such as “iPhone repair” as you typed them, keeps a draft whose title you cleared, and says so when more than 10 drafts would not fit.
- Long links in a draft wrapped off the card on a phone; reopening Tracky replayed the drafts’ animation; dialog footers had no space under them on a computer; and on a phone turned sideways the message box could grow taller than the dialog.
- Compacting a chat that had no answer back emptied it; it now keeps the chat and says it couldn’t. Compacting reads the whole chat kept on the device (up to 60 messages), not just the last 12, and the summary stays first in what Tracky remembers after more messages. Drafts with fields open stay open through a compaction.
- “/c” went to Tracky as a message, because it could be either command; it now waits for you to pick one.
- With reduced motion on, the drafts in a new answer appeared without their short fade.
- The message holding the drafts on screen could be dropped from a chat longer than 60 messages, losing the drafts after a reload.
- The sidebar: Enter on its button slid the page instead of changing at once; a quick second click jumped; the hidden Edit link next to Quick links could be reached with Tab in the icon strip; the labels didn’t fade in when it opened; and on a touch screen its edge and icons were smaller than a fingertip.

## v1.8 (2026-10-19)

### Added
- Tracky is a chat, laid out like Claude or ChatGPT: your messages on the right, Tracky’s answers on the left under its mark, and a message box at the bottom. Enter sends and Shift+Enter starts a new line; on a phone, Return starts a new line and the round button sends. The send button turns into Stop while Tracky reads. New chat clears the conversation; closing Tracky keeps it.
- You can reply to Tracky. “Make it 4pm”, “also remind me” or “drop the second one” change the drafts on screen instead of starting over, and edits you made by hand go with your reply.
- Tracky helps you plan. Ask what to do first, whether something fits, or whether work or a client meeting should come first, and it answers from your saved tasks and events with a recommendation and the reason. Advice alone adds nothing.
- Settings → Tracky, with a switch for whether Tracky sees your schedule.

### Changed
- Each draft is one line, such as “Event · Tue 20 Oct, 15:00 to 16:00 · Client office”, with a pencil to open every field and a cross to remove it. After Add, Tracky says what it added and the chat stays open.
- Tracky now sends Google a summary of your schedule with each message: the titles, times, priority, status and project of open tasks from the last 30 days to two weeks ahead, and your events for the next two weeks. Never notes, links or finished tasks. Turn it off in Settings → Tracky.

## v1.7 (2026-10-19)

### Added
- An intro when Daily Tracker opens: the day ruler draws itself, the teal line runs to the current time, and you’re greeted by name. About a second and a half, while the app loads. A click or any key skips it. It plays once each time the app starts, or once per tab in a browser. Turn it off, or play it again, in Settings → Appearance.
- After the intro, Home’s sections rise in one after another.
- Pages fade in when you switch between them. Moving to the next or previous month or week slides the new one in from that side.
- A task, event or note you add, bring back with Undo, or move to another day rises into its list, so you can see where it went.

### Changed
- Anything you do from the keyboard stays instant: pages and months change without a fade or slide after a key press, as Tracky already did with Cmd+K.
- With Reduce motion turned on in your system settings, the intro and the new transitions only fade.

## v1.6 (2026-10-19)

### Added
- Tracky: Quick add has a name. The dialog, the sidebar's Ask Tracky button and the Mac menu use it, and asked who it is, it says it’s Tracky, Daily Tracker’s assistant, running on Google’s Gemini.
- Event drafts from Tracky show where the event is, so you can check or change the place before adding it. It was saved before without being shown.

### Changed
- On the day ruler, deadlines and events at almost the same time share one mark with a count. Click it to see them all and open one. Before, three tasks due at 17:00 drew one diamond and only one of them could be opened.
- Moving an event’s start moves its end with it, keeping the length.
- Moving a task’s deadline moves its reminder with it, keeping the gap.
- On a phone, buttons and links are at least 44 pixels tall to tap: the Tasks filters, the reminder shortcuts, Tomorrow, Move all to tomorrow, Show table, the links at the top of the Home panels, the List and Board switch, and the note editor’s toolbar.
- A note left with no title and no text is removed when you leave it, so New note opened by mistake leaves nothing behind.

### Removed
- The time zone line in Settings. Nothing has used it since reminders moved to the Mac app, and it still mentioned Telegram.

### Fixed
- On a phone, messages such as “Moved 2 tasks to tomorrow” covered the tab bar and ran off the bottom of the screen. They now sit above it.
- On a phone, Home and Review were 12 pixels wider than the screen, so the browser zoomed out slightly and cut off the tab bar’s labels. The hidden label over the last bar of “Tasks finished per day” stuck out past the edge; it now stays inside the chart.
- Tracky accepted an event that ends before it starts if you changed the times on its card.

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
