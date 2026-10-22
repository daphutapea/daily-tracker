# Setting up Daily Tracker

This covers the one-time setup, putting the app online, and working on the code. For using the app
day to day, see the [README](../README.md).

The app is React and TypeScript (built with Vite), styled with Tailwind, with a TipTap editor for
notes. Data lives in the Supabase project `daily-tracker` (Singapore region). The Mac app turns your
reminders and summaries into notifications.

## 1. Create your account

The tracker allows exactly one account, and the database refuses every sign-up after the first.

1. Open the [Supabase dashboard](https://supabase.com/dashboard/project/huinyzkrpvhiigoywmro/auth/users)
   for the `daily-tracker` project and go to Authentication, then Users, then Add user, then Create
   new user.
2. Enter your email and a password, tick Auto Confirm User, and create it.

## 2. Run it on your computer

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 and sign in. This uses your real Supabase project, so anything you add is
saved.

## Install the Mac app

```bash
npm run app
```

This builds the tracker, wraps it in a native macOS window (`macos/main.swift`), checks that the page
loads, and installs `Daily Tracker.app` in `~/Applications`, where Spotlight and Launchpad find it. It
needs only the Swift compiler from Apple's Command Line Tools, which `xcode-select --install` provides.

The app shows the same pages from inside its bundle and talks to the same Supabase project, so your
login and data are shared with the browser version. Run `npm run app` again after any code change.

The app keeps running in the menu bar when you close its window, and hands upcoming reminders to
macOS as notifications. The first time one is coming up, macOS asks whether Daily Tracker may show
notifications; allow it, or turn them on later in System Settings → Notifications → Daily Tracker. To
start it with your Mac, tick Open at Login in its menu bar menu. macOS may ask you to allow that once
in System Settings → General → Login Items.

The icon is the Daily Tracker logo, drawn by `scripts/make-logo.swift` into `macos/AppIcon.png`. After
changing the logo, run `npm run logo` and then `npm run app`. To use a different icon, replace
`macos/AppIcon.png` with any 1024 by 1024 PNG and run `npm run app`.

## Install the iPhone app

The iPhone app is the same tracker in a native screen (`ios/DailyTracker/DailyTracker.swift`), like the
Mac app: its pages come from inside it, so nothing has to be put online, and it uses the same Supabase
project. You install it from this Mac. Xcode (from the Mac App Store) has to be installed; the iPhone
itself needs nothing extra.

Once:

1. In Xcode, open Settings → Accounts, press +, choose Apple Account and sign in. A free Apple ID works.
2. Plug the iPhone into the Mac with a cable, unlock it, and tap Trust when it asks.
3. On the iPhone, turn on Settings → Privacy & Security → Developer Mode. It restarts and asks you to
   confirm.

Then, from the project folder:

```bash
npm run iphone
```

It builds the pages, signs the app with your Apple ID, and installs it on the phone. The first time,
the iPhone won't open it until you trust your profile: Settings → General → VPN & Device Management →
your Apple ID → Trust. Open Daily Tracker, sign in with your tracker account, and allow notifications
when it asks (or later, under Settings → iPhone app).

With a free Apple ID the app stops opening after 7 days. Plug the phone in and run `npm run iphone`
again to renew it; your sign-in and settings stay. A paid Apple Developer membership makes it last a
year. Run it again after any code change, too.

`npm run iphone -- --simulator` runs it in the iOS Simulator instead, which needs Xcode's iOS
simulator (Xcode → Settings → Components).

## 3. Reminders, summaries and your iPhone

Reminders and summaries come from the Mac app, so install it first (above).

1. The first time a reminder is coming up, macOS asks whether Daily Tracker may show notifications.
   Allow it. Settings → Mac app → Send a test notification checks it works.
2. Under Settings → Summaries, turn on the morning summary or the weekly review if you want them,
   and pick when they arrive.
3. For alerts on your iPhone, install the iPhone app (above): it shows them as its own
   notifications. Without it, turn on Also alert me on my iPhone in Settings → Mac app and allow
   Calendar access when macOS asks. The app makes a “Daily Tracker” calendar in iCloud; on the iPhone,
   allow Calendar notifications and keep that calendar ticked in the Calendar app.
4. Tick Open at Login in the menu bar menu, so all of this keeps working after a restart.

## Turn on Tracky (free Gemini key)

Tracky sends what you type to Google’s Gemini API through a small server function in your Supabase
project (`supabase/functions/tracky`), so the key never reaches the browser or the Mac app.

1. Open [Google AI Studio](https://aistudio.google.com/apikey), sign in with your Google account, and
   create an API key. No card is needed for the free tier.
2. In the [Supabase dashboard](https://supabase.com/dashboard/project/huinyzkrpvhiigoywmro/functions/secrets)
   for `daily-tracker`, go to Edge Functions, then Secrets, and add a secret named `GEMINI_API_KEY` with
   that key as its value.

Then deploy the function from this folder:

```bash
npx supabase functions deploy tracky
```

That’s all. Open Tracky and try a sentence.

**Upgrading from Quick add.** Before v1.9 the function was called `quick-add`, and an app or browser
tab still running an older version keeps calling it. Upgrade in this order, so nothing calls a
function that isn’t there:

1. Deploy `tracky` (above), before the new version of the app goes live.
2. Put the new version online with `npx vercel --prod`, and rebuild the Mac app with `npm run app`.
3. Reload any browser tab that still has the tracker open, and quit and reopen the Mac app.
4. Only then remove the old function:

```bash
npx supabase functions delete quick-add
```

**Which model it uses.** It asks `gemini-3.6-flash` first, the best Flash model on the free tier,
which allows 20 requests a day. If that allowance is used up, the model is busy, or your key can’t use
it, it moves on to `gemini-3.5-flash-lite` and then `gemini-3.1-flash-lite`, which have larger free
daily allowances. To change the order, add a
secret named `GEMINI_MODELS` with model names separated by commas, best first. Your current limits are
listed in AI Studio under rate limits.

**Privacy.** On the free tier, Google’s terms allow it to use what you send to improve its products.
With each message Tracky sends what you typed, the chat so far, the drafts on screen, today’s date
and time, your time zone and your project names. So it can advise on your plans, it also sends a
summary of your schedule: the titles, times, priority, status and project of open tasks from the
last 30 days to two weeks ahead, and your events for the next two weeks. It never sends notes, links
or finished tasks. Turn the schedule off in Settings → Tracky, and leave out of your messages
anything you wouldn’t want shared.

## 4. Put it online

The project is ready for [Vercel](https://vercel.com) on the free plan. `vercel.json` sends every page
address to the app, and `.env.production` already points at your Supabase project.

```bash
npx vercel --prod
```

The first run asks you to log in and confirm the project settings; the defaults are right. It prints
your address. On your phone, open it and use Add to Home Screen.

You can also import the GitHub repository in the Vercel dashboard instead. No settings need changing.

## How reminders work

The page works out the reminders and the next morning and weekly summaries from your data
(`src/lib/reminders.ts`), and hands them to the Mac app (`src/components/MacAppBridge.tsx`). The app
schedules each one with macOS (`macos/main.swift`), which delivers it at its time even if the app has
quit. Whenever your data changes, the whole list is replaced, so a finished task's reminder is
withdrawn and a summary is rewritten. At most 50 reminders from the next two weeks are scheduled at a
time.

With iPhone alerts on, the same list goes into the “Daily Tracker” calendar in iCloud instead, one
five-minute entry with an alert per reminder, keyed by a `dailytracker://reminder/...` link so entries
are updated rather than duplicated. Turning it off removes the entries still ahead.

There is no server job any more: the database only stores the data and the summary settings. Until
v1.4, reminders went out as Telegram messages from a `pg_cron` job; the
`20261016000000_remove_telegram.sql` migration removed that.

## Working on the code with a local database

This needs Docker running. Start the local Supabase stack, load the schema, create a local test login,
then run the app against it:

```bash
npx supabase start
```

```bash
npx supabase db reset
```

```bash
node scripts/create-local-user.mjs
```

```bash
npm run dev:local
```

The local test login is written in `scripts/create-local-user.mjs`, and the script refuses to run
against anything but the local stack.

Schema changes go in `supabase/migrations/`. After changing the schema, regenerate the TypeScript types
with `npm run db:types`, and apply the same migration to the hosted project.

To use Tracky against the local stack, run its function in a second terminal. Without a key it
answers that the AI isn’t set up, which is enough to test the screens. To call Gemini locally, put
`GEMINI_API_KEY=...` in `supabase/functions/.env` (Git ignores it) first.

```bash
npx supabase functions serve tracky
```

The function’s parsing, its model fallback and the eval grader have tests that run without a key or
network:

```bash
npm run test:functions
```

To measure how well the AI reads notes, run the gold set of 34 notes against Gemini. It needs the key
in `supabase/functions/.env` and uses about 34 of the day’s free requests per run;
[the eval README](../supabase/functions/tracky/eval/README.md) explains the options and the limits.

```bash
npm run eval:tracky
```

After changing the function, deploy it to the hosted project:

```bash
npx supabase functions deploy tracky
```

When you change something people will notice, add it to [CHANGELOG.md](../CHANGELOG.md). Start a new
`## vX.Y (date)` section with Added, Changed, Fixed or Known limitations, and set the same version in
`package.json`, which is what Settings shows. `npm test` fails when the two disagree.

Before committing, check that the tests, types, lint and the production build pass:

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run build
```

The browser tests drive the real app in Chromium against the local stack, so `npx supabase start`
and `node scripts/create-local-user.mjs` must have run first. They fake the AI, so they need no key.
Each test removes the rows it made (their titles start with `e2e `).

```bash
npm run test:e2e
```

GitHub runs all of this on every push and pull request (`.github/workflows/checks.yml`): one job for
types, lint, tests and the build, and one that starts a fresh local database and runs the browser
tests. The results show on the commit in GitHub, under the Actions tab.

## Good to know

Supabase pauses a free project after a week with no activity. Using the app keeps it awake. If it does
pause, press Restore in the Supabase dashboard.

Every table has row level security, so only your account can read or change your rows. The publishable
key in `.env.production` is meant to be public; it ships inside the app anyway. The secret keys never
leave Supabase.

With iPhone alerts on, reminder and summary titles are stored in your iCloud calendar. If you track
client or office work here, check your company’s rules on where that information may go.

## Where things are

| Path | What it holds |
|---|---|
| `src/pages/` | Home, Tasks, Notes, Calendar, Links, Weekly review and Settings |
| `macos/` | The Mac app window and its icon |
| `ios/` | The iPhone app: its Xcode project, the native screen and its icon. `npm run iphone` builds and installs it |
| `scripts/build-mac-app.sh` | Builds, checks and installs the Mac app (`npm run app`) |
| `src/components/` | The task and event dialogs, Tracky (`Tracky.tsx`), the day ruler, charts, the notes editor |
| `src/lib/queries.ts` | Every read and write to the database |
| `supabase/migrations/` | Tables, access rules and the summary settings; later ones remove Telegram and add repeating tasks and events |
| `src/lib/reminders.ts`, `src/components/MacAppBridge.tsx` | What the Mac app schedules: reminders, summaries, the Today list |
| `supabase/functions/tracky/` | The server function that sends Tracky’s notes to Gemini, and its tests |
| `supabase/functions/tracky/eval/` | The 34-note gold set, its grader and `npm run eval:tracky` |
| `e2e/`, `playwright.config.ts` | Browser tests (`npm run test:e2e`) |
| `.github/workflows/checks.yml` | The checks GitHub runs on every push |
| `scripts/make-logo.swift`, `docs/brand/` | The logo: one script draws every version (`npm run logo`) |
| `CHANGELOG.md` | What changed in each version; `scripts/changelog.test.mjs` keeps it in step with `package.json` |
| `DESIGN.md` | Colors, type and motion, with the reason for each choice |
| `anti-slop/` | The design and accessibility checklist the first version was tested against |
