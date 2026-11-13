const CACHE = 'habit-tracker-v93';
const URLS = [
  './',
  'index.html',
  'css/style.css',
  'css/waqt.css',
  'js/app.js',
  'js/waqt.js',
  'js/vendor/adhan.min.js',
  'js/prayer-calc.js',
  'js/supabase-sync.js',
  'js/manifest.js',
  'js/push-client.js',
  'js/theme-init.js'
];
self.addEventListener('install', function(e) {
  // skipWaiting so a new worker activates itself instead of getting stuck "waiting" (on iOS PWAs a
  // stuck waiting worker made the app show an update popup on every launch). controllerchange in the
  // page then reloads once onto the fresh files.
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.allSettled(URLS.map(function(u){ return c.add(u).catch(function(){}); }));
    }).then(function(){ return self.skipWaiting(); })
  );
});
// The page posts 'skipWaiting' when the user taps "Update now" / "Check for updates".
self.addEventListener('message', function(e) { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  // Cloud data and third-party assets are always live. Cache Storage only owns
  // same-origin app files, so API/auth responses can never be stale matches.
  if (url.hostname.endsWith('.supabase.co') || url.origin !== self.location.origin) {
    e.respondWith(fetch(e.request));
    return;
  }
  if (!(url.pathname === '/' || /\.(?:html|css|js|json|png|svg|ico|woff2?)$/i.test(url.pathname))) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Stale-while-revalidate is intentionally limited to same-origin static
  // files. API/auth requests and third-party resources never enter this cache.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function(cached) {
      var networked = fetch(e.request).then(function(res) {
        // Opaque responses (no-cors cross-origin, e.g. the Supabase script
        // tag) always report status 0 — cache them unconditionally since
        // there's no status to check; same-origin/CORS responses are only
        // cached on a real 200.
        if (res && (res.type === 'opaque' || res.status === 200)) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c){ return c.put(e.request, clone); }).catch(function() {});
        }
        return res;
      }).catch(function() {
        return cached;
      });
      return cached || networked;
    })
  );
});

// ===== WEB PUSH =====
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  var title = data.title || 'Habit Tracker Reminder';
  var options = {
    body: data.body || '',
    tag: 'ht-notif-' + (data.field || '') + '::' + (data.name || ''),
    data: { field: data.field, name: data.name }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(e) {
  var field = e.notification.data && e.notification.data.field;
  var name = e.notification.data && e.notification.data.name;
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        client.postMessage({ type: 'ht-notif-click', field: field, name: name });
        if ('focus' in client) return client.focus();
      }
      var targetUrl = self.registration.scope + '?notif_field=' + encodeURIComponent(field) + '&notif_name=' + encodeURIComponent(name);
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
