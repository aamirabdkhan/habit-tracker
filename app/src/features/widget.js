// Home-screen widget feed. Publishes today's Pehar (prayers + timed practices) to
// the widget_feed table; the Scriptable script reads one row by token via the
// get_widget_feed RPC. Payload shape matches the old app so the existing widget
// script keeps working: { date, done, total, items:[{n,t,end,c,done,prayer?}] }.
import { client, currentUser } from '../data/sync.js';
import { peekDay, getTemplate, todayKey, PRAYERS } from '../data/store.js';

const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
const minToHHMM = (t) => String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
const PRAYER_GREEN = '#5FA46B';

function widgetPayload() {
  const day = peekDay(todayKey()); const tpl = getTemplate(); const items = [];
  if (tpl.modules.prayers) PRAYERS.forEach((p) => {
    const t = tpl.prayerTimes[p];
    if (t) items.push({ n: p, t, end: null, c: PRAYER_GREEN, done: !!day.prayers[p], prayer: true });
  });
  tpl.cards.forEach((c) => c.items.forEach((it) => {
    if (it.time) items.push({ n: it.name, t: it.time, end: minToHHMM(toMin(it.time) + 30), c: c.color, done: !!day.checks[it.name] });
  }));
  items.sort((a, b) => toMin(a.t) - toMin(b.t));
  let date = '';
  try { date = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch { /* */ }
  return { date, done: items.filter((i) => i.done).length, total: items.length, items };
}

export function publishWidgetFeed() {
  const sb = client(), user = currentUser();
  if (!sb || !user) return Promise.resolve();
  return sb.from('widget_feed')
    .upsert({ user_id: user.id, payload: widgetPayload(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(() => {});
}

let timer = null;
/** Debounced republish — call after any change that affects today's timeline. */
export function scheduleWidgetPublish() {
  clearTimeout(timer);
  timer = setTimeout(publishWidgetFeed, 1500);
}

/** The widget's read token (for the Scriptable setup). Ensures a row exists first. */
export async function getWidgetToken() {
  const sb = client(), user = currentUser(); if (!sb || !user) return null;
  await publishWidgetFeed(); // guarantees the row + its default token exist
  const { data } = await sb.from('widget_feed').select('token').eq('user_id', user.id).single();
  return data ? data.token : null;
}
