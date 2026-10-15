<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockup-dark.svg">
  <img src="docs/brand/lockup-light.svg" alt="Daily Tracker" height="48">
</picture>

# Daily Tracker

A personal board for one person. It keeps your tasks and their deadlines, your notes, your events, a
month calendar and the sites you open every day in one place, and it sends reminders and a morning
summary to Telegram.

Setting it up for the first time? Follow [docs/SETUP.md](docs/SETUP.md) to create your account, link
Telegram and put the app online. What changed in each version is in [CHANGELOG.md](CHANGELOG.md); the
version you are running is shown at the bottom of Settings.

## Opening it

On your Mac, press Cmd+Space, type Daily Tracker and press Return. It opens in its own window with its
own Dock icon, and you stay signed in between launches. The app lives in your Applications folder
(`~/Applications`); `npm run app` builds and installs it, and running it again after a code change
replaces the installed copy, reopening it if it was open.

Links you click inside the app, such as your quick links, open in your normal browser.

Closing the window doesn’t quit the app. It stays in the menu bar (the checklist icon at the top of the
screen), so reminders keep arriving and stay up to date. That menu lists what’s left today and how
many tasks are overdue; click any line to open it. It also opens the app or Quick add, shows your next
reminder, and turns on Open at Login. To quit for real, press Cmd+Q; reminders already handed to macOS
still arrive after that.

| Shortcut | What it does |
|---|---|
| ⌥⌘T, in any app | Brings Daily Tracker forward with Quick add open |
| ⌘K, inside the app | Opens Quick add |
| ⌘, | Opens Settings |
| ⌘Enter | Saves the task or event you’re editing, or reads a Quick add note |

⌥⌘T only works while Daily Tracker is running, because the app is what listens for it. If you quit
with Cmd+Q, open the app again before using it. Tick Open at Login in the menu bar menu and it’s always
there from the moment you sign in to your Mac.

The Dock icon shows how many tasks are past their deadline, so you can see it without opening the
app. Turn it off in Settings → Mac app.

## Home

Home is built to answer one question: what is left today?

The header shows the date, the time and three buttons. Add task opens a new task due today at 17:00.
Add event opens a new event today, starting at the next full hour. New note opens an empty note. The
greeting uses the name you set in Settings.

