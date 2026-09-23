// Boot. Keep this thin: wire the app together, nothing else.
import { startRouter } from './core/router.js';
import { initSync, onAuth } from './data/sync.js';
import { isOnboarded, todayKey } from './data/store.js';
import { set, subscribe } from './core/state.js';
import { publishWidgetFeed, scheduleWidgetPublish } from './features/widget.js';

if (!isOnboarded()) set({ view: 'onboarding' }); // set before first render (no flash)
startRouter();
initSync(); // optional cloud sync (no-op until Supabase is loaded + user signs in)

// Home-screen widget feed: publish on sign-in and (debounced) after any change.
onAuth((u) => { if (u) publishWidgetFeed(); });
subscribe(() => scheduleWidgetPublish());

// Notification click handoff from the service worker → open today.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'waqt-notif-click') set({ view: 'today', viewedDate: todayKey() });
  });
}

// PWA: offline shell + install. Network-first SW (see sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// TODO(next): cloud sync (data/sync.js — port the LWW merge to the v2 schema).
