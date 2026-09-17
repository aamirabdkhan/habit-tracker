// data/store.js — the SINGLE storage boundary (clean v2 schema in localStorage).
// Views call these named functions; nothing else touches localStorage.
//
// Shape:  localStorage["waqt.v2"] = { version:2, template, days:{ "YYYY-MM-DD": Day } }
//   Day = { prayers:{name:true}, takbir:{prayer:true}, checks:{practiceName:true},
//           water:int, weight:number|null, reading:{book:pages}, reflections:{} }
// Checks are keyed by practice NAME so history survives any card re-grouping.

import { PRAYERS, hasLegacy, migrateLegacyDays } from './migrate.js';
export { PRAYERS };

const KEY = 'waqt.v2';

/** Local date key YYYY-MM-DD (matches production dayKey). */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Fresh card seed — the recurring practices suggested from the user's history
 * (one-off tasks like "SIR form submission" are intentionally excluded; they
 * stay in history by name). Colours reuse the user's prior card palette.
 * Editable later in the Template screen.
 */
function seedTemplate() {
  const card = (id, name, color, items) => ({ id, name, color, items: items.map((n) => ({ name: n, tracked: true })) });
  return {
    cards: [
      card('deeds', 'Adhkar & Deeds', '#b05a86', [
        'Tahajjud', 'Fajr Adhkar', 'Maghrib Adhkar', 'Ruqyah Fajr', 'Ruqyah Maghrib',
        'Surah Mulk', 'Surah Rahman', 'Surah Waqiyah',
      ]),
      card('study', 'Study', '#e0a33a', ['CEH', 'Flashcards + quizzes', 'Videos', 'CTF']),
      card('health', 'Health', '#4090d6', [
        'Exercise', 'Morning walk', 'No Nap', 'No Fap', 'No Porn', 'No sugar', 'No screen while eating',
      ]),
      card('routine', 'Meds & Routine', '#5FA46B', [
        'Morning Medicine', 'Night Medicine', 'Breakfast', 'Lunch', 'Dinner', 'Sleep', 'Wind up the day',
      ]),
    ],
    prayerTimes: { Fajr: '5:30', Dhuhr: '1:10', Asr: '4:35', Maghrib: '7:25', Isha: '9:25' },
    modules: { prayers: true, pehar: true, weight: true, reflections: true },
    takbirTargetDays: 40,
  };
}

const blankDay = () => ({ prayers: {}, takbir: {}, checks: {}, water: 0, weight: null, reading: {}, reflections: {} });

// ---- load (with first-run migration) ----
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to rebuild */ }
  const data = { version: 2, template: seedTemplate(), days: hasLegacy() ? migrateLegacyDays() : {} };
  save(data);
  return data;
}
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota/private mode */ } }

let data = load();

// ---- read ----
export const getTemplate = () => data.template;
/** Read-only: returns the day or a throwaway blank WITHOUT storing it (safe for rendering/analysis). */
export function peekDay(key) { return data.days[key] || blankDay(); }
/** Read-write: returns the stored day, creating it if needed (use only when about to mutate). */
export function getDay(key) {
  if (!data.days[key]) data.days[key] = blankDay();
  return data.days[key];
}
/** All day keys that have any logged data (for Overview/History/engine). */
export const loggedDayKeys = () => Object.keys(data.days).sort();

// ---- write (mutate + persist; TODO: queue cloud sync here) ----
export function togglePrayer(key, name) {
  const day = getDay(key);
  if (day.prayers[name]) delete day.prayers[name]; else day.prayers[name] = true;
  save(data);
}
export function toggleCheck(key, name) {
  const day = getDay(key);
  if (day.checks[name]) delete day.checks[name]; else day.checks[name] = true;
  save(data);
}
export function toggleTakbir(key, name) {
  const day = getDay(key);
  if (day.takbir[name]) delete day.takbir[name]; else day.takbir[name] = true;
  save(data);
}
