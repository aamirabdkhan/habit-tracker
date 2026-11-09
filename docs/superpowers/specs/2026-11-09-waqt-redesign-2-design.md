# Waqt — Redesign 2 design

Date: 2026-11-09
Source: `~/Downloads/Redesign 2.pdf` (14 pages of annotated screenshots) + brainstorming with the user.
Branch policy: **everything lands on `redesign` first** (the testing app) and is only merged to `main` after the user verifies on device.

## Intent & why

Waqt is a prayer-anchored habit tracker (vanilla-JS PWA, Supabase sync, Scriptable widgets). The user has lived with the "big update" for a week and collected real friction. Redesign 2 is that punch-list: make the **AI setup actually understand the user and plan a full day**, stop the **reminder spam** (including notifications for cards that were deleted), and fill gaps in the **widgets, Overview, and reset flows**.

The centerpiece is the AI setup rewrite. The user plans their day a specific way, and the tool should plan it the same way:

- **Prayer-anchored** — the day is built around the 5 prayers; small rituals sit relative to them ("Fajr dhikr" after Fajr, dhikr after Maghrib).
- **Day-scoped weekly commitments** — physio Wed + Sat; Arabic class Sat–Mon mornings.
- **Specific study blocks, never generic** — "CEH", "CLG work", "Research", not "study".
- **A full visual day on the Pehar** the user can glance at and start working.

## Goals

- Rewrite the "Set up with AI" prompt into an **interactive planner**: the AI interviews the user about their real routine, then emits the schedule JSON — producing a better-fitting plan and far fewer stray reminders.
- **Reminders stop pinging for deleted cards/items**, and the user can **view/edit reminders in Settings**.
- Small, high-value widget + Overview + onboarding + reset improvements from the deck.

## Non-goals

