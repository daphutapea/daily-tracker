<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockup-dark.svg">
  <img src="docs/brand/lockup-light.svg" alt="Daily Tracker" height="48">
</picture>

# Daily Tracker

A personal board for one person. It keeps your tasks and their deadlines, your notes, your events, a
month calendar and the sites you open every day in one place. The Mac app sends reminders and a morning
and weekly summary as notifications, and can pass them to your iPhone through Apple Calendar.

Setting it up for the first time? Follow [docs/SETUP.md](docs/SETUP.md) to create your account,
install the Mac app and turn on Tracky. What changed in each version is in [CHANGELOG.md](CHANGELOG.md); the
version you are running is shown at the bottom of Settings.

## Opening it

On your Mac, press Cmd+Space, type Daily Tracker and press Return. It opens in its own window with its
own Dock icon, and you stay signed in between launches. The app lives in your Applications folder
(`~/Applications`); `npm run app` builds and installs it, and running it again after a code change
replaces the installed copy, reopening it if it was open.

When Daily Tracker opens, a short intro plays while it loads: the day ruler draws itself, a teal line
runs to the current time, and you're greeted by name. It takes about a second and a half; click or
press any key to skip it. It plays once each time the app starts (once per tab in a browser), and you
can turn it off in Settings → Appearance.

Links you click inside the app, such as your quick links, open in your normal browser.

Closing the window doesn’t quit the app. It stays in the menu bar (the checklist icon at the top of the
screen), so reminders keep arriving and stay up to date. That menu lists what’s left today and how
many tasks are overdue; click any line to open it. It also opens the app or Tracky, shows your next
reminder, and turns on Open at Login. To quit for real, press Cmd+Q; reminders already handed to macOS
still arrive after that.

| Shortcut | What it does |
|---|---|
| ⌥⌘T, in any app | Brings Daily Tracker forward with Tracky open |
| ⌘T in the Mac app, ⌘K in a browser | Opens Tracky (⌘K works in the app too; a browser keeps ⌘T for a new tab) |
| ⌘, | Opens Settings |
| ⌘Enter | Saves the task or event you’re editing, or sends your note to Tracky |

⌥⌘T only works while Daily Tracker is running, because the app is what listens for it. If you quit
with Cmd+Q, open the app again before using it. Tick Open at Login in the menu bar menu and it’s always
there from the moment you sign in to your Mac.

The Dock icon shows how many tasks are past their deadline, so you can see it without opening the
app. Turn it off in Settings → Mac app.

On a computer, the sidebar folds into a narrow strip of icons, as Claude’s does, so the page gets the
whole window: press the sidebar button at its top, or ⌘\ (Ctrl+\ on Windows). Drag its right edge
to make it wider or narrower; drag it far enough left and it folds, and double-click the edge for the
standard width. It remembers how you left it. On a narrow window it never takes more than 28% of
the width, whatever you set.

## Home

Home is built to answer one question: what is left today?

The header shows the date, the time and three buttons. Add task opens a new task due today at 17:00.
Add event opens a new event today, starting at the next full hour. New note opens an empty note. The
greeting uses the name you set in Settings.

