// View: Settings — reached via the gear/menu. Grouped: Prayer, Modules, Data, App.
// Prayer times + module toggles + backup are real; notifications/cloud sync are
// honest placeholders until the sync + service-worker phase.
import { icon, esc } from '../core/dom.js';
import { set } from '../core/state.js';
import { getTemplate, getModules, setPrayerTime, toggleModule, exportJSON, importJSON, todayKey, PRAYERS } from '../data/store.js';

const APP_VERSION = '2026-09-17.1';

const MODULES = [
  ['prayers', 'Prayers', 'Fajr → Isha on your day'],
  ['pehar', 'Pehar', 'your day as a timeline'],
  ['weight', 'Weight tracking', ''],
  ['reflections', 'Reflections', '5 nightly prompts'],
];

export function render() {
  const times = getTemplate().prayerTimes || {};
  const mods = getModules();

  const prayerRows = PRAYERS.map((p) =>
    `<div class="srow"><span class="sl">${p}</span>
       <input type="time" class="tinput" data-a="setPrayerTime" data-name="${p}" value="${esc(times[p] || '')}"></div>`
  ).join('');

  const moduleRows = MODULES.map(([id, label, sub]) =>
    `<div class="srow"><span class="sl">${label}${sub ? `<small>${sub}</small>` : ''}</span>
       <input type="checkbox" class="switch" data-a="toggleModule" data-name="${id}" ${mods[id] ? 'checked' : ''}></div>`
  ).join('');

  return `
  <div class="bar"><button class="back" data-a="back">${icon('list')}Back</button><div class="t">Settings</div></div>
  <div class="wrap">
    <div class="sgroup"><div class="gl">Prayer times</div>${prayerRows}</div>
    <div class="sgroup"><div class="gl">Modules</div>${moduleRows}</div>
    <div class="sgroup"><div class="gl">Data</div>
      <button class="setbtn" data-a="export">Export all data <span>↓</span></button>
      <button class="setbtn" data-a="importPick">Import data <span>↑</span></button>
      <input type="file" id="waqt-import" accept="application/json" hidden data-a="importFile">
      <div class="srow"><span class="sl">Cloud sync<small>arrives with the next update</small></span><span class="sv">not set up</span></div>
    </div>
    <div class="sgroup"><div class="gl">App</div>
      <div class="srow"><span class="sl">Notifications<small>arrives with the next update</small></span><span class="sv">off</span></div>
      <div class="srow"><span class="sl">Version</span><span class="sv">${APP_VERSION}</span></div>
    </div>
    <div class="setver">Waqt · a record of a quieter mind</div>
  </div>`;
}

export const actions = {
  back: () => set({ view: 'today' }),
  setPrayerTime: (d, el) => { setPrayerTime(d.name, el.value); },
  toggleModule: (d, el) => { toggleModule(d.name); el.blur(); },
  export: () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `waqt-backup-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(a.href);
  },
  importPick: () => document.getElementById('waqt-import').click(),
  importFile: (d, el) => {
    const f = el.files[0]; if (!f) return;
    if (!confirm('Importing replaces all current data. Continue?')) { el.value = ''; return; }
    const r = new FileReader();
    r.onload = () => { try { importJSON(r.result); alert('Imported.'); set({}); } catch { alert('That file could not be read.'); } el.value = ''; };
    r.readAsText(f);
  },
};
