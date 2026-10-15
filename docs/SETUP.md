# Setting up Daily Tracker

This covers the one-time setup, putting the app online, and working on the code. For using the app
day to day, see the [README](../README.md).

The app is React and TypeScript (built with Vite), styled with Tailwind, with a TipTap editor for
notes. Data lives in the Supabase project `daily-tracker` (Singapore region). Supabase also runs the
reminder job and keeps the Telegram bot token in its Vault.

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

## 3. Link Telegram

In the app, open Settings and find Telegram reminders. The three steps on screen walk you through it:

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and paste the token it
   gives you. The token is stored encrypted in Supabase Vault.
2. Press Get a link code, open your bot, press Start, then press I’ve sent it.
3. If you want the morning summary, turn it on and pick a time.

Send a test message confirms everything works.

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

A database job, `private.dispatch_reminders`, runs every minute through `pg_cron`. For each task or
event whose reminder time has arrived, it sends one Telegram message through `pg_net` and records that
it did. It skips finished tasks, and it marks any reminder more than 30 minutes late as missed instead
of sending it.

The morning summary goes out once a day, within two hours after the chosen time, in the time zone saved
on your profile. The app updates that time zone to match whichever device you open it on.

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

Before committing, check that types, lint and the production build pass:

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run build
```

## Good to know

Supabase pauses a free project after a week with no activity. Using the app keeps it awake. If it does
pause, press Restore in the Supabase dashboard.

Every table has row level security, so only your account can read or change your rows. The publishable
key in `.env.production` is meant to be public; it ships inside the app anyway. The secret keys never
leave Supabase.

Telegram messages contain task and event titles, so they pass through Telegram’s servers. If you track
client or office work here, check your company’s rules on where that information may go.

## Where things are

| Path | What it holds |
|---|---|
| `src/pages/` | Home, Tasks, Notes, Calendar, Links and Settings |
| `src/components/` | The task and event dialogs, the day ruler, charts, the notes editor |
| `src/lib/queries.ts` | Every read and write to the database |
| `supabase/migrations/` | Tables, access rules, the Telegram functions and the reminder job |
| `DESIGN.md` | Colors, type and motion, with the reason for each choice |
| `anti-slop/` | The design and accessibility checklist the first version was tested against |
