// Pehar — the day as a timeline. Right now it's built from the five prayer times
// and the open stretches between them (the calm free-time reveal). Timed practices
// will slot in here once the Template gains time fields.
import { PRAYERS } from '../data/store.js';

const PRAYER_MIN = 35; // nominal block length for a prayer

/** "5:30" -> minutes since midnight. Fajr is AM; the rest read as PM. */
function toMinutes(str, isFajr) {
  const [h, m] = String(str || '0:00').split(':').map(Number);
  let hh = h;
  if (!isFajr && h < 12) hh = h + 12;   // Dhuhr..Isha are afternoon/evening
  if (isFajr && h === 12) hh = 0;
  return hh * 60 + (m || 0);
}

export function clock(min) {
  let h = Math.floor(min / 60) % 24; const m = min % 60;
  const ap = h < 12 ? 'am' : 'pm'; let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}
export function dur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}

/** "14:30" (24h, from <input type=time>) -> minutes. */
const toMinutes24 = (str) => { const [h, m] = String(str).split(':').map(Number); return h * 60 + (m || 0); };

/**
 * Build the ordered timeline + total open minutes.
 * @param day  the day record  @param times  prayer times  @param tasks  timed practices [{name,time,dur?}]
 */
export function buildPehar(day, times, tasks = []) {
  const events = PRAYERS.map((p) => ({ type: 'prayer', name: p, start: toMinutes(times[p], p === 'Fajr'), len: PRAYER_MIN, done: !!day.prayers[p] }));
  tasks.forEach((t) => events.push({ type: 'task', name: t.name, start: toMinutes24(t.time), len: t.dur || 30, done: !!day.checks[t.name] }));
  events.sort((a, b) => a.start - b.start);

  const blocks = []; let freeMin = 0;
  events.forEach((e, i) => {
    const end = e.start + e.len;
    blocks.push({ type: e.type, name: e.name, start: e.start, end, done: e.done });
    const next = events[i + 1];
    if (next) {
      const gap = next.start - end;
      if (gap > 0) { blocks.push({ type: 'free', start: end, end: next.start, dur: gap }); freeMin += gap; }
    }
  });
  return { blocks, freeMin, stretches: blocks.filter((b) => b.type === 'free').length };
}
