// View: Template — "what you repeat". Object-first: tap a practice to reveal its
// config (track in Overview, optional time, remove). Adding a time makes it show
// as a task block on the Pehar.
import { icon, esc } from '../core/dom.js';
import { set } from '../core/state.js';
import { getTemplate, addPractice, removePractice, setPracticeField, addCard } from '../data/store.js';

let openItem = null; // "cardId:name" currently expanded

export function render() {
  const tpl = getTemplate();
  const cards = tpl.cards.map((c) => {
    const items = c.items.map((it) => {
      const k = `${c.id}:${it.name}`;
      const meta = [it.tracked ? 'tracked' : 'not tracked', it.time || null].filter(Boolean).join(' · ');
      const head = `<div class="titem ${openItem === k ? 'open' : ''}" data-a="expand" data-key="${esc(k)}">
        <span class="tn">${esc(it.name)}</span><span class="tmeta">${esc(meta)}</span><span class="chev">›</span></div>`;
      const cfg = openItem === k ? `<div class="tcfg">
        <div class="cfgrow"><span class="k">Track in Overview</span>
          <input type="checkbox" class="switch" data-a="toggleTracked" data-card="${c.id}" data-name="${esc(it.name)}" ${it.tracked ? 'checked' : ''}></div>
        <div class="cfgrow"><span class="k">Time <span style="opacity:.6">(shows on Pehar)</span></span>
          <input type="time" class="tinput" data-a="setTime" data-card="${c.id}" data-name="${esc(it.name)}" value="${esc(it.time || '')}"></div>
        <button class="del" data-a="removePractice" data-card="${c.id}" data-name="${esc(it.name)}">Remove practice</button>
      </div>` : '';
      return head + cfg;
    }).join('');
    return `<div class="card">
      <div class="card-h2"><span class="cdot" style="background:${c.color}"></span><span class="cname">${esc(c.name)}</span><span class="ccount">${c.items.length} practice${c.items.length === 1 ? '' : 's'}</span></div>
      ${items}
      <div class="additem"><input placeholder="Add a practice…" data-a="addPractice" data-card="${c.id}"><span class="plus">↵</span></div>
    </div>`;
  }).join('');

  return `
  <div class="top"><div class="brand">${icon('sun', 'sun')} Waqt</div>
    <button class="icobtn muted" data-a="settings" aria-label="Settings">${icon('gear')}</button></div>
  <div class="wrap">
    <div class="ov-head">Template</div>
    <div class="sub-line">What you repeat</div>
    ${cards}
    <div class="newcard"><input placeholder="+ New card…" data-a="addCard"></div>
  </div>`;
}

export const actions = {
  expand: (d) => { openItem = openItem === d.key ? null : d.key; set({}); },
  toggleTracked: (d, el) => { setPracticeField(d.card, d.name, 'tracked', el.checked); set({}); },
  setTime: (d, el) => { setPracticeField(d.card, d.name, 'time', el.value); set({}); },
  removePractice: (d) => { openItem = null; removePractice(d.card, d.name); set({}); },
  addPractice: (d, el, e) => { if (e.key === 'Enter' && el.value.trim()) { addPractice(d.card, el.value); el.value = ''; set({}); } },
  addCard: (d, el, e) => { if (e.key === 'Enter' && el.value.trim()) { addCard(el.value); el.value = ''; set({}); } },
  settings: () => set({ view: 'settings' }),
};
