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
    prayerTimes: { Fajr: '05:30', Dhuhr: '13:10', Asr: '16:35', Maghrib: '19:25', Isha: '21:25' },
    modules: { prayers: true, pehar: true, weight: true, reflections: true },
    takbirTargetDays: 40,
  };
}

const blankDay = () => ({ prayers: {}, takbir: {}, checks: {}, water: 0, weight: null, reading: {}, reflections: {} });

// ---- load (with first-run migration) ----
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (!d.mts) d.mts = {}; if (d.onboarded === undefined) d.onboarded = true; return d; }
  } catch { /* fall through to rebuild */ }
  // fresh install: onboard. migrated-from-legacy: treat as already onboarded.
  const legacy = hasLegacy();
  const d = { version: 2, template: seedTemplate(), days: legacy ? migrateLegacyDays() : {}, mts: {}, onboarded: legacy };
  save(d);
  return d;
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

// stamp a local edit time on a key ('template' or a date) for last-write-wins sync
function touch(k) { data.mts[k] = Date.now(); }

// ---- write (mutate + stamp + persist) ----
export function togglePrayer(key, name) {
  const day = getDay(key);
  if (day.prayers[name]) delete day.prayers[name]; else day.prayers[name] = true;
  touch(key); save(data);
}
export function toggleCheck(key, name) {
  const day = getDay(key);
  if (day.checks[name]) delete day.checks[name]; else day.checks[name] = true;
  touch(key); save(data);
}
export function toggleTakbir(key, name) {
  const day = getDay(key);
  if (day.takbir[name]) delete day.takbir[name]; else day.takbir[name] = true;
  touch(key); save(data);
}

// ---- template editing (Template screen) ----
const findCard = (id) => data.template.cards.find((c) => c.id === id);
export function addPractice(cardId, name) {
  const c = findCard(cardId); const n = (name || '').trim();
  if (c && n && !c.items.some((i) => i.name === n)) { c.items.push({ name: n, tracked: true }); touch('template'); save(data); }
}
export function removePractice(cardId, name) {
  const c = findCard(cardId);
  if (c) { c.items = c.items.filter((i) => i.name !== name); touch('template'); save(data); }
}
export function setPracticeField(cardId, name, field, value) {
  const c = findCard(cardId); const it = c && c.items.find((i) => i.name === name);
  if (it) { if (value === '' || value == null) delete it[field]; else it[field] = value; touch('template'); save(data); }
}
export function addCard(name) {
  const n = (name || '').trim();
  if (n) { data.template.cards.push({ id: 'c_' + Math.random().toString(36).slice(2, 8), name: n, color: '#5FA46B', items: [] }); touch('template'); save(data); }
}

// ---- settings ----
export function setPrayerTime(name, time) { data.template.prayerTimes[name] = time; touch('template'); save(data); }
export function toggleModule(name) { data.template.modules[name] = !data.template.modules[name]; touch('template'); save(data); }
export const getModules = () => data.template.modules;

// ---- onboarding ----
export const isOnboarded = () => !!data.onboarded;
export function setOnboarded() { data.onboarded = true; save(data); }

// ---- backup ----
export const exportJSON = () => JSON.stringify(data, null, 2);
export function importJSON(str) {
  const o = JSON.parse(str);
  if (!o || o.version !== 2 || typeof o.days !== 'object') throw new Error('Not a Waqt v2 backup.');
  data = o; if (!data.mts) data.mts = {};
  Object.keys(data.days).forEach((k) => touch(k)); touch('template'); save(data);
}

// ---- sync support (per-key last-write-wins; template + each day is a row) ----
/** Rows to push to the cloud, each with this device's last local edit time. */
export function syncRows() {
  const rows = [{ k: 'template', v: data.template, mt: data.mts.template || 0 }];
  Object.keys(data.days).forEach((d) => rows.push({ k: d, v: data.days[d], mt: data.mts[d] || 0 }));
  return rows;
}
/** Apply a remote row iff it's newer than our local edit of that key. Returns true if local changed. */
export function applyRemote(k, v, remoteUpdatedAt) {
  const remoteTs = remoteUpdatedAt ? Date.parse(remoteUpdatedAt) : 0;
  if (!remoteTs || remoteTs <= (data.mts[k] || 0)) return false;
  if (k === 'template') data.template = v; else data.days[k] = v;
  data.mts[k] = remoteTs; save(data); return true;
}
export const localMt = (k) => (data.mts[k] || 0);
