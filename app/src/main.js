// Boot. Keep this thin: wire the app together, nothing else.
import { startRouter } from './core/router.js';
import { initSync } from './data/sync.js';
import { isOnboarded } from './data/store.js';
import { set } from './core/state.js';

if (!isOnboarded()) set({ view: 'onboarding' }); // set before first render (no flash)
startRouter();
initSync(); // optional cloud sync (no-op until Supabase is loaded + user signs in)

// PWA: offline shell + install. Network-first SW (see sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// TODO(next): cloud sync (data/sync.js — port the LWW merge to the v2 schema).
