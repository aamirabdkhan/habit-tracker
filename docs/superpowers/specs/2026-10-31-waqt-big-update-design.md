# Waqt — Big Update (tab-bar shell, slots, widgets, reminders, voluntary & carry-over)

**Date:** 2026-10-31
**Status:** Design — locked in brainstorming, awaiting user review of this written spec.
**Scope source:** `Downloads/Habit trackerrr.pdf` (10 demands) + live-app review + widget/design brainstorm.
**Shipping:** One combined update, built and shipped together.
**Branch rule:** All work on a dedicated branch, never `main`, until the user accepts it.
**Design philosophy:** Preserve the current live look exactly (dark/gold/serif "Quiet Precision"). This is NOT a visual rebuild — it adds a bottom tab bar and features inside the existing shell.

## In scope (9) / deferred (1)
- In: #1 stats widget, #2 Pehar-widget polish, #3 multi-time items, #4 on-Pehar declutter, #5 voluntary items, #6 bottom-tab-bar shell, #7 priority carry-over, #9 heatmap-for-daily-only, #10 custom reminders.
- Deferred: #8 Eisenhower matrix (user: skip this release).

## Authoritative palette (captured from the running app — do not alter)
`--bg:#0C0C0C` · surfaces `#131313`/`#1A1A1A` · lines `#2A2725` · text `#E8E2D9` · muted `#7A756E` · gold `--ac:#C9943E` (hover `#DBA84E`, tint `rgba(201,148,62,.12)`) · ok `#4A8C5C` · danger `#B84C4C` · category: prayer/sage `#7B9E6B`, weight/blue `#5A8FA8`, health/copper `#B87333`. Pehar time-of-day dots: dawn `#5A8FA8`, noon `#C9943E`, afternoon `#DBA84E`, dusk `#B87333`, night `#7B9E6B`. Fonts: DM Serif Display (big headers), Space Grotesk (body + day name), mono (SF Mono) for labels/times. No emoji anywhere in UI or widgets.

---

## Decisions locked in brainstorming

### Shell / navigation (#6)
- Keep the current live **Today** screen verbatim, with ONE change: **remove the top segment tabs** (`TODAY / OVERVIEW / TEMPLATE`). That navigation moves to a bottom tab bar.
- Add a **bottom tab bar** styled like the user's reference (rounded floating pill, thin monochrome inline-SVG line icons, label under each, active tab = filled rounded-pill highlight). No emoji, no colored glyphs.
- **5 tabs:** Overview · Today · Pehar · Template · Settings.
- **Pehar** becomes its own tab (timed items live and are ticked there; opens scrolled to "now").
- **Settings** holds: notifications, widgets, plus the existing settings (prayers/weight/tracking toggles, Cloud Sync, Import, App/update, Reset).
- The current single-render-string model (`render()` → `#content`) extends to a tab router: `view` gains a tab state; each tab is its own render function. Keep `data-a` delegation and `esc`/`esA` escaping.

### Widgets (4 total — 3 new + 1 fixed; others dropped)
1. **Stats widget** (new, Scriptable medium) — exact replica of the live stats block: gold ring + centred `%`, then one inline row of 5 counts (`x/5 PRAYERS`, `x/N DAILY`, `x/N EXTRA`, `x/N HEALTHY`, `x/N COMMITMENTS`), dashed divider, then `Next: <prayer> · in Hh Mm` with a sage dot. Card hugs content (no dead space). Lock-screen mono accessory variant.
2. **Priority / Overdue widget** (new, medium) — top carried priority tasks, each row = task name + a copper/danger age chip (`4d late`, `2d late`, `today`). Empty state = "All clear".
3. **Next Prayer widget** (new, medium) — big next-prayer name + countdown (`in 2h 28m`) + a row of 5 prayer dots (done = sage fill, next = gold ring, later = muted).
4. **Pehar widget** (existing, fixed) — see #2 below.
- **Dropped:** reminders-due widget, streak widget, up-next/focus widget. (The reminders *feature* stays; it just has no dedicated widget.)

