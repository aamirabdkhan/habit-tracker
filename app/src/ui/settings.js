// View: Settings — reached via the gear/menu. Grouped: Prayer, Modules, Data, App.
// Prayer times + module toggles + backup are real; notifications/cloud sync are
// honest placeholders until the sync + service-worker phase.
import { icon, esc } from '../core/dom.js';
import { set } from '../core/state.js';
import { getTemplate, getModules, setPrayerTime, toggleModule, exportJSON, importJSON, todayKey, PRAYERS } from '../data/store.js';
import { currentUser, signIn, signUp, signOut, syncNow } from '../data/sync.js';
import { pushState, subscribePush, unsubscribePush, syncPrayerReminders } from '../features/notifications.js';
import { getWidgetToken } from '../features/widget.js';

const APP_VERSION = '2026-09-23.1';
const msg = (t) => { const el = document.getElementById('cs-msg'); if (el) el.textContent = t; };

let notif = null; // cached push state; refreshed lazily when Settings renders
function remindersRow() {
  if (!currentUser()) return `<div class="srow"><span class="sl">Prayer reminders<small>log in to cloud sync to enable</small></span><span class="sv">—</span></div>`;
  if (notif === null) pushState().then((s) => { notif = s; set({}); });
  if (notif === 'unsupported') return `<div class="srow"><span class="sl">Prayer reminders</span><span class="sv">not supported here</span></div>`;
  if (notif === 'denied') return `<div class="srow"><span class="sl">Prayer reminders<small>blocked — allow notifications in browser settings</small></span><span class="sv">blocked</span></div>`;
  if (notif === 'subscribed') return `<button class="setbtn" data-a="disableNotif">Prayer reminders · on <span>Turn off</span></button>`;
  return `<button class="setbtn" data-a="enableNotif">Enable prayer reminders <span>→</span></button>`;
}

function cloudSection() {
  const u = currentUser();
  if (u) {
    return `<div class="cloud"><div class="ce"><span class="dot"></span>Synced<small>${esc(u.email || '')}</small></div>
      <div class="cb"><button data-a="syncnow">Sync now</button><button class="signout" data-a="signout">Sign out</button></div></div>`;
  }
  return `<div class="cloud">
    <input id="cs-email" class="cinput" type="email" placeholder="you@example.com" autocomplete="username">
    <input id="cs-pw" class="cinput" type="password" placeholder="password" autocomplete="current-password">
    <div class="cb"><button data-a="login">Log in</button><button data-a="signup">Sign up</button></div>
    <div id="cs-msg" class="cmsg"></div></div>`;
}

const MODULES = [
  ['prayers', 'Prayers', 'Fajr → Isha on your day'],
  ['pehar', 'Pehar', 'your day as a timeline'],
  ['weight', 'Weight tracking', ''],
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
    <div class="sgroup"><div class="gl">Cloud sync</div>${cloudSection()}</div>

    <div class="sgroup"><div class="gl">Data</div>
      <button class="setbtn" data-a="export">Export all data <span>↓</span></button>
      <button class="setbtn" data-a="importPick">Import data <span>↑</span></button>
      <input type="file" id="waqt-import" accept="application/json" hidden data-a="importFile">
    </div>
    <div class="sgroup"><div class="gl">Reminders</div>${remindersRow()}</div>

    <div class="sgroup"><div class="gl">Widget</div>
      <button class="setbtn" data-a="setupWidget">Set up home-screen widget <span>›</span></button>
      <div class="ob-hint" style="margin-top:8px">Shows today's Pehar via the free Scriptable app on iPhone.</div>
    </div>

    <div class="sgroup"><div class="gl">App</div>
      <div class="srow"><span class="sl">Version</span><span class="sv">${APP_VERSION}</span></div>
    </div>
    <div class="setver">Waqt · a record of a quieter mind</div>
  </div>`;
}

export const actions = {
  back: () => set({ view: 'today' }),
  setPrayerTime: (d, el) => { setPrayerTime(d.name, el.value); syncPrayerReminders(); },
  enableNotif: async () => { try { await subscribePush(); notif = 'subscribed'; set({}); } catch (e) { alert(e.message); } },
  disableNotif: async () => { await unsubscribePush(); notif = 'not-subscribed'; set({}); },
  setupWidget: async () => {
    const t = await getWidgetToken();
    if (!t) { alert('Log in to cloud sync first.'); return; }
    window.prompt('Widget token — paste this into your Scriptable “Waqt Pehar” script (TOKEN):', t);
  },
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
  // cloud sync
  login: async () => {
    const e = document.getElementById('cs-email').value, p = document.getElementById('cs-pw').value;
    if (!e || !p) return msg('Enter your email and password.');
    msg('Logging in…'); const { error } = await signIn(e, p); if (error) msg(error.message);
  },
  signup: async () => {
    const e = document.getElementById('cs-email').value, p = document.getElementById('cs-pw').value;
    if (!e || !p) return msg('Enter an email and password.');
    msg('Creating account…'); const { data, error } = await signUp(e, p);
    if (error) msg(error.message); else if (!data.session) msg('Check your email to confirm, then log in.');
  },
  signout: () => signOut(),
  syncnow: () => { msg('Syncing…'); syncNow().then(() => msg('Synced.')); },
};
