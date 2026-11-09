# Redesign 2 — Wave 1 Implementation Plan (AI planner + reminders)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the "Set up with AI" prompt into an interview-style planner and fix the reminder system so deleted cards stop pinging, notifications read with real names, and reminders can be managed in Settings.

**Architecture:** All client work is in the existing single-render-string, `data-a`-delegation PWA (`js/waqt.js`, `js/push-client.js`, `css/waqt.css`). One change is server-side in the Supabase edge function `supabase/functions/send-reminders/index.ts`. No framework, no bundler.

**Tech Stack:** Vanilla JS (ES5-style, `var`), Supabase (`user_data`, `reminder_times`, `push_subscriptions`), Deno edge function, Scriptable (unaffected this wave).

**Spec:** `docs/superpowers/specs/2026-11-09-waqt-redesign-2-design.md`

## Global Constraints

- **Prayers on/off is first-class.** No code may assume prayers exist; `prayersOn()` gates all prayer references.
- **Branch:** everything lands on `redesign` first; merge to `main` only after on-device verify.
- **Storage split:** `htn_*` keys are device-local (never synced); `ht_*` keys sync. `reminder_times` is a Supabase table, separate from both.
- **No test framework.** "Tests" are `_*SelfCheck()` functions gated on `location.hash` (run in the browser console/page), `node -c <file>` for syntax, and in-browser verification via a local `python3 -m http.server`. Follow the existing self-check idiom in `js/waqt.js` (search `function _cardsSelfCheck`).
- **Cache/version bumps:** any change to `js/*.js` or `css/*.css` requires bumping that file's `?v=` in `index.html` AND `CACHE` in `sw.js`. The edge function deploys separately (`supabase functions deploy send-reminders`) and is NOT cached.
- **Attribution:** commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Review Focus

- **Custom-card reminder body** — a reminder for a `c_*` card currently shows `c_8ivntv: Surah Rahman`; a person expects the card's real name. (Task 3 test.)
- **Deleting a card with multiple items** — every item's reminder must be torn down, not just the first. (Task 2 test.)
- **Orphan sweep false-positive** — the sweep must never delete a `reminder_times` row for an item that still exists (base-card items in `ht_d`, custom in the item store, prayers). (Task 2 test.)
- **Prayers OFF** — the AI prompt must emit clock-time instructions with zero prayer references when prayers are off. (Task 1 test.)
- **Edit-reminders with none / signed out** — the Settings section must render a clean empty/"connect sync" state, not crash or show a blank box. (Task 4 test.)

---

### Task 1: Rewrite `importPrompt()` into an interactive planner

**Files:**
- Modify: `js/waqt.js` (`function importPrompt()`, ~line 1366; its only caller is `copyImportPrompt()`)
- Test: extend the import self-check in `js/waqt.js` (search `_importSelfCheck` / `_parseSelfCheck`) — add a `_aiPromptSelfCheck()` gated on `location.hash === "#aipromptcheck"`.

**Interfaces:**
- Consumes: `prayersOn()`, `cleanScheduleSnapshot()` (unchanged — still embeds the current profile).
- Produces: `importPrompt()` returns the new prompt string. **The emitted JSON schema is unchanged** (`{version, prayers?, notes, cards:[{name,items:[{name,time,duration,days,note}]}], reminders:[{name,every,unit}|{name,date}]}`) so `parseImportSchedule`/`buildImportPreview`/`applyImportSchedule` keep working untouched.