### Data / sync
- Scheduling is currently device-local (`htn_*` keys are not synced). **Fold time/days/duration into the item objects** (via `slots`, below) so schedules sync with the item. Single device today, but fold anyway for correctness.
- All new fields (`slots`, `optional`, priority/carry state, reminders) added to `mergeData`/`mergeTemplate` with the existing last-write-wins (`ht_d_mt`) / OR-merge discipline.
- Extend the published `widget_feed` payload for the stats, priority, and next-prayer widgets + the slots-aware Pehar.

### AI setup (primary path)
- The AI import/setup is extended so plain language sets up **slots, voluntary (`optional`), priority one-time tasks, and reminders** — e.g. "remind me to service the scooty in 3 months", "CEH at 6:25am on weekdays and 8pm weekends", "Tahajjud is optional".

---

## #3 — Multi-time items (`slots` model)

**Data model.** Each item gains `slots` — a list of `{ time: "HH:MM", days?: [weekday] }`.
- One slot = one time on those days; no `days` ⇒ every day.
- Multiple slots ⇒ the task appears at each time (stops the CEH / CEH-2 / CEH-3 duplication).
- Per-weekday ⇒ each slot carries its own `days`.
- `duration` stays per-item (one length for every slot) for v1.
- Legacy items with a single `time`+`days` **auto-migrate** to `slots:[{time,days}]` (gated on a migration flag). A read accessor returns `slots` whether the stored item is legacy or new.

**Completion (per session).** Done is tracked per occurrence: key `card::name::HH:MM` in the day record. Each slot active today renders as its own tickable occurrence on the Pehar.

**Pehar expansion.** `buildTimeline` expands each item into one occurrence per slot whose `days` include today, each with its own `start/end` and the shared duration.

**AI import.** Item schema accepts either legacy `time`/`days` (⇒ one slot) or `slots:[{time,days?}]`:
```json
{ "name": "CEH", "duration": 120, "slots": [
  { "time": "06:25", "days": ["Mon","Tue","Wed","Thu","Fri"] },
  { "time": "20:00", "days": ["Sat","Sun"] }
]}
```
Prompt rule: *"One activity = one item. For several times use `slots:[{time,days?}]`; never duplicate the activity."* The offline "type your day" parser also emits slots when a line lists multiple times.

**Manual editor (secondary).** A "＋ Add time" repeater appends slots (default: every day); a "different days per time" toggle reveals per-slot day-pills.

---

## #4 — On-Pehar declutter (collapsed → pill-rows)

- Cards show **only untimed items** as tick rows.
- For each card with timed items, one slim line at the card foot: **`ON PEHAR · N`** (count), collapsed by default.
- Tap → expands to **pill-rows**: one row per timed item = color bar + name + its time(s) as tappable pills. Tapping a pill scrolls the Pehar to that occurrence and flashes it (reuse `gototimeline`). Second tap collapses.
- Replaces the per-item `sch-tlink` chip wall entirely. Scales to one line regardless of item count; multi-time items show multiple pills on one row.

---

## #2 — Pehar-widget polish (LOCKED design)

- Order **past → now → upcoming**: a few previous/completed items shown above the now item.
- **Completed** items = strike-through + dimmed (only completed get the strike).
- **NOW** item = boxed, gold-accented, bold, with a `NOW` marker — obviously the one happening now.
- **Upcoming** = normal.
- Each row: colored left bar by time-of-day + name + mono time + right tag.
- Renders correctly across the whole day (morning AND evening items), fixing the current bug where evening items never rendered and completed items lingered.
- Home-screen (full color) + lock-screen (monochrome) variants. Bar colors align with the in-app category colors (single source).

---

## #1 — Stats widget (LOCKED design)
As in "Widgets" above: medium Scriptable widget replicating the live stats block exactly (ring + 5 counts + `Next:` line), card hugging content, plus a lock-screen mono variant. App publishes a `stats` payload to the `widget_feed` row (extend the payload; no new table); widget reads by token.