Below the buttons is the quick-add field (see [Quick add](#quick-add)). Under it is a ruler for today,
from midnight to midnight. Diamonds are deadlines, short bars
are events, and the teal line is the current time. A filled red diamond is a deadline you have already
missed. Click any mark to open it.

| Panel | What it shows |
|---|---|
| Today | Overdue tasks first, then today’s events and deadlines in time order. The number beside the title is how much is left. |
| Next 7 days | Deadlines and events for the coming week, grouped by day. |
| In progress and waiting | Open tasks with the status In progress or Waiting. They stay here until you finish them. |
| Month | A small calendar. A diamond under a day means a deadline, a bar means an event. Click a day to open it in Calendar. |
| Numbers | Counts that open the matching list when clicked, tasks finished per day over the last week, how many of today’s and this week’s deadlines you met, and your open tasks by status and priority. Show table swaps the chart for the numbers behind it. |

On a phone, your quick links sit at the bottom of Home.

## Quick add

Write what’s coming up the way you’d say it, and the AI drafts the tasks and events for you. Open it
from the field on Home, the Quick add button in the sidebar, or Cmd+K (Ctrl+K on Windows) from any page.

For example: “Sync with Dennis Tuesday 10 to 11am, remind me 15 min before. Finish the labelling sheet
by Friday, high priority.” English, Bahasa Indonesia or a mix all work, and one note can hold several
things.

Press Read it (or Cmd+Enter). While it reads, a thin line moves along the bottom of your note; it
usually takes a second or two. Each item comes back as a card you can change before anything is saved:
switch it between task and event, fix the title, day, time, reminder, priority or project, or remove
it. A task with a day but no time is due at 17:00. An event that overlaps one already in your calendar
gets a warning. Press Add to save them all, or Edit note to go back and rewrite. The whole flow works
from the keyboard: after reading, Tab moves through the cards, and removing one moves you to the next.

The AI only drafts. It can’t save, change or delete anything; you do that with the Add button. It runs
on Google’s Gemini free tier. The best model allows 20 notes a day; after that Quick add switches by
itself to lighter models with larger allowances, and the footer of each answer says which model read
it. Only when all of them are used up does the app say so, and then you add items by hand until the
next day. Quick add needs a one-time setup, described in
[docs/SETUP.md](docs/SETUP.md).

How often the AI reads notes correctly is measured with a set of 24 test notes. How to run it, and
what it does and doesn't prove, is in
[supabase/functions/quick-add/eval/README.md](supabase/functions/quick-add/eval/README.md).

## Tasks

### Adding and editing a task

| Field | How it works |
|---|---|
| Title | The only required field. |
| Status | To do, In progress, Waiting or Done. |
| Priority | Urgent shows in red with a warning sign and High in orange. Medium and Low stay quiet in lists, so the urgent ones stand out. |
| Project | An optional group, such as ATLAS or Personal. You make projects in Settings. |
| Deadline | A date and time. |
| Show on calendar | Untick it to keep this deadline off the Calendar page. |
| Remind me | Pick a time, or press a shortcut: At deadline, 15 min before, 1 hour before or 1 day before. The shortcuts need a deadline first. Lists show a small bell on tasks with a reminder. |
| Links | A label and an address. If you leave out `https://`, the app adds it. |
| Notes | Bold, italic, headings, bulleted and numbered lists, checklists, tables and text alignment. Click inside a table to get controls for adding and removing rows and columns. |

Press Cmd+Enter (Ctrl+Enter on Windows) to save. Escape or the close button shuts the dialog; if you
changed anything, the app asks before throwing it away. Delete removes the task at once and shows Undo
for 8 seconds, which brings it back exactly as it was. Events and notes work the same way.

### Finishing a task

Tick its box wherever it appears: on Home, in the list or on the calendar. The app records when you
finished it, which feeds the chart on Home. Unticking a task moves it back to To do.

### Moving overdue tasks

An overdue task has a Tomorrow button on its row. It moves the deadline to the same time tomorrow, and
a reminder moves with it, keeping the same distance from the deadline. When two or more tasks are
overdue, Move all to tomorrow on the Overdue heading moves them together, on Home and on the Tasks page.
Either way, Undo appears for 8 seconds and puts everything back exactly as it was.

### List view

Tasks are grouped into Overdue, Today, Tomorrow, Next 7 days, Later and No deadline. The chips above
the list switch between Open (the default), Today, Overdue, Done and All. The search box looks through
titles and note text, and the dropdowns filter by priority and, once you have projects, by project. Your filters become part of
the page address, so bookmarking the page keeps them.

### Board view

The board has four columns: To do, In progress, Waiting and Done. Done only shows tasks finished in the
last 14 days. Drag a card to another column to change its status. On a phone, press and hold a card for
a moment before dragging, and swipe sideways to move between columns. Clicking a card opens it, which is
also how you change a task’s status from the keyboard.

## Notes

New note opens an empty note, and it saves itself about a second after you stop typing. The line at the
top shows when it last saved. If a save fails, that line tells you and offers Retry.

Pin keeps a note at the top of the list. You can give a note a project, and the search box looks through
both titles and text. The editor is the same one tasks use, tables included.

## Calendar

The month starts on Monday. Each day lists its events with their start times and its deadlines with a
diamond. Click a day to see everything on it in the side panel, which moves below the month on narrow
screens.

With a day selected, the Task button adds a task due that day at 17:00, and Add event adds an event on
that day. An event has a title, a start, an optional end, an All day switch, a place (a room, an address
or a meeting link), a reminder with its own shortcuts (At start, 10 min before, 1 hour before and 1 day
before) and room for details.

## Links

These are the sites you open every day. On a computer they sit in the sidebar; on a phone they appear at
the bottom of Home and under Settings. Add one with a name and an address, or press one of the
suggestions. The pencil edits a link and the bin removes it.

To change the order, drag a link up or down in the sidebar; a plain click still opens it. On the Links
page, drag the grip at the left of a row, or press and hold it on a phone. From the keyboard, tab to a
grip, press Space, move with the arrow keys, and press Space again to drop it. The new order saves at
once and shows on every device.

## Reminders

Once Telegram is linked, every reminder time you set sends a message from your own bot. Finished tasks
don’t send one. A reminder more than 30 minutes late, for example because you picked a time that had
already passed, is skipped instead of arriving late.

On your Mac, the app hands every reminder in the next two weeks to macOS, so it arrives as a normal
Mac notification even when the window is closed or the app has quit. A task’s notification has Mark
done and Snooze 10 minutes; an event’s has Snooze 10 minutes; clicking either opens it. The first time
a reminder is coming up, macOS asks whether Daily Tracker may show notifications. Settings → Mac
notifications can turn them off or send a test.

While you’re looking at the app, a reminder appears in the corner of the window instead, with an Open
button. In a browser, that pop-up is the only reminder you get until Telegram is linked.

The morning summary is optional. It lists overdue tasks, today’s deadlines and today’s events, and it
arrives once a day within two hours after the time you choose. The weekly review message is optional
too: on the day and time you pick, it sends what you finished that week, which deadlines slipped, and
what’s due the week after. Reminder times follow the time zone shown in Settings, which updates to match
the device you use.

## Weekly review

Open Review in the sidebar, or Weekly review next to Numbers on Home. It shows one week, Monday to
Sunday, and the arrows step back and forward through earlier weeks.

| Section | What it shows |
|---|---|
| Summary | How many tasks you finished and how many deadlines slipped. |
| Tasks finished per day | One column per day of that week. Show table swaps it for the numbers. |
| Finished | Every task you marked done that week, with when. |
| Slipped | Deadlines that fell in that week and passed before the task was done, whether it’s still open or was finished late. |
| The week after | Deadlines and events planned for the following week. |

When deadlines slipped and the tasks are still open, the Slipped panel offers to move them all to next
Monday, keeping each one’s time. Undo works here too.

## Settings

| Section | What you can do there |
|---|---|
| You | Set the name used in the greeting, and see the time zone reminders use. |
| Mac app | In the Mac app only: turn reminder notifications on or off, let macOS show them, send a test, and choose whether the Dock icon shows how many tasks are overdue. |
| Telegram reminders | Connect your bot, link your chat, send a test message, and turn on the morning summary and the weekly review message. |
| Projects | Add, rename, archive or delete projects. Deleting a project keeps its tasks and notes; they just lose the label. |
| Appearance | Match your system, or always use Light or Dark. Each mode has two colour sets: Sage or White for light, Navy or Charcoal for dark. Each card shows a small preview. These choices are saved on each device separately. |
| Your data | Download a copy of everything you’ve added as one JSON file. Keep one somewhere safe now and then. |
| Account | See which account is signed in, sign out, and see which version of the tracker is running. |

## Small things worth knowing

- Every task and event has its own page address, so you can bookmark one.
- Tasks and events refresh every minute, and everything refreshes when you switch back to the tab, so
  something you add on your phone shows up on your laptop without reloading.
- Your phone and laptop share the same data, because it lives in Supabase rather than in the browser.
- Design decisions, colors and the logo’s rules are written down in [DESIGN.md](DESIGN.md).
- If ⌥⌘T doesn’t respond, look at `~/Library/Logs/DailyTracker.log` (Console.app lists it under Log
  Reports). It records when the shortcut was set up, each press, and when the app quit, so you can
  tell whether the app was running and whether the press arrived.
