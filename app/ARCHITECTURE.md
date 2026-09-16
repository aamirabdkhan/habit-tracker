# Waqt — Architecture

A clean, zero-build, vanilla ES-module rebuild. No framework, no bundler, no
toolchain — every file is served as-is. The goal is that a new contributor can
open any file and understand one clear responsibility.

> Why no build step: the app deploys as static files to Vercel and runs offline
> as a PWA. Keeping it buildless means nothing to install, nothing to rot, and
> it deploys anywhere. "Professional" here = **structure + naming + docs**, not tooling.

## Folder map

```
app/
  index.html            # shell only: mount point + <script type="module" src="src/main.js">
  styles/
    tokens.css          # design system: colours, type, spacing (the ONE source of visual truth)
    base.css            # resets + shared element styles
  src/
    main.js             # boot: load data, start router, register service worker
    core/
      state.js          # the app's reactive state + a tiny subscribe/notify bus (no framework)
      router.js         # which of the 4 modes is showing; renders the active view
      dom.js            # tiny helpers: html`` template tag, $, on() delegation, icons
    data/
      schema.js         # the localStorage data shape + normalisation (documented contract)
      store.js          # read/write days + template to localStorage (the ONLY storage access)
      sync.js           # optional Supabase cloud sync (last-write-wins) — ported from the fix
    features/
      prayers.js        # prayer times + logging (Muslim-first, a toggleable module)
      pehar.js          # day-as-timeline + free-time calculation
      practices.js      # cards + practices (habits)
      weight.js
      reflections.js
      correlations.js   # the pattern engine (Strong/Emerging/Still-watching, meaningfulness filter)
    ui/
      today.js          # view: Today
      pehar.js          # view: Pehar
      overview.js       # view: Overview
      template.js       # view: Template
      settings.js       # view: Settings (reached via gear)
      components.js     # shared render pieces (bottom tabs, section headers, dot strips…)
```

## Rules of the codebase

1. **One-way data flow.** UI reads from `core/state`; user actions call a
   `data`/`features` function that mutates state + persists; state notifies; the
   active view re-renders. Views never write to localStorage directly — only
   `data/store.js` does.
2. **`data/store.js` is the single storage boundary.** All `localStorage` access
   lives there, behind named functions (`getDay`, `saveDay`, `getTemplate`…).
   Swapping the backend later touches one file.
3. **Views are pure-ish render functions.** `renderToday(state) -> htmlString`.
   No per-element listeners; one delegated handler per view (see `core/dom.js`).
4. **Features are modules, not globals.** Prayers/Pehar/Weight/Reflections each
   own their logic and can be toggled off (Muslim-first + modular).
5. **Escape all user text** through `esc()` before it enters an HTML string.
6. **Same on-disk data schema as the shipped app** (`ht_d`, `ht_<date>`) so
   existing user data, backups, and cloud sync keep working — see `data/schema.js`.

## Data model (unchanged from production, documented in `data/schema.js`)

- `ht_d` — template/settings (cards, practices, prayer settings, module toggles, water target).
- `ht_<YYYY-MM-DD>` — one record per day (prayer checks, practice checks, weight, reading, reflections).
- `ht_<key>_mt` — local edit timestamp for last-write-wins sync (local only, never synced).

## Adding a screen (the pattern)

1. Add `ui/<name>.js` exporting `render<Name>(state)` + an `actions` map.
2. Register it in `core/router.js`.
3. Add its tab in `ui/components.js` bottomTabs().
That's it — no wiring elsewhere.

## Status

Fresh build in progress on branch `redesign`. Old root app (`index.html`, `js/`,
`css/`) stays live-shaped until this replaces it. Nothing here is deployed.
