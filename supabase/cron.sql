-- Run this ONCE, after deploying the send-reminders Edge Function, via the
-- Supabase Dashboard SQL editor. Requires the pg_cron and pg_net extensions
-- (Dashboard -> Database -> Extensions -> enable both, or run the two
-- `create extension` lines below first).
--
-- Project ref (yyxisjdkfdpcxjjthqsw) already filled in below.
--
-- This deploys the function with `supabase functions deploy send-reminders
-- --no-verify-jwt` (see supabase/README.md), so no Authorization header is
-- needed here — the function takes no per-caller input and does the same
-- fixed job for any invocation.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-reminders-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://yyxisjdkfdpcxjjthqsw.functions.supabase.co/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To check it's running: select * from cron.job;
-- To check recent invocation results: select * from cron.job_run_details order by start_time desc limit 20;
-- To remove it later: select cron.unschedule('send-reminders-every-5-min');
