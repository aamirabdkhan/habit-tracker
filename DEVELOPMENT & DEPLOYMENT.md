# DEVELOPMENT & DEPLOYMENT

Deployment map for the Habit Tracker (Waqt). Written for the from-scratch redesign so
surface/UX work never disturbs the live pipeline or the sync backend.
**Do not modify anything documented here as part of the redesign unless explicitly instructed.**

## Stack

- Zero-dependency vanilla HTML/CSS/JS. No build step, no package manager, no bundler.
- Offline-first PWA. LocalStorage is the source of truth; Supabase is optional cloud sync layered on top.
- Front end: `index.html` + `css/*` + `js/*` (`app.js`, `waqt.js`, `supabase-sync.js`, `push-client.js`, `manifest.js`) + `sw.js`.

## Git

- Remote: `origin` → https://github.com/aamirabdkhan/habit-tracker.git
- **Production branch: `main`.**
- **Redesign work: branch `redesign`. Owner has said: do NOT push to `main` / do NOT deploy to production until they explicitly say so.** Owner reviews progress off the `redesign` branch.
- Never commit: `sandbox/`, `test-ground.html`, `Bug videos/` (gitignored / local-only).

## Deployment (Vercel)

- Static hosting on Vercel. **Production deploy trigger: push to `main`.** Live at `habit-tracker-aamirabdkhan.vercel.app`.
- `vercel.json`: `cleanUrls`, SPA rewrite (`/(.*)` → `/index.html`), `pehar-widget.js` served `no-store`, and a strict **CSP**.
- **CSP gotcha:** any new external script / font / API / websocket origin must be added to the matching `*-src` in `vercel.json` CSP, or it is silently blocked in production (local preview does not enforce headers). Current allowed origins: `cdn.jsdelivr.net`, Google Fonts, `cdnjs.cloudflare.com`, and Supabase (`https://` + `wss://yyxisjdkfdpcxjjthqsw.supabase.co`).

## Supabase backend (production-sensitive — do NOT change for UI work)

- Table `user_data` (`user_id`, `key`, `value` jsonb, `updated_at`). Client syncs arbitrary `ht_*` LocalStorage keys as rows.
- **RLS is required and load-bearing.** The client never filters by user — it relies entirely on RLS policies scoping select/insert/update/delete to `auth.uid() = user_id`. The public anon/publishable key in `supabase-sync.js` is safe **only if** those policies are correct.
- ⚠️ **RLS policies for `user_data` are NOT in `supabase/migrations/`** (only `0001_push_notifications.sql` is). They live hand-configured in the Supabase dashboard — unversioned and untested. **Verify before trusting** (User A must not read/write User B's rows; realtime must not leak cross-user).
- Push: `supabase/functions/send-reminders`, `supabase/cron.sql`, `supabase/widget_feed.sql`, migration `0001_push_notifications.sql`.

## Production-sensitive files & config (do NOT change during the redesign without approval)

| File / symbol | Why sensitive |
|---|---|
| `sw.js` — `const CACHE = 'habit-tracker-v32'` | PWA cache. Bump on every cached-asset change or users get stale files. |
| `js/supabase-sync.js` | Cloud sync + merge logic + hardcoded Supabase creds + RLS dependency. **Contains a known correctness bug — see below.** |
| `vercel.json` | CSP + rewrites + headers. |
| `supabase/**` | DB functions, cron, migrations, widget feed. |
| `js/manifest.js` | Builds PWA manifest as a runtime Blob URL. |
| `js/push-client.js` | Web-push subscription flow. |

## Known correctness bug (P0 for the redesign — the analysis USP depends on truthful data)

`mergeData()` in `supabase-sync.js` OR-merges every boolean field (habits, prayers, takbeer, extra, health, water):
```js
result.habits[k] = !!(result.habits[k] || remote.habits[k]);
```
Effect: a checkbox can only ever flip **ON** across devices, never **off**. Un-checking on one device is silently reverted by the next sync from another device. This corrupts exactly the daily-completion data the "analyze my activities" redesign is built on. Fix before/with the redesign.

## Local run

```bash
npx -y serve -l 5177 .
# or: python3 -m http.server 5177
```
Do NOT open via `file://` — Supabase auth/sync and the service worker need a real origin.
Sandbox re-sync (never commit sandbox): `bash sync-sandbox.sh`.
