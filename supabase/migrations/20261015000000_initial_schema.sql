-- Daily Tracker: single-owner schema.
-- Every row belongs to auth.uid(); RLS keeps it that way. Telegram plumbing lives in the
-- `private` schema, which the API never exposes.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.task_status as enum ('todo', 'in_progress', 'waiting', 'done');
create type public.task_priority as enum ('urgent', 'high', 'medium', 'low');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  timezone text not null default 'Asia/Jakarta',
  telegram_chat_id bigint,
  telegram_link_code text,
  telegram_link_request bigint,
  digest_enabled boolean not null default false,
  digest_time time not null default '07:30',
  last_digest_on date,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  due_at timestamptz,
  remind_at timestamptz,
  reminded_at timestamptz,
  show_on_calendar boolean not null default true,
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  notes jsonb,
  notes_text text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite key so a task can only point at a project owned by the same user.
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid,
  title text not null default '' check (char_length(title) <= 200),
  content jsonb,
  content_text text not null default '',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text check (char_length(location) <= 200),
  details text check (char_length(details) <= 4000),
  remind_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create table public.quick_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  url text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table private.app_settings (
  key text primary key,
  value text
);

create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_project_idx on public.tasks (project_id, user_id);
create index tasks_pending_reminder_idx on public.tasks (remind_at) where reminded_at is null;
create index notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index notes_project_idx on public.notes (project_id, user_id);
create index events_user_starts_idx on public.events (user_id, starts_at);
create index events_pending_reminder_idx on public.events (remind_at) where reminded_at is null;
create index projects_user_idx on public.projects (user_id);
create index quick_links_user_idx on public.quick_links (user_id, position);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- One owner per deployment. The first account created (dashboard or API) is the owner;
-- any later sign-up fails here, so a leaked URL can't be used to open a second account.
create function private.enforce_single_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'This tracker already has an owner. Sign-ups are closed.';
  end if;
  return new;
end;
$$;

create trigger enforce_single_owner
  before insert on auth.users
  for each row execute function private.enforce_single_owner();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone;
  end if;
  return new;
end;
$$;

create trigger profiles_validate_timezone
  before insert or update of timezone on public.profiles
  for each row execute function private.validate_timezone();

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The reminder dispatcher only stamps reminded_at; that isn't an edit.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'reminded_at' - 'updated_at') = (to_jsonb(old) - 'reminded_at' - 'updated_at') then
    return new;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_touch before update on public.tasks
  for each row execute function private.touch_updated_at();
create trigger notes_touch before update on public.notes
  for each row execute function private.touch_updated_at();
create trigger events_touch before update on public.events
  for each row execute function private.touch_updated_at();

create function private.task_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;

  if tg_op = 'INSERT' or new.remind_at is distinct from old.remind_at then
    new.reminded_at = null;
  end if;
  return new;
end;
$$;

create trigger tasks_lifecycle before insert or update on public.tasks
  for each row execute function private.task_lifecycle();

create function private.event_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.remind_at is distinct from old.remind_at then
    new.reminded_at = null;
  end if;
  return new;
end;
$$;

create trigger events_lifecycle before insert or update on public.events
  for each row execute function private.event_lifecycle();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.events enable row level security;
alter table public.quick_links enable row level security;

create policy "Owner reads profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Owner updates profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Telegram columns change only through the link functions below.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, timezone, digest_enabled, digest_time) on public.profiles to authenticated;

create policy "Owner manages projects" on public.projects
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner manages tasks" on public.tasks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner manages notes" on public.notes
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner manages events" on public.events
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner manages quick links" on public.quick_links
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.projects, public.tasks, public.notes, public.events, public.quick_links from anon;

-- ---------------------------------------------------------------------------
-- Telegram
-- ---------------------------------------------------------------------------

create function private.telegram_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;
$$;

