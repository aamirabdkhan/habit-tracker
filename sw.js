const CACHE = 'habit-tracker-v19';
const URLS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/supabase-sync.js',
  'js/manifest.js',
  'js/push-client.js'
];
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.allSettled(URLS.map(function(u){ return c.add(u).catch(function(){}); }));
    }).then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function(e) {
  // Only intercept same-origin requests (the app shell). Cross-origin
  // requests (Supabase CDN script, Google Fonts, Font Awesome) are left
  // alone entirely — deliberately not calling respondWith() for them, so
  // the browser handles them natively. Re-fetching a cross-origin request
  // from inside the service worker subjects it to this page's CSP
  // connect-src directive regardless of the original resource type (e.g. a
  // <script src> load would need to satisfy connect-src instead of
  // script-src), which silently broke third-party script loading under a
  // strict CSP. Same-origin resources aren't affected by that quirk.
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var networked = fetch(e.request).then(function(res) {
        if (res && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
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