---

## #7 — Priority carry-over (one-time tasks)

- **One-time** items (not template/recurring) gain a **priority** flag at creation (and via AI).
- A priority one-time item **not ticked today carries to the next day**, re-appearing until done or deleted, and **shows its age** (`Nd late`).
- Non-priority one-time items do **not** carry (today-only). Template/recurring items never carry.
- Implementation: a priority one-time item persists a "pending" state across days until completed; day roll-over re-surfaces it and increments its age. Feeds the Priority/Overdue widget.

---

## #5 — Voluntary items (nafl prayers / any habit)

An **`optional` flag** on any prayer/habit (not just prayers):
- Doing it **counts** — positive streak, shows as a win, feeds "times done" stats.
- Skipping **never** breaks a streak, shows red, or lowers a ratio (excluded from `x/5`, miss-coloring, and the heatmap).
- **Tahajjud:** optional + shows every day (tick it when you wake for it).
- **Duha:** optional + no fixed day — logged ad-hoc (a quick "log Duha" affordance), no daily expectation.
- Implemented as a flag on the item plus exclusion rules in the ratio/streak/heatmap calculators.

---

## #9 — Heatmap only for daily-recurring tasks

- The consistency heatmap/streak grids apply **only to items that recur daily** (every-day cadence). One-off / infrequent items get **no grid** — they show a plain count instead (a heatmap over sparse data is meaningless).
- Rule: an item qualifies for a heatmap iff its schedule is "every day". Feeds the Overview consistency cards.

---

## #10 — Custom reminders (interval-from-done + fixed date)

A new reminder type, separate from habits/tasks (they are "ping me later" events, not daily checklist items).

**Model.** A reminder has: name, optional note, and a schedule that is **one of**:
- **Interval-from-done** — "every N days/weeks/months, measured from the last time I mark it done." Marking done re-arms the next fire at done-date + interval. (Scooty service, oil change, filter replacement.)
- **Fixed recurring date** — "on the Nth of each month / every N months on a date / a specific date." (Bills.)

**Behavior.**
- When due it surfaces as a **Reminders list badge** + a push notification (extend the existing `reminder_times`/`send-reminders` path for date-based fires).
- A reminder is **not** a streak/heatmap item; missing it never penalizes — it waits until done or snoozed.
- Lives in a small **Reminders** area on **Today** (management also reachable from Settings).
- **AI-settable:** plain language creates reminders ("remind me to service the scooty in 3 months").

> Implementation note: date-based fires need a change to the `send-reminders` Edge Function (it currently fires daily times, not calendar dates). Detailed in the plan.

---

## Cross-cutting
- **Migrations:** legacy single-time → `slots`; existing data otherwise untouched; each migration gated on a flag.
- **Widget feed:** extend the published payload for stats, priority, next-prayer, and the slots-aware Pehar.
- **Self-checks:** every new calculator (slots expansion, voluntary exclusion, priority carry-over + age, reminder due-date/re-arm, heatmap eligibility) ships one runnable self-check matching the existing `#*check` pattern.

## Build order (single release)
1. **Shell:** tab router + bottom tab bar (image-6 style); remove top segment tabs; Pehar as its own tab. (No data change.)
2. **Slots core (#3):** data model + migration + accessor + `buildTimeline` expansion + per-occurrence completion; AI import + manual editor.
3. **Declutter (#4):** cards = untimed only; `ON PEHAR · N` collapsed → pill-rows.
4. **Voluntary (#5)** + **heatmap rule (#9)** + **priority carry-over (#7)** — the calculator-level changes and their self-checks.
5. **Reminders (#10):** model + Reminders area + AI + `send-reminders` date fires.
6. **Widgets (#1, #2):** stats + priority + next-prayer feeds and scripts; fix the Pehar widget.
7. **Sync:** fold scheduling into items; extend `mergeData`/`mergeTemplate`; verify round-trip.
