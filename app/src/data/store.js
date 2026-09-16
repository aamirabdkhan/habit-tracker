// data/store.js — the SINGLE storage boundary. Views never touch localStorage;
// they call these named functions. Today this is backed by an in-memory sample so
// the UI can be built and previewed; the real localStorage implementation (reading
// the production `ht_d` / `ht_<date>` schema — see schema.js) drops in behind these
// exact signatures next, without touching any view.

/** Local date key YYYY-MM-DD (local parts, matching the production `dayKey`). */
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// ---- sample data (temporary; replaced by localStorage-backed reads) --------------
const template = {
  cards: [
    { id: 'goals', name: 'Daily Goals', color: 'var(--green)', items: [
      { id: 'walk', name: 'Morning walk', tracked: true },
      { id: 'read', name: 'Read 10 pages', tracked: true },
      { id: 'sleep', name: 'Sleep before 12', tracked: true },
    ] },
    { id: 'health', name: 'Health', color: 'var(--amber)', items: [
      { id: 'ex', name: 'Exercise', tracked: true },
      { id: 'water', name: '2L water', tracked: false },
    ] },
  ],
  modules: { prayers: true, pehar: true, weight: true, reflections: true },
  takbirTargetDays: 40,
};

const days = {
  [todayKey()]: {
    prayers: { Fajr: true, Dhuhr: true, Asr: false, Maghrib: false, Isha: false },
    prayerTimes: { Fajr: '5:30', Dhuhr: '1:10', Asr: '4:35', Maghrib: '7:25', Isha: '9:25' },
    takbir: [true, true, false, false, false],
    checks: { walk: true, read: true, sleep: false, ex: false, water: false },
    weight: 81.2,
    reflectionDone: false,
  },
};

function blankDay() {
  return { prayers: {}, prayerTimes: {}, takbir: [], checks: {}, weight: null, reflectionDone: false };
}

// ---- read ----
export const getTemplate = () => template;
export function getDay(key) {
  return days[key] || (days[key] = blankDay());
}

// ---- write (mutate + persist; persistence is a no-op in the sample) ----
export function togglePrayer(key, name) {
  const day = getDay(key);
  day.prayers[name] = !day.prayers[name];
  persist(key);
}
export function toggleCheck(key, itemId) {
  const day = getDay(key);
  day.checks[itemId] = !day.checks[itemId];
  persist(key);
}

function persist(/* key */) {
  // TODO(store): write days[key] to localStorage as `ht_<key>` + stamp `_mt`,
  // then queue cloud sync (data/sync.js). No-op while sample-backed.
}
