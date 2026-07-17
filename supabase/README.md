# Web Push notifications — setup checklist

All the code (SQL migration, Edge Function, service worker, client JS) is
already written and committed. The steps below are things only you can do,
since they need access to your own Supabase project and generate a secret
that must never live in this repo.

## 1. Log in to the Supabase CLI

A global `npm install -g supabase` needs root in this environment — skip it
and just use `npx`, which works without any install (verified):

```bash
npx supabase login
npx supabase init          # safe to run even though this folder already exists
npx supabase link --project-ref yyxisjdkfdpcxjjthqsw
```

## 2. VAPID keys — already generated

Done already (`js/push-client.js` already has the real public key committed).
You still need to set the private key as a secret yourself — it was shown to
you in chat once and should not be pasted anywhere else. If you've lost it,
just regenerate a fresh pair with `npx web-push generate-vapid-keys` and
update `VAPID_PUBLIC_KEY` in `js/push-client.js` to match.

## 3. Set the private key + subject as Edge Function secrets

```bash
npx supabase secrets set VAPID_PRIVATE_KEY="<your private key>"
npx supabase secrets set VAPID_SUBJECT="mailto:linuxaamir@gmail.com"
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available
to every Edge Function — no need to set those yourself.)

## 4. Run the SQL migration

Either:

```bash
npx supabase db push
```

or paste the contents of `supabase/migrations/0001_push_notifications.sql`
into the Supabase Dashboard's SQL Editor and run it. This creates the
`push_subscriptions`, `reminder_times`, and `reminder_sent_log` tables with
the same row-level-security pattern as the existing `user_data` table.

## 5. Deploy the Edge Function

```bash
npx supabase functions deploy send-reminders --no-verify-jwt
```

`--no-verify-jwt` is used because the cron job calling this function has no
per-user identity — it does the same fixed job (check everyone's reminders)
on every invocation.

## 6. Schedule it

Open `supabase/cron.sql` (the project ref is already filled in) and run the
whole file once in the Dashboard SQL Editor. This enables the `pg_cron`/
`pg_net` extensions and schedules the function to run every 5 minutes.

## 7. Deploy the site and refresh

Push/deploy as usual (Vercel will pick up the `js/push-client.js` change and
the bumped `sw.js` cache version automatically). Reload the site once on
each device afterward so the updated service worker takes over.

## 8. Enable notifications on each device

1. Log into Cloud Sync (Settings → Connect Cloud Sync) — a push subscription
   needs an account to be associated with.
2. **On iPhone only**: Share → "Add to Home Screen", then open the app from
   the home screen icon, not from a regular Safari tab — this is an iOS
   requirement, not something we can work around.
3. Go to Settings → "Enable Notifications" and allow the permission prompt.
4. Set a reminder time on any item.
5. To fully test: set a time a few minutes out, close the app/browser
   completely, and confirm the notification arrives and tapping it opens the
   app to that item, briefly highlighted.

## Troubleshooting

- `select * from cron.job;` — confirms the schedule exists.
- `select * from cron.job_run_details order by start_time desc limit 20;` —
  shows recent invocation results/errors.
- Supabase Dashboard → Edge Functions → `send-reminders` → Logs — shows
  `console.error` output from the function itself (e.g. push send failures).
- Chrome DevTools → Application → Service Workers → "Push" lets you send a
  synthetic push payload to test the `push`/`notificationclick` handlers in
  `sw.js` without waiting for the real cron.
