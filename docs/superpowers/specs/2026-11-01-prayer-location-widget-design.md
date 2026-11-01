# Waqt — Location-based prayer times + redesigned prayer widget

Date: 2026-11-01
Branch: `redesign` (never main without explicit approval)
Status: approved design, pre-plan

## Intent / why

The user uses Waqt to know when a prayer *starts and ends*, i.e. how long is left in
the current prayer window. Today prayer times are typed in by hand, and the Scriptable
"next prayer" widget only shows the next prayer name + a countdown + five dots. The user
wants:

1. **Optional** location-based automatic prayer times (like the Deen app) so they don't
   have to type times in — including the voluntary prayers Duha and Tahajjud.
2. A redesigned prayer widget that shows the **current** prayer and a **bar that drains
   as its window elapses**, plus an adaptive row of dots for every prayer they track
   (fard solid, voluntary dashed).
3. The PRAYERS column removed from the Stats widget (the prayer widget now covers it).

Why now: the widget work this cycle exposed that prayer data is the most glanceable thing
on the lock/home screen, and manual entry + a thin "next" widget under-serve it.

## Goals

- A settings toggle **"Automatic prayer times (uses your location)"**, default OFF.
- When ON: compute the 5 fard times from device location + a calculation method, plus
  Duha and Tahajjud window starts, and keep them current day-to-day. Fard/auto times are
  shown read-only while the toggle is on.
- When OFF: today's exact manual behaviour, unchanged.
- Optional **Track Duha** / **Track Tahajjud** toggles (mirroring the existing First
  Takbir toggle) so these voluntary prayers can appear in the tracker and on the widget.
- Redesign the `next-prayer-widget.js` into the "current window" design (mockup C-v3):
  big current prayer name, "ends in Xh Ym · <next> at <time>", a progress bar that fills
  as the window elapses, and an adaptive dot row — exactly the prayers the user tracks
  (5–7), in time order, **fard = solid ring, voluntary = dashed ring**; done = green fill
  (nafl = small green centre inside the dashed ring); the current one = gold ring.
- Remove the PRAYERS count from `stats-widget.js` / the stats payload counts.

## Non-goals

- Not becoming a prayer app: no Quran, qibla, athan audio, hijri calendar, duas.
- No change to how non-prayer habits/cards work.
- The Scriptable widget does **not** request location — the app computes times and
  publishes them in the feed; the widget only renders and runs the live countdown.

## Anti-goals (would make this a failure even if it "works")

- Location becoming compulsory, or the app nagging for location. It is opt-in.
- Toggling location ON then OFF **losing the user's hand-typed times**. Manual times must
  survive untouched and come back when location is turned off.
- Auto-computed times silently overwriting a value the user deliberately set while in
  manual mode.
- Sending location anywhere off-device (no network calls with coordinates, never in URLs).

## How it works

### 1. Calculation (new, app-side)

- Vendor **adhan.js** (MIT, zero runtime deps, ~small single file) into the repo as a
  local script; add its origin-local path to the service-worker cache list and, if a CSP
  `script-src` applies, keep it same-origin so no CSP change is needed. *(Builder's call:
  adhan-js is the standard, battle-tested library and already exposes `SunnahTimes`
  (`middleOfTheNight`, `lastThirdOfTheNight`) and `sunrise`, which is exactly what Duha
  and Tahajjud need; an inline PrayTimes implementation is the fallback if vendoring is
  rejected.)*
- Location: `navigator.geolocation.getCurrentPosition` once when the toggle is switched ON
  (and a manual "update location" affordance). Store `{lat, lng, ts}` in a **device-local,
  non-synced** key (e.g. `htn_geo` under the `htn_` prefix so `isSyncableKey` skips it) —
  coordinates are personal and single-device like the other `htn_*` data.
- Method + madhab: a small picker in prayer settings. Options from adhan's
  `CalculationMethod` (Muslim World League, ISNA/North America, Umm al-Qura, Egyptian,
  Karachi, Dubai, Kuwait, Qatar, Singapore, Turkey, Moonsighting, Tehran) and an Asr
  **madhab** toggle (Shafi default / Hanafi). Default method: Muslim World League. Stored
  device-local. *(Builder: during implementation, check whether deenia publishes its
  method; if so, set the default to match so "I like their timing" holds out of the box.
  Otherwise MWL default + the picker lets the user match it.)*
- Each day (on app open / date change while location is ON), compute:
  - fajr, sunrise, dhuhr, asr, maghrib (sunset), isha via adhan `PrayerTimes`.
  - **Duha** start = `sunrise + offset` (default +20 min; its window runs until Dhuhr).
  - **Tahajjud** start = adhan `SunnahTimes.lastThirdOfTheNight` (window runs until Fajr).
  - Write the resulting `HH:MM` into the existing `getNotifTime("prayers", name)` store so
    the whole app (Template, Pehar, reminders, feed) reads them exactly as it reads manual
    times today — one write path, no downstream changes. While location is ON these rows
    are rendered read-only in Template.

