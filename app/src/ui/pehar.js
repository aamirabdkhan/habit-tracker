// View: Pehar — day timeline (prayers + open stretches) with the calm free-time reveal.
import { icon } from '../core/dom.js';
import { set, get } from '../core/state.js';
import { peekDay, getTemplate, togglePrayer, todayKey, PRAYERS } from '../data/store.js';
import { buildPehar, clock, dur } from '../features/pehar.js';

function shiftDay(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function label(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
}

export function render(state) {
  const key = state.viewedDate;
  const day = peekDay(key);
  const { blocks, freeMin, stretches } = buildPehar(day, getTemplate().prayerTimes || {});
  const isToday = key === todayKey();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  let rows = '';
  blocks.forEach((b) => {
    if (isToday && b.start <= nowMin && b.end > nowMin) {
      rows += `<div class="nowrow"><span class="lbl">Now ${clock(nowMin)}</span><span class="line"></span></div>`;
    }
    if (b.type === 'prayer') {
      rows += `<div class="trow"><div class="tm">${clock(b.start)}</div>
        <div class="blk ${b.done ? 'done' : ''}" data-a="togglePrayer" data-name="${b.name}">
          <span class="box">${icon('check')}</span><span class="nm">${b.name}</span></div></div>`;
    } else {
      rows += `<div class="trow"><div class="tm">${clock(b.start)}<small>${dur(b.dur)}</small></div>
        <div class="blk free-blk" data-a="plan"><span class="nm">Open</span><span class="plan">+ plan</span></div></div>`;
    }
  });

  return `
  <div class="top">
    <div class="brand">${icon('sun', 'sun')} Waqt</div>
    <button class="icobtn muted" data-a="settings" aria-label="Settings">${icon('gear')}</button>
  </div>
  <div class="wrap">
    <div class="ov-head">Pehar</div>
    <div class="daynav"><button class="nb" data-a="prev">‹</button><span class="dl">${isToday ? 'Today · ' : ''}${label(key)}</span><button class="nb" data-a="next">›</button></div>

    <div class="free"><span class="num">${dur(freeMin)}</span><span class="lab">open between prayers</span><span class="sub">${stretches} stretches</span></div>

    <div class="tl">${rows}</div>
    <div class="pehar-note">Timed tasks will appear here once practices have times (Template).</div>
  </div>`;
}

export const actions = {
  togglePrayer: (d) => { togglePrayer(get().viewedDate, d.name); set({}); },
  prev: () => set({ viewedDate: shiftDay(get().viewedDate, -1) }),
  next: () => set({ viewedDate: shiftDay(get().viewedDate, 1) }),
  settings: () => set({ view: 'settings' }),
  plan: () => {/* TODO: plan a task into this stretch (needs timed practices) */},
};
