// View: Today — the calm daily checklist. Prayers are the anchor (Muslim-first);
// a glanceable "up next" peeks at the Pehar. Reads state + store, writes via store.
import { icon, esc } from '../core/dom.js';
import { set, get } from '../core/state.js';
import { getDay, getTemplate, togglePrayer, toggleCheck, PRAYERS } from '../data/store.js';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function weekStrip(viewedKey) {
  const [y, m, d] = viewedKey.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  let out = '';
  for (let i = -3; i <= 3; i++) {
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const on = i === 0;
    out += `<div class="wd ${on ? 'on' : ''}"><div class="dow">${DOW[dt.getDay()]}</div>` +
      `<div class="dn">${dt.getDate()}</div>${on ? '<div class="prog"></div>' : ''}</div>`;
  }
  return out;
}

export function render(state) {
  const key = state.viewedDate;
  const day = getDay(key);
  const tpl = getTemplate();

  const prayersDone = PRAYERS.filter((p) => day.prayers[p]).length;
  const nextPrayer = PRAYERS.find((p) => !day.prayers[p]);
  const items = tpl.cards.flatMap((c) => c.items);
  const goalsDone = items.filter((it) => day.checks[it.id]).length;
  const pct = Math.round(((prayersDone + goalsDone) / (PRAYERS.length + items.length)) * 100) || 0;

  return `
  <div class="top">
    <div class="brand">${icon('sun', 'sun')} Waqt</div>
    <div style="display:flex;gap:6px">
      <button class="icobtn" data-a="new" aria-label="New entry">${icon('plus')}</button>
      <button class="icobtn muted" data-a="menu" aria-label="Menu">${icon('menu')}</button>
    </div>
  </div>
  <div class="tagline">A calmer you<br>A brighter tomorrow</div>

  <div class="week">${weekStrip(key)}</div>

  ${upNext(day, nextPrayer, pct)}

  <div class="wrap">
    <div class="summary">
      <div class="sm"><div class="n">${prayersDone}<small>/${PRAYERS.length}</small></div><div class="l">Prayers</div></div>
      <div class="sm"><div class="n">${goalsDone}<small>/${items.length}</small></div><div class="l">Goals</div></div>
      <div class="sm"><div class="n">${day.weight ?? '—'}<small>${day.weight ? 'kg' : ''}</small></div><div class="l">Weight</div></div>
    </div>

    ${prayersSection(day, nextPrayer, prayersDone, tpl)}
    ${practicesSection(day, tpl, goalsDone, items.length)}

    ${day.weight ? `<div class="sec"><div class="sec-h"><span class="sec-num">03</span><span class="sec-name">Weight</span></div>
      <div class="weight"><div class="wv">${day.weight} <small>kg</small></div><div class="wnote">logged today</div></div></div>` : ''}

    <div class="reflect" data-a="reflect">
      <div><div class="rl">Reflect on today</div><div class="rs">5 quiet prompts · ${day.reflectionDone ? 'done' : 'not done yet'}</div></div>
      <span class="rdot" ${day.reflectionDone ? 'hidden' : ''}></span>
    </div>
  </div>`;
}

function upNext(day, nextPrayer, pct) {
  if (!nextPrayer) return '';
  const t = day.prayerTimes[nextPrayer] || '';
  const remaining = PRAYERS.filter((p) => !day.prayers[p] && p !== nextPrayer);
  const off = 163 - (163 * pct) / 100;
  return `
  <div class="upnext">
    <div class="un-top">
      <div><div class="k">Next prayer</div><div class="p">${nextPrayer}</div><div class="t">${t}</div></div>
      <div class="ring"><svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="26" fill="none" stroke="var(--rule-2)" stroke-width="4"/>
        <circle cx="30" cy="30" r="26" fill="none" stroke="var(--green)" stroke-width="4" stroke-linecap="round"
          stroke-dasharray="163" stroke-dashoffset="${off}"/></svg><div class="pct">${pct}%</div></div>
    </div>
    ${remaining.length ? `<div class="un-list">${remaining.map((p) =>
      `<div class="un-row"><span class="un-dot un-pr"></span><span class="un-tm">${day.prayerTimes[p] || ''}</span><span class="un-nm">${p}</span><span class="un-tag">prayer</span></div>`
    ).join('')}</div>` : ''}
    <button class="un-link" data-a="openPehar">Open Pehar →</button>
  </div>`;
}

function prayersSection(day, nextPrayer, done, tpl) {
  const cells = PRAYERS.map((p) => {
    const isDone = day.prayers[p], isNext = p === nextPrayer;
    return `<div class="pr ${isDone ? 'done' : ''} ${isNext ? 'next' : ''}" data-a="togglePrayer" data-name="${p}">
      ${isDone ? '<span class="chk">✓</span>' : ''}<div class="nm">${p}</div><div class="tm">${day.prayerTimes[p] || ''}</div></div>`;
  }).join('');
  const takbir = (day.takbir || []);
  const tdots = PRAYERS.map((_, i) => `<span class="tdot ${takbir[i] ? 'on' : ''}">${takbir[i] ? '✓' : ''}</span>`).join('');
  const streak = takbir.filter(Boolean).length;
  return `<div class="sec"><div class="sec-h"><span class="sec-num">01</span><span class="sec-name">Prayers</span><span class="sec-meta">${done} / ${PRAYERS.length}</span></div>
    <div class="prayers">${cells}</div>
    <div class="takbir"><div><div class="tl">First Takbīr</div><div class="dots">${tdots}</div></div>
      <div class="streak">🔥 ${streak} / ${tpl.takbirTargetDays} days</div></div></div>`;
}

function practicesSection(day, tpl, done, total) {
  const cards = tpl.cards.map((c) => {
    const rows = c.items.map((it) => {
      const on = day.checks[it.id];
      return `<div class="item ${on ? 'done' : ''}" data-a="toggleCheck" data-id="${it.id}">
        <span class="box">${icon('check')}</span><span class="nm">${esc(it.name)}</span></div>`;
    }).join('');
    const cdone = c.items.filter((it) => day.checks[it.id]).length;
    return `<div class="card"><div class="card-h"><div class="cn"><span class="cdot" style="background:${c.color}"></span>${esc(c.name)}</div>
      <div class="cc">${cdone}/${c.items.length}</div></div>${rows}
      <div class="additem"><input placeholder="Add for today…" data-a="addPlaceholder"><span class="plus">+ ADD</span></div></div>`;
  }).join('');
  return `<div class="sec"><div class="sec-h"><span class="sec-num">02</span><span class="sec-name">Practices</span><span class="sec-meta">${done} / ${total}</span></div>${cards}</div>`;
}

// Interactions — mutate via store, then set({}) to re-render.
export const actions = {
  togglePrayer: (d) => { togglePrayer(get().viewedDate, d.name); set({}); },
  toggleCheck: (d) => { toggleCheck(get().viewedDate, d.id); set({}); },
  openPehar: () => set({ view: 'pehar' }),
  reflect: () => {/* TODO: open reflection wizard */},
  new: () => {/* TODO: new-entry / add flow */},
  menu: () => {/* TODO: open drawer */},
  addPlaceholder: () => {/* TODO: inline add practice */},
};
