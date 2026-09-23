// Waqt service worker — offline shell + fresh-on-network. Network-first so the
// latest deploy always wins when online; falls back to cache when offline.
// Bump CACHE on any shipped asset change.
const CACHE = 'waqt-v1';
const SHELL = [
  './', './index.html', './manifest.json',
  './styles/tokens.css', './styles/app.css',
  './src/main.js',
  './src/core/dom.js', './src/core/state.js', './src/core/router.js',
  './src/data/store.js', './src/data/migrate.js',
  './src/features/correlations.js', './src/features/pehar.js',
  './src/ui/components.js', './src/ui/today.js', './src/ui/overview.js',
  './src/ui/pehar.js', './src/ui/template.js', './src/ui/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for GET; cache the fresh copy; fall back to cache offline.
// (Deliberately no reload-on-controllerchange — that caused a loop in a sibling app.)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
