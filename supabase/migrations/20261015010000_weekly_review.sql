-- Weekly review on Telegram: once a week, on the day and time the owner picks, a message with what
-- was finished this week, which deadlines slipped, and what is due next week. Off by default.

alter table public.profiles
  add column weekly_enabled boolean not null default false,
  add column weekly_day smallint not null default 5 check (weekly_day between 1 and 7), -- ISO: 1 = Monday
  add column weekly_time time not null default '17:00',
  add column last_weekly_on date;

grant update (weekly_enabled, weekly_day, weekly_time) on public.profiles to authenticated;

create function private.dispatch_weekly_reviews()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_local_now timestamp;
  v_today date;
  v_week_start date;
  v_week_end date; -- exclusive: the following Monday
  v_count integer;
  v_lines text;
  v_text text;
begin
  for r in
    select p.id, p.telegram_chat_id, p.timezone, p.weekly_day, p.weekly_time, p.last_weekly_on
      from public.profiles p
     where p.weekly_enabled and p.telegram_chat_id is not null
  loop
    begin
      v_local_now := now() at time zone r.timezone;
      v_today := v_local_now::date;
      continue when extract(isodow from v_local_now)::int <> r.weekly_day;
      continue when r.last_weekly_on is not null and r.last_weekly_on >= v_today;
      continue when v_local_now::time < r.weekly_time
                 or v_local_now::time > r.weekly_time + interval '2 hours';

      v_week_start := date_trunc('week', v_local_now)::date;
      v_week_end := v_week_start + 7;
      v_text := 'Your week, ' || to_char(v_week_start, 'FMDD Mon') || ' to ' || to_char(v_week_end - 1, 'FMDD Mon');

      select count(*) into v_count
        from public.tasks t
       where t.user_id = r.id
         and (t.completed_at at time zone r.timezone) >= v_week_start
         and (t.completed_at at time zone r.timezone) < v_week_end;
      select string_agg('- ' || s.title, E'\n') into v_lines
        from (select t.title
                from public.tasks t
               where t.user_id = r.id
                 and (t.completed_at at time zone r.timezone) >= v_week_start
                 and (t.completed_at at time zone r.timezone) < v_week_end
               order by t.completed_at
               limit 8) s;
      v_text := v_text || E'\n\nFinished: ' || v_count || coalesce(E'\n' || v_lines, '');

      -- A deadline slipped if it fell this week, has passed, and the task wasn't done in time.
      select count(*) into v_count
        from public.tasks t
       where t.user_id = r.id
         and (t.due_at at time zone r.timezone) >= v_week_start
         and t.due_at < now()
         and (t.status <> 'done' or t.completed_at > t.due_at);
      select string_agg(s.line, E'\n') into v_lines
        from (select '- ' || t.title || case when t.status = 'done' then ' (done late)' else ' (still open)' end as line
                from public.tasks t
               where t.user_id = r.id
                 and (t.due_at at time zone r.timezone) >= v_week_start
                 and t.due_at < now()
                 and (t.status <> 'done' or t.completed_at > t.due_at)
               order by t.due_at
               limit 8) s;
      v_text := v_text || E'\n\nSlipped: ' || v_count || coalesce(E'\n' || v_lines, '');

      select string_agg(s.line, E'\n' order by s.at) into v_lines
        from (
          select t.due_at as at, '- ' || to_char(t.due_at at time zone r.timezone, 'Dy') || '  ' || t.title as line
            from public.tasks t
           where t.user_id = r.id and t.status <> 'done'
             and (t.due_at at time zone r.timezone) >= v_week_end
             and (t.due_at at time zone r.timezone) < v_week_end + 7
          union all
          select e.starts_at, '- ' || to_char(e.starts_at at time zone r.timezone, 'Dy') || '  ' || e.title
            from public.events e
           where e.user_id = r.id
             and (e.starts_at at time zone r.timezone) >= v_week_end
             and (e.starts_at at time zone r.timezone) < v_week_end + 7
          order by 1
          limit 10
        ) s;
      v_text := v_text || E'\n\nNext week' || E'\n' || coalesce(v_lines, '- Nothing scheduled yet');

      perform private.telegram_send(r.telegram_chat_id, v_text);
      update public.profiles set last_weekly_on = v_today where id = r.id;
    exception when others then
      raise warning 'weekly review for % failed: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

revoke execute on function private.dispatch_weekly_reviews() from public, anon, authenticated;

select cron.schedule('dispatch-weekly-reviews', '*/5 * * * *', 'select private.dispatch_weekly_reviews()');