create function private.telegram_send(p_chat_id bigint, p_text text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := private.telegram_token();
begin
  if v_token is null or p_chat_id is null then
    return null;
  end if;
  return net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', p_chat_id, 'text', p_text, 'disable_web_page_preview', true),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end;
$$;

-- Reads a finished pg_net response; null while the request is still in flight.
create function private.http_result(p_request_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when r.timed_out or r.error_msg is not null then jsonb_build_object('ok', false, 'error', coalesce(r.error_msg, 'timed out'))
    else coalesce(r.content::jsonb, '{}'::jsonb)
  end
  from net._http_response r
  where r.id = p_request_id;
$$;

create function public.telegram_set_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_request bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  p_token := btrim(p_token);
  if p_token !~ '^[0-9]{5,}:[A-Za-z0-9_-]{30,}$' then
    raise exception 'That does not look like a bot token. It should look like 123456789:AA... from @BotFather.';
  end if;

  select id into v_existing from vault.secrets where name = 'telegram_bot_token';
  if v_existing is null then
    perform vault.create_secret(p_token, 'telegram_bot_token', 'Telegram bot token for reminders');
  else
    perform vault.update_secret(v_existing, p_token);
  end if;

  v_request := net.http_get(url := 'https://api.telegram.org/bot' || p_token || '/getMe');
  insert into private.app_settings (key, value) values ('getme_request', v_request::text)
    on conflict (key) do update set value = excluded.value;
  delete from private.app_settings where key = 'bot_username';
end;
$$;

create function public.telegram_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_username text;
  v_request bigint;
  v_result jsonb;
  v_error text;
begin
  if v_uid is null then
    raise exception 'Sign in first.';
  end if;
  select * into v_profile from public.profiles where id = v_uid;

  select value into v_username from private.app_settings where key = 'bot_username';
  if v_username is null then
    select value::bigint into v_request from private.app_settings where key = 'getme_request';
    if v_request is not null then
      v_result := private.http_result(v_request);
      if v_result is not null then
        if (v_result ->> 'ok')::boolean then
          v_username := v_result -> 'result' ->> 'username';
          insert into private.app_settings (key, value) values ('bot_username', v_username)
            on conflict (key) do update set value = excluded.value;
        else
          v_error := coalesce(v_result ->> 'description', v_result ->> 'error', 'Telegram rejected the token.');
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'bot_configured', private.telegram_token() is not null,
    'bot_username', v_username,
    'bot_error', v_error,
    'linked', v_profile.telegram_chat_id is not null,
    'link_code', v_profile.telegram_link_code
  );
end;
$$;

create function public.telegram_link_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := 'DT-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  update public.profiles
     set telegram_link_code = v_code, telegram_link_request = null
   where id = auth.uid();
  return v_code;
end;
$$;

-- Call repeatedly after the owner has sent the code to the bot. First call asks Telegram for
-- recent messages; later calls read the answer. Returns 'pending', 'linked' or 'not_found'.
create function public.telegram_link_poll()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_token text := private.telegram_token();
  v_result jsonb;
  v_chat_id bigint;
begin
  if v_uid is null then
    raise exception 'Sign in first.';
  end if;
  if v_token is null then
    raise exception 'Save a bot token first.';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.telegram_link_code is null then
    raise exception 'Generate a link code first.';
  end if;

  if v_profile.telegram_link_request is null then
    update public.profiles
       set telegram_link_request = net.http_get(url := 'https://api.telegram.org/bot' || v_token || '/getUpdates')
     where id = v_uid;
    return 'pending';
  end if;

  v_result := private.http_result(v_profile.telegram_link_request);
  if v_result is null then
    return 'pending';
  end if;

  select (u -> 'message' -> 'chat' ->> 'id')::bigint into v_chat_id
    from jsonb_array_elements(coalesce(v_result -> 'result', '[]'::jsonb)) as u
   where u -> 'message' ->> 'text' ilike '%' || v_profile.telegram_link_code || '%'
   order by (u ->> 'update_id')::bigint desc
   limit 1;

  if v_chat_id is null then
    update public.profiles set telegram_link_request = null where id = v_uid;
    return 'not_found';
  end if;

  update public.profiles
     set telegram_chat_id = v_chat_id, telegram_link_code = null, telegram_link_request = null
   where id = v_uid;
  perform private.telegram_send(v_chat_id, 'Daily Tracker is linked. Reminders will arrive in this chat.');
  return 'linked';
end;
$$;

create function public.telegram_send_test()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat_id bigint;
begin
  select telegram_chat_id into v_chat_id from public.profiles where id = auth.uid();
  if v_chat_id is null then
    raise exception 'Link Telegram first.';
  end if;
  perform private.telegram_send(v_chat_id, 'Test message from Daily Tracker. If you can read this, reminders will reach you.');
end;
$$;

create function public.telegram_unlink()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set telegram_chat_id = null, telegram_link_code = null, telegram_link_request = null
   where id = auth.uid();
$$;

revoke execute on function
  public.telegram_set_token(text),
  public.telegram_status(),
  public.telegram_link_code(),
  public.telegram_link_poll(),
  public.telegram_send_test(),
  public.telegram_unlink()
from public, anon;

grant execute on function
  public.telegram_set_token(text),
  public.telegram_status(),
  public.telegram_link_code(),
  public.telegram_link_poll(),
  public.telegram_send_test(),
  public.telegram_unlink()
to authenticated;

-- ---------------------------------------------------------------------------
-- Reminder dispatcher (pg_cron, every minute)
-- ---------------------------------------------------------------------------

create function private.priority_label(p public.task_priority)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'urgent' then 'Urgent'
    when 'high' then 'High'
    when 'medium' then 'Medium'
    else 'Low'
  end;
$$;

create function private.dispatch_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_text text;
  v_local_now timestamp;
  v_today date;
  v_lines text;
begin
  -- A reminder more than 30 minutes late is stale (the owner set it in the past, or the
  -- job was down). Mark it instead of sending a burst of old pings.
  update public.tasks set reminded_at = now()
   where reminded_at is null and remind_at < now() - interval '30 minutes';
  update public.events set reminded_at = now()
   where reminded_at is null and remind_at < now() - interval '30 minutes';

  for r in
    select t.id, t.title, t.due_at, t.priority, p.telegram_chat_id, p.timezone
      from public.tasks t
      join public.profiles p on p.id = t.user_id
     where t.reminded_at is null
       and t.remind_at <= now()
       and t.status <> 'done'
       and p.telegram_chat_id is not null
  loop
    begin
      v_text := 'Reminder: ' || r.title;
      if r.due_at is not null then
        v_text := v_text || E'\nDue ' || to_char(r.due_at at time zone r.timezone, 'Dy DD Mon, HH24:MI');
      end if;
      v_text := v_text || E'\n' || private.priority_label(r.priority) || ' priority';
      perform private.telegram_send(r.telegram_chat_id, v_text);
      update public.tasks set reminded_at = now() where id = r.id;
    exception when others then
      raise warning 'task reminder % failed: %', r.id, sqlerrm;
    end;
  end loop;

  for r in
    select e.id, e.title, e.starts_at, e.all_day, e.location, p.telegram_chat_id, p.timezone
      from public.events e
      join public.profiles p on p.id = e.user_id
     where e.reminded_at is null
       and e.remind_at <= now()
       and p.telegram_chat_id is not null
  loop
    begin
      v_text := 'Coming up: ' || r.title || E'\n'
        || case when r.all_day then to_char(r.starts_at at time zone r.timezone, 'Dy DD Mon') || ', all day'
                else to_char(r.starts_at at time zone r.timezone, 'Dy DD Mon, HH24:MI') end;
      if r.location is not null and r.location <> '' then
        v_text := v_text || E'\n' || r.location;
      end if;
      perform private.telegram_send(r.telegram_chat_id, v_text);
      update public.events set reminded_at = now() where id = r.id;
    exception when others then
      raise warning 'event reminder % failed: %', r.id, sqlerrm;
    end;
  end loop;

  -- Morning digest: sent once a day, within two hours after the chosen time.
  for r in
    select p.id, p.telegram_chat_id, p.timezone, p.digest_time, p.last_digest_on
      from public.profiles p
     where p.digest_enabled and p.telegram_chat_id is not null
  loop
    begin
      v_local_now := now() at time zone r.timezone;
      v_today := v_local_now::date;
      continue when r.last_digest_on is not null and r.last_digest_on >= v_today;
      continue when v_local_now::time < r.digest_time
                 or v_local_now::time > r.digest_time + interval '2 hours';

      v_text := 'Today, ' || to_char(v_local_now, 'FMDay DD Mon');

      select string_agg('- ' || to_char(t.due_at at time zone r.timezone, 'Dy DD Mon') || '  ' || t.title, E'\n' order by t.due_at)
        into v_lines
        from public.tasks t
       where t.user_id = r.id and t.status <> 'done' and (t.due_at at time zone r.timezone)::date < v_today;
      if v_lines is not null then
        v_text := v_text || E'\n\nOverdue\n' || v_lines;
      end if;

      select string_agg('- ' || to_char(t.due_at at time zone r.timezone, 'HH24:MI') || '  ' || t.title
               || '  (' || private.priority_label(t.priority) || ')', E'\n' order by t.due_at)
        into v_lines
        from public.tasks t
       where t.user_id = r.id and t.status <> 'done' and (t.due_at at time zone r.timezone)::date = v_today;
      v_text := v_text || E'\n\nDue today\n' || coalesce(v_lines, '- Nothing due today');

      select string_agg('- ' || case when e.all_day then 'All day' else to_char(e.starts_at at time zone r.timezone, 'HH24:MI') end
               || '  ' || e.title, E'\n' order by e.all_day desc, e.starts_at)
        into v_lines
        from public.events e
       where e.user_id = r.id and (e.starts_at at time zone r.timezone)::date = v_today;
      if v_lines is not null then
        v_text := v_text || E'\n\nEvents\n' || v_lines;
      end if;

      perform private.telegram_send(r.telegram_chat_id, v_text);
      update public.profiles set last_digest_on = v_today where id = r.id;
    exception when others then
      raise warning 'digest for % failed: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;

select cron.schedule('dispatch-reminders', '* * * * *', 'select private.dispatch_reminders()');
