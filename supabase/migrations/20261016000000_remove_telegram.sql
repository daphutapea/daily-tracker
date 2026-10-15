-- Telegram is removed. Reminders and the morning and weekly summaries now come from the Mac app as
-- notifications, and through an Apple Calendar to an iPhone. No chat was ever linked and no bot
-- token stored, so nothing is lost. The summary settings on profiles stay: the Mac app uses them.

select cron.unschedule(jobid) from cron.job where jobname in ('dispatch-reminders', 'dispatch-weekly-reviews');

drop function if exists private.dispatch_reminders();
drop function if exists private.dispatch_weekly_reviews();
drop function if exists public.telegram_set_token(text);
drop function if exists public.telegram_status();
drop function if exists public.telegram_link_code();
drop function if exists public.telegram_link_poll();
drop function if exists public.telegram_send_test();
drop function if exists public.telegram_unlink();
drop function if exists private.telegram_send(bigint, text);
drop function if exists private.telegram_token();
drop function if exists private.http_result(bigint);

delete from vault.secrets where name = 'telegram_bot_token';

alter table public.profiles
  drop column telegram_chat_id,
  drop column telegram_link_code,
  drop column telegram_link_request,
  drop column last_digest_on,
  drop column last_weekly_on;