- No change to the paste-back mechanism (copy prompt → chat in the user's AI → paste the reply → Preview → Apply). We improve the *prompt*, not the transport.
- No new backend services; stay on the existing Supabase tables (`user_data`, `reminder_times`, `widget_feed`) and RLS.
- No redesign of the Pehar timeline itself.

## Anti-goals (these would make it a failure even if it "works")

- An AI interview so long it's more work than typing the schedule by hand.
- Any feature assuming prayers exist when the user has prayers turned **off**.
- A reset that destroys Overview history the user wanted to keep.
- "Fixing" reminders in a way that silently drops reminders the user *did* want.

## Constraints

- **Prayers on/off is a first-class state.** Everything prayer-related (AI anchoring, the compact widget's "Next prayer" line, the Prayer Consistency heatmap, Tahajjud/Duha rows, the prayer-times sheet) must hide/degrade cleanly when prayers are off — never assume prayer times.
- Zero-dependency vanilla JS, no build step. Device-local keys use `htn_` (not synced); syncable keys start `ht_`.
- iOS cannot be force-refreshed; Scriptable widgets fetch the feed fresh each run and re-render on iOS's own schedule.
- Device-local vs synced split must be preserved for anything new.
- Ship each wave on `redesign`, verify, then merge.

---

## Features (grouped into build waves)

### Wave 1 — AI setup rewrite + reminder fixes (the heart)

**1.1 Interactive AI planner prompt.**
Rewrite `importPrompt()` so the copied text turns the user's AI into a planner that **asks before it builds**. Flow the prompt instructs the AI to run:
1. Read the user's current profile (already embedded) and greet.
2. **Interview**, briefly, in this order: fixed anchors (prayers if on; weekly classes/physio with their days) → study/work blocks **by real name** ("what are you studying — name each block") → small post-prayer or fixed micro-habits → "**do you want reminders? for which items?**" (default: none).
3. Only then emit the final schedule JSON block to paste back — same schema as today.
- **Prayer-anchored timing:** when prayers are on, instruct the AI to use the app's existing "after Fajr"/"before Isha" anchoring for rituals; when **prayers are off**, plain clock times only, no prayer references.
- **Day scoping:** emit one item with `days:[...]` for weekly things (physio Wed/Sat; Arabic Sat–Mon), never one copy per day.
- **Specific names:** forbid generic "Study"; make the AI ask what the study block actually is.
- **Reminders opt-in:** the schema's `reminders`/bell flags stay empty unless the user explicitly asked — this is the direct fix for the over-reminder screenshots.
- Keep the one-shot fallback usable (a user who just pastes their day still gets a schedule), but the default is the interview.
- *Open to builder:* exact question wording and how to keep the interview short (target ≈4–6 questions).

**1.2 Deleting a card/item cancels its reminders.**
Root cause confirmed: `deleteCard()` removes the card + its items from the store but never clears each item's `reminder_times` row (nor `htn_times/days/slots/bell`), so the server keeps pushing them — the "deleted cards still pinging" notifications. Fix: `deleteCard` must iterate the card's items and run the same teardown `removeCardItem` does (clear time/days/slots/bell/optional + delete the `reminder_times` row). Also add a one-time **orphan sweep**: on load, delete `reminder_times` rows whose `field::name` no longer matches any current card/item.

**1.3 Reminder bodies show raw card IDs.**
Notifications read `c_8ivntv: Surah Rahman` — the internal card id leaks into the push title. Fix the server payload / client registration to send the human card + item name, not the `c_*` id. *(Builder: confirm where the id string is assembled — client `pushSaveReminderTime` vs the edge function.)*

**1.4 Edit/manage reminders in Settings.**
A new Settings section listing every active reminder (item name, time, days) with the ability to turn one off or change its time, and a clear "turn off all reminders" escape hatch.

### Wave 2 — Widgets

**2.1 Priority widget: show every priority.**
Remove the hard `slice(0,3)` cap (already partially addressed with "+N more"); the user wants the full list visible on the larger family. Use the large widget to list all; keep "+N more" only when physically out of room.

**2.2 Compact stats widget.**
A new small widget family that shows **one combined stat** — the % ring + a single total (e.g. "4/6 today") + the **Next prayer** line — instead of the per-card columns. Same feed, smaller layout.

**2.3 "Hadith of the day" lock-screen widget.**
A simple small/lock-screen widget showing one hadith per day under the clock. *Open to builder:* source of the hadith list (bundled static set rotating by day-of-year is the likely MVP — no network, no new dependency). Confirm with user whether a curated bundled set is acceptable.

### Wave 3 — Overview & prayers

**3.1 Track priorities in Overview.**
Priorities (starred one-time tasks) currently live only on Today + the priority widget. Add a way to see/mark them on the **Overview** page so their completion is visible in history. *This needs its own mini-brainstorm* — options to weigh: a dedicated "Priorities" strip on Overview with done/late state, vs folding them into the existing heatmap. Decide during Wave 3 planning.

**3.2 Tahajjud & Duha in the Prayer Consistency heatmap.**
Add Tahajjud and Duha rows to the heatmap, rendered **separately at the bottom**, labelled **voluntary** (only when the user tracks them, and only when prayers are on). They never lower the fard consistency numbers.

### Wave 4 — Onboarding & reset

**4.1 New vs returning user at first launch.**
Onboarding's first step asks "new here, or returning?" A returning user skips the setup questions (their data syncs down); a new user gets the full "what do you want to track" flow. Goal: a returning user on a new device isn't forced back through setup.

**4.2 "Set up with AI" as its own section.**
Pull "Set up with AI" out of the "Schedule data" tab pair into its **own collapsible Settings section**, so it's discoverable and not buried next to "Type your day".

**4.3 A middle reset: new cards/Pehar, keep history.**
Between "Reset schedule" and "Erase everything", give a reset that **clears cards + Pehar/schedule but keeps the Overview day-by-day records**. Matches the user's note: sometimes they want fresh cards without losing their history. *(Builder: this is close to today's "Reset schedule" — decide whether to relabel/extend it or add a third option; the differentiator is explicitly clearing Pehar/timed items while preserving `ht_YYYY-MM-DD` records.)*

---

## Build order

Waves ship in order (1 → 4), each to `redesign`, each verified on device before the next. Wave 1 is the priority. Waves are independent enough that order can flex if the user wants a specific item sooner.

## What's left to the builder

Each wave becomes its own implementation plan (via writing-plans) when it's reached. Per-item "open to builder" notes above capture the decisions a sensible builder can make without the user; anything that changes *what gets built* comes back to the user first.
