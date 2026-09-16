// Reactive app state — a minimal observable, no framework.
// UI subscribes; features call set() after mutating data; the router re-renders.

import { todayKey } from '../data/store.js';

const state = {
  view: 'today',          // 'today' | 'pehar' | 'overview' | 'template' | 'settings'
  viewedDate: todayKey(), // day currently shown (YYYY-MM-DD)
};

const listeners = new Set();

/** Read the current state (treat as read-only). */
export const get = () => state;

/** Merge a patch into state and notify subscribers. */
export function set(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

/** Subscribe to state changes; returns an unsubscribe fn. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
