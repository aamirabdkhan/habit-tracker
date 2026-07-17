// ===== WEB PUSH NOTIFICATIONS =====
// Real background push (works even with the browser fully closed). Supersedes
// the earlier foreground-only setInterval prototype: once a real push
// subscription exists, the server-side scheduler (Supabase Edge Function)
// handles "is this due right now" and delivery, so there is no client-side
// polling here and no client-side "already fired today" ledger — the
// server's reminder_sent_log is the single source of truth for dedup.
//
// VAPID public keys are meant to be exposed client-side (unlike the private
// key, which lives only as a Supabase Edge Function secret). Replace this
// placeholder with the real value from `npx web-push generate-vapid-keys` —
// see supabase/README.md for the full setup checklist.
var VAPID_PUBLIC_KEY = "BMvpaT5hi2vpaMX0HUE80ZA6gn-xQPs-ZGVDy6VCllaP3Z80QVslvsYJs_cfGgYivyTb8W9BHQ-W3lMjzztZa6E";

var NOTIF_TIMES_KEY = "htn_times";

function getNotifTimesMap() { try { return JSON.parse(localStorage.getItem(NOTIF_TIMES_KEY)) || {}; } catch(e) { return {}; } }
function saveNotifTimesMap(map) { localStorage.setItem(NOTIF_TIMES_KEY, JSON.stringify(map)); }
function notifKey(field, name) { return field + "::" + name; }
function getNotifTime(field, name) { return getNotifTimesMap()[notifKey(field, name)] || ""; }
function setNotifTime(field, name, time) {
  var map = getNotifTimesMap(), key = notifKey(field, name);
  if (time) map[key] = time; else delete map[key];
  saveNotifTimesMap(map);
  pushSaveReminderTime(field, name, time);
}

function pushSaveReminderTime(field, name, time) {
  if (!sbClient || !currentUser) return;
  if (time) {
    sbClient.from('reminder_times').upsert({
      user_id: currentUser.id, field: field, name: name, time: time, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,field,name' }).then(function(res) {
      if (res.error) console.error("Reminder save error:", res.error);
    });
  } else {
    sbClient.from('reminder_times').delete()
      .eq('user_id', currentUser.id).eq('field', field).eq('name', name)
      .then(function(res) { if (res.error) console.error("Reminder delete error:", res.error); });
  }
}

function urlBase64ToUint8Array(base64String) {
  var padding = "=".repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function isIosNonStandalone() {
  var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !isStandalone;
}

// "unsupported" | "denied" | "subscribed" | "not-subscribed" | "loading"
var pushSubscriptionState = "loading";

function refreshPushSubscriptionState() {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    pushSubscriptionState = "unsupported";
    return Promise.resolve();
  }
  if (Notification.permission === "denied") {
    pushSubscriptionState = "denied";
    return Promise.resolve();
  }
  return navigator.serviceWorker.ready.then(function(registration) {
    return registration.pushManager.getSubscription();
  }).then(function(sub) {
    pushSubscriptionState = sub ? "subscribed" : "not-subscribed";
  }).catch(function() {
    pushSubscriptionState = "not-subscribed";
  });
}

function subscribeToPush() {
  if (!currentUser) { toast("Log in to Cloud Sync first"); return; }
  if (isIosNonStandalone()) { toast("On iPhone: Add to Home Screen first, then open from there"); return; }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) { toast("Push notifications not supported in this browser"); return; }

  Notification.requestPermission().then(function(perm) {
    if (perm !== "granted") { toast("Permission: " + perm); refreshPushSubscriptionState().then(render); return; }
    return navigator.serviceWorker.ready.then(function(registration) {
      return registration.pushManager.getSubscription().then(function(existing) {
        return existing || registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      });
    }).then(function(subscription) {
      var json = subscription.toJSON();
      var timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return sbClient.from('push_subscriptions').upsert({
        user_id: currentUser.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        timezone: timezone,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' });
    }).then(function(res) {
      if (res && res.error) { console.error("Push subscribe error:", res.error); toast("Could not enable push notifications"); return; }
      toast("Push notifications enabled on this device");
    }).catch(function(err) {
      console.error("Push subscribe error:", err);
      toast("Could not enable push notifications");
    }).then(function() {
      refreshPushSubscriptionState().then(render);
    });
  });
}

function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then(function(registration) {
    return registration.pushManager.getSubscription();
  }).then(function(subscription) {
    if (!subscription) { toast("Not subscribed on this device"); return; }
    var endpoint = subscription.endpoint;
    return subscription.unsubscribe().then(function() {
      if (sbClient) return sbClient.from('push_subscriptions').delete().eq('endpoint', endpoint);
    });
  }).then(function() {
    toast("Push notifications disabled on this device");
  }).catch(function(err) {
    console.error("Push unsubscribe error:", err);
  }).then(function() {
    refreshPushSubscriptionState().then(render);
  });
}

// ===== CLICK-TO-NAVIGATE-AND-HIGHLIGHT =====
// Shared by both delivery paths a notification click can take: an in-app
// postMessage handoff (app already open) or a boot-time URL param (app was
// fully closed, see checkNotifClickParams()). Item rows are always
// addressable via production's existing rChk() output: data-a="tog"
// data-f="<field>" data-k="<name>".
function findItemEl(field, name) {
  var els = document.querySelectorAll('[data-a="tog"][data-f="' + field + '"]');
  for (var i = 0; i < els.length; i++) { if (els[i].dataset.k === name) return els[i]; }
  return null;
}

function handleNotifClick(field, name) {
  view = "daily";
  cDate = new Date();
  render();
  requestAnimationFrame(function() {
    var el = findItemEl(field, name);
    if (!el) { toast("That item is no longer tracked"); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("ht-notif-flash"); void el.offsetWidth;
    el.classList.add("ht-notif-flash");
    setTimeout(function(){ el.classList.remove("ht-notif-flash"); }, 2000);
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", function(e) {
    if (e.data && e.data.type === "ht-notif-click") handleNotifClick(e.data.field, e.data.name);
  });
}

// Handles the "app was fully closed, notificationclick had to open a new
// window" case — called once from app.js's boot sequence, after the initial
// render() so view/cDate/render already exist.
function checkNotifClickParams() {
  var params = new URLSearchParams(location.search);
  var field = params.get("notif_field"), name = params.get("notif_name");
  if (field && name) {
    handleNotifClick(field, name);
    history.replaceState(null, "", location.pathname);
  }
}
