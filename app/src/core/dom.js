// Tiny DOM helpers — the only "framework" this app has. No dependencies.

/** Escape user-supplied text before it enters an HTML string (XSS boundary). */
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/** Get an element by id. */
export const $ = (id) => document.getElementById(id);

/**
 * Delegated event binding: one listener on `root`, dispatched by the nearest
 * ancestor carrying [data-a="<action>"]. Views define an `actions` map keyed by
 * that action name, so rendered nodes need no per-element listeners.
 */
export function delegate(root, type, actions) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest('[data-a]');
    if (!t || !root.contains(t)) return;
    const fn = actions[t.dataset.a];
    if (fn) fn(t.dataset, t, e);
  });
}

/** Line-icon set (stroke, currentColor). Keep one coherent family. */
const P = {
  sun: `<circle cx="12" cy="10" r="4"/><path d="M12 2v2M4 10H2M22 10h-2M6 4.5 5 3.5M18 4.5l1-1"/><path d="M8 20l4-3 4 3" stroke-linejoin="round"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  menu: `<path d="M3 6h18M3 12h18M3 18h18"/>`,
  check: `<path d="M4 12l5 5L20 6"/>`,
  home: `<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  chart: `<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`,
  list: `<path d="M4 6h16M4 12h16M4 18h10"/>`,
};
export const icon = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${P[name] || ''}</svg>`;
