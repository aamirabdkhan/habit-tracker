// View: Overview — clarity first. Real month-strip consistency (prayers + practices),
// then a small honest "Patterns" block (meaningfulness-filtered, confidence-labelled),
// then weight. Reframe: clarity + time is the headline; correlations are a slow burn.
import { esc } from '../core/dom.js';
import { sectionHead } from './components.js';
import { peekDay, getTemplate, loggedDayKeys, todayKey, PRAYERS } from '../data/store.js';
import { findPatterns } from '../features/correlations.js';

const WINDOW = 30; // days shown in the strips

function windowKeys(n) {
  const t = new Date(), out = [];
  for (let i = n - 1; i >= 0; i--) out.push(todayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - i)));
  return out;
}

function strip(name, cells) {
  const on = cells.filter(Boolean).length;
  const bars = cells.map((v) => `<i class="${v ? 'on' : ''}"></i>`).join('');
  return `<div class="mrow"><span class="cn">${esc(name)}</span><div class="strip">${bars}</div><span class="cpct">${on}/${cells.length}</span></div>`;
}

export function render() {
  const tpl = getTemplate();
  const win = windowKeys(WINDOW);
  const winDays = win.map(peekDay);

  // consistency strips
  const prayerStrips = PRAYERS.map((p) => strip(p, winDays.map((d) => !!d.prayers[p]))).join('');
  const tracked = tpl.cards.flatMap((c) => c.items.filter((it) => it.tracked).map((it) => ({ name: it.name })));
  const practiceStrips = tracked
    .map((it) => ({ name: it.name, cells: winDays.map((d) => !!d.checks[it.name]) }))
    .filter((s) => s.cells.some(Boolean))              // hide never-done ones (noise)
    .sort((a, b) => b.cells.filter(Boolean).length - a.cells.filter(Boolean).length)
    .map((s) => strip(s.name, s.cells)).join('');

  return `
  <div class="top"><div class="brand"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="10" r="4"/><path d="M12 2v2M4 10H2M22 10h-2M6 4.5 5 3.5M18 4.5l1-1"/><path d="M8 20l4-3 4 3" stroke-linejoin="round"/></svg> Waqt</div></div>
  <div class="wrap">
    <div class="ov-head">Overview</div>
    <div class="range"><button class="on">Last 30 days</button></div>

    <div class="sec">${sectionHead('01', 'Prayers', 'last 30 days')}${prayerStrips}</div>
    <div class="sec">${sectionHead('02', 'Practices', 'last 30 days')}${practiceStrips || '<div class="ov-empty">No practice logged in this window yet.</div>'}</div>

    ${patternsSection(tpl)}
    ${weightSection()}
  </div>`;
}

function patternsSection(tpl) {
  // signals over ALL history, category-tagged for the meaningfulness filter
  const keys = loggedDayKeys();
  const days = keys.map(peekDay);
  const signals = [];
  PRAYERS.forEach((p) => signals.push({ name: p, category: 'Prayer', values: days.map((d) => (d.prayers[p] ? 1 : 0)) }));
  tpl.cards.forEach((c) => c.items.forEach((it) => {
    if (it.tracked) signals.push({ name: it.name, category: c.name, values: days.map((d) => (d.checks[it.name] ? 1 : 0)) });
  }));

  const { strong, emerging, analysed } = findPatterns(signals);
  const line = (r, chip) => {
    const dir = r.positive ? 'also' : 'tend to skip';
    return `<div class="pat"><div class="ins">On days you <b>${esc(r.b)}</b>, you ${dir} <b>${esc(r.a)}</b>.</div>
      <div class="ev"><span class="cnt">${r.whenA}% vs ${r.whenNotA}% · n=${r.n}</span><span class="chip ${chip}">${chip}</span></div></div>`;
  };

  let body;
  if (strong.length) {
    body = strong.map((r) => line(r, 'strong')).join('') + emerging.map((r) => line(r, 'emerging')).join('');
  } else {
    body = `<div class="ov-learning">Still learning your patterns — trustworthy links need more varied days.
      ${emerging.length ? 'A few early signals are forming:' : `Analysing ${analysed} signals so far.`}</div>`
      + emerging.map((r) => line(r, 'emerging')).join('');
  }
  return `<div class="sec">${sectionHead('03', 'Patterns', 'what the record is showing')}${body}</div>`;
}

function weightSection() {
  const pts = loggedDayKeys().map(peekDay).map((d) => d.weight).filter((w) => w != null);
  if (pts.length < 2) return '';
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const step = 320 / (pts.length - 1);
  const path = pts.map((w, i) => `${(i * step).toFixed(0)},${(60 - ((w - min) / span) * 52 + 4).toFixed(0)}`).join(' ');
  const change = (pts[pts.length - 1] - pts[0]).toFixed(1);
  return `<div class="sec">${sectionHead('04', 'Weight', `${pts.length} entries`)}
    <div class="wt-top"><div class="wt-v">${pts[pts.length - 1]} <small>kg</small></div><div class="wt-d">${change >= 0 ? '+' : ''}${change} kg</div></div>
    <svg class="spark" viewBox="0 0 320 70" preserveAspectRatio="none"><polyline fill="none" stroke="var(--gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${path}"/></svg></div>`;
}

export const actions = {};