### 2. Prayer model extension

- Keep `PRAYERS` (the 5 fard) as the obligatory set.
- Add voluntary prayers **Duha** and **Tahajjud** as optional tracked prayers, gated by
  per-prayer toggles (same pattern/٭ storage style as `takbeerOn`). A tracked voluntary
  prayer gets: a done-state per day (like fard), a time (auto when location ON, else
  manual), and a `voluntary:true` marker used for the dashed ring.
- Ordering for the widget/Pehar: all tracked prayers sorted by time. Each prayer "starts"
  its segment; the segment ends at the next tracked prayer's start (Duha→Dhuhr,
  Tahajjud→Fajr, etc.). "Current" = the prayer whose start ≤ now < next start. This reuses
  the existing time-ordering logic rather than hard-coding windows.

### 3. Widget payload (`computeWidgetPayload`)

- Extend the `prayers` array entries with `voluntary:boolean` and keep `time` + `done`.
- Add, for the prayer widget: the ordered list already sorted by time, and leave the
  live "current / ends-in / bar fill" computation to the widget (so it stays accurate
  between iOS refreshes), exactly like the next-prayer live-clock fix already shipped.
- **Remove** the PRAYERS entry from `stats.counts` (and the widget already renders counts
  generically, so the Stats widget simply shows one fewer column).

### 4. Widget redesign (`next-prayer-widget.js`)

- Rebuild to mockup **C-v3**:
  - Title row: current prayer name (serif) + muted "now".
  - Line: `ends in Xh Ym · <next prayer> at <HH:MM>` (gold on the number).
  - A thin progress bar filling left→right with `elapsed / windowLength` of the current
    window, computed live from the clock against the current + next start times.
  - Dot row: one column per tracked prayer in time order. Fard = solid ring, voluntary =
    dashed ring; done fard = solid green fill, done voluntary = dashed ring with a small
    green centre; current = gold ring (solid or dashed per type). Label under each.
  - Lock-screen (accessory) variants: keep monochrome, show current prayer + time-left.
- Keep the existing `refreshAfterDate` approach: reload at the next prayer boundary.
- No location use in the widget; it reads times from the feed and does the countdown.

### 5. Stats widget (`stats-widget.js`)

- No code change needed beyond the payload dropping PRAYERS; verify it reflows to the
  remaining columns and spacing stays clean.

## Constraints

- Zero-dependency vanilla static site: adhan.js is vendored as a local file, not an npm
  install; no build step.
- Offline-first: location fetched opportunistically; if unavailable, fall back to the last
  stored coordinates, and if none, keep manual mode / show a gentle prompt — never block.
- Sync: times still live in the synced `htn_times`/notif store (so auto times propagate
  like manual ones), but **coordinates, method, madhab, and the location toggle are
  device-local** (`htn_`-prefixed), matching the existing device-local MVP convention.
- Service worker cache (`CACHE`) bumped when app/widget assets change; widget scripts are
  fetched fresh by the loader (no bump needed for them).

## Decided "how" choices (builder: these are my calls, not the user's)

- Library: vendor **adhan.js**.
- Default method **Muslim World League**, Asr **Shafi**, with a settings picker.
- Duha offset default **+20 min after sunrise**; Tahajjud = **last third of the night**.
- Location/method/madhab/toggle stored **device-local** (not synced); computed times stored
  in the existing synced prayer-time store.
- Voluntary prayers limited to **Duha** and **Tahajjud** for v1 (not an arbitrary
  user-defined nafl list).

## Left to the builder

- Exact Template UI for the location toggle, method/madhab picker, Duha/Tahajjud toggles,
  and the read-only presentation of auto times.
- adhan.js high-latitude rule selection and date-line/timezone handling.
- The precise Scriptable stack layout to realise C-v3 (dashed rings via bordered stacks or
  a drawn image) and its lock-screen reductions.
- Whether to verify and match deenia's calculation method for the default.
- Self-checks: a `#…check` asserting (a) window/current-segment selection from a set of
  times, (b) Duha/Tahajjud derivation from sunrise/night, (c) PRAYERS dropped from stats
  counts, (d) toggling location ON→OFF restores manual times.

## Testability

Each non-trivial pure function (segment selection, Duha/Tahajjud derivation, bar-fill
fraction) gets one runnable assertion in the existing hash-gated self-check style, plus an
in-browser render check of the widget payload and a visual check of the redesigned widget.