Below the buttons is the field where you ask Tracky (see [Tracky](#tracky)). Under it is a ruler for
today, from midnight to midnight. Diamonds are deadlines, short bars
are events, and the teal line is the current time. A filled red diamond is a deadline you have already
missed. Click any mark to open it. When several fall at almost the same time, such as three tasks due
at 17:00, they share one mark with a number above it; click it to list them and open the one you want.

| Panel | What it shows |
|---|---|
| Today | Overdue tasks first, then today’s events and deadlines in time order. The number beside the title is how much is left. |
| Next 7 days | Deadlines and events for the coming week, grouped by day. |
| In progress and waiting | Open tasks with the status In progress or Waiting. They stay here until you finish them. |
| Month | A small calendar. A diamond under a day means a deadline, a bar means an event. Click a day to open it in Calendar. |
| Numbers | Counts that open the matching list when clicked, tasks finished per day over the last week, how many of today’s and this week’s deadlines you met, and your open tasks by status and priority. Show table swaps the chart for the numbers behind it. |

On a phone, your quick links sit at the bottom of Home.

## Tracky

Tracky is the assistant built into Daily Tracker. Write what’s coming up the way you’d say it, and
Tracky drafts the tasks and events for you. Open it from the field on Home, the Ask Tracky button in
the sidebar, ⌘T in the Mac app, or ⌘K in a browser (Ctrl+K on Windows) from any page. Ask it who it is and it tells you: Tracky,
running on Google’s Gemini.

For example: “Sync with Dennis Tuesday 10 to 11am, remind me 15 min before. Finish the labelling sheet
by Friday, high priority.” English, Bahasa Indonesia or a mix all work, and one note can hold several
things. Type as fast as you like: typos, shorthand and loose times are read for what you meant, so
“Sync me with mr. dennis at 1500 till 1600, then work on ATLAS imrpovementsd again” becomes “Sync with
Mr. Dennis” today from 15:00 to 16:00 and “Work on ATLAS improvements again”, filed under ATLAS.

Tracky works like a chat, the way Claude or ChatGPT do. Type in the box at the bottom and press
Enter to send; Shift+Enter starts a new line. On a phone, Return starts a new line and the round
button sends. While Tracky works, a band of light sweeps across its status, and the send button
turns into Stop. Its answer then appears word by word, the way Claude’s does, in well under a second. Each item comes back as one line, such as “Event · Tue 20 Oct, 15:00 to 16:00 · Client office”.
Press the pencil to change anything on it (task or event, title, day, time, place, reminder,
priority, project) or the cross to remove it. A task with a day but no time is due at 17:00. An event
that overlaps one already in your calendar gets a warning. Press Add to save them, or Discard.

You can also just reply. “Make it 4pm”, “also remind me 10 minutes before” or “drop the second one”
changes the drafts on screen instead of starting over, and edits you made by hand travel with your
reply.

The chat is kept on this device, so it is still there after you close Tracky or quit the app, along
with any drafts you haven’t added, until you sign out. Two commands, typed into the box like in
Claude Code, keep it in check. Type / to see them; the arrow keys pick one, Tab or Enter fills it
in, and Enter again runs it:

- `/compact` asks Tracky to sum up the chat in a few lines, and that summary replaces the
  conversation. Drafts you haven’t added stay, and Tracky still remembers the gist next time. Use it
  when a long chat gets slow to scroll. The Compact button at the top does the same.
- `/clear` starts a new chat. New chat at the top does the same.

Tracky can also help you plan. Ask “I have a client meeting at 3 and the ATLAS report due at 5, what
should I do first?” or “can I fit a dentist appointment in on Thursday?” and it answers from your
saved tasks and events: a recommendation first, then the reason and the trade-off. Advice alone
adds nothing; ask it to plan or schedule something and it drafts it for you to check. What Tracky
sees of your schedule, and how to turn that off, is under Settings → Tracky.

Tracky only drafts and advises. It can’t save, change or delete anything; you do that with the Add
button, or in the app. It runs on Google’s Gemini free tier. The best model allows 20 messages a day;
after that Tracky switches by itself to lighter models with larger allowances, and each answer says
which model wrote it. Only when all of them are used up does the app say so, and then you add items by hand until the
next day. Tracky needs a one-time setup, described in
[docs/SETUP.md](docs/SETUP.md).

How often the AI reads notes correctly is measured with a set of 34 test notes, ten of them full of typos. How to run it, and
what it does and doesn't prove, is in
[supabase/functions/tracky/eval/README.md](supabase/functions/tracky/eval/README.md).

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

## Reminders and summaries

The Mac app hands every reminder in the next two weeks to macOS, so it arrives as a normal Mac
notification even when the window is closed or the app has quit. A task’s notification has Mark done
and Snooze 10 minutes; an event’s has Snooze 10 minutes; clicking either opens it. Finished tasks
don’t send one. The first time a reminder is coming up, macOS asks whether Daily Tracker may show
notifications. Settings → Mac app can turn them off or send a test.

While you’re looking at the app, a reminder appears in the corner of the window instead, with an Open
button, so you never get both. In a browser, that pop-up is the only reminder you get.

Two summaries are optional, under Settings → Summaries:

| Summary | When | What it says |
|---|---|---|
| Morning summary | Every day at the time you pick | How many tasks are overdue, how many are due and how many events you have, then the first few by time. Clicking it opens Home. |
| Weekly review | On the day and time you pick | What you finished that week, how many deadlines slipped, and what’s planned for the week after. Clicking it opens the Review page. |

The app rewrites each summary whenever your tasks change, so what arrives matches the day. If the app
was closed when something changed, the summary shows things as they were when it last ran.

### On your iPhone

Notifications can’t jump from a Mac to an iPhone, but calendar alerts can. Turn on **Also alert me on
my iPhone** in Settings → Mac app and the app keeps a “Daily Tracker” calendar in your iCloud: each
reminder and summary becomes a five-minute entry with an alert, and iCloud brings the alert to your
iPhone (and an Apple Watch). macOS asks once whether Daily Tracker may use Calendar.

- Your Mac then shows that calendar’s alert instead of the app’s own notification, so you never get two.
  Calendar alerts have no Mark done or Snooze buttons; open the app for those.
- The Mac app has to be running to bring changes into the calendar. Alerts already there still reach
  your phone when the Mac is asleep or off.
- On the iPhone, Calendar alerts must be allowed (Settings → Notifications → Calendar), and the Daily
  Tracker calendar must be ticked in the Calendar app’s list of calendars.

Reminder times follow the time zone shown in Settings, which updates to match the device you use.

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
| Mac app | In the Mac app only: turn reminder notifications on or off, let macOS show them, send a test, choose whether the Dock icon shows how many tasks are overdue, and turn on iPhone alerts. |
| Summaries | Turn the morning summary and the weekly review on or off, and choose when they arrive. |
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