- [ ] **Step 1: Write the failing self-check.** Add `_aiPromptSelfCheck()` with asserts: (a) with `prayersOn()` true the prompt contains an interview instruction to ask about fixed anchors, study blocks by name, micro-habits, and reminders; (b) it instructs reminders are **opt-in** (contains a phrase like "only add reminders the user explicitly asks for"); (c) it still contains the `OUTPUT FORMAT:` schema marker and `Return JSON only`; (d) when prayers are off (temporarily `setPrayersOn(false)`), the prompt contains **no** `Fajr`/`after Fajr`/`prayer` anchoring text; restore prayer state after.
- [ ] **Step 2: Run it to verify it fails.** Load the app at `http://localhost:<port>/#aipromptcheck`, open console, call `_aiPromptSelfCheck()`. Expected: assertion failures (new prompt text not present yet).
- [ ] **Step 3: Rewrite `importPrompt()`.** Keep the "copy → paste into your AI → paste reply back" mechanism. New prompt instructs the AI to (1) read the embedded profile, (2) run a **short interview (~4–6 questions)** in order: fixed anchors (prayers when on; weekly classes/physio with their days) → study/work blocks **by real name, never "Study"** → small post-prayer/fixed micro-habits → "do you want reminders, and for which items?" (default none) → (3) then emit the JSON. Keep the existing rules (one activity = one item with `days:[...]`, no renaming, prayer-split math when prayers on). Preserve the prayers-on/off branch: when off, no prayer anchoring, clock times only; the `reminders` array stays empty unless the user asked. Keep a one-line fallback note so a user who just pastes their day still gets output.
- [ ] **Step 4: Verify the self-check passes** and the existing import checks still pass: call `_aiPromptSelfCheck()`, then `_importSelfCheck()`, `_importTabSelfCheck()`, `_parseSelfCheck()` — all must report no failures (the schema/parser is unchanged).
- [ ] **Step 5: Bump + commit.** Bump `js/waqt.js?v=` in `index.html` and `CACHE` in `sw.js`. `node -c js/waqt.js`. Commit.

---

### Task 2: `deleteCard` tears down reminders + load-time orphan sweep

**Files:**
- Modify: `js/waqt.js` (`function deleteCard(id)`, ~line 660)
- Modify: `js/push-client.js` (add `pushCleanupOrphanReminders()`)
- Modify: `js/supabase-sync.js` (call the sweep once after a successful `syncDown()`)
- Test: add `_reminderTeardownSelfCheck()` in `js/waqt.js` gated on `location.hash === "#remindercleanupcheck"`.

**Interfaces:**
- Consumes: `getCardItemsStore()`, `itemName()`, `removeCardItem(cardId, name)` (already clears time/days/slots/bell/optional + the `reminder_times` row via `setNotifTime(...,"")`→`pushSaveReminderTime(...,"")`), `cardTemplateArr(field)`, `prayersOn()`, `PRAYERS`, `getNotifTimesMap()`.
- Produces: `deleteCard` now cancels every deleted item's reminders. `pushCleanupOrphanReminders()` (in `push-client.js`): selects the user's `reminder_times`, and for each row whose `field::name` no longer maps to a live item/prayer, deletes that row via `pushSaveReminderTime(field, name, "")`.

- [ ] **Step 1: Write the failing self-check.** `_reminderTeardownSelfCheck()`: create a custom card with two timed items; spy/stub `pushSaveReminderTime` to record `(field,name,time)` calls; call `deleteCard(id)`; assert `pushSaveReminderTime` was called with `""` for **both** item names and that their `htn_times` keys are gone. Second assert (orphan guard): seed `htn_times` with one key for a still-existing item and one for a deleted-item name; run the orphan predicate used by `pushCleanupOrphanReminders` and assert it flags only the deleted one. Restore stubs/state.
- [ ] **Step 2: Run it to verify it fails** (`#remindercleanupcheck`): deleting a card does not currently clear item reminders → asserts fail.
- [ ] **Step 3: Implement teardown in `deleteCard`.** Before removing the card from the store, read its items (`getCardItemsStore()[id]`) and call `removeCardItem(id, itemName(it))` for each (this runs the full per-item teardown, including the `reminder_times` delete), then proceed with the existing card removal. Base cards are already refused, so only custom-card items are involved.
- [ ] **Step 4: Implement `pushCleanupOrphanReminders()`** in `push-client.js`: `select('field,name').eq('user_id', currentUser.id)` from `reminder_times`; for each, keep it only if it maps to a live item — `field==="prayers"` and `PRAYERS.concat(trackedVoluntaryPrayers())` includes `name`, OR `field` is a current card id and `cardTemplateArr(field)` contains `name`; otherwise `pushSaveReminderTime(field, name, "")`. Call it once from `js/supabase-sync.js` right after `syncDown()` resolves (template is current by then). Guard: no-op if `!currentUser`.
- [ ] **Step 5: Verify** the self-check passes; manually in-browser, create → delete a timed custom card and confirm (console) no matching `htn_times` key remains.
- [ ] **Step 6: Bump + commit** (`waqt.js?v=`, `push-client.js?v=` if it carries one, `supabase-sync.js?v=`, `CACHE`). `node -c` all three. Commit.

---

