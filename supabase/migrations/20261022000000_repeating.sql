-- Repeating tasks and events (v1.11).
--
-- A task repeats when you finish it: the database adds the next one, due on the next day its rule
-- allows that is still ahead, at the same time of day, with its reminder the same distance before.
-- Unticking the finished task takes that next one back, unless it has been finished too.
--
-- An event repeats as a series. The app writes each occurrence as an ordinary row, about three
-- months ahead, and adds more as time passes, so the calendar, reminders and Tracky need nothing new
-- to show them. event_series holds the rule and how far the series has been written, so an
-- occurrence you delete isn't written again.

create type public.repeat_rule as enum ('daily', 'weekdays', 'weekly', 'monthly', 'yearly');

alter table public.tasks
  add column repeat public.repeat_rule,
  -- The task added when this one was finished, so unticking can take it back. Not a foreign key:
  -- a restored backup may point at a task that no longer exists, which does no harm.
  add column repeat_next uuid;

create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  repeat public.repeat_rule not null,
  -- The first occurrence's start. Every later one is counted from it, so a monthly event on the
  -- 31st comes back to the 31st after a shorter month.
  anchor timestamptz not null,
  -- The start of the last occurrence written so far.
  written_until timestamptz not null,
  -- No occurrence starts at or after this. Null repeats for as long as the series lasts.
  ends_before timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

alter table public.events
  add column series_id uuid,
  add foreign key (series_id, user_id) references public.event_series (id, user_id) on delete set null (series_id);

-- Two devices extending the same series at once write each occurrence only once.
create unique index events_series_start on public.events (series_id, starts_at);

alter table public.event_series enable row level security;
create policy "Owner manages event series" on public.event_series
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.event_series from anon;

create function private.task_repeat()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
  local_due timestamp;
  step interval;
  n integer := 1;
  next_local timestamp;
  next_due timestamptz;
begin
  if new.status = 'done' and old.status <> 'done' and new.repeat is not null and new.due_at is not null
     and new.repeat_next is null then
    select coalesce(p.timezone, 'UTC') into tz from public.profiles p where p.id = new.user_id;
    tz := coalesce(tz, 'UTC');
    local_due := new.due_at at time zone tz;
    step := case new.repeat
      when 'daily' then interval '1 day'
      when 'weekdays' then interval '1 day'
      when 'weekly' then interval '1 week'
      when 'monthly' then interval '1 month'
      else interval '1 year'
    end;
    -- The first occurrence after this deadline that is still ahead: finishing a daily task three days
    -- late doesn't leave two more overdue behind it. Counting from this deadline keeps a monthly task
    -- on its day of the month within one step.
    loop
      next_local := local_due + step * n;
      if new.repeat = 'weekdays' and extract(isodow from next_local) > 5 then
        n := n + 1;
        continue;
      end if;
      exit when (next_local at time zone tz) > now();
      n := n + 1;
    end loop;
    next_due := next_local at time zone tz;

    insert into public.tasks (user_id, project_id, title, priority, due_at, remind_at, show_on_calendar, links, notes, notes_text, repeat)
    values (
      new.user_id, new.project_id, new.title, new.priority, next_due,
      case when new.remind_at is null then null else next_due - (new.due_at - new.remind_at) end,
      new.show_on_calendar, new.links, new.notes, new.notes_text, new.repeat
    )
    returning id into new.repeat_next;
  elsif old.status = 'done' and new.status <> 'done' and old.repeat_next is not null then
    delete from public.tasks t where t.id = old.repeat_next and t.user_id = new.user_id and t.status <> 'done';
    new.repeat_next := null;
  end if;
  return new;
end;
$$;

create trigger tasks_repeat before update of status on public.tasks
  for each row execute function private.task_repeat();
