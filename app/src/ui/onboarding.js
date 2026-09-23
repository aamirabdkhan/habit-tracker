// View: Onboarding — a light first-run. Welcome + set prayer times, then Begin.
// Shown only when the store isn't onboarded (fresh install).
import { icon, esc } from '../core/dom.js';
import { set } from '../core/state.js';
import { getTemplate, setPrayerTime, setOnboarded, PRAYERS } from '../data/store.js';

export function render() {
  const times = getTemplate().prayerTimes || {};
  const rows = PRAYERS.map((p) =>
    `<div class="ob-row"><span class="ob-p">${p}</span>
       <input type="time" class="tinput" data-a="setTime" data-name="${p}" value="${esc(times[p] || '')}"></div>`
  ).join('');

  return `<div class="ob">
    <div class="ob-top"><div class="brand">${icon('sun', 'sun')} Waqt</div></div>
    <div class="ob-hero">
      <div class="ob-title">A record of<br>a quieter mind.</div>
      <p class="ob-sub">Track your prayers and practices, see your day on the Pehar, and let the record show you your patterns — honestly, only when they're real.</p>
    </div>
    <div class="ob-times">
      <div class="gl">Set your prayer times</div>
      ${rows}
      <div class="ob-hint">You can change these anytime in Settings.</div>
    </div>
    <button class="ob-begin" data-a="begin">Begin <span>→</span></button>
  </div>`;
}

export const actions = {
  setTime: (d, el) => setPrayerTime(d.name, el.value),
  begin: () => { setOnboarded(); set({ view: 'today' }); },
};
