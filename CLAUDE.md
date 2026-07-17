# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There is no build step, package manager, linter, or test suite — this is a zero-dependency vanilla HTML/CSS/JS static site. There is nothing to `npm install` or compile.

**Local preview**: serve the directory with any static file server, e.g.:
```bash
python3 -m http.server 5177
```
Do not open `index.html` via `file://` — Supabase auth/sync and the service worker require a real origin.

**Sandbox re-sync**: `sandbox/` is a local-only playground that mirrors production for feature prototyping. Before starting new feature work there, run:
```bash
bash sync-sandbox.sh
```
This re-copies `index.html`, `css/style.css`, `js/app.js`, and `js/manifest.js` from production into `sandbox/`, and re-copies `js/supabase-sync.js` while forcing the Supabase credentials back to placeholders (so sandbox testing can never write to the real database). It also strips the service-worker registration from the sandbox's `js/app.js` copy. Both `sandbox/` and `test-ground.html` are gitignored — never commit or push either.

## Architecture

Full deep-dive documentation lives in `info/*.md` (architecture, data schema/sync, features/UI, keyboard shortcuts, test-ground). Read those before making non-trivial changes. Summary of what matters most when editing:

**Single-file render loop, no framework.** `js/app.js` holds all state in a few globals (`view`, `cDate`, `cData`, `oMonth`). Any state change calls `render()`, which builds one big HTML string for the current `view` ("daily" | "overview" | "settings") and replaces `#content` via `innerHTML`. There's no virtual DOM/diffing — for perf-sensitive interactions (checking a habit, water glass, etc.) there are hand-written partial-update functions (`uHP`, `uEP`, `uWP`, `uHL`, `uWD`, `reHL`, `reEX`, `reRL`, `reWT`, `reGL`) that patch specific DOM nodes instead of a full re-render. When adding a new toggleable module, follow this same pattern (full render function + a partial updater) rather than introducing new state-management machinery.

**Event delegation via `data-a`.** All clicks/keydowns/inputs are handled by listeners attached once to `#app` in `js/app.js` (not per-element listeners). Interactive elements carry `data-a="<action>"` plus supporting `data-f`/`data-k`/`data-i`/`data-n` attributes; the delegator reads `e.target.closest("[data-a]")` and dispatches on `t.dataset.a`. New interactive elements must follow this convention — don't attach ad-hoc `addEventListener` calls to individual rendered nodes, since they get destroyed and recreated on every full render.

**Escaping convention.** Every user-supplied string interpolated into an HTML string must go through `esc()` (text content) or `esA()` (attribute context) before concatenation — these are the only XSS defense in a codebase with no framework auto-escaping. This was previously missed in one spot (`greet()`'s OAuth display name); don't reintroduce that class of bug when adding new render functions.

**Data model.** LocalStorage is the source of truth, offline-first:
- `ht_d` — global template/settings object (habit/extra/health-lifestyle lists, reading titles, water target).
- `ht_[YYYY-MM-DD]` — one record per day (habits, prayers, extra, reading, water, weight, health, goalRef, reflections).
- `gDef()` reads/normalizes `ht_d`; `gDay(key)` reads/normalizes a given day, backfilling any template items missing from that day's record. Always go through these accessors rather than reading `localStorage` directly, since they handle schema migration and defaults.
- A one-time v3 migration (gated on `ht_migrated_v3`) strips deprecated seed habits — see `gDef()` in `js/app.js` and `data_schema.md` if touching migration logic.

**Supabase sync (`js/supabase-sync.js`).** Optional cloud sync layered on top of LocalStorage: on auth state change it upserts/downloads rows in the `user_data` table (`user_id`, `key`, `value` jsonb, `updated_at`) and subscribes to Postgres realtime changes filtered by `user_id`. Conflict resolution is deterministic and field-specific (`mergeTemplate`/`mergeData`): checkboxes OR together, reading pages take the max, weight prefers local-if-set. **Row Level Security is required** on `user_data` (policies scoping all of select/insert/update/delete to `auth.uid() = user_id`) — the client never filters by user itself, it relies entirely on RLS, so any schema change to this table must preserve those policies.

**PWA shell.** `sw.js` (stale-while-revalidate cache, versioned via `CACHE` const — bump on any cached-asset change) and `js/manifest.js` (builds the web app manifest as a Blob URL at runtime, avoiding a separate manifest file/icon assets) are both production-only; the sandbox intentionally omits the service worker.

**Deployment.** Static hosting on Vercel (`vercel.json`): SPA fallback rewrite to `index.html`, plus security headers including a CSP. If you add a new external script/font/API origin, you must also add it to the CSP `connect-src`/`script-src`/`style-src`/`font-src` in `vercel.json` or it will be silently blocked in production despite working in local preview (which doesn't enforce these headers).

**`test-ground.html`** is a separate, gitignored, user-owned experimentation file (not `sandbox/`) that overrides `render()`/`rSettings()` at runtime to prototype a modular/reorderable dashboard layout — see `info/test_ground.md` for how the override pattern works if extending it.
