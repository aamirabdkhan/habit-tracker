// One-time migration: the old, mid-migration `ht_*` localStorage schema -> clean v2.
// Only HISTORY is migrated (prayers, takbīr, per-item checks by NAME, weight, water,
// reading, reflections). Card *grouping* is intentionally not carried over — the clean
// app starts with fresh cards (see store.seedTemplate), and historical checks re-attach
// by name. Proven lossless against real data in scratchpad/migrate.js (46 days).

export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const DAY_RE = /^ht_\d{4}-\d{2}-\d{2}$/;

/** True items across every legacy check source, unified by name ("done anywhere that day"). */
function unifiedChecks(rec) {
  const checks = {};
  const add = (obj) => { if (obj) for (const n in obj) if (obj[n]) checks[n] = true; };
  add(rec.habits); add(rec.health); add(rec.extra);
  if (rec.cards) for (const cid in rec.cards) add(rec.cards[cid]);
  return checks;
}

/** Convert one legacy day record to a clean v2 day. */
export function cleanDay(rec) {
  const prayers = {};
  PRAYERS.forEach((p) => { if (rec.prayers && rec.prayers[p]) prayers[p] = true; });
  const takbir = {};
  if (rec.takbeer) for (const p in rec.takbeer) if (rec.takbeer[p]) takbir[p] = true;
  const reading = {};
  (rec.reading || []).forEach((b) => { if (b && b.t) reading[b.n] = b.t; });
  const reflections = {};
  if (rec.reflections) for (const k in rec.reflections) {
    if ((rec.reflections[k] || '').trim()) reflections[k] = rec.reflections[k];
  }
  const w = parseFloat(rec.weight);
  return {
    prayers, takbir,
    checks: unifiedChecks(rec),
    water: (rec.water || []).filter(Boolean).length,
    weight: isNaN(w) ? null : w,
    reading, reflections,
  };
}

/** Is there any legacy `ht_<date>` data to migrate? */
export function hasLegacy() {
  for (let i = 0; i < localStorage.length; i++) {
    if (DAY_RE.test(localStorage.key(i))) return true;
  }
  return false;
}

/** Read all legacy day records from localStorage into clean v2 days keyed by YYYY-MM-DD. */
export function migrateLegacyDays() {
  const days = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!DAY_RE.test(k)) continue;
    try { days[k.slice(3)] = cleanDay(JSON.parse(localStorage.getItem(k))); } catch { /* skip corrupt */ }
  }
  return days;
}
