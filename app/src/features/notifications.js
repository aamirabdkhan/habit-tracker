// Web push — prayer reminders. Real background push handled by the Supabase Edge
// Function (send-reminders) + cron; the client only (a) subscribes this device and
// (b) writes reminder_times. Ported from the old push-client.js. Same tables.
// VAPID public keys are meant to be public (private key is a server secret).
import { client, currentUser } from '../data/sync.js';
import { getTemplate, PRAYERS } from '../data/store.js';

const VAPID_PUBLIC_KEY = 'BMvpaT5hi2vpaMX0HUE80ZA6gn-xQPs-ZGVDy6VCllaP3Z80QVslvsYJs_cfGgYivyTb8W9BHQ-W3lMjzztZa6E';
const LEAD_MIN = 5; // prayers get a 5-minute-early heads-up

function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64); const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
// prayer reminder fires 5 min before the actual time (Pehar still shows the real time)
function reminderTime(field, time) {
  if (field !== 'prayers' || !/^\d{1,2}:\d{2}$/.test(time)) return time;
  const [h, m] = time.split(':').map(Number);
  const t = ((h * 60 + m - LEAD_MIN) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}

export const isIosNonStandalone = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !(window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);

/** 'unsupported' | 'denied' | 'subscribed' | 'not-subscribed' */
export async function pushState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? 'subscribed' : 'not-subscribed';
  } catch { return 'not-subscribed'; }
}

async function saveReminderTime(field, name, time) {
  const sb = client(), user = currentUser(); if (!sb || !user) return;
  if (time) {
    await sb.from('reminder_times').upsert(
      { user_id: user.id, field, name, time: reminderTime(field, time), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,field,name' });
  } else {
    await sb.from('reminder_times').delete().eq('user_id', user.id).eq('field', field).eq('name', name);
  }
}

/** Push the five prayer times as reminders (call after subscribe + on time changes). */
export async function syncPrayerReminders() {
  if (!currentUser()) return;
  const times = getTemplate().prayerTimes || {};
  for (const p of PRAYERS) if (times[p]) await saveReminderTime('prayers', p, times[p]);
}

export async function subscribePush() {
  const sb = client(), user = currentUser();
  if (!user) throw new Error('Log in to cloud sync first.');
  if (isIosNonStandalone()) throw new Error('On iPhone: Add to Home Screen first, then open from there.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permission ' + perm + '.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC_KEY),
  });
  const j = sub.toJSON();
  await sb.from('push_subscriptions').upsert({
    user_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, user_agent: navigator.userAgent,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  await syncPrayerReminders();
}

export async function unsubscribePush() {
  const sb = client();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  if (sb) await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