### Task 3: Edge function uses the card's real name in the notification body

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts` (body construction, lines 24–29 and 121–126)

**Interfaces:**
- Consumes: the existing per-user `user_data` fetch (already pulls `ht_reminders`; widen it to also pull `ht_cards`).
- Produces: notification `body` = `<card display name>: <item name>` for custom cards; base cards keep their `FIELD_LABELS`; prayers keep "Prayer".

- [ ] **Step 1: Capture current behavior.** Note the bug: `FIELD_LABELS[reminder.field] || reminder.field` → for a `c_*` field there is no label, so the raw id prints. (No local Deno test harness; verification is by reading + `deno check`.)
- [ ] **Step 2: Fetch card names.** Change the `user_data` query (line ~79) to `.in("key", ["ht_reminders", "ht_cards"])`; build a per-user `Map<cardId, name>` from each user's `ht_cards` value (`[{id,name,...}]`).
- [ ] **Step 3: Resolve the label.** Replace the body expression with a helper `cardLabel(field, cardMap)` = `FIELD_LABELS[field] ?? cardMap.get(field) ?? field`. Use it in the `reminder_times` payload body (line ~123). Custom-reminder body (line ~167) is unchanged.
- [ ] **Step 4: Verify.** Run `deno check supabase/functions/send-reminders/index.ts` if Deno is available; otherwise read the diff and confirm types. Note in the commit that this requires `supabase functions deploy send-reminders` to take effect (not covered by the PWA cache bump).
- [ ] **Step 5: Commit.**

---

### Task 4: Manage reminders in Settings

**Files:**
- Modify: `js/waqt.js` (`rPrefs()` — add a "Reminders" collapsible section near the existing settings groups; add `data-a` handlers in the delegator)
- Modify: `css/waqt.css` (rows styling, reuse existing `.sch-*` patterns)
- Test: add `_reminderSettingsSelfCheck()` gated on `location.hash === "#reminderuicheck"`.

**Interfaces:**
- Consumes: `getNotifTimesMap()` (keys `field::name` → `HH:MM`), `getItemBell`, `cardTemplateArr`, `getCardMeta`, `prayersOn()`, `setNotifTime(field,name,time)`, `syncItemReminder(field,name)`.
- Produces: a Settings section listing every active reminder (item/prayer name, its card, time) with: turn-one-off, change-its-time, and a "turn off all reminders" action. Turning off calls the same teardown as deletion (clears the `reminder_times` row) without deleting the item.

- [ ] **Step 1: Write the failing self-check.** `_reminderSettingsSelfCheck()`: with two timed items set, assert `rPrefs()` HTML contains a Reminders section listing both names with their times and an "off" control each, plus a "turn off all" control; with no timed items, assert it renders a muted empty state (not a blank card); when signed out, assert it shows the "connect sync" style note rather than erroring.
- [ ] **Step 2: Run it to verify it fails** (`#reminderuicheck`): section not present yet.
- [ ] **Step 3: Implement the render.** In `rPrefs()`, add a collapsible "Reminders" group (reuse the existing `settOpen/settClose` collapsible helpers). List reminders built from `getNotifTimesMap()` entries that are bell-on timed items, resolving each `field` to its card name; render a time input + an off button per row and a single "Turn off all reminders" button. Empty + signed-out states per the self-check.
- [ ] **Step 4: Wire handlers** in the `#app` delegator: `reminderoff` (data-f/data-k → `setNotifTime(f,k,"")` or bell-off + `syncItemReminder`), `remindertime` (time input change → `setNotifTime` + `syncItemReminder`), `remindersalloff` (confirm, then clear every listed reminder). Each re-renders.
- [ ] **Step 5: Verify** the self-check passes and exercise it in-browser (set a reminder, open Settings → Reminders, change its time, turn it off, confirm it's gone). Run the broad self-check sweep (all `_*SelfCheck`) to confirm no regressions.
- [ ] **Step 6: Bump + commit** (`waqt.js?v=`, `CACHE`). `node -c js/waqt.js`. Commit.

---

## After Wave 1

Push the branch, verify on device (especially: delete a custom card → its reminders stop; a custom-card reminder now shows the card name after the edge function deploys; the AI prompt runs an interview and doesn't spam reminders; Settings → Reminders edits work), then merge to `main` on the user's go. Waves 2–4 get their own plans when reached.
