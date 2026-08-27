// ===== WEEKLY-HTML REDESIGN (experimental) =====
// Real data, real functions (gDef/sDef/gDay/getNotifTime/setNotifTime/sDay —
// all production, untouched). Nothing here is ever auto-deployed.

// Stamp a local modified-time on every genuine local ht_d write so cloud sync can do last-write-wins
// (see mergeTemplate). Cloud sync writes ht_d via localStorage.setItem directly, NOT via sDef, so
// this only records real local edits (add/remove/toggle items) and the one-time v3 migration.
if (typeof sDef === "function" && !sDef.__mtWrapped) {
  var _sDefBase = sDef;
  sDef = function(d) { _sDefBase(d); try { localStorage.setItem("ht_d_mt", String(Date.now())); } catch(e) {} };
  sDef.__mtWrapped = true;
}

// ---- App updates (no reinstall, no data loss) --------------------------------------------------
// A new deploy bumps the service worker; it installs and WAITS (sw.js no longer skipWaiting on
// install). We surface an "update available" banner and a Settings button; tapping either tells the
// waiting worker to activate, then reloads once so the fresh files load. Mirrors the day-log app.
var APP_VERSION = "2026-08-27.1";
var swReg = null, swUpdateReady = false;
function markUpdateReady() {
  if (swUpdateReady) return;
  swUpdateReady = true;
  showUpdateBanner();
  if (view === "prefs" && typeof render === "function") render();  // reflect "update ready" in Settings
}
function showUpdateBanner() {
  if (document.getElementById("waqt-update-banner")) return;
  var b = document.createElement("div");
  b.id = "waqt-update-banner";
  b.className = "waqt-update-banner";
  b.innerHTML = '<span>A new version of Waqt is ready.</span><button type="button" data-a="doupdate">Update now</button>';
  document.body.appendChild(b);
}
if ("serviceWorker" in navigator) {
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", function() { if (hadController) location.reload(); });
  navigator.serviceWorker.getRegistration().then(function(reg) {
    if (!reg) return;
    swReg = reg;
    reg.update().catch(function() {});
    if (reg.waiting && navigator.serviceWorker.controller) markUpdateReady();
    reg.addEventListener("updatefound", function() {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", function() {
        if (nw.state === "installed" && navigator.serviceWorker.controller) markUpdateReady();
      });
    });
  }).catch(function() {});
}

var schEdit = null;          // "field::name" of the item whose inline editor is open
var schAddCard = null;       // cardId whose "Add for today" form is open (or null)
var schQuickGap = null;      // {start, cardId} for the Free time quick-add form
var schGestSwipedAt = 0;     // Date.now() of the last swipe-completed gesture — guards the schtog
                              // click handler against the browser's post-touch synthetic click (Task 8)
var onbStep = 1;             // Setup onboarding: 1 = prayer choice, 2 = prayer setup, 3 = finish

// ---- Help & tutorial (help/tour/AI-walkthrough) state — spec 2026-08-12-waqt-help-tutorial-design ----
var helpTopic = null;        // key into HELP_TOPICS, or null when the ? overlay is closed

// Toggle done-state for prayers, base-card items, or new-card items alike. Single code path shared
// by the tap-to-toggle click handler (data-a="schtog") and the swipe-right-to-complete gesture (Task 8).
function schToggle(f, k) {
  if (f === "prayers") { cData.prayers[k] = !cData.prayers[k]; }
  else if (isBaseCard(f)) { cData[f][k] = !cData[f][k]; }
  else { if (!cData.cards) cData.cards = {}; if (!cData.cards[f]) cData.cards[f] = {}; cData.cards[f][k] = !cData.cards[f][k]; }
  sDay();
}

// Remove a one-day (today-only) item from the current day record (Task 9C). Base cards live at
// cData[field][name], new (c_*) cards at cData.cards[cardId][name] — mirrors schToggle's split.
// Also clears its onedayTimes entry so a stale time can't resurface if the same name is re-added.
function removeOnedayItem(field, name) {
  if (isBaseCard(field)) { delete cData[field][name]; }
  else if (cData.cards && cData.cards[field]) { delete cData.cards[field][name]; }
  if (cData.onedayTimes) delete cData.onedayTimes[field + "::" + name];
  sDay();
}
function addOnedayItem(day, cardId, name, time, dur) {
  if (isBaseCard(cardId)) day[cardId][name] = false;
  else { if (!day.cards) day.cards = {}; if (!day.cards[cardId]) day.cards[cardId] = {}; day.cards[cardId][name] = false; }
  if (time) {
    if (!day.onedayTimes) day.onedayTimes = {}; if (!day.onedayDur) day.onedayDur = {};
    day.onedayTimes[cardId + "::" + name] = time;
    day.onedayDur[cardId + "::" + name] = dur > 0 ? dur : 30;
  }
}
function hasDayItem(day, cardId, name) {
  return isBaseCard(cardId) ? !!(day[cardId] && Object.prototype.hasOwnProperty.call(day[cardId], name)) : !!(day.cards && day.cards[cardId] && Object.prototype.hasOwnProperty.call(day.cards[cardId], name));
}
function copyYesterdayOneday(day, key) {
  var yesterday = new Date(key + "T00:00:00"); yesterday.setDate(yesterday.getDate() - 1);
  var prev = gDay(dk(yesterday)), copied = 0, cards = getCards();
  cards.forEach(function(card) {
    var map = isBaseCard(card.id) ? prev[card.id] : (prev.cards && prev.cards[card.id]);
    Object.keys(map || {}).forEach(function(name) {
      if (templateNamesFor(card.id).indexOf(name) !== -1 || hasDayItem(day, card.id, name)) return;
      var k = card.id + "::" + name;
      addOnedayItem(day, card.id, name, (prev.onedayTimes || {})[k] || "", (prev.onedayDur || {})[k] || 30);
      copied++;
    });
  });
  return copied;
}

// ---- day-of-week scoping ----
var NOTIF_DAYS_KEY = "htn_days";
function getDaysMap() { try { return JSON.parse(localStorage.getItem(NOTIF_DAYS_KEY)) || {}; } catch(e) { return {}; } }
function saveDaysMap(map) { localStorage.setItem(NOTIF_DAYS_KEY, JSON.stringify(map)); }
function getItemDays(field, name) { var v = getDaysMap()[notifKey(field, name)]; return Array.isArray(v) ? v : null; }
function setItemDays(field, name, daysArr) {
  var map = getDaysMap(), key = notifKey(field, name);
  if (!daysArr || daysArr.length === 7) delete map[key]; else map[key] = daysArr;
  saveDaysMap(map);
}

// Wrap gDay: drop day-scoped items on days they're not scheduled for.
var originalGDay = gDay;
gDay = function(key) {
  var d = originalGDay(key);
  var dow = new Date(key + "T00:00:00").getDay();
  ["habits", "extra", "health"].forEach(function(field) {
    Object.keys(d[field]).forEach(function(name) {
      var days = getItemDays(field, name);
      if (days && days.indexOf(dow) === -1) delete d[field][name];
    });
  });
  if (Array.isArray(d.goalRef)) d.goalRef = d.goalRef.filter(function(gr) { return gr.name in d.habits; });
  return d;
};

// ============================================================
// CUSTOM-CARDS DATA MODEL (override layer, spec: "Custom cards (LOCKED)")
// A "card" is a VIEW over existing storage, not a new source of truth:
//   - card metadata (id/name/icon/color/base/order) -> localStorage["ht_cards"]
//   - base cards (habits/extra/health) still keep their items in ht_d
//     (gDef().habits / .ex / .hl) so old history, htn_times, htn_days
//     all keep resolving with zero rewrite.
//   - user-added cards ("c_*") keep their items in a small side-store,
//     localStorage["ht_card_items"] = { cardId: [{n,s,c}] }.
// Migration is gated on "ht_cards_v1" and runs lazily, the first time
// getCards() is called.
// ============================================================
var CARDS_KEY = "ht_cards";
var CARDS_V1_KEY = "ht_cards_v1";
var CARDS_GOLD_KEY = "ht_cards_gold_v1";
var CARDS_STATS_KEY = "ht_stats_all_v1";
// Marks a profile that was seeded fresh (single Daily Goals card) while storage was empty. On a
// new device/origin the fresh seed can be written BEFORE the user's legacy ht_d arrives via cloud
// sync, which would otherwise permanently shadow the legacy->3-card migration. This flag lets a
// later-arriving legacy history trigger a one-time re-migration. Cleared once that happens (or once
// the user grows the profile past the single seed).
var CARDS_FRESH_KEY = "ht_cards_freshseed";
// One-shot-per-device recovery for profiles polluted BEFORE CARDS_FRESH_KEY existed. Deliberately
// NOT ht_-prefixed so cloud sync never carries it: each device runs the recovery at most once,
// independently. See recoverStalePollutedSeed().
var CARDS_RECOVER_KEY = "waqt_recover_cards_v1";
var OV_INTRO_KEY = "ht_ov_intro_seen";
var CARD_ITEMS_KEY = "ht_card_items";
var PRAYERS_ON_KEY = "ht_prayers_on";
// Green (#82a06e) is reserved for Prayers — never assign it to a card.
var CARD_PALETTE = ["#e0a33a", "#e07a3a", "#e05a6f", "#d64f8f", "#b85fd6", "#8f5fe0", "#6070e0", "#4090d6", "#40b0d6", "#40c0a8", "#7d84c0", "#b05a86"];

// ---- metadata store (ht_cards) ----
function getCardMeta() { try { return JSON.parse(localStorage.getItem(CARDS_KEY)) || []; } catch(e) { return []; } }
function saveCards(list) { localStorage.setItem(CARDS_KEY, JSON.stringify(list)); }

function hasWeightHistory() {
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (!/^ht_\d{4}-\d{2}-\d{2}$/.test(key || "")) continue;
    try { var day = JSON.parse(localStorage.getItem(key)); if (day && day.weight !== "" && day.weight !== null && day.weight !== undefined) return true; } catch(e) {}
  }
  return false;
}
// Weight is opt-in/out from Settings. Untouched, it follows the sensible default: show the tile
// once there is weight history to show.
var WEIGHT_ON_KEY = "ht_weight_on";
function weightOn() { var v = localStorage.getItem(WEIGHT_ON_KEY); return v === null ? hasWeightHistory() : v === "true"; }
function setWeightOn(on) { localStorage.setItem(WEIGHT_ON_KEY, on ? "true" : "false"); }
function prayersOn() { var v = localStorage.getItem(PRAYERS_ON_KEY); return v === null ? true : v === "true"; }
function setPrayersOn(on) { localStorage.setItem(PRAYERS_ON_KEY, on ? "true" : "false"); }
var PEHAR_ON_KEY = "ht_pehar_on";
function peharOn() { var v = localStorage.getItem(PEHAR_ON_KEY); return v === null ? true : v === "true"; }
function setPeharOn(on) { localStorage.setItem(PEHAR_ON_KEY, on ? "true" : "false"); }

function baseCardSeed() {
  return [
    { id:"habits", name:"Daily Goals", icon:"fa-bullseye", color:"#e0a33a", base:true },
    { id:"extra",  name:"Extra Deeds", icon:"fa-hand-holding-heart", color:"#b05a86" },
    { id:"health", name:"Healthy Lifestyle", icon:"fa-heart-pulse", color:"#4090d6" }
  ];
}
function hasLegacyCardHistory() {
  try {
    var def = JSON.parse(localStorage.getItem("ht_d"));
    if (def && (Array.isArray(def.habits) || Array.isArray(def.ex) || Array.isArray(def.hl))) return true;
  } catch(e) {}
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (!/^ht_\d{4}-\d{2}-\d{2}$/.test(key || "")) continue;
    try {
      var day = JSON.parse(localStorage.getItem(key));
      if (day && (day.habits || day.extra || day.health)) return true;
    } catch(e) {}
  }
  return false;
}
// Fresh profiles (no ht_cards, no legacy habits/extra/health history) seed Daily Goals only;
// anyone with either gets the full 3-card base seed so the legacy migration is unchanged.
// `isExisting` is an explicit override for self-checks — passing it means the state probe is
// skipped entirely, so a check never has to wipe real localStorage records to exercise a branch.
function seedCardsForState(isExisting) {
  var cards = baseCardSeed();
  if (isExisting === undefined) isExisting = !!localStorage.getItem(CARDS_KEY) || hasLegacyCardHistory();
  return isExisting ? cards : [cards[0]];
}

function migrateCardsIfNeeded() {
  if (localStorage.getItem(CARDS_V1_KEY)) return;
  var existing = !!localStorage.getItem(CARDS_KEY) || hasLegacyCardHistory();
  saveCards(seedCardsForState(existing));
  // A fresh single-card seed is provisional: legacy data may still arrive via cloud sync. Flag it
  // so remigrateIfLegacyArrivedLate() can redo the full 3-card migration if that happens.
  if (existing) localStorage.removeItem(CARDS_FRESH_KEY);
  else localStorage.setItem(CARDS_FRESH_KEY, "true");
  localStorage.setItem(CARDS_V1_KEY, "true");
}
// Fresh-origin / new-device fix: if this profile was seeded fresh (single Daily Goals card) and the
// user's legacy habits/extra/health history has since appeared (typically pulled down by cloud sync
// after the seed was written), redo the seed as an existing profile so the full 3-card base returns
// and every legacy item backfills. Only fires while the profile is still the untouched single seed,
// so a user who deliberately deleted their other cards is never overridden.
function remigrateIfLegacyArrivedLate() {
  if (!localStorage.getItem(CARDS_FRESH_KEY)) return;
  var meta = getCardMeta();
  var pristineSingleSeed = meta.length === 1 && meta[0].id === "habits";
  if (!pristineSingleSeed) { localStorage.removeItem(CARDS_FRESH_KEY); return; }
  if (!hasLegacyCardHistory()) return;
  localStorage.removeItem(CARDS_KEY);
  localStorage.removeItem(CARDS_V1_KEY);
  localStorage.removeItem(CARDS_FRESH_KEY);
  // migrateCardsIfNeeded() (called next in getCards) now sees the legacy history -> full 3-card seed.
}
// One-time-per-device recovery for the pollution window before CARDS_FRESH_KEY existed: a fresh
// single-card seed was written (and possibly synced to the cloud) with no fresh-seed flag to trigger
// re-migration, while the user's legacy ex/hl history sits unmigrated. If we still hold exactly the
// single seed and legacy ex/hl items exist, redo the full migration. Runs at most once per device.
// Trade-off: a user who had deliberately deleted Extra Deeds / Healthy Lifestyle sees them restored
// this one time (harmless; deleting again sticks, since the recovery never runs a second time).
function recoverStalePollutedSeed() {
  if (localStorage.getItem(CARDS_RECOVER_KEY)) return;
  localStorage.setItem(CARDS_RECOVER_KEY, "1");           // one-shot per device, whatever the outcome
  if (localStorage.getItem(CARDS_FRESH_KEY)) return;       // the flag-based path already handles this
  var meta = getCardMeta();
  if (!(meta.length === 1 && meta[0].id === "habits")) return;
  var d = null; try { d = JSON.parse(localStorage.getItem("ht_d")); } catch(e) {}
  var hasExHl = d && ((Array.isArray(d.ex) && d.ex.length) || (Array.isArray(d.hl) && d.hl.length));
  if (!hasExHl) return;
  localStorage.removeItem(CARDS_KEY);
  localStorage.removeItem(CARDS_V1_KEY);
}
// One-time: `s` defaulted to false for every card except Daily Goals, so most items were being
// recorded but never displayed in the Overview grids, and a card with nothing flagged rendered no
// heatmap at all. Flip every existing item to tracked. History is untouched — this only starts
// showing what was already being written.
function migrateStatsAllTracked() {
  if (localStorage.getItem(CARDS_STATS_KEY)) return;
  var d = gDef(), touched = false;
  [d.habits, d.ex, d.hl].forEach(function(arr) {
    if (!Array.isArray(arr)) return;
    arr.forEach(function(it, i) {
      if (typeof it === "string") { arr[i] = { n:it, s:true, c:"rings" }; touched = true; }
      else if (it && !it.s) { it.s = true; touched = true; }
    });
  });
  if (touched) sDef(d);
  var store = getCardItemsStore(), storeTouched = false;
  Object.keys(store).forEach(function(cid) {
    (store[cid] || []).forEach(function(it, i) {
      if (typeof it === "string") { store[cid][i] = { n:it, s:true, c:"rings" }; storeTouched = true; }
      else if (it && !it.s) { it.s = true; storeTouched = true; }
    });
  });
  if (storeTouched) saveCardItemsStore(store);
  localStorage.setItem(CARDS_STATS_KEY, "true");
}
// One-time re-sync: a muted palette shipped briefly and got baked into saved base cards.
// Restores the base cards' seed colors once; custom (c_*) cards and later restyles are untouched.
function migrateBaseCardColors() {
  if (localStorage.getItem(CARDS_GOLD_KEY)) return;
  var seed = baseCardSeed(), list = getCardMeta();
  if (list.length) {
    list.forEach(function(card) {
      var s = seed.filter(function(x) { return x.id === card.id; })[0];
      if (s) card.color = s.color;
    });
    saveCards(list);
  }
  localStorage.setItem(CARDS_GOLD_KEY, "true");
}

function nextCardColor(list) {
  var used = list.map(function(c) { return c.color; });
  for (var i = 0; i < CARD_PALETTE.length; i++) { if (used.indexOf(CARD_PALETTE[i]) === -1) return CARD_PALETTE[i]; }
  return CARD_PALETTE[list.length % CARD_PALETTE.length];
}
function nextCardIcon(list) {
  var choices = (typeof ICON_CHOICES !== "undefined" && ICON_CHOICES) || ["fa-star","fa-bullseye","fa-hand-holding-heart","fa-heart-pulse","fa-dumbbell","fa-book","fa-pen","fa-brain","fa-leaf","fa-mug-hot"];
  var used = list.map(function(c) { return c.icon; });
  for (var i = 0; i < choices.length; i++) { if (used.indexOf(choices[i]) === -1) return choices[i]; }
  return choices[list.length % choices.length];
}

// ---- side-store for new (c_*) cards' items (ht_card_items) ----
function getCardItemsStore() { try { return JSON.parse(localStorage.getItem(CARD_ITEMS_KEY)) || {}; } catch(e) { return {}; } }
function saveCardItemsStore(store) { localStorage.setItem(CARD_ITEMS_KEY, JSON.stringify(store)); }

// The raw {n,s,c} template array backing a card's items, wherever it lives.
function cardTemplateArr(id) {
  var df = gDef();
  if (id === "habits") return df.habits;
  if (id === "extra") return df.ex;
  if (id === "health") return df.hl;
  var store = getCardItemsStore();
  return store[id] || [];
}

// Template items -> view items, folding in notif time + day-scope (keyed cardId::name).
function cardItemsFor(id) {
  return cardTemplateArr(id).map(function(x) {
    var n = itemName(x);
    return { n:n, time:getNotifTime(id, n) || "", days:getItemDays(id, n) };
  });
}

// getCards() — migrates/seeds on first call, then returns [{id,name,icon,color,base,items}].
function getCards() {
  remigrateIfLegacyArrivedLate();
  recoverStalePollutedSeed();
  migrateCardsIfNeeded();
  migrateBaseCardColors();
  return getCardMeta().map(function(meta) {
    return { id:meta.id, name:meta.name, icon:meta.icon, color:meta.color, base:!!meta.base, items:cardItemsFor(meta.id) };
  });
}

// Extend gDay (already wrapped above for day-of-week scoping) to backfill a
// day.cards[cardId] = {name:bool} sub-map for non-base cards, mirroring how
// production gDay backfills habits/extra/health.
var gDayBeforeCards = gDay;
gDay = function(key) {
  var d = gDayBeforeCards(key);
  if (!d.cards) d.cards = {};
  getCardMeta().forEach(function(meta) {
    if (meta.base) return;
    if (!d.cards[meta.id]) d.cards[meta.id] = {};
    cardTemplateArr(meta.id).forEach(function(it) {
      var n = itemName(it);
      if (!(n in d.cards[meta.id])) d.cards[meta.id][n] = false;
    });
  });
  return d;
};

// gDayCards(key) — unified per-card completion for a given day.
// Base cards read the existing top-level day-record maps; new cards read
// the day.cards sub-map. Prayers are NOT a card — handled separately.
function gDayCards(key) {
  var day = gDay(key);
  return getCards().map(function(card) {
    var items;
    if (card.id === "habits" || card.id === "extra" || card.id === "health") {
      var f = card.id === "extra" ? "extra" : card.id === "health" ? "health" : "habits";
      items = card.items.map(function(it) { return { n:it.n, done:!!day[f][it.n], time:it.time, days:it.days }; });
    } else {
      var doneMap = (day.cards && day.cards[card.id]) || {};
      items = card.items.map(function(it) { return { n:it.n, done:!!doneMap[it.n], time:it.time, days:it.days }; });
    }
    return { card:card, items:items };
  });
}

// Wrap dScore (Task 9D) — production only counts habits/prayers/extra/health(+water), missing new
// (c_*) card completion entirely, so the Overview heatmap/streak/week-strip dots undercount for
// anyone with a custom card. Recompute using the exact same rule as Daily's own ring (rSchedule):
// (prayers done + all card items done) / (5 + total card items), via gDayCards — which already
// covers base cards (habits/extra/health, read from the day record) AND new cards (day.cards), so
// nothing is double-counted. Water is intentionally dropped (cut from this redesign, spec "Cut/Keep").
dScore = function(key) {
  var day = gDay(key), pd = 0;
  if (prayersOn()) PRAYERS.forEach(function(p) { if (day.prayers[p]) pd++; });
  var doneTasks = 0, totalTasks = 0;
  gDayCards(key).forEach(function(row) {
    row.items.forEach(function(it) { totalTasks++; if (it.done) doneTasks++; });
  });
  var total = (prayersOn() ? 5 : 0) + totalTasks;
  return total ? Math.round((pd + doneTasks) / total * 100) : 0;
};

// ---- card ops (metadata only; item storage handled separately below) ----
function addCard(name) {
  var list = getCardMeta(), id;
  if (list.length >= 5) { toast("Max 5 cards"); return null; }
  do { id = "c_" + Math.random().toString(36).slice(2, 8); } while (list.some(function(c) { return c.id === id; }));
  var card = { id:id, name:name, icon:nextCardIcon(list), color:nextCardColor(list), base:false };
  list.push(card);
  saveCards(list);
  return card;
}
function renameCard(id, name) {
  var list = getCardMeta(), card = list.filter(function(c) { return c.id === id; })[0];
  if (!card) return false;
  card.name = name;
  saveCards(list);
  return true;
}
function restyleCard(id, opts) {
  var list = getCardMeta(), card = list.filter(function(c) { return c.id === id; })[0];
  if (!card) return false;
  opts = opts || {};
  if (opts.icon && list.some(function(c) { return c.id !== id && c.icon === opts.icon; })) return false;
  if (opts.color && list.some(function(c) { return c.id !== id && c.color === opts.color; })) return false;
  if (opts.icon) card.icon = opts.icon;
  if (opts.color) card.color = opts.color;
  saveCards(list);
  return true;
}
function deleteCard(id) {
  var list = getCardMeta(), card = list.filter(function(c) { return c.id === id; })[0];
  if (!card) return false;
  if (card.base) { toast("Can't delete a base card"); return false; }
  saveCards(list.filter(function(c) { return c.id !== id; }));
  var store = getCardItemsStore();
  delete store[id];
  saveCardItemsStore(store);
  return true;
}

// ---- item ops (permanent items; base cards push into gDef arrays via sDef,
// new cards push into the ht_card_items side-store) ----
function addCardItem(cardId, name) {
  name = (name || "").trim();
  if (!name) return false;
  if (cardId === "habits" || cardId === "extra" || cardId === "health") {
    var d = gDef(), arr = cardId === "habits" ? d.habits : cardId === "extra" ? d.ex : d.hl;
    if (arr.some(function(x) { return itemName(x) === name; })) return false;
    arr.push({ n:name, s:false, c:"rings" });
    sDef(d);
    return true;
  }
  var store = getCardItemsStore();
  if (!store[cardId]) store[cardId] = [];
  if (store[cardId].some(function(x) { return itemName(x) === name; })) return false;
  store[cardId].push({ n:name, s:false, c:"rings" });
  saveCardItemsStore(store);
  return true;
}
function removeCardItem(cardId, name) {
  if (cardId === "habits" || cardId === "extra" || cardId === "health") {
    var d = gDef(), arr = cardId === "habits" ? d.habits : cardId === "extra" ? d.ex : d.hl;
    var idx = arr.findIndex(function(x) { return itemName(x) === name; });
    if (idx === -1) return false;
    arr.splice(idx, 1);
    sDef(d);
  } else {
    var store = getCardItemsStore(), list = store[cardId] || [];
    var idx2 = list.findIndex(function(x) { return itemName(x) === name; });
    if (idx2 === -1) return false;
    list.splice(idx2, 1);
    store[cardId] = list;
    saveCardItemsStore(store);
  }
  setNotifTime(cardId, name, ""); // already clears any reminder_times row unconditionally (Task: task notifications)
  setItemDays(cardId, name, null);
  setItemBell(cardId, name, false); // drop stale bell state so a reused name doesn't inherit it
  return true;
}

// ---- self-check (run with the page open at #cardscheck) ----
function _cardsSelfCheck() {
  if (location.hash !== "#cardscheck") return;
  var cards = getCards();
  console.assert(cards.length === 1 || cards.length === 3, "expected fresh Daily Goals-only seed or 3-card legacy migration, got", cards.length);
  var ids = cards.map(function(c) { return c.id; });
  console.assert(ids.indexOf("habits") > -1, "Daily Goals base card missing", ids);
  if (cards.length === 3) console.assert(ids.indexOf("extra") > -1 && ids.indexOf("health") > -1, "legacy base card ids wrong", ids);

  var habitsCard = cards.filter(function(c) { return c.id === "habits"; })[0];
  var defNames = gDef().habits.map(itemName);
  var cardNames = habitsCard.items.map(function(i) { return i.n; });
  console.assert(JSON.stringify(cardNames) === JSON.stringify(defNames), "habits card items should match gDef().habits", cardNames, defNames);

  var testCard = addCard("__selfcheck__");
  console.assert(/^c_/.test(testCard.id), "addCard should assign a c_ id", testCard.id);
  console.assert(testCard.color !== "#82a06e", "addCard must never assign green", testCard.color);

  console.assert(deleteCard("habits") === false, "deleteCard must refuse base cards");
  console.assert(getCardMeta().some(function(c) { return c.id === "habits"; }), "base card must survive a refused delete");

  var key = dk(new Date()), day = gDay(key);
  var habitsRow = gDayCards(key).filter(function(x) { return x.card.id === "habits"; })[0];
  var mismatch = habitsRow.items.some(function(it) { return it.done !== !!day.habits[it.n]; });
  console.assert(!mismatch, "gDayCards done-state must match the day record for a base card");

  deleteCard(testCard.id); // cleanup — no permanent trace left behind
  console.assert(!getCardMeta().some(function(c) { return c.id === testCard.id; }), "selfcheck card should be gone after cleanup");

  console.log("cards self-check complete");
}
_cardsSelfCheck();

// ============================================================
// MANUAL PRAYER TIMES — prayer times are set directly via setNotifTime("prayers", name, "HH:MM")
// (Daily already reads htn_times and puts prayers on the timeline / hides the fallback strip).
// The only extra bit here is the bell -> push-reminder wiring (Task 9B).
// ============================================================
var PRAYER_BELL_KEY = "htn_prayer_bell";

function getPrayerBells() { try { return JSON.parse(localStorage.getItem(PRAYER_BELL_KEY)) || {}; } catch(e) { return {}; } }
function savePrayerBells(m) { localStorage.setItem(PRAYER_BELL_KEY, JSON.stringify(m)); }

// ---- generic per-item bell (Task: task notifications) ----
// Generalizes the prayer-only bell above to any timed item. Prayers keep using the existing
// htn_prayer_bell store untouched (avoids regressing existing prayer bells); every other field
// reads/writes this new htn_bell map keyed "field::name" (same key shape as htn_times/htn_dur).
var ITEM_BELL_KEY = "htn_bell";
function getItemBells() { try { return JSON.parse(localStorage.getItem(ITEM_BELL_KEY)) || {}; } catch(e) { return {}; } }
function saveItemBells(m) { localStorage.setItem(ITEM_BELL_KEY, JSON.stringify(m)); }
function getItemBell(field, name) { return field === "prayers" ? !!getPrayerBells()[name] : !!getItemBells()[notifKey(field, name)]; }
function setItemBell(field, name, on) {
  if (field === "prayers") { var pb = getPrayerBells(); pb[name] = !!on; savePrayerBells(pb); return; }
  var m = getItemBells(), key = notifKey(field, name);
  if (on) m[key] = true; else delete m[key];
  saveItemBells(m);
}

// First-bell permission gate. Mirrors subscribeToPush()'s Notification.requestPermission() step
// (js/push-client.js) without its service-worker/VAPID/Supabase-subscription machinery — that
// remains subscribeToPush()'s job once the user also turns on Cloud Sync push from Template.
// Only prompts while permission is still undecided ("default"); already-granted/denied never
// re-prompts, so later toggles don't nag. cb(true) means the bell may turn on, cb(false) means it
// must stay off.
function ensureBellPermission(cb) {
  if (!("Notification" in window)) { cb(true); return; }
  if (Notification.permission === "granted") { cb(true); return; }
  if (Notification.permission === "denied") { toast("Notifications are blocked in your browser settings"); cb(false); return; }
  Notification.requestPermission().then(function(perm) {
    if (perm !== "granted") toast("Reminders need notification permission");
    cb(perm === "granted");
  });
}

// ---- bell -> reminder wiring (Task 9B, generalized) ----
// setNotifTime(field, name, time) (js/push-client.js, production, untouched) already writes
// htn_times AND upserts/deletes the matching reminder_times row via pushSaveReminderTime — the
// exact mechanism the server-side push scheduler reads. That call is unconditional (every timed
// item gets a row), so without this the bell is purely visual: toggling it never touches
// reminder_times. This reuses pushSaveReminderTime directly (same function, same table) to
// correct that row per-item, gated on the bell — without touching htn_times, which must stay set
// for every timed item regardless of bell (the Pehar shows all timed items, bell-or-not).
// ponytail: pushSaveReminderTime no-ops without sbClient+currentUser, and actually firing needs a
// live push subscription (subscribeToPush()) — neither is set up in this sandbox, so this wires the
// intent correctly but can't be observed firing here.
function syncItemReminder(field, name) {
  var t = getNotifTime(field, name);
  pushSaveReminderTime(field, name, (getItemBell(field, name) && t) ? t : "");
}
function syncPrayerReminder(name) { return syncItemReminder("prayers", name); } // Task 9B name, kept as a thin alias

// ---- self-check (run with the page open at #tplcheck) ----
function _templateSelfCheck() {
  if (location.hash !== "#tplcheck") return;

  // (a) addCard refuses once at the 5-card cap and doesn't grow the list.
  var savedList = getCardMeta();
  var seed = [];
  for (var i = 0; i < 5; i++) seed.push({ id: "c_seed" + i, name: "Seed " + i, icon: "fa-star", color: "#8090a8", base: i === 0 });
  saveCards(seed);
  var beforeLen = getCardMeta().length;
  var overflow = addCard("__overflow__");
  console.assert(!overflow, "(a) addCard must return falsy once at the 5-card cap", overflow);
  console.assert(getCardMeta().length === beforeLen, "(a) addCard must not grow the list past 5", getCardMeta().length);
  saveCards(savedList); // restore real cards

  // (b) deleteCard refuses the base "habits" card.
  console.assert(deleteCard("habits") === false, "(b) deleteCard must refuse base cards");

  // (c) carousel/pincode machinery is fully gone — no dangling globals.
  console.assert(typeof carouselHTML === "undefined", "(c) carouselHTML must not be defined");
  console.assert(typeof computePrayerTimes === "undefined", "(c) computePrayerTimes must not be defined");

  console.log("template self-check complete");
}
_templateSelfCheck();

// ============================================================
// SCHEDULE IMPORT — public, clean JSON interchange. This never exposes the
// app's storage keys; the translator below is the single bridge back to them.
// ============================================================
var IMPORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var importDraft = "", importError = "", importPreview = null;
var importTab = "ai"; // "type" | "ai" — which of the two static tabs is showing (session-only, no storage key)
function importDays(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.some(function(d) { return IMPORT_DAY_NAMES.indexOf(d) === -1; })) return false;
  return value.filter(function(d, i, a) { return a.indexOf(d) === i; }).map(function(d) { return IMPORT_DAY_NAMES.indexOf(d); }).sort(function(a,b) { return a-b; });
}
function importItem(value, prayer) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.name !== "string" || !value.name.trim()) return null;
  if (value.time !== undefined && (typeof value.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))) return null;
  if (value.duration !== undefined && (typeof value.duration !== "number" || !isFinite(value.duration) || value.duration <= 0)) return null;
  var days = importDays(value.days); if (days === false) return null;
  var out = { name:value.name.trim(), time:value.time || "", duration:value.duration === undefined ? (prayer ? 35 : 30) : Math.round(value.duration), days:days };
  // Fix 4: optional per-item change note ("split around Asr", "moved 21:30->22:00"). Optional by
  // design — absence must never fail validation, so older payloads keep importing unchanged.
  if (typeof value.note === "string" && value.note.trim()) out.note = value.note.trim();
  return out;
}
// Repeat activity names inside ONE card get a -2/-3 suffix so none get merged or lost. Shared by
// the JSON path and the prayer-split below (which legitimately produces two pieces of one name).
function dedupItemNames(items) {
  var used = {};
  items.forEach(function(it) {
    var nm = it.name;
    if (used[nm]) { var k = 2; nm = it.name + '-' + k; while (used[nm]) { k++; nm = it.name + '-' + k; } it.name = nm; }
    used[nm] = true;
  });
  return items;
}
// Real AI replies wrap the JSON in a ```json fence and/or add prose ("Here's your plan:").
// Pull the JSON out before parsing so a verbatim paste works. Clean JSON (and our own
// internal JSON.stringify callers) pass through untouched.
function extractJson(text) {
  var s = String(text || "").trim();
  var fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (s.charAt(0) !== "{" || s.charAt(s.length - 1) !== "}") {
    var a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a !== -1 && b > a) s = s.slice(a, b + 1);
  }
  return s;
}
function parseImportSchedule(text) {
  var raw;
  try { raw = JSON.parse(extractJson(text)); } catch(e) { return { error:"Couldn't find a schedule in that. Paste the AI's full reply, including the part in curly braces." }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.version !== 1 || !Array.isArray(raw.cards) || (raw.prayers !== undefined && (!raw.prayers || typeof raw.prayers !== "object" || Array.isArray(raw.prayers)))) return { error:"Use version 1 with a cards array (and a prayers object when included)." };
  var out = { version:1 };
  // Fix 4 (top level): the AI already writes a `flow` summary of how the day hangs together and
  // what it reshaped — the app used to throw it away. Keep it (either key), render it above the table.
  var topNote = typeof raw.notes === "string" ? raw.notes : (typeof raw.flow === "string" ? raw.flow : "");
  if (topNote.trim()) out.notes = topNote.trim();
  if (raw.prayers !== undefined) {
    out.prayers = {};
    Object.keys(raw.prayers).forEach(function(name) {
      if (PRAYERS.indexOf(name) === -1) return;
      var p = raw.prayers[name];
      if (!p || typeof p !== "object" || Array.isArray(p) || (p.time !== undefined && (typeof p.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time))) || (p.duration !== undefined && (typeof p.duration !== "number" || !isFinite(p.duration) || p.duration <= 0))) { out._bad = true; return; }
      out.prayers[name] = { time:p.time || "", duration:p.duration === undefined ? 35 : Math.round(p.duration) };
    });
    if (out._bad) return { error:"Prayer times must be HH:MM and durations must be positive numbers." };
  }
  out.cards = [];
  for (var i = 0; i < raw.cards.length; i++) {
    var card = raw.cards[i];
    if (!card || typeof card !== "object" || Array.isArray(card) || typeof card.name !== "string" || !card.name.trim() || !Array.isArray(card.items)) return { error:"Each card needs a name and an items array." };
    var clean = { name:card.name.trim(), items:[] };
    for (var j = 0; j < card.items.length; j++) { var item = importItem(card.items[j], false); if (!item) return { error:"Each item needs a name; times use HH:MM, days use Sun through Sat." }; clean.items.push(item); }
    dedupItemNames(clean.items);
    out.cards.push(clean);
  }
  return { value:out };
}
function cleanScheduleSnapshot() {
  var out = { version:1 };
  if (prayersOn()) { out.prayers = {}; PRAYERS.forEach(function(name) { out.prayers[name] = { time:getNotifTime("prayers", name) || "", duration:effectiveDur("prayers", name, false) }; }); }
  out.cards = getCards().map(function(card) { return { name:card.name, items:card.items.map(function(it) { var x = { name:it.n }; var time = getNotifTime(card.id, it.n); if (time) x.time = time; x.duration = effectiveDur(card.id, it.n, false); var days = getItemDays(card.id, it.n); if (days) x.days = days.map(function(d) { return IMPORT_DAY_NAMES[d]; }); return x; }) }; });
  return out;
}
function importSame(a, b) { return a.time === b.time && a.duration === b.duration && JSON.stringify(a.days || null) === JSON.stringify(b.days || null); }

// ---- Fix 1: card routing -------------------------------------------------
// Guess an incoming item's home card by matching words in its name against the user's REAL card
// names and the items already sitting on them. Deliberately not a taxonomy of invented cards —
// "Surah Rahman" finds an Islamic card only because a Surah item is already there. No confident
// match returns null and the caller falls back to Daily Goals / the payload's own group name.
function nameWords(s) { return String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(function(w) { return w.length >= 3; }); }
function guessCardId(itemNm) {
  var want = nameWords(itemNm), best = null;
  if (!want.length) return null;
  getCards().forEach(function(c) {
    [c.name].concat(c.items.map(function(x) { return x.n; })).forEach(function(hay) {
      nameWords(hay).forEach(function(w) {
        if (want.indexOf(w) === -1) return;
        if (!best || w.length > best.score) best = { id:c.id, score:w.length };  // longest shared word wins
      });
    });
  });
  return best ? best.id : null;
}
// The one place a row's target is decided, so the preview and the apply can never disagree.
// Order: explicit user override (the preview dropdown) > the payload's own card name > keyword
// guess > null, meaning "the caller creates/folds this group's card".
function resolveImportTarget(item, groupName, pool) {
  var by = function(fn) { return pool.filter(fn)[0] || null; };
  if (item._card) { var forced = by(function(c) { return c.id === item._card; }); if (forced) return forced; }
  var named = by(function(c) { return c.name === groupName; }); if (named) return named;
  var guess = guessCardId(item.name); if (guess) { var g = by(function(c) { return c.id === guess; }); if (g) return g; }
  return null;
}

// ---- Fix 2: prayer split that preserves the requested duration -----------
// A timed block straddling a prayer becomes two pieces that SUM to the original duration: the
// second resumes when the prayer block ends and runs for the remainder. It is never shrunk — if
// the pushed-out end now collides with something, the overlap flag below says so.
// Idempotent: neither piece straddles that prayer any more, so re-running changes nothing.
function prayerBlocks(data) {
  if (!prayersOn()) return [];
  return PRAYERS.map(function(p) {
    var inc = data.prayers && data.prayers[p];
    var t = (inc && inc.time) || getNotifTime("prayers", p) || "";
    if (!t) return null;
    return { name:p, start:hhmmToMin(t), dur:(inc && inc.duration) || effectiveDur("prayers", p, false) || 35 };
  }).filter(function(x) { return !!x; });
}
function splitOnePrayer(it, prayers) {
  if (!it.time || !it.duration) return null;
  var s = hhmmToMin(it.time), e = s + it.duration;
  for (var i = 0; i < prayers.length; i++) {
    var p = prayers[i];
    if (p.start <= s || p.start >= e) continue;
    var first = p.start - s, why = "split around " + p.name + ", all " + fmtDur(it.duration) + " kept";
    return [{ name:it.name, time:it.time, duration:first, days:it.days, note:why },
            { name:it.name, time:minToHHMM((p.start + p.dur) % 1440), duration:it.duration - first, days:it.days, note:why }];
  }
  return null;
}
function splitAroundPrayers(data) {
  var prayers = prayerBlocks(data);
  if (!prayers.length) return data;
  data.cards.forEach(function(card) {
    var out = [];
    card.items.forEach(function(it) {
      var queue = [it], guard = 0;                       // a piece can straddle a later prayer too
      while (queue.length && guard++ < 20) {
        var cur = queue.shift(), pieces = splitOnePrayer(cur, prayers);
        if (pieces) { out.push(pieces[0]); queue.unshift(pieces[1]); } else out.push(cur);
      }
    });
    card.items = dedupItemNames(out);                    // pieces become Research / Research-2
  });
  return data;
}

// ---- Fix 5: overlap flagging + the one-tap fix ---------------------------
function importRowRange(row) {
  var inc = row && row.incoming;
  if (!inc || !inc.time || row.kind === "prayer" || row.kind === "newprayer") return null;
  var s = hhmmToMin(inc.time);
  return { s:s, e:s + (inc.duration || 30), days:inc.days || null };
}
function daysIntersect(a, b) { return !a || !b || a.some(function(d) { return b.indexOf(d) !== -1; }); }
function markImportOverlaps(rows) {
  var rs = rows.map(importRowRange);
  rows.forEach(function(r) { r.overlap = false; });
  for (var i = 0; i < rs.length; i++) for (var j = i + 1; j < rs.length; j++) {
    if (!rs[i] || !rs[j]) continue;
    if (rs[i].s < rs[j].e && rs[j].s < rs[i].e && daysIntersect(rs[i].days, rs[j].days)) { rows[i].overlap = true; rows[j].overlap = true; }
  }
}
// Moves ONE row (the tapped one) past every block it collides with. Nothing here runs without a tap.
// ponytail: free slots are measured against the other import rows only, not the user's untouched
// existing blocks — widen to those if the preview ever imports into a heavily-filled day.
function shiftRowToFreeSlot(preview, idx) {
  var row = preview.rows[idx], inc = row && row.incoming, mine = importRowRange(row);
  if (!mine) return false;
  var busy = preview.rows.map(importRowRange).filter(function(r, i) { return r && i !== idx && daysIntersect(r.days, mine.days); }).sort(function(a, b) { return a.s - b.s; });
  var s = mine.s, dur = inc.duration || 30;
  busy.forEach(function(b) { if (s < b.e && b.s < s + dur) s = b.e; });
  if (s === mine.s) return false;
  var from = inc.time;
  inc.time = minToHHMM(s % 1440);
  inc.note = "moved " + from + "→" + inc.time + " to avoid an overlap";
  return true;
}

function buildImportPreview(data) {
  splitAroundPrayers(data);
  var cards = getCards(), planned = cards.slice(), rows = [], addCards = 0, addItems = 0, folded = 0, prayerSets = prayersOn() && data.prayers ? Object.keys(data.prayers).length : 0;
  if (prayersOn() && data.prayers) Object.keys(data.prayers).forEach(function(name) {
    var incoming = data.prayers[name], mine = { time:getNotifTime("prayers", name) || "", duration:effectiveDur("prayers", name, false), days:null };
    if (mine.time || getItemDur("prayers", name) !== null) { if (!importSame(mine, incoming)) rows.push({ kind:"prayer", name:name, incoming:incoming, mine:mine, choice:"mine" }); }
    else rows.push({ kind:"newprayer", name:name, incoming:incoming });
  });
  data.cards.forEach(function(group) {
    var groupTarget = null;   // created lazily: only if an item actually still needs this group's card
    group.items.forEach(function(incoming) {
      var target = resolveImportTarget(incoming, group.name, planned);
      // Feature 2 (fold notice): a group with no name match that arrives once the 5-card cap is
      // already hit gets folded into an existing card (Daily Goals, or whatever's first) instead of
      // becoming its own card — count it so the preview can tell the user, instead of doing this silently.
      if (!target) {
        if (!groupTarget) { if (planned.length < 5) { groupTarget = { id:"__new_" + planned.length, name:group.name, newCard:true }; planned.push(groupTarget); addCards++; } else { groupTarget = planned.filter(function(c) { return c.id === "habits"; })[0] || planned[0]; folded++; } }
        target = groupTarget;
      }
      var existing = target.newCard ? null : cardTemplateArr(target.id).filter(function(x) { return itemName(x) === incoming.name; })[0];
      if (!existing) { rows.push({ kind:"newitem", cardName:target.name, targetId:target.id, incoming:incoming, sourceName:group.name }); addItems++; }
      else { var mine = { time:getNotifTime(target.id, incoming.name) || "", duration:effectiveDur(target.id, incoming.name, false), days:getItemDays(target.id, incoming.name) }; if (!importSame(mine, incoming)) rows.push({ kind:"item", cardName:target.name, targetId:target.id, name:incoming.name, incoming:incoming, mine:mine, choice:"mine" }); }
    });
  });
  markImportOverlaps(rows);
  return { data:data, rows:rows, addCards:addCards, addItems:addItems, prayerSets:prayerSets, folded:folded };
}
function writeImportTime(field, name, time, raw) { if (raw) { var map = getNotifTimesMap(); if (time) map[notifKey(field,name)] = time; else delete map[notifKey(field,name)]; saveNotifTimesMap(map); } else setNotifTime(field, name, time); }
function applyImportSchedule(preview, rawTimes) {
  // syncItemReminder skipped when rawTimes is true — that mode (used only by #importcheck) stages
  // times through the local map directly and must stay entirely offline, same reasoning as
  // #setupcheck's raw NOTIF_TIMES_KEY restore (see its comment above). Real applies (importapply
  // click handler calls this with rawTimes=false) do want reminder_times kept in step.
  function applyValues(id, item) { writeImportTime(id, item.name, item.time, rawTimes); setItemDur(id, item.name, item.duration); setItemDays(id, item.name, item.days); if (!rawTimes) syncItemReminder(id, item.name); }
  preview.rows.forEach(function(row) {
    if (row.kind === "newprayer" || (row.kind === "prayer" && row.choice === "import")) {
      writeImportTime("prayers", row.name, row.incoming.time, rawTimes);
      setItemDur("prayers", row.name, row.incoming.duration);
      if (!rawTimes) syncItemReminder("prayers", row.name);
    }
  });
  preview.data.cards.forEach(function(group) {
    var groupTarget = null;
    group.items.forEach(function(item) {
      // Same resolver the preview used, against the real cards — the Card dropdown's override
      // (item._card) rides on the item itself, so what the table showed is what gets written.
      var target = resolveImportTarget(item, group.name, getCards());
      if (!target) {
        if (!groupTarget) groupTarget = getCards().length < 5 ? addCard(group.name) : (getCards().filter(function(c) { return c.id === "habits"; })[0] || getCards()[0]);
        target = groupTarget;
      }
      var exists = templateNamesFor(target.id).indexOf(item.name) !== -1;
      var row = preview.rows.filter(function(r) { return (r.kind === "item" || r.kind === "newitem") && r.incoming === item; })[0];
      if (!exists) { addCardItem(target.id, item.name); applyValues(target.id, item); }
      else if (row && row.kind === "item" && row.choice === "import") applyValues(target.id, item);
    });
  });
}
function importPrompt() {
  var prayers = prayersOn();
  var schema = '{"version":1,' + (prayers ? '"prayers":{"Fajr":{"time":"05:30","duration":30}},' : '') + '"notes":"how the day flows and anything I changed","cards":[{"name":"Study","items":[{"name":"CEH","time":"06:30","duration":120,"days":["Sat","Sun","Mon"],"note":"why this moved or split"}]}]}';
  // Fix 3 — every rule below exists because live testing caught the AI breaking it: inventing
  // cards while leaving mine empty, emitting Class three times instead of days:[...], renaming
  // blocks the app already disambiguates, and splitting a 120m block into 85m of pieces.
  var instruction = "Create a recurring weekly plan. " + (prayers ? "Anchor the day around the prayer times; " : "") + "do not overlap blocks. Place study, exercise, and commitments where I describe them; apply day-of-week scoping when I say on Saturday/Sunday. Assign realistic durations so each item is a block. Timed items render on a visual timeline called the Pehar, from dawn to night; briefly show me how my day will flow."
    + "\n\nRULES, follow these exactly:"
    + "\n1. USE THE CARDS IN MY CURRENT PROFILE BELOW. Put each activity on the card it fits. Only invent a new card when nothing fits at all, and never leave a card I already have empty in order to invent one. 5 cards maximum in total, including Daily Goals."
    + "\n2. ONE ACTIVITY = ONE ITEM. If it repeats on several days, emit it once with days:[\"Sat\",\"Sun\",\"Mon\"], never one copy per weekday."
    + "\n3. DO NOT RENAME my activities (no \"CEH Morning\"/\"CEH Afternoon\"). The app adds a -2 suffix itself when the same name repeats."
    + (prayers ? "\n4. You MAY split a block that runs across a prayer into two pieces, and it helps. THE PIECES MUST ADD UP TO THE DURATION I ASKED FOR. If a 120m block loses 35m to a prayer, the second piece runs 35m longer, it does not disappear. Keep the same name for both pieces." : "\n4. Never shorten a block below the duration I asked for.")
    + "\n5. REPORT EVERY CHANGE. Any block you split, move, shorten or merge gets a short \"note\" on that item saying what you did and why. Put an overall summary of how the day flows in a top-level \"notes\" string."
    + "\n6. If I mention anything that can't become a timed block (no clear time, or not a schedulable task), tell me plainly it can't be added and won't appear on my Pehar."
    + "\n\nReturn JSON only.";
  return instruction + "\n\nOUTPUT FORMAT:\n" + schema + "\nOnly item name is required; time/duration/days/note are optional (default duration 30" + (prayers ? "; prayer duration defaults to 35" : "") + ", and omitted days means every day). Use weekday names Sun through Sat. No colors or icons. Reply with ONLY the JSON object. No code fence, no explanation before or after.\n\nEXAMPLE:\n" + schema + "\n\nCURRENT PROFILE (use this as the starting point):\n" + JSON.stringify(cleanScheduleSnapshot(), null, 2) + "\n\nNOW DESCRIBE YOUR DAY OR WEEK BELOW in plain words. Give times, and which days for weekly things (e.g. \"Gym 6:30–7:30am\", \"Team meeting Mon/Wed 10–11am\"). Turn it into the format above:\n\n";
}
function copyImportPrompt() {
  var value = importPrompt();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function() { toast("Copied!"); }, function() { copyImportFallback(value); }); else copyImportFallback(value);
}
function copyImportFallback(value) { var area = document.createElement("textarea"); area.value = value; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); try { document.execCommand("copy"); toast("Copied!"); } catch(e) { toast("Copy failed"); } document.body.removeChild(area); }

// ============================================================
// "TYPE YOUR DAY" SCHEDULE PARSER (no-AI, offline) — a second input into the
// SAME import pipeline above (parseImportSchedule/buildImportPreview/apply).
// Spec: docs/superpowers/specs/2026-08-12-waqt-schedule-parser-design.md
// ============================================================
var parseText = "", parseCardId = "habits", parseUnread = [];

// -- Feature 4 storage: personal phrase->time dictionary, grown only from explicit confirms.
var PHRASE_LEARNED_KEY = "ht_phrase_learned";
function getLearnedMap() { try { return JSON.parse(localStorage.getItem(PHRASE_LEARNED_KEY)) || {}; } catch(e) { return {}; } }
function saveLearnedMap(map) { localStorage.setItem(PHRASE_LEARNED_KEY, JSON.stringify(map)); }
function getLearnedPhrase(phrase) { return getLearnedMap()[phrase] || null; }
function setLearnedPhrase(phrase, time, duration) { var m = getLearnedMap(); m[phrase] = duration ? { time:time, duration:duration } : { time:time }; saveLearnedMap(m); }
function forgetPhrase(phrase) { var m = getLearnedMap(); delete m[phrase]; saveLearnedMap(m); }

// -- Feature 3: built-in phrase dictionary. Longest-phrase-first matching avoids "morning"
// swallowing "early morning", "night" swallowing "late night", etc.
var PHRASE_TIMEOFDAY = { "early morning":"06:00", "mid-morning":"10:00", "morning":"08:00", "noon":"12:00", "midday":"12:00", "mid-afternoon":"15:30", "afternoon":"15:00", "evening":"19:00", "late night":"23:00", "night":"21:00", "before bed":"22:00", "after work":"18:00" };
var PHRASE_DURATION = { "quick":15, "short":20, "for an hour":60, "an hour":60, "half an hour":30, "half hour":30, "30 min":30, "30 minutes":30 };
function hhmmToMin(hhmm) { var p = hhmm.split(":"); return (+p[0]) * 60 + (+p[1]); }
function stripAt(str, idx, len) { return (str.slice(0, idx) + str.slice(idx + len)).replace(/\s{2,}/g, " ").trim(); }
function matchPhraseTimeOfDay(line) {
  var lower = line.toLowerCase(), keys = Object.keys(PHRASE_TIMEOFDAY).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) { var idx = lower.indexOf(keys[i]); if (idx !== -1) return { start:hhmmToMin(PHRASE_TIMEOFDAY[keys[i]]), rest:stripAt(line, idx, keys[i].length) }; }
  return null;
}
function matchPhraseDuration(line) {
  var lower = line.toLowerCase(), keys = Object.keys(PHRASE_DURATION).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) if (lower.indexOf(keys[i]) !== -1) return PHRASE_DURATION[keys[i]];
  var mh = lower.match(/\b(\d+)\s*(?:hours?|hrs?)\b/); if (mh) return (+mh[1]) * 60;
  var mm = lower.match(/\b(\d+)\s*min(?:ute)?s?\b/); if (mm) return +mm[1];
  return null;
}
function stripDurationWords(line) {
  var lower = line.toLowerCase(), keys = Object.keys(PHRASE_DURATION).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) { var idx = lower.indexOf(keys[i]); if (idx !== -1) return stripAt(line, idx, keys[i].length); }
  var m = line.match(/\b\d+\s*(?:hours?|hrs?|min(?:ute)?s?)\b/i); if (m) return stripAt(line, m.index, m[0].length);
  return line;
}
// Prayer-anchored ("after Fajr" / "before Isha") — real awqāt from the user's own prayer
// settings (getNotifTime/prayersOn/PRAYERS are production globals from js/app.js, untouched).
function matchPrayerAnchor(line, blockDur) {
  if (!prayersOn()) return null;
  var m = line.match(/\b(after|before)\s+(Fajr|Dhuhr|Asr|Maghrib|Isha)\b/i);
  if (!m) return null;
  var prayerName = PRAYERS.filter(function(p) { return p.toLowerCase() === m[2].toLowerCase(); })[0];
  if (!prayerName) return null;
  var pt = getNotifTime("prayers", prayerName);
  if (!pt) return null;
  var start = hhmmToMin(pt) + (m[1].toLowerCase() === "after" ? 5 : -(blockDur || 30));
  start = ((start % 1440) + 1440) % 1440;
  return { start:start, rest:stripAt(line, m.index, m[0].length) };
}

// -- Feature 2 day extraction: a contiguous "day clause" (on Sat / Sat–Mon / Mon/Wed / Mon, Wed),
// full or short names. A dash/en-dash connector between exactly two days is an INCLUSIVE RANGE
// (with week wraparound, Sat->Mon = Sat,Sun,Mon); any other connector (comma/slash/"and") is a
// discrete LIST. Absent = every day (caller omits `days`).
var DAY_WORD = "(?:Sun(?:day)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?)";
var DAY_CLAUSE_RE = new RegExp("\\b(?:on\\s+)?(" + DAY_WORD + "(?:(?:\\s*(?:[-\u2013,\\/]|and)\\s*|\\s+)" + DAY_WORD + ")*)\\b", "i");
function dayTokenIndex(tok) { var t = tok.slice(0, 3).toLowerCase(); for (var i = 0; i < IMPORT_DAY_NAMES.length; i++) if (IMPORT_DAY_NAMES[i].toLowerCase() === t) return i; return -1; }
function parseDaysToken(line) {
  // Keyword day-scopes. Without this, "weekdays"/"daily"/"every day" leaked into the item name
  // and the item lost its recurrence. daily/everyday -> null (= every day, per importItem default).
  var kw = line.match(/\b(weekdays?|weekends?|every\s*day|everyday|daily)\b/i);
  if (kw) {
    var w = kw[0].toLowerCase().replace(/\s+/g, "");
    var kdays = /weekday/.test(w) ? [1, 2, 3, 4, 5] : /weekend/.test(w) ? [0, 6] : null;
    return { days:kdays, rest:stripAt(line, kw.index, kw[0].length) };
  }
  var m = line.match(DAY_CLAUSE_RE);
  if (!m) return { days:null, rest:line };
  var clause = m[1], toks = clause.match(new RegExp(DAY_WORD, "gi")) || [];
  var idxs = toks.map(dayTokenIndex).filter(function(i) { return i !== -1; });
  var isRange = idxs.length === 2 && /[-\u2013]/.test(clause) && !/,|and|\//i.test(clause.replace(/[-\u2013]/g, ""));
  var days;
  if (isRange) { var out = [idxs[0]], cur = idxs[0]; while (cur !== idxs[1]) { cur = (cur + 1) % 7; out.push(cur); } days = out; }
  else days = idxs.filter(function(v, i, a) { return a.indexOf(v) === i; }).sort(function(a, b) { return a - b; });
  return { days:days.length ? days : null, rest:stripAt(line, m.index, m[0].length) };
}

// -- Feature 2 time extraction. No am/pm on an atom = read the hour literally (this single rule
// covers both "6" alone -> 06:00 and a bare ambiguous range "10-12" -> 10:00-12:00 per spec).
var TIME_ATOM = "(\\d{1,2})(?::([0-5]\\d))?\\s*([ap]m)?";
var TIME_RANGE_RE = new RegExp("\\b" + TIME_ATOM + "\\s*(?:-|\u2013|to)\\s*" + TIME_ATOM + "\\b", "i");
var TIME_SINGLE_RE = new RegExp("\\b" + TIME_ATOM + "\\b", "i");
function meridiemHour(h, ap) { h = h % 12; return ap === "pm" ? h + 12 : h; }
function literalHour(h) { return h % 24; }
// Explicit am/pm always wins; a range's END am/pm back-fills the START when the start has none,
// trying both meridiems and keeping whichever keeps start < end (11-1pm -> 11:00-13:00).
function resolveRangeAtoms(a1, a2) {
  var h1, h2;
  if (a1.ap && a2.ap) { h1 = meridiemHour(a1.h, a1.ap); h2 = meridiemHour(a2.h, a2.ap); }
  else if (!a1.ap && a2.ap) {
    h2 = meridiemHour(a2.h, a2.ap);
    var tryH1 = meridiemHour(a1.h, a2.ap);
    h1 = (tryH1 * 60 + a1.m < h2 * 60 + a2.m) ? tryH1 : meridiemHour(a1.h, a2.ap === "am" ? "pm" : "am");
  }
  else if (a1.ap && !a2.ap) { h1 = meridiemHour(a1.h, a1.ap); h2 = literalHour(a2.h); }
  else { h1 = literalHour(a1.h); h2 = literalHour(a2.h); }
  var start = h1 * 60 + a1.m, end = h2 * 60 + a2.m;
  // A range that ends before it starts wrapped. When BOTH atoms carried an explicit am/pm the
  // meridiems aren't in doubt, so the only reading is "crosses midnight" (11:45pm-12am = 15m, and
  // 11pm-1am = 120m) — bumping 12h there is what produced the 30m midnight bug. Only an ambiguous
  // atom gets the 12h nudge first (6:30pm-8 = 8pm), falling through to a day if that's still short.
  if (start >= end) {
    if (a1.ap && a2.ap) end += 1440;
    else { end += 720; if (start >= end) end += 720; }
  }
  return { start:start, end:end };
}
function matchExplicitRange(line) {
  var m = line.match(TIME_RANGE_RE);
  if (!m) return null;
  var res = resolveRangeAtoms({ h:+m[1], m:m[2] ? +m[2] : 0, ap:m[3] ? m[3].toLowerCase() : null }, { h:+m[4], m:m[5] ? +m[5] : 0, ap:m[6] ? m[6].toLowerCase() : null });
  return { start:res.start, end:res.end, rest:stripAt(line, m.index, m[0].length) };
}
function matchExplicitSingle(line) {
  var m = line.match(TIME_SINGLE_RE);
  if (!m) return null;
  var ap = m[3] ? m[3].toLowerCase() : null, mins = m[2] ? +m[2] : 0;
  var start = ap ? meridiemHour(+m[1], ap) * 60 + mins : literalHour(+m[1]) * 60 + mins;
  return { start:start, rest:stripAt(line, m.index, m[0].length) };
}
function isHeaderLine(trimmed) { return /:$/.test(trimmed) || /this is how my day|and every week/i.test(trimmed); }
// Per-line dispatcher — Feature 2 steps 2-5 (days already skipped as step 1's blank/header lines
// are filtered by the caller). Precedence: (a) learned phrase, (b) explicit range, (c) single
// time, (d) built-in phrase dictionary (prayer-anchored, then time-of-day words).
function parseOneLine(trimmed) {
  var afterDays = parseDaysToken(trimmed), days = afterDays.days, rest = afterDays.rest;
  var start = null, end = null, duration = null;

  var learned = getLearnedMap(), learnedKeys = Object.keys(learned).sort(function(a, b) { return b.length - a.length; });
  var restLower = rest.toLowerCase();
  for (var i = 0; i < learnedKeys.length; i++) {
    if (restLower.indexOf(learnedKeys[i]) !== -1) { var lp = learned[learnedKeys[i]]; start = hhmmToMin(lp.time); duration = lp.duration || null; break; }
    // NOTE: intentionally not stripped from `rest` — the learned key IS the item's own leftover
    // name text (Feature 4), so removing it again would empty the name and force it to `unread`.
  }

  if (start === null) {
    var rangeM = matchExplicitRange(rest);
    if (rangeM && rangeM.start !== null) { start = rangeM.start; end = rangeM.end; rest = rangeM.rest; if (end !== null) duration = end - start; }
    else { var singleM = matchExplicitSingle(rest); if (singleM) { start = singleM.start; rest = singleM.rest; } }
  }

  var durWord = matchPhraseDuration(rest); // independent of start, per spec

  if (start === null) { var anchor = matchPrayerAnchor(rest, durWord || 30); if (anchor) { start = anchor.start; rest = anchor.rest; } }
  if (start === null) { var tod = matchPhraseTimeOfDay(rest); if (tod) { start = tod.start; rest = tod.rest; } }

  if (start === null) return null; // step 5: no time resolved -> unread

  if (duration === null) duration = durWord || 30;
  if (durWord !== null) rest = stripDurationWords(rest);

  var name = rest.replace(/[,;.\-\u2013]+$/, "").trim();
  if (!name) return null; // step 4: empty name -> unread

  var out = { name:name, time:minToHHMM(((start % 1440) + 1440) % 1440), duration:Math.max(1, Math.round(duration)) };
  // omit `days` entirely for "every day" (importItem treats an explicit null as invalid, only
  // undefined means every day); when present, the wire payload uses day-name strings (Sun..Sat),
  // same as the AI-JSON import format — not the internal int indices `days` holds here.
  if (days) out.days = days.map(function(d) { return IMPORT_DAY_NAMES[d]; });
  return out;
}
// Feature 2 entry point — {payload, unread}. payload feeds straight into parseImportSchedule
// (validation+dedup) exactly like the pasted-AI-JSON path; unread lines are surfaced, never dropped.
function parseScheduleText(text, cardId) {
  var lines = (text || "").split("\n"), items = [], unread = [];
  lines.forEach(function(rawLine, i) {
    var trimmed = rawLine.trim();
    if (!trimmed) return;
    if (isHeaderLine(trimmed) && !TIME_RANGE_RE.test(trimmed) && !TIME_SINGLE_RE.test(trimmed)) return;
    var parsed = parseOneLine(trimmed);
    if (!parsed) { unread.push({ text:rawLine, i:i }); return; }
    items.push(parsed);
  });
  // Fix 1: route each line to the card its words match instead of dumping the whole day into the
  // picked card — the chip is now just the DEFAULT for lines nothing matches. Emitting real card
  // names as the group names means the downstream preview/apply need no parser-specific handling.
  var byName = {}, order = [], cards = getCards();
  function cardName(id) { return (cards.filter(function(c) { return c.id === id; })[0] || {}).name || "Daily Goals"; }
  var fallback = cardName(cardId);
  items.forEach(function(it) {
    var guess = guessCardId(it.name), nm = guess ? cardName(guess) : fallback;
    if (!byName[nm]) { byName[nm] = []; order.push(nm); }
    byName[nm].push(it);
  });
  return { payload:{ version:1, cards:order.map(function(nm) { return { name:nm, items:byName[nm] }; }) }, unread:unread };
}
function renderParserPanel() {
  var cards = getCards();
  var h = '<div class="sch-parserbox' + '" style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)">';
  h += '<p style="font-weight:600;margin-bottom:6px">Type your day</p>';
  h += '<p style="font-size:11px;opacity:.75;margin-bottom:8px">No AI needed. You write it, we read it, fully offline.</p>';
  h += '<ol class="sch-parsesteps">'
    + '<li>Set up your cards first on the <b>Plan</b> page, for example Fitness, Study, Prayers.</li>'
    + '<li>Pick a card below, then type that card\u2019s activities, one per line with a time.</li>'
    + '<li>Tap <b>Read my day</b>, then switch cards and do the next one.</li>'
    + '</ol>';
  h += '<p class="sch-parselbl">Which card do these lines go on?</p>';
  h += '<div class="sch-gapcards">';
  cards.forEach(function(card) { h += '<button type="button" class="sch-gapcard' + (card.id === parseCardId ? ' on' : '') + '" style="--kc:' + esA(card.color) + '" data-a="parsecardchip" data-c="' + esA(card.id) + '">' + esc(card.name) + '</button>'; });
  h += '</div>';
  h += '<textarea id="parse-text" style="margin-top:8px" placeholder="Activities for ' + esc((cards[0] && cards[0].name) || "this card") + ', e.g.\nGym 6:30\u20137:30am\nMorning run 7am Mon Wed Fri">' + esc(parseText) + '</textarea>';
  h += '<button class="bt bta t-sm" style="margin-top:8px" data-a="parserun">Read my day</button>';
  h += '<p class="sch-parsehint">Need another card? Add one on your <b>Plan</b> page, then come back here.</p>';
  if (parseUnread.length) {
    h += '<div style="margin-top:12px"><p style="font-size:12px;font-weight:600;color:#bfa46a">Couldn\u2019t read these \u2014 add a time or edit them</p>';
    parseUnread.forEach(function(u) {
      h += '<div style="display:flex;gap:6px;align-items:center;margin-top:6px">'
        + '<input type="text" id="parse-unread-edit-' + u.i + '" class="sch-addname" style="margin-bottom:0;flex:1" value="' + esA(u.text) + '">'
        + '<button class="bt t-xs" data-a="parseunreadretry" data-i="' + u.i + '">Retry</button>'
        + '<button class="bt t-xs" data-a="parseunreadremove" data-i="' + u.i + '">Remove</button></div>';
    });
    h += '</div>';
  }
  var learned = getLearnedMap(), learnedKeys = Object.keys(learned);
  if (learnedKeys.length) {
    h += '<details style="font-size:11px;margin-top:12px"><summary style="cursor:pointer;opacity:.8">Learned phrases (' + learnedKeys.length + ')</summary>';
    learnedKeys.forEach(function(k) { h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-top:1px solid var(--line)"><span>' + esc(k) + ' = ' + esc(learned[k].time) + (learned[k].duration ? ' (' + esc(fmtDur(learned[k].duration)) + ')' : '') + '</span><button class="bt t-xs" data-a="phraseforget" data-k="' + esA(k) + '">Delete</button></div>'; });
    h += '</details>';
  }
  return h + '</div>';
}
// Shared with HELP_TOPICS.import below — one source of copy, so the ? sheet and the inline
// guide's <ol> never drift apart.
var IMPORT_GUIDE_STEPS = [
  "Tap Copy my template (copies a prompt with your current schedule).",
  "Open your AI (Claude, ChatGPT, etc.), paste it, and describe your week in plain words.",
  "The AI replies with your schedule in the right format.",
  "Copy that reply, tap Import schedule below to open the paste box, and paste it in.",
  "Tap Preview, check the table, then Apply."
];
var aiStep = 0;   // 0 = copy the prompt, 1 = bring the reply back, 2 = check the preview
// Copy-and-open, deliberately NOT URL prompt-prefill: only ChatGPT supports a ?q= param at all,
// and the prompt is already ~5.9k URL-encoded characters at one card with five items, scaling to
// roughly 12-15k at the five-card cap, far past the ~2k safe URL limit. Clipboard has no length
// limit and behaves the same on all three. Do not "upgrade" this to prefill without re-measuring.
var AI_SERVICES = [
  { id:"claude",  label:"Claude",  url:"https://claude.ai/new" },
  { id:"chatgpt", label:"ChatGPT", url:"https://chatgpt.com/" },
  { id:"gemini",  label:"Gemini",  url:"https://gemini.google.com/app" }
];
var AI_STEP_TEXT = [
  "Copy the prompt, then paste it into your AI.",
  "Describe your week, then copy the reply.",
  "Check the preview below, then apply."
];
function renderImportGuide() {
  return '<div class="sch-guide" style="margin-bottom:12px">'
    + '<div class="sch-seg" role="tablist">'
    + '<button type="button" class="sch-segtab' + (importTab === "type" ? ' act' : '') + '" role="tab" aria-selected="' + (importTab === "type" ? 'true' : 'false') + '" data-a="importtab" data-tab="type">Type your day</button>'
    + '<button type="button" class="sch-segtab' + (importTab === "ai" ? ' act' : '') + '" role="tab" aria-selected="' + (importTab === "ai" ? 'true' : 'false') + '" data-a="importtab" data-tab="ai">Set up with AI</button>'
    + '</div></div>';
}
// One instruction at a time, tied to where the user is in the flow. NOT a walkthrough: no overlay,
// no dim, no Skip/Next, and every control stays live regardless of aiStep. It is a label that
// changes. The full five steps stay one tap away in the `import` help topic.
function renderAiTabGuide() {
  var h = '<div class="flx aic" style="justify-content:space-between;margin-bottom:9px">';
  h += '<p style="font-size:12.5px;margin:0">' + esc(AI_STEP_TEXT[aiStep] || AI_STEP_TEXT[0]) + '</p>';
  h += '<button type="button" class="sch-ib" data-a="help" data-topic="import" aria-label="Help with importing">?</button></div>';
  h += '<div class="sch-aibtns">';
  AI_SERVICES.forEach(function(svc) {
    h += '<button type="button" class="bt t-sm" data-a="aiopen" data-svc="' + esA(svc.id) + '"><i class="fas fa-arrow-up-right-from-square mr-1.5"></i>' + esc(svc.label) + '</button>';
  });
  h += '</div>';
  return h;
}
// ---- HELP_TOPICS registry — single source for both the per-section ? sheets and the tour ----
var HELP_TOPICS = {
  import:   { title: "Set up with AI", steps: IMPORT_GUIDE_STEPS },
  prayers:  { title: "Prayers", steps: [
    "All 5 prayers, always shown. Tap a time to set or change it.",
    "A timed prayer shows green on the Pehar, and reminds you before it starts."
  ]}
};

// ---- On-demand ? help overlay. The first-run tour and the AI walkthrough were deleted with
// the controls they explained: help scaffolding is a symptom of unclear UI, not a fix for it.
function renderHelpOverlay() {
  if (!helpTopic || !HELP_TOPICS[helpTopic]) return '';
  var t = HELP_TOPICS[helpTopic];
  var h = '<div class="sch-ovbackdrop" data-a="helpclose">';
  h += '<div class="sch-ovsheet" data-a="helpnoop">';
  h += '<div class="sch-ovhead"><h2>' + esc(t.title) + '</h2><button type="button" class="sch-ib" data-a="helpclose" aria-label="Close"><i class="fas fa-xmark"></i></button></div>';
  h += '<ul class="sch-ovsteps">' + t.steps.map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
  h += '</div></div>';
  return h;
}
// Overview stats picker as a real modal (the inline panel was cramped/ugly). Opened by a card's
// pencil (ovStatsEdit = cardId); lists that card's items with on/off toggle rows.
function renderOvStatsModal() {
  if (!ovStatsEdit) return '';
  var card = getCards().filter(function(c) { return c.id === ovStatsEdit; })[0];
  if (!card) return '';
  var h = '<div class="sch-ovbackdrop" data-a="ovstatsclose">';
  h += '<div class="sch-ovsheet" data-a="helpnoop" style="--kc:' + esA(card.color) + '">';
  h += '<div class="sch-ovhead"><h2>Track in ' + esc(card.name) + '</h2><button type="button" class="sch-ib" data-a="ovstatsclose" aria-label="Close"><i class="fas fa-xmark"></i></button></div>';
  h += '<p style="font-size:12px;color:var(--smut);margin:0 0 12px">Choose which items show a streak grid here.</p>';
  if (!card.items.length) { h += '<p class="sch-cardnothing">No items on this card yet.</p>'; }
  else card.items.forEach(function(it) {
    var on = getItemShow(card.id, it.n);
    h += '<button type="button" class="sch-ovpickrow' + (on ? ' on' : '') + '" data-a="ovstatstoggle" data-c="' + esA(card.id) + '" data-k="' + esA(it.n) + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" style="--kc:' + esA(card.color) + '">';
    h += '<span class="sch-box"><svg viewBox="0 0 24 24"><polyline points="4 13 9 18 20 6"></polyline></svg></span>';
    h += '<span>' + esc(it.n) + '</span></button>';
  });
  h += '</div></div>';
  return h;
}

// Re-derive the preview after an in-place edit (re-target, shift). Keeps the user's already-made
// keep-mine/keep-imported calls, since a rebuild would otherwise silently reset them all to "mine".
function rebuildImportPreview() {
  function key(r) { return r.kind + "::" + (r.cardName || "") + "::" + (r.name || ""); }
  var keep = {}; importPreview.rows.forEach(function(r) { if (r.choice) keep[key(r)] = r.choice; });
  var fromParser = importPreview.fromParser;
  importPreview = buildImportPreview(importPreview.data);
  importPreview.fromParser = fromParser;
  importPreview.rows.forEach(function(r) { if (keep[key(r)]) r.choice = keep[key(r)]; });
}
function importPreviewAllChoice() {
  var conflicts = importPreview.rows.filter(function(r){ return r.kind === "item" || r.kind === "prayer"; });
  if (!conflicts.length) return null;
  if (conflicts.every(function(r){ return r.choice === "mine"; })) return "mine";
  if (conflicts.every(function(r){ return r.choice === "import"; })) return "import";
  return null;
}
function importPreviewRow(row, i, fromParser) {
  var isPrayer = row.kind === "newprayer" || row.kind === "prayer";
  var isNew = row.kind === "newitem" || row.kind === "newprayer";
  var inc = row.incoming || {}, mine = row.mine || {};
  var item = isPrayer ? row.name : (row.name || inc.name || "");
  var td = 'padding:6px 8px;border-bottom:1px solid var(--bd)';
  // Fix 1: the Card cell is a dropdown, the single override for a bad auto-guess OR the AI's bad
  // grouping (Physiotherapy landing in Islamic Deeds). A row bound for a card that doesn't exist
  // yet keeps its own "(new)" option so choosing it again is possible after switching away.
  var card;
  if (isPrayer) card = 'Prayers';
  else {
    var opts = getCards().map(function(c) { return '<option value="' + esA(c.id) + '"' + (c.id === row.targetId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; });
    if (String(row.targetId).indexOf("__new_") === 0) opts.push('<option value="' + esA(row.targetId) + '" selected>' + esc(row.cardName) + ' (new)</option>');
    card = '<select class="inp t-xs" data-a="importrowcard" data-i="' + i + '" aria-label="Card for ' + esA(item) + '">' + opts.join('') + '</select>';
  }
  function fdays(dd){ return (dd && dd.length) ? dd.map(function(d){ return typeof d === "number" ? IMPORT_DAY_NAMES[d] : d; }).join('/') : "every day"; }
  var incTime = inc.time || "-", incDur = fmtDur(inc.duration || (isPrayer ? 35 : 30)), incDays = fdays(inc.days);
  var timeCell, durCell, daysCell, status;
  if (isNew) {
    // Feature 4's second learning trigger — correcting a parser-sourced row's time before apply.
    // Gated on fromParser + newitem only, so the plain AI-JSON import path renders exactly as before.
    timeCell = (fromParser && row.kind === "newitem")
      ? '<input type="time" class="inp t-xs" id="prow-time-' + i + '" value="' + esA(inc.time || "") + '" style="width:92px"> <button class="bt t-xs" data-a="parserowtimesave" data-i="' + i + '">Save</button>'
      : esc(incTime);
    durCell = esc(incDur); daysCell = esc(incDays);
    status = '<span style="color:#79a06b;font-weight:600">NEW</span>';
  } else {
    var keepMine = row.choice === "mine";
    function diff(a, b){ if (a === b) return esc(a); var ms = keepMine ? 'font-weight:700' : 'opacity:.5;text-decoration:line-through', is = keepMine ? 'opacity:.5;text-decoration:line-through' : 'font-weight:700'; return '<span style="' + ms + '">' + esc(a) + '</span> → <span style="' + is + '">' + esc(b) + '</span>'; }
    timeCell = diff(mine.time || "-", incTime); durCell = diff(fmtDur(mine.duration || (isPrayer ? 35 : 30)), incDur); daysCell = diff(fdays(mine.days), incDays);
    status = '<span style="color:#bfa46a;font-weight:600">CONFLICT</span> <span style="display:inline-flex;gap:4px;margin-left:4px"><button class="bt t-xs' + (keepMine ? ' on' : '') + '" data-a="importresolve" data-i="' + i + '" data-choice="mine">mine</button><button class="bt t-xs' + (row.choice === "import" ? ' on' : '') + '" data-a="importresolve" data-i="' + i + '" data-choice="import">imported</button></span>';
  }
  // Fix 4/5: every reshape the AI or the app made is visible on its own row, and an overlap comes
  // with the one-tap fix rather than being silently moved for the user.
  if (row.overlap) status += '<div style="margin-top:4px;color:#e0a35c;font-size:11px;white-space:normal"><i class="fas fa-triangle-exclamation" style="margin-right:4px"></i>overlaps another block <button class="bt t-xs" data-a="importrowshift" data-i="' + i + '">Shift to next free slot</button></div>';
  if (inc.note) status += '<div style="margin-top:4px;color:#bfa46a;font-size:11px;white-space:normal"><i class="fas fa-triangle-exclamation" style="margin-right:4px"></i>' + esc(inc.note) + '</div>';
  return '<tr><td style="' + td + '">' + (isPrayer ? esc(card) : card) + '</td><td style="' + td + '">' + esc(item) + '</td><td style="' + td + '">' + timeCell + '</td><td style="' + td + '">' + durCell + '</td><td style="' + td + '">' + daysCell + '</td><td style="' + td + '">' + status + '</td></tr>';
}
function importSummaryText() {
  var c = importPreview.addCards, it = importPreview.addItems, pr = importPreview.prayerSets;
  var cf = importPreview.rows.filter(function(r){ return r.kind === "item" || r.kind === "prayer"; }).length;
  function pl(n, w){ return n + ' ' + w + (n === 1 ? '' : 's'); }
  var parts = [];
  if (c) parts.push(pl(c, 'card'));
  if (it) parts.push(pl(it, 'item'));
  if (pr) parts.push(pl(pr, 'prayer time'));
  var head = parts.length ? 'Adds ' + parts.join(' · ') : 'Nothing new';
  return head + ' · ' + pl(cf, 'conflict') + ' to resolve.';
}
function renderImportPanel() {
  var h = '<div class="sch-importbox" id="schedule-import">';
  h += renderImportGuide();
  if (importTab === "type") {
    h += renderParserPanel();
  } else {
    h += '<div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)">';
    h += renderAiTabGuide();
    h += '<textarea id="import-json" placeholder="Paste the whole reply here. A code fence or extra words around it are fine.">' + esc(importDraft) + '</textarea><button class="bt bta t-sm" style="margin-top:8px" data-a="importpreview">Preview</button>';
    if (importError) h += '<p class="sch-importerr">' + esc(importError) + '</p>';
    h += '</div>';
  }
  // Preview table renders below either tab — it's the shared destination both paths land in.
  if (importPreview) { h += (importPreview.folded > 0 ? '<p style="font-size:11px;color:#e0a35c;margin:10px 0 0">' + importPreview.folded + ' group' + (importPreview.folded === 1 ? '' : 's') + ' merged into Daily Goals (5-card limit).</p>' : '') + (importPreview.data.notes ? '<p class="sch-importnotes" style="font-size:11.5px;line-height:1.6;opacity:.85;margin:10px 0 0;white-space:pre-wrap;border-left:2px solid var(--bd);padding-left:8px">' + esc(importPreview.data.notes) + '</p>' : '') + '<p class="sch-importsummary">' + importSummaryText() + '</p><div class="sch-importchoices"><button class="bt t-sm' + (importPreviewAllChoice() === "mine" ? " on" : "") + '" data-a="importallmine">Keep all mine</button><button class="bt t-sm' + (importPreviewAllChoice() === "import" ? " on" : "") + '" data-a="importallimport">Keep all imported</button></div>'; h += '<div style="overflow-x:auto"><table class="sch-imptable" style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr>' + ['Card','Item','Time','Dur','Days','Status'].map(function(c){ return '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd);color:var(--mt);font-weight:600">' + c + '</th>'; }).join('') + '</tr></thead><tbody>'; importPreview.rows.forEach(function(row, i) { h += importPreviewRow(row, i, importPreview.fromParser); }); h += '</tbody></table></div><button class="bt bta t-sm" style="margin-top:10px" data-a="importapply">Apply import</button>'; }
  return h + '</div>';
}

// ============================================================
// TEMPLATE VIEW (spec: "Page 2 — Template") — the recurring plan.
// Prayers card (fixed/special) + YOUR PLAN custom cards + settings footer.
// ============================================================
var ICON_CHOICES = ["fa-star","fa-bullseye","fa-hand-holding-heart","fa-heart-pulse","fa-dumbbell","fa-book","fa-pen","fa-brain","fa-leaf","fa-mug-hot"];
var ovStatsEdit = null;   // cardId whose Overview stats-picker panel is open, or null
var tplCardEdit = null;   // cardId whose name is being renamed inline
var tplItemEdit = null;   // "field::name" of the item whose inline editor is open
var tplRepeatMode = {};   // "field::name" -> "every"|"custom", UI-only (persists via setItemDays)

// carForceReduced/carReducedMotion are kept (used by row-gesture drag animation gating below,
// unrelated to the deleted carousel) even though the carousel itself is gone.
var carForceReduced = false; // self-check only: force the reduced-motion branch
function carReducedMotion() {
  return carForceReduced || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function renderNav(active) {
  var h = '<div class="sch-nav' + '">';
  [["vday","Today","daily"],["vov","Overview","overview"],["vset","Template","settings"]].forEach(function(n) {
    h += '<button class="sch-tab' + (n[2] === active ? ' act' : '') + '" data-a="' + n[0] + '">' + n[1] + '</button>';
  });
  return h + '</div>';
}

function scheduleSummary(time, days) {
  // Returns HTML (the clock is an icon), so its one call site must not wrap it in esc().
  var timePart = time ? ('<i class="fas fa-clock" style="margin-right:4px"></i>' + prettyTime(time)) : 'no time';
  return timePart + ' · ' + (!days ? 'every day' : 'custom');
}

function templateEditorHTML(field, name) { return itemEditorHTML(field, name, "tpledit"); }

// Composed empty state — one muted icon + one short line. The add affordance
// (already rendered by the caller right after) completes the state.
function emptyStateHTML(icon, text) {
  return '<div class="sch-emptystate"><i class="fas ' + icon + '"></i><p>' + esc(text) + '</p></div>';
}

function renderPlanCard(card) {
  var items = cardItemsFor(card.id);
  var h = '<div class="sch-cardblock" style="--kc:' + esA(card.color) + '">';
  h += '<div class="sch-cardhead">';
  // The icon is decoration now, not a button: colour and icon are auto-assigned at creation
  // (nextCardColor/nextCardIcon) and the 12x10 restyle popover is gone. Delete-card moved out
  // of that popover and onto the head, because the popover was the only way to reach it.
  h += '<i class="fas ' + esA(card.icon) + ' sch-cardicon" style="--kc:' + esA(card.color) + '"></i>';
  if (tplCardEdit === card.id) {
    h += '<input type="text" class="sch-addname sch-cardnameinp" id="cardname-' + esA(card.id) + '" value="' + esA(card.name) + '" maxlength="40">';
  } else {
    h += '<span class="sch-cardname" data-a="cardrename" data-c="' + esA(card.id) + '" role="button" tabindex="0">' + esc(card.name) + '</span>';
  }
  h += '<span class="sch-cardcount">' + items.length + '</span>';
  if (!card.base) h += '<button type="button" class="sch-ib sch-carddel" data-a="carddel" data-c="' + esA(card.id) + '" aria-label="Delete ' + esA(card.name) + '"><i class="fas fa-trash-can"></i></button>';
  h += '</div>';

  if (!items.length) {
    h += emptyStateHTML('fa-list-check', 'No items yet');
  } else {
    items.forEach(function(it) {
      var key = card.id + "::" + it.n;
      h += '<div class="sch-planitem"><div class="sch-gest" data-gest="delete" data-f="' + esA(card.id) + '" data-k="' + esA(it.n) + '">';
      h += '<button type="button" class="sch-gest-action sch-gest-delete" data-a="gestdel" data-f="' + esA(card.id) + '" data-k="' + esA(it.n) + '" aria-label="Delete ' + esA(it.n) + '"><i class="fas fa-trash-can"></i></button>';
      h += '<div class="sch-planrow sch-gest-row">';
      h += '<div class="sch-planinfo"><span class="sch-title">' + esc(it.n) + '</span><span class="sch-summary">' + scheduleSummary(it.time, it.days) + '</span></div>';
      h += '<button class="sch-edit" data-a="tpledit" data-f="' + esA(card.id) + '" data-k="' + esA(it.n) + '" aria-label="Edit ' + esA(it.n) + '"><i class="fas fa-pen"></i></button>';
      h += '<button class="sch-edit sch-rowdel" data-a="gestdel" data-f="' + esA(card.id) + '" data-k="' + esA(it.n) + '" aria-label="Delete ' + esA(it.n) + '"><i class="fas fa-trash-can"></i></button>';
      h += '</div></div>';
      if (tplItemEdit === key) h += templateEditorHTML(card.id, it.n);
      h += '</div>';
    });
  }

  // Persistent name-only add row (the live-site convenience the user asked back): type a name,
  // Enter or +Add, it lands and the box stays focused for the next one. Time and repeat days are
  // set later via the item's pencil — adding is deliberately just the name, so you can rattle off
  // several in a row without a form reopening each time.
  h += '<div class="sch-inlineadd">';
  h += '<input type="text" id="ca-name-' + esA(card.id) + '" class="sch-addname" placeholder="Add a goal…" maxlength="60" autocomplete="off">';
  h += '<button class="sch-addgo" data-a="cardadditemsave" data-c="' + esA(card.id) + '"><i class="fas fa-plus mr-1.5"></i>Add</button>';
  h += '</div>';
  return h + '</div>';
}

function renderPrayersCard() {
  if (!prayersOn()) return "";
  var bells = getPrayerBells();
  var h = '<div class="sch-cardblock" style="--kc:' + PRAYER_GREEN + '">';
  h += '<div class="sch-cardhead"><i class="fas fa-mosque sch-cardicon"></i><span class="sch-cardname">Prayers</span><button type="button" class="sch-ib" style="margin-left:auto" data-a="help" data-topic="prayers" aria-label="Help with prayers">?</button></div>';
  PRAYERS.forEach(function(name) {
    var t = getNotifTime("prayers", name);
    h += '<div class="sch-prayrow">';
    h += '<span class="sch-praynode" style="--kc:' + PRAYER_GREEN + '"></span><span class="sch-name">' + esc(name) + '</span>';
    h += '<input type="time" class="sch-timeinp" data-field="prayers" data-name="' + esA(name) + '" value="' + esA(t) + '">';
    h += '<button class="sch-bell' + (bells[name] ? ' on' : '') + '" data-a="prayerbell" data-k="' + esA(name) + '"><i class="fas fa-bell"></i></button>';
    h += '</div>';
  });
  h += '<p class="sch-autolbl">set your prayer times · updates your Pehar</p>';
  return h + '</div>';
}

// ============================================================
// ONBOARDING (Task 9A, spec: "First-run / onboarding") — prayer choice, then setup.
// Writes via setNotifTime("prayers", name, val) — exactly what Template's Prayers card
// reads/edits later — no separate model.
// ============================================================
var ONBOARD_KEY = "ht_onboarded";
// Prefilled prayer-time defaults for onboarding step 1 (Task 12) — user can change any before
// Continue; Continue writes whatever's shown (see onbcontinue), so leaving a default untouched
// just means that default gets written.
var ONB_DEFAULTS = { Fajr: "05:30", Dhuhr: "13:10", Asr: "17:35", Maghrib: "19:25", Isha: "21:25" };

// Pure gate predicate (no DOM) so the self-check can exercise it directly.
function shouldShowOnboarding() {
  if (location.hash === "#onboard") return true; // force-show for testing, flag untouched
  return !localStorage.getItem(ONBOARD_KEY) && view === "daily";
}

function finishOnboarding() {
  localStorage.setItem(ONBOARD_KEY, "true");
  if (location.hash === "#onboard") history.replaceState(null, "", location.pathname + location.search);
  onbStep = 1;
  render();
}

function rOnboarding() {
  var h = '<div class="sch-view sch-onb">';
  h += '<div class="sch-onbprog"><i class="' + (onbStep >= 1 ? 'on' : '') + '"></i><i class="' + (onbStep >= 2 ? 'on' : '') + '"></i><i class="' + (onbStep >= 3 ? 'on' : '') + '"></i><i class="' + (onbStep >= 4 ? 'on' : '') + '"></i></div>';
  if (onbStep === 1) {
    h += '<h1 class="sch-onbtitle">What do you want to track?</h1>';
    h += '<p class="sch-onblede">Waqt anchors your day to fixed times. Pick what shows up in your feed. You can change any of these later in Settings.</p>';
    h += '<div class="sch-onbtrack">';
    h += onbTrackRow("prayers", prayersOn(), "The 5 daily prayers", "Fajr to Isha, set as anchors on your timeline.");
    h += onbTrackRow("weight", weightOn(), "Weight", "A tile and trend chart to log your weight over time.");
    h += '</div>';
    h += '<div class="sch-onbfoot"><button class="sch-onbgo" data-a="onbstep1">Continue</button></div>';
  } else if (onbStep === 2) {
    h += '<h1 class="sch-onbtitle">Meet the Pehar</h1>';
    h += '<p class="sch-onblede">The Pehar is your day as a timeline, from dawn to night. Prayers and tasks sit in order with the free stretches in between, so a glance tells you what is on now and what comes next.</p>';
    h += '<div class="sch-pehardemo">' + peharDemoHTML(prayersOn()) + '</div>';
    h += '<div class="sch-onbtrack">';
    h += onbTrackRow("pehar", peharOn(), "Show the Pehar in my feed", "Turn off for a plain checklist instead.");
    h += '</div>';
    h += '<div class="sch-onbfoot"><button class="sch-onbgo" data-a="onbstep2">Continue</button></div>';
  } else if (onbStep === 3) {
    h += '<h1 class="sch-onbtitle">Set your prayer times</h1>';
    h += '<p class="sch-onblede">Enter your prayer times so they show up on your Pehar. You can skip this and set it up later in Template.</p>';
    PRAYERS.forEach(function(name) {
      h += '<div class="sch-prayrow"><span class="sch-praynode" style="--kc:' + PRAYER_GREEN + '"></span><span class="sch-name">' + esc(name) + '</span>';
      h += '<input type="time" class="sch-timeinp" id="onb-' + esA(name) + '" value="' + esA(ONB_DEFAULTS[name] || "") + '"></div>';
    });
    h += '<div class="sch-onbfoot"><button class="sch-onbskip" data-a="onbskip1">Skip for now</button><button class="sch-onbgo" data-a="onbcontinue">Continue</button></div>';
  } else {
    h += '<h1 class="sch-onbtitle">You’re set</h1>';
    h += '<p class="sch-onblede">Your day lives on the Pehar. Plan recurring goals on your Plan page.</p>';
    h += '<div class="sch-onbfoot"><button class="sch-onbgo" data-a="onbfinish">Get started</button></div>';
  }
  return h + '</div>';
}

// Onboarding "what to track" row: label + reused switch. Flips the matching on/off key live.
function onbTrackRow(key, on, title, sub) {
  return '<div class="sch-onbrow"><div class="txt"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></div>'
    + '<button type="button" class="sch-switch' + (on ? ' on' : '') + '" data-a="onbtoggle" data-k="' + esA(key) + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esA(title) + '"><span class="sch-switchknob"></span></button></div>';
}
// A miniature of the real (vertical) Pehar: time on the left, a rail with green prayer nodes,
// prayer cards alternating with dashed "Free time" gaps. Mirrors how the timeline actually looks.
function peharDemoRow(time, unit, dur, label, type) {
  var node = type === "prayer" ? " on" : type === "task" ? " task" : "";
  var card = type === "prayer" ? "" : type === "task" ? " task" : " free";
  var tag = type === "prayer" ? "Prayer" : type === "task" ? "Task" : "";
  return '<div class="pdemo-row"><div class="pdemo-time">' + time + '<span>' + unit + '</span><br>' + dur + '</div>'
    + '<div class="pdemo-rail"><span class="pdemo-node' + node + '"></span></div>'
    + '<div class="pdemo-card' + card + '"><span>' + esc(label) + '</span>' + (tag ? '<span class="tag">' + tag + '</span>' : '') + '</div></div>';
}
// An invented example day, not the user's own. Two versions: with prayers woven in, or a
// prayer-free day for someone who skipped them. Free stretches show as dashed "Free time" rows.
function peharDemoHTML(withPrayers) {
  var rows = withPrayers
    ? [["6:10", "am", "35m", "Fajr", "prayer"],
       ["7:00", "am", "45m", "Morning run", "task"],
       ["9:00", "am", "2h", "Deep work", "task"],
       ["1:20", "pm", "35m", "Dhuhr", "prayer"],
       ["2:00", "pm", "3h", "Free time", "free"],
       ["8:30", "pm", "30m", "Reading", "task"]]
    : [["7:00", "am", "45m", "Morning run", "task"],
       ["8:00", "am", "1h", "Free time", "free"],
       ["9:00", "am", "2h", "Deep work", "task"],
       ["12:30", "pm", "45m", "Lunch", "task"],
       ["2:00", "pm", "3h", "Free time", "free"],
       ["8:30", "pm", "30m", "Reading", "task"]];
  return '<div class="pdemo" role="img" aria-label="An example day laid out as a vertical timeline, each block with its time on the left and a card on the right">'
    + rows.map(function(r) { return peharDemoRow(r[0], r[1], r[2], r[3], r[4]); }).join("")
    + '</div>';
}

function rTemplate() {
  var h = '<div class="sch-view">';
  h += '<header class="sch-mast t-ctr"><button type="button" class="sch-ib sch-mastbtn" data-a="vprefs" aria-label="Settings"><i class="fas fa-gear"></i></button><p class="sch-eyebrow">PLAN</p><h1 class="sch-dayname sch-datefull">Your plan</h1><p class="sch-sub">set a time and repeat days once, it repeats every day</p></header>';
  h += renderNav("settings");
  h += '<div class="al"></div>';
  if (prayersOn()) h += renderPrayersCard();
  h += '<div class="sch-planhead"><p class="sch-anylbl" style="margin:0">YOUR PLAN</p>';
  h += getCardMeta().length >= 5 ? '<span class="sch-summary">Max 5 cards</span>' : '<button class="sch-plusbtn" data-a="cardadd"><i class="fas fa-plus"></i></button>';
  h += '</div>';
  h += getCards().map(renderPlanCard).join('');
  return h + '</div>';
}

// Settings: everything that used to make the Plan page a junk drawer. Reached by the gear on
// Plan, and a sub-screen of it rather than a fourth nav tab.
function rPrefs() {
  var h = '<div class="sch-view">';
  h += '<header class="sch-mast t-ctr"><button type="button" class="sch-ib sch-mastbtn" data-a="vset" aria-label="Back to your plan"><i class="fas fa-xmark"></i></button><p class="sch-eyebrow">SETTINGS</p><h1 class="sch-dayname sch-datefull">Settings</h1></header>';
  h += renderNav("settings");
  h += '<div class="al"></div>';

  h += '<div class="cd" style="margin-top:22px"><div class="sec-t">What you track</div>';
  h += '<div class="flx gap-2" style="align-items:center;margin-bottom:10px"><span style="flex:1">The 5 daily prayers</span><button type="button" class="sch-switch' + (prayersOn() ? ' on' : '') + '" data-a="prayerstoggle" role="switch" aria-checked="' + (prayersOn() ? 'true' : 'false') + '"><span class="sch-switchknob"></span></button></div>';
  h += '<div class="flx gap-2" style="align-items:center;margin-bottom:10px"><span style="flex:1">Weight</span><button type="button" class="sch-switch' + (weightOn() ? ' on' : '') + '" data-a="weighttoggle" role="switch" aria-checked="' + (weightOn() ? 'true' : 'false') + '"><span class="sch-switchknob"></span></button></div>';
  h += '<div class="flx gap-2" style="align-items:center"><span style="flex:1">Pehar timeline</span><button type="button" class="sch-switch' + (peharOn() ? ' on' : '') + '" data-a="pehartoggle" role="switch" aria-checked="' + (peharOn() ? 'true' : 'false') + '"><span class="sch-switchknob"></span></button></div></div>';

  h += '<div class="cd"><div class="sec-t"><i class="fas fa-rotate mr-1.5" style="color:var(--wa)"></i>Cloud Sync</div>';
  if (typeof sbClient === "undefined" || !sbClient) {
    h += '<p class="t-xs mb-3" style="color:var(--mt)">Sync not configured.</p>';
  } else if (currentUser) {
    h += '<p class="t-xs mb-3" style="color:var(--mt)">Logged in as <strong>' + esc(currentUser.email) + '</strong>.</p>';
    h += '<div class="flx gap-2"><button class="bt t-sm" data-a="sync-now"><i class="fas fa-rotate mr-1.5"></i>Sync Now</button><button class="bt t-sm" data-a="signout" style="border-color:var(--dn);color:var(--dn)"><i class="fas fa-right-from-bracket mr-1.5"></i>Sign Out</button></div>';
  } else {
    h += '<button class="bt t-sm" data-a="show-login"><i class="fas fa-cloud mr-1.5"></i>Connect Cloud Sync</button>';
  }
  h += '</div>';

  h += '<div class="cd"><div class="sec-t"><i class="fas fa-bell mr-1.5" style="color:var(--ac)"></i>Notifications</div>';
  if (pushSubscriptionState === "subscribed") {
    h += '<p class="t-xs mb-2" style="color:var(--ok)"><i class="fas fa-check-circle mr-1"></i>Enabled on this device</p><button class="bt t-sm" data-a="push-disable" style="border-color:var(--dn);color:var(--dn)">Disable</button>';
  } else if (!currentUser) {
    h += '<p class="t-xs" style="color:var(--mt)">Connect Cloud Sync above first.</p>';
  } else {
    h += '<button class="bt bta t-sm" data-a="push-enable"><i class="fas fa-bell mr-1.5"></i>Enable Notifications</button>';
  }
  h += '</div>';

  h += renderImportPanel();

  h += '<div class="cd"><div class="sec-t">Reset</div>';
  h += '<button type="button" class="bt t-sm" style="color:var(--dn);border-color:var(--dn)" data-a="resetschedule"><i class="fas fa-trash-can mr-1.5"></i>Reset schedule</button>';
  h += '<p class="t-xs" style="color:var(--mt);margin-top:8px">Clears cards, items and times. Your day-by-day history is kept.</p></div>';

  h += '<div class="cd"><div class="sec-t"><i class="fas fa-cloud-arrow-down mr-1.5" style="color:var(--ac)"></i>App</div>';
  h += '<p class="t-xs mb-3" style="color:var(--mt)">Version ' + esc(APP_VERSION) + (swUpdateReady ? ' <span style="color:var(--ac)">· update ready</span>' : '') + '</p>';
  h += '<button type="button" class="bt t-sm" data-a="doupdate"><i class="fas fa-rotate mr-1.5"></i>Check for updates</button>';
  h += '<p class="t-xs" style="color:var(--mt);margin-top:8px">Gets the latest features without removing the app from your home screen.</p></div>';

  h += rFoot();
  return h + '</div>';
}

// ============================================================
// OVERVIEW VIEW (spec: "Page 3 — Overview") — monthly stats, ink shell.
// Reuses production's month state (oMonth), day accessor (gDay via getMonthData),
// weight-series builder (buildWeightSeries/drawLine) and dScore. Adds the
// cards-model read (gDayCards) for Avg Tasks + per-item card consistency.
// ============================================================

// Completion-ramp bucket for a 0-100 day score (spec: <40 red, 40-69 amber, 70-99 sage, 100 green).
function completionRampColor(score) {
  if (score >= 100) return "#79a06b";
  if (score >= 70) return "#93a877";
  if (score >= 40) return "#bfa46a";
  return "#b47a70";
}

// Generic consecutive-run counter over a boolean array (oldest -> newest).
// Reused for both the prayer streak and each card-item's streak.
function streakFromBoolArray(arr) {
  var cur = 0, best = 0, tmp = 0;
  for (var i = 0; i < arr.length; i++) { if (arr[i]) { tmp++; if (tmp > best) best = tmp; } else tmp = 0; }
  for (var j = arr.length - 1; j >= 0; j--) { if (arr[j]) cur++; else break; }
  return { current: cur, best: best };
}

// % of card items done for one gDayCards(key)-shaped result, or null if there are no items that day.
function avgTasksForDay(dayCardsResult) {
  var total = 0, done = 0;
  dayCardsResult.forEach(function(row) { row.items.forEach(function(it) { total++; if (it.done) done++; }); });
  return total ? done / total * 100 : null;
}

function chunkArr(arr, size) {
  var out = [];
  for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function renderOverviewStats(s) {
  var wChangeNum = s.wChange !== null ? parseFloat(s.wChange) : null;
  var wChangeColor = wChangeNum !== null && wChangeNum < 0 ? "var(--ok)" : wChangeNum !== null && wChangeNum > 0 ? "var(--dn)" : "var(--smut)";
  var tiles = [
    { v: s.tracked, l: "Days Tracked" },
    { v: s.avgTasks + "%", l: "Avg Tasks" },
    { v: s.bestStreak, l: "Best Streak" }
  ];
  if (prayersOn()) tiles.splice(1, 0, { v: s.avgPrayer + "%", l: "Avg Prayers", c: "#82a06e" });
  if (weightOn()) tiles.splice(tiles.length - 1, 0, { v: (s.lastW || "-"), l: "Current Weight" }, { v: (s.wChange !== null ? (wChangeNum > 0 ? "+" : "") + s.wChange : "-"), l: "Weight Change", c: wChangeColor });
  var h = '<div class="sch-ovstats">';
  tiles.forEach(function(t) {
    h += '<div class="sch-ovstat"><div class="sch-ovstatv"' + (t.c ? ' style="color:' + esA(t.c) + '"' : '') + '>' + esc(String(t.v)) + '</div><div class="sch-ovstatl">' + t.l + '</div></div>';
  });
  return h + '</div>';
}

function renderHeatmapCard(md) {
  var y = oMonth.getFullYear(), m = oMonth.getMonth();
  var todayKey = dk(new Date()), todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  var h = '<div class="sch-ovcard"><h3>Daily Completion Heatmap</h3><div class="hmg">';
  DOW_LBL.forEach(function(d) { h += '<div class="hmh">' + d + '</div>'; });
  var startDow = new Date(y, m, 1).getDay();
  for (var i = 0; i < startDow; i++) h += '<div class="hmc em"></div>';
  md.forEach(function(d) {
    var cellDate = new Date(y, m, d.day);
    var isFuture = cellDate > todayDate;
    var score = dScore(d.key);
    var bg = isFuture ? "rgba(150,160,180,.10)" : completionRampColor(score);
    var isTd = d.key === todayKey;
    h += '<div class="hmc' + (isTd ? ' today' : '') + '" style="background:' + bg + '" title="Day ' + d.day + (isFuture ? ': upcoming' : ': ' + score + '%') + '">' + d.day + '</div>';
  });
  return h + '</div></div>';
}

function renderWeightTrendCard(md) {
  var series = buildWeightSeries(md);
  requestAnimationFrame(function() { drawLine("ovwc", series, "#8fa3bd"); });
  return '<div class="sch-ovcard"><h3>Weight Trend</h3><p class="sch-ovsub">Solid dots = recorded &middot; faint dots = carried from previous entry</p><div id="ovwcw"><canvas id="ovwc"></canvas></div></div>';
}

function renderPrayerConsistencyCard(md, prayerGrid, prayerCounts, tracked, prayerStreak) {
  var days = md.length;
  var h = '<div class="sch-ovcard"><h3>Prayer Consistency</h3>';
  h += '<div class="sch-ovrow"><div class="sch-ovrowlbl"></div><div class="phg" style="--cols:' + days + '">';
  for (var d = 0; d < days; d++) h += '<div class="phn">' + (((d + 1) % 5 === 1) || d === 0 ? (d + 1) : '') + '</div>';
  h += '</div></div>';
  for (var p = 0; p < 5; p++) {
    h += '<div class="sch-ovrow"><div class="sch-ovrowlbl">' + PRAYERS[p] + '</div><div class="phg" style="--cols:' + days + '">';
    for (var dd = 0; dd < days; dd++) {
      var on = prayerGrid[p][dd];
      h += '<div class="phc" style="background:' + (on ? "#82a06e" : "rgba(150,160,180,.10)") + '" title="' + PRAYERS[p] + ' Day ' + (dd + 1) + ': ' + (on ? 'Done' : 'Missed') + '"></div>';
    }
    h += '</div></div>';
  }
  h += '<div class="sch-ovlegend">';
  h += '<div class="sch-ovlegenditem"><span><i class="fas fa-fire"></i></span><strong style="color:#e0a35c">' + prayerStreak.current + 'd &middot; best ' + prayerStreak.best + 'd</strong></div>';
  PRAYERS.forEach(function(p) {
    var pct = tracked ? Math.round(prayerCounts[p] / tracked * 100) : 0;
    h += '<div class="sch-ovlegenditem"><span>' + p + '</span><strong style="color:#82a06e">' + pct + '%</strong></div>';
  });
  h += '</div></div>';
  return h;
}

// Habit / Card Consistency: one slide per card-chunk, capped ~5 items each —
// extra items spill into the next slide for that card. Returned as an array
// of slide-HTML strings so the caller can feed them straight into a carousel
// (Task 7) instead of stacking them in a long scrolling list.
function renderCardConsistencySlides(md, cardsMeta, cardDayItems) {
  var days = md.length, slides = [];
  cardsMeta.forEach(function(card) {
    var items = card.items.filter(function(it) { return getItemShow(card.id, it.n); });
    // A card with nothing tracked still renders. The old early-return made the whole card vanish,
    // which also took away the only route back in to re-enable anything on it.
    var chunks = items.length ? chunkArr(items, 5) : [[]];
    chunks.forEach(function(itemChunk, ci) {
      var h = '<div class="sch-ovcard" style="--kc:' + esA(card.color) + '"><h3><i class="fas ' + esA(card.icon) + '" style="color:var(--kc);margin-right:6px"></i>' + esc(card.name) + (chunks.length > 1 ? ' (' + (ci + 1) + '/' + chunks.length + ')' : '');
      // Only the first chunk carries the picker, so a two-slide card does not show it twice.
      if (ci === 0) h += '<button type="button" class="sch-ib sch-ovedit" data-a="ovstatsedit" data-c="' + esA(card.id) + '" aria-label="Choose which items to track"><i class="fas fa-pen"></i></button>';
      h += '</h3>';
      // The picker is a modal now (renderOvStatsModal), opened by the pencil — the inline panel
      // was cramped and ugly. Nothing else renders here.
      if (!itemChunk.length) {
        h += '<p class="sch-cardnothing">Nothing tracked on this card. Tap the pencil to choose items.</p>';
      } else {
        h += '<div class="sch-ovrow"><div class="sch-ovrowlbl"></div><div class="phg" style="--cols:' + days + '">';
        for (var d = 0; d < days; d++) h += '<div class="phn">' + (((d + 1) % 5 === 1) || d === 0 ? (d + 1) : '') + '</div>';
        h += '</div></div>';
        var legend = '';
        itemChunk.forEach(function(it) {
          var arr = (cardDayItems[card.id] || {})[it.n] || [];
          var st = streakFromBoolArray(arr);
          h += '<div class="sch-ovrow"><div class="sch-ovrowlbl">' + esc(it.n) + '</div>';
          h += '<div class="phg" style="--cols:' + days + '">';
          for (var d2 = 0; d2 < days; d2++) {
            var on2 = arr[d2];
            h += '<div class="phc" style="background:' + (on2 ? esA(card.color) : "rgba(150,160,180,.10)") + '" title="' + esc(it.n) + ' Day ' + (d2 + 1) + ': ' + (on2 ? 'Done' : 'Missed') + '"></div>';
          }
          h += '</div></div>';
          legend += '<div class="sch-ovlegenditem"><span>' + esc(it.n) + '</span><strong style="color:' + esA(card.color) + '"><i class="fas fa-fire" style="margin-right:4px"></i>' + st.current + ' · best ' + st.best + '</strong></div>';
        });
        h += '<div class="sch-ovlegend">' + legend + '</div>';
      }
      h += '</div>';
      slides.push(h);
    });
  });
  return slides;
}

function rOverview() {
  var md = getMonthData();
  var tracked = 0, prayerSum = 0, weightVals = [];
  var prayerGrid = []; PRAYERS.forEach(function() { prayerGrid.push([]); });
  var prayerCounts = {}; PRAYERS.forEach(function(p) { prayerCounts[p] = 0; });
  var allFiveArr = [];
  var taskSum = 0, taskDays = 0;
  var cardsMeta = getCards();
  var cardDayItems = {};
  cardsMeta.forEach(function(c) { cardDayItems[c.id] = {}; c.items.forEach(function(it) { cardDayItems[c.id][it.n] = []; }); });

  md.forEach(function(d) {
    var dd = d.data;
    var hasData = Object.keys(dd.habits).length > 0 || Object.keys(dd.prayers).length > 0;
    if (hasData) tracked++;

    var pc = 0;
    PRAYERS.forEach(function(p, i) { var v = !!dd.prayers[p]; prayerGrid[i].push(v); if (v) { prayerCounts[p]++; pc++; } });
    allFiveArr.push(pc === 5);
    prayerSum += pc / 5 * 100;

    if (dd.weight) weightVals.push(dd.weight);

    var dc = gDayCards(d.key);
    var dayPct = avgTasksForDay(dc);
    if (dayPct !== null) { taskSum += dayPct; taskDays++; }
    dc.forEach(function(row) {
      row.items.forEach(function(it) {
        if (!cardDayItems[row.card.id][it.n]) cardDayItems[row.card.id][it.n] = [];
        cardDayItems[row.card.id][it.n].push(!!it.done);
      });
    });
  });

  var avgPrayer = tracked ? Math.round(prayerSum / tracked) : 0;
  var avgTasks = taskDays ? Math.round(taskSum / taskDays) : 0;
  var recordedWeights = weightVals.filter(function(v) { return v !== "" && v !== null && v !== undefined; });
  var wChange = recordedWeights.length >= 2 ? (parseFloat(recordedWeights[recordedWeights.length - 1]) - parseFloat(recordedWeights[0])).toFixed(1) : null;
  var lastW = recordedWeights.length ? recordedWeights[recordedWeights.length - 1] : null;
  if (!lastW) { var cw = getLastWeight(md[md.length - 1].key); if (cw) lastW = cw; }

  var bestStreak = 0, curStreak = 0;
  md.forEach(function(d) { var sc = dScore(d.key); if (sc >= 50) { curStreak++; if (curStreak > bestStreak) bestStreak = curStreak; } else curStreak = 0; });

  var prayerStreak = streakFromBoolArray(allFiveArr);

  var h = '<div class="sch-view">';
  // The month steppers sit ON the month title, not in a detached row — an unlabelled pair of
  // arrows floating under the nav reads as broken chrome; beside the month they explain themselves.
  h += '<header class="sch-mast t-ctr"><p class="sch-eyebrow">MONTHLY OVERVIEW</p>';
  h += '<h1 class="sch-dayname sch-datefull">' + esc(fMon(oMonth)) + '</h1>';
  h += '<div class="flx aic jcc gap-3" style="margin-top:12px"><button type="button" class="dnb" data-a="omp" aria-label="Previous month"><i class="fas fa-chevron-left t-xs"></i></button>';
  h += '<button type="button" class="dnb" data-a="omn" aria-label="Next month"><i class="fas fa-chevron-right t-xs"></i></button></div></header>';

  h += renderNav("overview");
  h += '<div class="al"></div>';
  h += renderOverviewStats({ tracked: tracked, avgPrayer: avgPrayer, avgTasks: avgTasks, lastW: lastW, wChange: wChange, bestStreak: bestStreak });
  h += renderHeatmapCard(md);
  if (weightOn()) h += renderWeightTrendCard(md);
  if (prayersOn()) h += renderPrayerConsistencyCard(md, prayerGrid, prayerCounts, tracked, prayerStreak);
  // Habit / Card Consistency — stacked (capped ~5 habits/card via chunking above).
  h += '<p class="sch-anylbl" style="margin:22px 0 0">HABIT / CARD CONSISTENCY</p>';
  h += '<p style="margin:4px 0 0;font-size:11px;color:var(--mt)"><i class="fas fa-fire" style="margin-right:4px"></i>days completed in a row, shown as <b>now</b> · <b>best</b> ever</p>';
  // First-visit nudge: tracking starts OFF for everything, so tell the user how to turn it on.
  if (!localStorage.getItem(OV_INTRO_KEY)) {
    h += '<div class="sch-ovintro"><div><b>Nothing is tracked yet.</b><br>Tap the <i class="fas fa-pen"></i> on any card to pick which items get a streak grid.</div>';
    h += '<button type="button" class="sch-ib" data-a="ovintroclose" aria-label="Got it"><i class="fas fa-xmark"></i></button></div>';
  }
  var ccSlides = renderCardConsistencySlides(md, cardsMeta, cardDayItems);
  h += ccSlides.length ? ccSlides.join('') : '<div class="sch-ovcard"><p class="sch-cardnothing">No cards to track yet. Add one on your Plan.</p></div>';

  h += '</div>';
  return h;
}

// ---- self-check (run with the page open at #ovcheck) ----
// Pure function fixtures — no localStorage reads/writes, nothing real is touched.
function _overviewSelfCheck() {
  if (location.hash !== "#ovcheck") return;

  console.assert(completionRampColor(0) === "#b47a70", "(a) 0 should map to the red bucket");
  console.assert(completionRampColor(50) === "#bfa46a", "(a) 50 should map to the amber bucket");
  console.assert(completionRampColor(85) === "#93a877", "(a) 85 should map to the sage bucket");
  console.assert(completionRampColor(100) === "#79a06b", "(a) 100 should map to the green bucket");

  var s3 = streakFromBoolArray([true, true, true]);
  console.assert(s3.current === 3 && s3.best === 3, "(b) 3 consecutive all-5 days should give current=3 best=3", s3);
  var sBreak = streakFromBoolArray([true, true, false, true]);
  console.assert(sBreak.current === 1 && sBreak.best === 2, "(b) streak must break on the first miss", sBreak);

  var day1 = [{ card: { id: "x" }, items: [{ done: true }, { done: false }, { done: true }, { done: false }] }]; // 2/4 = 50%
  var day2 = [{ card: { id: "x" }, items: [{ done: true }, { done: true }, { done: true }] }]; // 3/3 = 100%
  var avg = Math.round((avgTasksForDay(day1) + avgTasksForDay(day2)) / 2);
  console.assert(avg === 75, "(c) Avg Tasks over the 2-day fixture should hand-compute to 75", avg);

  var statsHtml = renderOverviewStats({ tracked: 1, avgPrayer: 0, avgTasks: 0, lastW: null, wChange: null, bestStreak: 0 });
  console.assert(!/water|pages/i.test(statsHtml), "(d) stat tiles must not reference water or pages", statsHtml);

  console.log("overview self-check complete");
}
_overviewSelfCheck();

// ---- Daily view IS the timeline ----
var originalRender = render;
render = function() {
  if (shouldShowOnboarding()) { document.getElementById("content").innerHTML = rOnboarding(); return; }
  var h;
  if (view === "daily") h = rSchedule();
  else if (view === "settings") h = rTemplate();
  else if (view === "overview") h = rOverview();
  else if (view === "prefs") h = rPrefs();
  else { originalRender(); return; }
  document.getElementById("content").innerHTML = h + renderHelpOverlay() + renderOvStatsModal();
};

// Prayers are one muted green (spec: prayer nodes are green, not a rainbow).
var PRAYER_GREEN = "#82a06e";
var DOW_LBL = ["S","M","T","W","T","F","S"];
var DOW_FULL = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; // same Sunday-start indices as DOW_LBL/setItemDays, just spelled out for the bigger editor pills
function timeToMin(hhmm) { var p = hhmm.split(":").map(Number); return p[0] * 60 + p[1]; }
function prettyTime(hhmm) { var p = hhmm.split(":").map(Number), h = p[0], m = p[1]; var ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + ap; }
function minToHHMM(min) { var h = Math.floor(min / 60) % 24, m = min % 60; return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; }

// ---- duration model (Task 11) — mirrors getItemDays/setItemDays (js/push-client.js's notifKey).
// htn_dur = {"field::name": minutes}. Missing key -> caller applies the default (35 prayers, 30 else).
var HTN_DUR_KEY = "htn_dur";
function getDurMap() { try { return JSON.parse(localStorage.getItem(HTN_DUR_KEY)) || {}; } catch(e) { return {}; } }
function saveDurMap(map) { localStorage.setItem(HTN_DUR_KEY, JSON.stringify(map)); }
function getItemDur(field, name) { var v = getDurMap()[notifKey(field, name)]; return typeof v === "number" ? v : null; }
function setItemDur(field, name, mins) {
  var map = getDurMap(), key = notifKey(field, name), def = field === "prayers" ? 35 : 30;
  if (!mins || mins === def) delete map[key]; else map[key] = mins;
  saveDurMap(map);
}
// ---- overview-stats visibility (Task 12) — reads/mutates the {n,s,c} entry backing a
// permanent item, wherever it lives (gDef habits/ex/hl for base cards, ht_card_items for
// new cards) — mirrors addCardItem/removeCardItem's base-vs-new-card split.
function _patchItemShow(arr, name, val) {
  for (var i = 0; i < arr.length; i++) {
    if (itemName(arr[i]) === name) {
      if (typeof arr[i] === "string") arr[i] = { n: arr[i], s: !!val, c: "rings" };
      else arr[i].s = !!val;
      return true;
    }
  }
  return false;
}
function setItemShow(cardId, name, val) {
  if (isBaseCard(cardId)) {
    var d = gDef(), arr = cardId === "habits" ? d.habits : cardId === "extra" ? d.ex : d.hl;
    if (_patchItemShow(arr, name, val)) sDef(d);
  } else {
    var store = getCardItemsStore(), list = store[cardId] || [];
    if (_patchItemShow(list, name, val)) { store[cardId] = list; saveCardItemsStore(store); }
  }
}
function getItemShow(cardId, name) {
  var it = cardTemplateArr(cardId).filter(function(x) { return itemName(x) === name; })[0];
  return !!(it && typeof it === "object" && it.s);
}
// Effective duration for a timeline item: one-day items read cData.onedayDur, permanent
// items read htn_dur via getItemDur, both fall back to the field's default when unset.
function effectiveDur(field, name, oneday, day) {
  if (oneday) {
    var v = day && day.onedayDur && day.onedayDur[field + "::" + name];
    return typeof v === "number" ? v : 30;
  }
  var v2 = getItemDur(field, name);
  return typeof v2 === "number" ? v2 : (field === "prayers" ? 35 : 30);
}
// dur() from the reference weekly-schedule.html, minutes-in/string-out: "50m" / "2h" / "1.1h".
function fmtDur(n) { return n >= 60 ? ((n / 60 % 1 ? (n / 60).toFixed(1) : n / 60) + "h") : (n + "m"); }
// Compact duration control for the ADD forms (Task 12) — a readout + preset chips, no name/field
// to key off yet (the item doesn't exist until save), so state lives in a hidden input the save
// handler reads directly (idPrefix + "-val"). Patched by the delegated "adddurpreset" click case
// below without a full render(), so it doesn't blur the name field mid-typing.
function addDurControl(idPrefix, def) {
  var h = '<div class="sch-adddur">';
  h += '<span class="sch-durread" id="' + idPrefix + '-read">' + fmtDur(def) + '</span>';
  h += '<input type="hidden" id="' + idPrefix + '-val" value="' + def + '">';
  [30, 45, 60, 120, 180].forEach(function(p) {
    h += '<button type="button" class="sch-durchip' + (p === def ? ' on' : '') + '" data-a="adddurpreset" data-target="' + idPrefix + '" data-val="' + p + '">' + fmtDur(p) + '</button>';
  });
  return h + '</div>';
}
// Next prayer whose time is later than `nowMin` (minutes since midnight); rolls to tomorrow's
// Fajr once every prayer today has passed. `times` = {PrayerName: "HH:MM"|""}. Returns null if
// no prayer has a time set at all, or there's nothing to roll to (Fajr itself is unset).
function computeNextPrayer(nowMin, times) {
  var withTimes = PRAYERS.filter(function(p) { return !!times[p]; });
  if (!withTimes.length) return null;
  for (var i = 0; i < withTimes.length; i++) {
    var tmin = timeToMin(times[withTimes[i]]);
    if (tmin > nowMin) return { name: withTimes[i], mins: tmin - nowMin };
  }
  if (times.Fajr) return { name: "Fajr", mins: (1440 - nowMin) + timeToMin(times.Fajr) };
  return null;
}
function fmtHM(mins) { var h = Math.floor(mins / 60), m = mins % 60; return (h > 0 ? h + "h " : "") + m + "m"; }
// Sorted timeline items (with start/end in minutes) -> same array with synthetic {openBlock:true,
// start,end} rows spliced into gaps >= 15min. No filler before the first or after the last item;
// overlapping/negative gaps (prevEnd > nextStart) simply never clear the >=15 threshold.
function insertOpenBlocks(items) {
  var out = [];
  for (var i = 0; i < items.length; i++) {
    out.push(items[i]);
    var next = items[i + 1];
    if (next) {
      var gapStart = items[i].end, gapEnd = next.start;
      if (gapEnd - gapStart >= 15) out.push({ openBlock: true, start: gapStart, end: gapEnd });
    }
  }
  return out;
}
function timelineNowItem(items, nowMin) { return items.filter(function(item) { return nowMin >= item.start && nowMin < item.end; })[0] || null; }
function itemName(x) { return typeof x === "string" ? x : x.n; }
function dowOf(key) { return new Date(key + "T00:00:00").getDay(); }
// Week strip (Task 6): Sun-Sat week containing d, matching DOW_LBL[0]="S"=Sunday.
function wkDays(d) {
  var start = new Date(d); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
  var out = [];
  for (var i = 0; i < 7; i++) { var x = new Date(start); x.setDate(start.getDate() + i); out.push(x); }
  return out;
}
function wkDotColor(score) { return score >= 100 ? "#79a06b" : score >= 70 ? "#93a877" : score >= 40 ? "#bfa46a" : "#b47a70"; }
function isBaseCard(id) { return id === "habits" || id === "extra" || id === "health"; }
function templateNamesFor(cardId) { return cardTemplateArr(cardId).map(itemName); }

// Shared inline editor markup for one item (Task 12 redesign) — used by both the Daily
// timeline pencil (schedit -> editorHTML) and the Template row pencil (tpledit ->
// templateEditorHTML). `closeAction` is the data-a the Save button reuses to close THIS
// editor (schedit for Daily, tpledit for Template) — same toggle-off code path as the pencil.
function itemEditorHTML(field, name, closeAction) {
  var isPrayer = field === "prayers";
  var t = getNotifTime(field, name), days = getItemDays(field, name);
  var mode = tplRepeatMode[field + "::" + name] || (days ? "custom" : "every");
  var h = '<div class="sch-editor">';
  // TIME. Setting a time on a non-prayer item turns its reminder on automatically (see the
  // .sch-timeinp change handler) — there is no bell to toggle, because "timed but silent" was
  // a distinction nobody asked for. Duration is no longer editable here either: it defaults to
  // 30 (35 for prayers) and a typed or imported time RANGE still sets it.
  h += '<div class="sch-editrow"><span class="sch-editlbl">Time</span><label class="sch-timepill"><i class="fas fa-clock"></i><input type="time" class="sch-timeinp" data-field="' + esA(field) + '" data-name="' + esA(name) + '" value="' + esA(t) + '"></label></div>';
  if (!isPrayer) {
    // REPEAT — seven single-letter pills, always shown. All seven lit = every day (setItemDays
    // stores that as absent, so "every day" and a 7-day list are the same thing). The Every/Custom
    // segment is gone: it was a mode toggle in front of the very control it gated, and the pills
    // already carry the whole meaning. `days` scoping (getItemDays) is UNCHANGED.
    h += '<div class="sch-editrow sch-repeatrow"><span class="sch-editlbl">Repeat</span>';
    h += '<div class="sch-days sch-daysrow" data-field="' + esA(field) + '" data-name="' + esA(name) + '">';
    DOW_LBL.forEach(function(lbl, d) { var on = !days || days.indexOf(d) !== -1; h += '<button type="button" class="sch-day' + (on ? ' on' : '') + '" data-dow="' + d + '" aria-label="' + esA(DOW_FULL[d]) + '">' + lbl + '</button>'; });
    h += '</div></div>';
    // Which items count toward the Overview grids is now chosen ON the Overview heatmap
    // (data-a="ovstatsedit"), next to the consequence, instead of as noise during task creation.
  }
  h += '<div class="sch-editrow sch-editfoot">';
  h += '<button class="sch-savebtn" data-a="' + closeAction + '" data-f="' + esA(field) + '" data-k="' + esA(name) + '"><i class="fas fa-check"></i> Save</button>';
  if (!isPrayer) h += '<button class="sch-del" data-a="schdel" data-f="' + esA(field) + '" data-k="' + esA(name) + '"><i class="fas fa-trash-can"></i> Delete</button>';
  h += '</div>';
  return h + '</div>';
}
function editorHTML(field, name) { return itemEditorHTML(field, name, "schedit"); }

// Items of one card scheduled for `dow` on `day` (a gDay()-shaped record).
// Template items are filtered by their day-of-week scope; one-day items
// (added directly into the day record, not in the template) always count
// since they only ever exist on the day they were added for.
function dayItemsForCard(card, day, dow) {
  var doneMap = isBaseCard(card.id) ? day[card.id] : ((day.cards && day.cards[card.id]) || {});
  var tplNames = templateNamesFor(card.id);
  var onedayTimes = day.onedayTimes || {};
  var out = [];
  Object.keys(doneMap || {}).forEach(function(name) {
    var isTpl = tplNames.indexOf(name) !== -1;
    if (isTpl) {
      var days = getItemDays(card.id, name);
      if (days && days.indexOf(dow) === -1) return;
    }
    var t = isTpl ? (getNotifTime(card.id, name) || "") : (onedayTimes[card.id + "::" + name] || "");
    out.push({ n:name, done:!!doneMap[name], time:t, oneday:!isTpl });
  });
  return out;
}

// Every timed item (permanent + one-day) across all cards, plus timed prayers,
// sorted chronologically. Tie-break: prayers first, then card order, then item order.
function buildTimeline(cards, day, dow) {
  var items = [];
  if (prayersOn()) PRAYERS.forEach(function(name) {
    var t = getNotifTime("prayers", name);
    if (t) {
      var dur = effectiveDur("prayers", name, false, day), start = timeToMin(t);
      items.push({ id:"prayers", name:name, t:t, kc:PRAYER_GREEN, done:!!day.prayers[name], isPrayer:true, oneday:false, cardOrder:-1, itemOrder:0, start:start, dur:dur, end:start + dur });
    }
  });
  cards.forEach(function(card, ci) {
    dayItemsForCard(card, day, dow).forEach(function(it, ii) {
      if (it.time) {
        var dur2 = effectiveDur(card.id, it.n, it.oneday, day), start2 = timeToMin(it.time);
        items.push({ id:card.id, name:it.n, t:it.time, kc:card.color, done:it.done, isPrayer:false, oneday:it.oneday, cardOrder:ci, itemOrder:ii, start:start2, dur:dur2, end:start2 + dur2 });
      }
    });
  });
  items.sort(function(a, b) {
    var d = a.start - b.start;
    if (d) return d;
    if (a.isPrayer !== b.isPrayer) return a.isPrayer ? -1 : 1;
    return (a.cardOrder - b.cardOrder) || (a.itemOrder - b.itemOrder);
  });
  items.forEach(function(item, i) {
    item.overlap = items.some(function(other, j) { return i !== j && item.start < other.end && other.start < item.end; });
  });
  return items;
}

// One stacked card block: header + progress bar + untimed rows + add-for-today.
function renderCard(card, items) {
  var done = 0, total = items.length;
  items.forEach(function(it) { if (it.done) done++; });
  var pct = total ? Math.round(done / total * 100) : 0;
  var untimed = items.filter(function(it) { return !it.time; });
  var timed = items.filter(function(it) { return !!it.time; });
  var h = '<div class="sch-cardblock" style="--kc:' + esA(card.color) + '">';
  h += '<div class="sch-cardhead"><i class="fas ' + esA(card.icon) + ' sch-cardicon"></i><span class="sch-cardname">' + esc(card.name) + '</span><span class="sch-cardcount">' + done + '/' + total + '</span></div>';
  h += '<div class="sch-cardbar"><div class="sch-cardbarfill" style="transform:scaleX(' + (pct / 100) + ')"></div></div>';
  if (!total) {
    h += emptyStateHTML('fa-inbox', 'Nothing for today yet');
  } else {
    if (untimed.length) {
      untimed.forEach(function(it) {
        h += '<div class="sch-gest" data-gest="complete" data-f="' + esA(card.id) + '" data-k="' + esA(it.n) + '" style="--kc:' + esA(card.color) + '">';
        h += '<div class="sch-gest-action sch-gest-complete" aria-hidden="true"><i class="fas fa-check"></i></div>';
        h += '<div class="sch-rep sch-gest-row' + (it.done ? ' on' : '') + '" data-a="schtog" data-f="' + esA(card.id) + '" data-k="' + esA(it.n) + '" style="--kc:' + esA(card.color) + '">';
        h += '<div class="sch-box"><svg viewBox="0 0 24 24"><polyline points="4 13 9 18 20 6"></polyline></svg></div>';
        h += '<span class="sch-name">' + esc(it.n) + (it.oneday ? ' <span class="sch-todaytag">today</span>' : '') + '</span>';
        if (it.oneday) h += '<button type="button" class="sch-edit" data-a="oddel" data-f="' + esA(card.id) + '" data-k="' + esA(it.n) + '" aria-label="Remove ' + esA(it.n) + '"><i class="fas fa-xmark"></i></button>';
        h += '</div>';
        h += '</div>';
      });
    }
    // Timed items are checkable only on the timeline (Task 14 #3) — here they're just
    // tappable name-links that jump to + flash their timeline block (Task 14 #2).
    if (timed.length) {
      h += '<div class="sch-tlrow">';
      if (untimed.length) h += '<span class="sch-tlrow-lbl">on Pehar:</span>';
      timed.forEach(function(it) {
        h += '<button type="button" class="sch-tlink" style="--kc:' + esA(card.color) + '" data-a="gototimeline" data-block="' + esA(card.id + "::" + it.n) + '"><i class="fas fa-arrow-up"></i>' + esc(it.n) + '</button>';
      });
      h += '</div>';
    }
  }
  // Persistent inline add on Today too (same convenience as the Plan cards): name-only, adds a
  // one-day item and stays focused for the next. No toggle-open form.
  h += '<div class="sch-inlineadd">';
  h += '<input type="text" id="od-name-' + esA(card.id) + '" class="sch-addname" placeholder="Add for today…" maxlength="60" autocomplete="off">';
  h += '<button class="sch-addgo" data-a="odaddsave" data-c="' + esA(card.id) + '"><i class="fas fa-plus mr-1.5"></i>Add</button>';
  h += '</div>';
  h += '</div>';
  return h;
}
function renderGapQuickAdd(cards) {
  if (!schQuickGap) return "";
  var chosen = schQuickGap.cardId || "habits", h = '<div class="sch-gapform">';
  h += '<input type="text" id="gap-name" class="sch-addname" placeholder="What will you do?" maxlength="60" autocomplete="off">';
  h += '<div class="sch-gapcards">';
  cards.forEach(function(card) { h += '<button type="button" class="sch-gapcard' + (card.id === chosen ? ' on' : '') + '" style="--kc:' + esA(card.color) + '" data-a="gapquickcard" data-c="' + esA(card.id) + '">' + esc(card.name) + '</button>'; });
  h += '</div><div class="sch-addfoot"><input type="time" id="gap-time" class="sch-timeinp" value="' + esA(minToHHMM(schQuickGap.start)) + '">';
  h += addDurControl("gap-dur", 30);
  h += '<button class="sch-addgo" data-a="gapquicksave">Add</button></div></div>';
  return h;
}

// Fallback strip shown only while no prayer has a time yet.
function renderPrayersDayCard() {
  if (!prayersOn()) return "";
  var items = PRAYERS.map(function(p){ return { n:p, done:!!cData.prayers[p], time:getNotifTime("prayers", p) || "" }; });
  var done = items.filter(function(it){ return it.done; }).length, total = items.length;
  var pct = Math.round(done / total * 100), kc = PRAYER_GREEN;
  var untimed = items.filter(function(it){ return !it.time; });
  var timed = items.filter(function(it){ return !!it.time; });
  var h = '<div class="sch-cardblock" style="--kc:' + kc + '">';
  h += '<div class="sch-cardhead"><i class="fas fa-mosque sch-cardicon"></i><span class="sch-cardname">Prayers</span><span class="sch-cardcount">' + done + '/' + total + '</span></div>';
  h += '<div class="sch-cardbar"><div class="sch-cardbarfill" style="transform:scaleX(' + (pct / 100) + ')"></div></div>';
  untimed.forEach(function(it){
    h += '<div class="sch-gest" data-gest="complete" data-f="prayers" data-k="' + esA(it.n) + '" style="--kc:' + kc + '">';
    h += '<div class="sch-gest-action sch-gest-complete" aria-hidden="true"><i class="fas fa-check"></i></div>';
    h += '<div class="sch-rep sch-gest-row' + (it.done ? ' on' : '') + '" data-a="schtog" data-f="prayers" data-k="' + esA(it.n) + '" style="--kc:' + kc + '">';
    h += '<div class="sch-box"><svg viewBox="0 0 24 24"><polyline points="4 13 9 18 20 6"></polyline></svg></div>';
    h += '<span class="sch-name">' + esc(it.n) + '</span></div></div>';
  });
  if (timed.length) {
    h += '<div class="sch-tlrow">';
    if (untimed.length) h += '<span class="sch-tlrow-lbl">on Pehar:</span>';
    timed.forEach(function(it){ h += '<button type="button" class="sch-tlink" style="--kc:' + kc + '" data-a="gototimeline" data-block="' + esA("prayers::" + it.n) + '"><i class="fas fa-arrow-up"></i>' + esc(it.n) + '</button>'; });
    h += '</div>';
  }
  if (!timed.length) h += '<p style="font-size:11px;color:var(--mt);margin:8px 0 0">Set prayer times in Template to place them on your Pehar.</p>';
  return h + '</div>';
}
function renderPrayerStrip() {
  if (!prayersOn()) return "";
  var h = '<div class="sch-prayerstrip"><p class="sch-prayerlbl"><i class="fas fa-mosque"></i> Prayers</p>';
  PRAYERS.forEach(function(p) {
    h += '<div class="sch-gest" data-gest="complete" data-f="prayers" data-k="' + esA(p) + '" style="--kc:' + PRAYER_GREEN + '">';
    h += '<div class="sch-gest-action sch-gest-complete" aria-hidden="true"><i class="fas fa-check"></i></div>';
    h += '<div class="sch-rep sch-gest-row' + (cData.prayers[p] ? ' on' : '') + '" data-a="schtog" data-f="prayers" data-k="' + esA(p) + '" style="--kc:' + PRAYER_GREEN + '">';
    h += '<div class="sch-box"><svg viewBox="0 0 24 24"><polyline points="4 13 9 18 20 6"></polyline></svg></div>';
    h += '<span class="sch-name">' + esc(p) + '</span></div>';
    h += '</div>';
  });
  h += '<p class="sch-prayernudge">Set prayer times in Template to see them on your Pehar.</p></div>';
  return h;
}

// Week strip: 7 pills for the Sun-Sat week containing cDate, plus prev/next-week arrows
// and a "Today" jump-back chip. selKey is dk(cDate), precomputed by the caller.
function renderWeekStrip(selKey) {
  var todayKey = dk(new Date());
  var h = '<div class="sch-week">';
  h += '<button type="button" class="sch-ib" data-a="wkprev" aria-label="Previous week"><i class="fas fa-chevron-left"></i></button>';
  h += '<div class="sch-wkstrip">';
  wkDays(cDate).forEach(function(d) {
    var wkey = dk(d), isToday = wkey === todayKey, isSel = wkey === selKey;
    var dot = '';
    if (!isF(d)) {
      var rec = localStorage.getItem("ht_" + wkey);
      if (rec) { var sc = dScore(wkey); if (sc > 0) dot = wkDotColor(sc); }
    }
    h += '<button type="button" class="sch-wkday' + (isToday ? ' istoday' : (isSel ? ' issel' : '')) + '" data-a="wkday" data-key="' + wkey + '">';
    h += '<span class="sch-wkdow">' + DOW_LBL[d.getDay()] + '</span><span class="sch-wknum">' + d.getDate() + '</span>';
    h += '<span class="sch-wkdot"' + (dot ? ' style="background:' + dot + '"' : '') + '></span></button>';
  });
  h += '</div>';
  h += '<button type="button" class="sch-ib" data-a="wknext" aria-label="Next week"><i class="fas fa-chevron-right"></i></button>';
  h += '</div>';
  if (selKey !== todayKey) h += '<button type="button" class="sch-ib sch-ibw sch-wktoday" data-a="today">Today</button>';
  return h;
}

function rSchedule() {
  var key = dk(cDate);
  cData = gDay(key);
  if (!cData.onedayTimes) cData.onedayTimes = {};
  if (!cData.onedayDur) cData.onedayDur = {};
  var dow = dowOf(key);
  var td = isT(cDate), fu = isF(cDate);

  var cards = getCards();
  var cardItems = cards.map(function(card) { return { card:card, items:dayItemsForCard(card, cData, dow) }; });
  var timeline = insertOpenBlocks(buildTimeline(cards, cData, dow));
  var anyPrayerTimed = prayersOn() && PRAYERS.some(function(p) { return !!getNotifTime("prayers", p); });

  // counts: Prayers x/5 + Tasks x/y (all card items across all cards)
  var pd = 0; if (prayersOn()) PRAYERS.forEach(function(p) { if (cData.prayers[p]) pd++; });
  var doneTasks = 0, totalTasks = 0;
  cardItems.forEach(function(ci) { totalTasks += ci.items.length; ci.items.forEach(function(it) { if (it.done) doneTasks++; }); });
  var done = pd + doneTasks, total = (prayersOn() ? 5 : 0) + totalTasks, pct = total ? Math.round(done / total * 100) : 0;
  var C = 169.646, off = C * (1 - pct / 100);

  // "now" — range-based: whichever block (item OR open block) has start<=now<end, today only.
  var nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  var h = '<div class="sch-view">';

  // masthead — greeting (from production greet(), the live-site touch the user asked back) + the
  // full date + a day stepper with a Today jump-back. greet() interpolates a user-controlled name,
  // so it MUST be esc()'d (this is the exact spot the project's XSS note calls out), and wrapped so
  // a missing/throwing greet() falls back to the brand rather than blanking the page.
  // masthead — copied to match the LIVE site exactly: centered greeting, fLong date, a GREEN Today
  // badge, round .dnb day arrows, then nav, then the .al shimmer line. All these classes ship in the
  // loaded css/style.css. greet() takes a user-controlled name → MUST be esc()'d (the project's XSS
  // spot), wrapped so a throw falls back to the brand. fLong() is the production date formatter.
  var greeting = "Waqt";
  try { if (typeof greet === "function") greeting = greet(); } catch(e) {}
  h += '<header class="sch-mast t-ctr">';
  h += '<p class="sch-eyebrow">' + esc(greeting) + '</p>';
  h += '<h1 class="sch-dayname sch-datefull">' + esc(typeof fLong === "function" ? fLong(cDate) : cDate.toDateString()) + '</h1>';
  h += '<div class="flx aic jcc gap-2" style="margin-top:8px">';
  if (td) h += '<span class="bdg" style="background:rgba(74,140,92,.15);color:var(--ok)">Today</span>';
  else if (fu) h += '<span class="bdg" style="background:var(--acd);color:var(--ac)">Upcoming</span>';
  h += '</div>';
  h += '<div class="flx aic jcc gap-3" style="margin-top:14px">';
  h += '<button type="button" class="dnb" data-a="prevday" aria-label="Previous day"><i class="fas fa-chevron-left t-xs"></i></button>';
  if (!td) h += '<button type="button" class="bt t-xs" data-a="today">Today</button>';
  h += '<button type="button" class="dnb" data-a="nextday" aria-label="Next day"><i class="fas fa-chevron-right t-xs"></i></button>';
  h += '</div>';
  h += '</header>';

  h += renderNav("daily");
  h += '<div class="al"></div>';
  h += renderWeekStrip(key);

  // ring + per-card count chips (Prayers first, then one chip per card)
  h += '<div class="sch-status"><div class="sch-statusrow"><div class="sch-ring"><svg width="62" height="62" viewBox="0 0 62 62">';
  h += '<circle class="sch-track" cx="31" cy="31" r="27"></circle>';
  h += '<circle class="sch-fill" cx="31" cy="31" r="27" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '" style="stroke:' + completionRampColor(pct) + '"></circle>';
  h += '</svg><div class="sch-pct">' + pct + '%</div></div><div class="sch-statcols">';
  if (prayersOn()) h += '<div class="sch-statcol" data-cardchip="prayers" data-done="' + pd + '" data-total="5"><span class="sch-statnum">' + pd + '/5</span><span class="sch-statlbl">Prayers</span></div>';
  cardItems.forEach(function(ci) {
    var d = 0, t = ci.items.length;
    ci.items.forEach(function(it) { if (it.done) d++; });
    var label = ci.card.name.split(' ')[0];
    h += '<div class="sch-statcol" data-cardchip="' + esA(ci.card.id) + '" data-done="' + d + '" data-total="' + t + '"><span class="sch-statnum">' + d + '/' + t + '</span><span class="sch-statlbl">' + esc(label) + '</span></div>';
  });
  h += '</div></div>';
  // next-prayer countdown — today only, hidden until at least one prayer has a time.
  if (td && prayersOn()) {
    var prayerTimesMap = {}; PRAYERS.forEach(function(p) { prayerTimesMap[p] = getNotifTime("prayers", p); });
    var npc = computeNextPrayer(nowMin, prayerTimesMap);
    if (npc) h += '<div class="sch-nextdiv"><p class="sch-next"><span class="sch-nextdot"></span>Next: <b>' + esc(npc.name) + '</b> &middot; in ' + fmtHM(npc.mins) + '</p></div>';
  }
  h += '</div>';

  // weight tile (reuses production's id="wi" change handler)
  // NOTE: production's #wi handler stores weight as a NUMBER (parseFloat) and sDay persists it as a
  // JSON number, so it reloads as a number — coerce to string before esA() (which calls .replace).
  if (weightOn()) {
    var w = cData.weight ? String(cData.weight) : "", carried = w ? "" : String(getLastWeight(key) || "");
    var wStat = w ? 'Saved ' + w + ' kg' : (carried ? 'Carrying ' + carried + ' kg' : 'Not recorded');
    h += '<div class="sch-wtile"><span class="sch-wlbl">Weight</span>';
    h += '<span class="sch-wgroup"><input type="number" id="wi" class="sch-winp" step="0.1" value="' + esA(w || "") + '" placeholder="' + esA(carried || "-") + '">';
    h += '<span class="sch-wunit">kg</span></span><span class="sch-wstat" id="ws">' + esc(wStat) + '</span></div>';
  }

  // Checklist cards — stacked, above the timeline.
  h += renderPrayersDayCard();
  h += cardItems.map(function(ci) { return renderCard(ci.card, ci.items); }).join('');

  // timeline spine — last block (only when the Pehar is turned on in Settings)
  if (peharOn()) {
  h += '<div class="sch-peharhead">';
  h += '<button type="button" class="sch-copyy sch-phleft" data-a="setupwithai"><i class="fas fa-wand-magic-sparkles"></i> Set up with AI</button>';
  h += '<p class="sch-anylbl sch-phtitle">PEHAR</p>';
  if (td) h += '<button type="button" class="sch-copyy sch-phright" data-a="copyyesterday"><i class="fas fa-copy"></i> Copy yesterday</button>';
  else h += '<span></span>';
  h += '</div>';
  if (timeline.length) {
    h += '<div class="sch-rail">';
    timeline.forEach(function(item) {
      var isNow = td && nowMin >= item.start && nowMin < item.end;
      if (item.openBlock) {
        h += '<div class="sch-block sch-openblock' + (isNow ? ' now' : '') + '" style="--kc:var(--smut)">';
        h += '<div class="sch-time">' + prettyTime(minToHHMM(item.start)) + '<small>' + fmtDur(item.end - item.start) + '</small></div>';
        h += '<div class="sch-node"><i></i></div>';
        h += '<div class="sch-card" data-a="gapquick" data-start="' + item.start + '"><p class="sch-title">Free time' + (isNow ? '<span class="sch-nowtag">NOW</span>' : '') + '</p></div>';
        h += '</div>';
        if (schQuickGap && schQuickGap.start === item.start) h += renderGapQuickAdd(cards);
        return;
      }
      var ekey = item.id + "::" + item.name;
      h += '<div class="sch-block' + (item.done ? ' checked' : '') + (isNow ? ' now' : '') + (item.isPrayer ? ' prayer' : '') + '" data-block="' + esA(ekey) + '" style="--kc:' + item.kc + '">';
      h += '<div class="sch-time">' + prettyTime(item.t) + '<small>' + fmtDur(item.dur) + '</small></div>';
      h += '<div class="sch-node"><i></i></div>';
      h += '<div class="sch-gest" data-gest="complete" data-f="' + esA(item.id) + '" data-k="' + esA(item.name) + '" style="--kc:' + item.kc + '">';
      h += '<div class="sch-gest-action sch-gest-complete" aria-hidden="true"><i class="fas fa-check"></i></div>';
      h += '<div class="sch-card sch-gest-row" data-a="schtog" data-f="' + esA(item.id) + '" data-k="' + esA(item.name) + '">';
      h += '<p class="sch-title">' + esc(item.name) + (item.overlap ? ' <span class="sch-overlap">overlap</span>' : '') + (item.oneday ? ' <span class="sch-todaytag">today</span>' : '') + (isNow ? '<span class="sch-nowtag">NOW</span>' : '') + '</p>';
      if (!item.oneday) h += '<button class="sch-edit" data-a="schedit" data-f="' + esA(item.id) + '" data-k="' + esA(item.name) + '"><i class="fas fa-pen"></i></button>';
      else h += '<button class="sch-edit" data-a="oddel" data-f="' + esA(item.id) + '" data-k="' + esA(item.name) + '" aria-label="Remove ' + esA(item.name) + '"><i class="fas fa-xmark"></i></button>';
      h += '<div class="sch-box"><svg viewBox="0 0 24 24"><polyline points="4 13 9 18 20 6"></polyline></svg></div>';
      h += '</div>';
      h += '</div>';
      h += '</div>';
      if (!item.oneday && schEdit === ekey) h += editorHTML(item.id, item.name);
    });
    h += '</div>';
  } else h += '<div class="sch-empty" style="display:flex;flex-direction:column;align-items:center;gap:9px;margin:34px 0">'
    + '<div style="font-size:26px;color:var(--bd);line-height:1">◷</div>'
    + '<p style="font-family:\'DM Serif Display\',Georgia,serif;font-size:16px;color:var(--fg);margin:0">Nothing scheduled yet</p>'
    + '<p style="margin:0;max-width:32ch;color:var(--smut)">Bring in a whole week, or drop in a single goal to start.</p>'
    + '<div class="flx gap-2" style="margin-top:4px">'
    + '<button class="bt t-sm" data-a="setupwithai" style="background:var(--ac);border-color:var(--ac);color:#1a1206;font-weight:600"><i class="fas fa-wand-magic-sparkles mr-1.5"></i>Set up with AI</button>'
    + '<button class="bt t-sm" data-a="vset"><i class="fas fa-plus mr-1.5"></i>Add goals</button>'
    + '</div></div>';
  }

  h += '</div>';
  return h;
}

// ---- self-check (run with the page open at #dailycheck) ----
// Built against the render helpers' data (dayItemsForCard/buildTimeline), not
// DOM scraping. Uses a throwaway day key that's never written to localStorage
// (gDay() mutations here stay in-memory only), so nothing real is touched.
function _dailySelfCheck() {
  if (location.hash !== "#dailycheck") return;
  var testKey = "2000-01-01", dow = dowOf(testKey);
  var day = gDay(testKey);
  var cards = getCards();
  var habitsCard = cards.filter(function(c) { return c.id === "habits"; })[0];

  // seed a timed and an untimed one-day item on the (in-memory only) test day
  day.habits["__sc_timed__"] = false;
  day.habits["__sc_untimed__"] = false;
  day.onedayTimes = day.onedayTimes || {};
  day.onedayTimes["habits::__sc_timed__"] = "09:00";

  var items = dayItemsForCard(habitsCard, day, dow);
  var timedItem = items.filter(function(it) { return it.n === "__sc_timed__"; })[0];
  var untimedItem = items.filter(function(it) { return it.n === "__sc_untimed__"; })[0];
  var untimedRows = items.filter(function(it) { return !it.time; });
  var timeline = buildTimeline(cards, day, dow);
  var timedInTimeline = timeline.some(function(t) { return t.id === "habits" && t.name === "__sc_timed__"; });
  var untimedInTimeline = timeline.some(function(t) { return t.id === "habits" && t.name === "__sc_untimed__"; });

  console.assert(!!timedItem && timedItem.time === "09:00", "(a) timed one-day item should carry its time", timedItem);
  console.assert(timedInTimeline, "(a) timed item must appear in the timeline");
  console.assert(!untimedRows.some(function(it) { return it.n === "__sc_timed__"; }), "(a) timed item must NOT appear in its card's untimed rows");

  console.assert(!!untimedItem && !untimedItem.time, "(b) untimed one-day item should carry no time");
  console.assert(!untimedInTimeline, "(b) untimed item must NOT appear in the timeline");
  console.assert(untimedRows.some(function(it) { return it.n === "__sc_untimed__"; }), "(b) untimed item must appear in its card's untimed rows");

  var sumTotal = 0; cards.forEach(function(c) { sumTotal += dayItemsForCard(c, day, dow).length; });
  console.assert(sumTotal >= 2, "(c) Tasks total should be the sum of every card's today-items", sumTotal);

  // (d) prayers fallback strip renders only when no prayer is timed.
  // strip visibility == !anyPrayerTimed, by construction in rSchedule(); verify
  // that invariant flips correctly when a prayer time is set, then restore it.
  var probe = getNotifTime("prayers", "Fajr"); // restore this exact value after
  var stripShownBefore = PRAYERS.every(function(p) { return !getNotifTime("prayers", p); });
  setNotifTime("prayers", "Fajr", "05:00");
  var stripShownAfter = PRAYERS.every(function(p) { return !getNotifTime("prayers", p); });
  console.assert(stripShownAfter === false, "(d) fallback strip must hide once a prayer has a time");
  setNotifTime("prayers", "Fajr", probe || "");
  var stripShownRestored = PRAYERS.every(function(p) { return !getNotifTime("prayers", p); });
  console.assert(stripShownRestored === stripShownBefore, "(d) prayer notif times restored after probe");

  // (e) status card renders one chip per card (+1 for Prayers when enabled), each matching dayItemsForCard's done/total.
  var savedCDateE = cDate, savedCDataE = cData;
  cDate = new Date(2000, 0, 1);
  var htmlE = rSchedule();
  cDate = savedCDateE; cData = savedCDataE;
  var hostE = document.createElement("div");
  hostE.innerHTML = htmlE;
  var chips = hostE.querySelectorAll("[data-cardchip]");
  console.assert(chips.length === cards.length + (prayersOn() ? 1 : 0), "(e) status card should match the prayer toggle", chips.length, cards.length + (prayersOn() ? 1 : 0));
  var dayE = gDay(testKey);
  cards.forEach(function(c) {
    var chip = hostE.querySelector('[data-cardchip="' + c.id + '"]');
    var its = dayItemsForCard(c, dayE, dow);
    var d = 0; its.forEach(function(it) { if (it.done) d++; });
    console.assert(chip && +chip.dataset.done === d && +chip.dataset.total === its.length, "(e) chip counts must match dayItemsForCard for card " + c.id);
  });

  console.log("daily self-check complete");
}
_dailySelfCheck();

// ---- self-check (run with the page open at #tlcheck) ----
// Task 14: card-color completion highlight, timeline name-links, timed-only-on-timeline.
// Renders in isolation via renderCard()/rSchedule() into detached nodes — no localStorage writes.
function _timelineSelfCheck() {
  if (location.hash !== "#tlcheck") return;
  var cards = getCards();
  var habitsCard = cards.filter(function(c) { return c.id === "habits"; })[0];

  // (a) the .sch-gest wrapper for a non-prayer timed row's completion action carries
  // --kc (the card color), so .sch-gest-complete{background:var(--kc,var(--ok))} resolves
  // to the card color rather than falling back to green.
  var allTimedItems = [{ n:"__sc_alltimed__", done:false, time:"09:15", oneday:true }];
  var htmlAllTimed = renderCard(habitsCard, allTimedItems);
  var hostA = document.createElement("div"); hostA.innerHTML = htmlAllTimed;
  var gestA = hostA.querySelector('.sch-gest[data-k="__sc_alltimed__"]');
  console.assert(!gestA, "(a) an all-timed item must not render a checkbox .sch-gest row on the card at all");
  var mixedItems = [{ n:"__sc_untimed2__", done:false, time:"", oneday:true }, { n:"__sc_timed2__", done:false, time:"10:00", oneday:true }];
  var htmlMixed = renderCard(habitsCard, mixedItems);
  var gestMixed = /<div class="sch-gest" data-gest="complete"[^>]*data-k="__sc_untimed2__"[^>]*style="--kc:/.test(htmlMixed);
  console.assert(gestMixed, "(a) the .sch-gest wrapper around an untimed row's complete action must carry --kc (card color)");

  // (b) all-timed card renders a gototimeline link, no checkbox, for that item.
  var linkA = hostA.querySelector('.sch-tlink[data-a="gototimeline"][data-block="' + CSS.escape(habitsCard.id + "::__sc_alltimed__") + '"]');
  console.assert(!!linkA, "(b) an all-timed card item must render a gototimeline link", htmlAllTimed);
  console.assert(!hostA.querySelector('[data-a="schtog"][data-k="__sc_alltimed__"]'), "(b) an all-timed card item must NOT render a checkbox");

  // (c) the gototimeline handler's lookup (.sch-block[data-block="…"]) locates the right block.
  var hostC = document.createElement("div");
  hostC.innerHTML = '<div class="sch-block" data-block="habits::__sc_alltimed__"></div><div class="sch-block" data-block="habits::other"></div>';
  document.body.appendChild(hostC);
  var foundC = hostC.querySelector('.sch-block[data-block="' + CSS.escape("habits::__sc_alltimed__") + '"]');
  console.assert(foundC === hostC.firstChild, "(c) gototimeline lookup must find the matching .sch-block by data-block");
  document.body.removeChild(hostC);

  // (d) flash class is added immediately, then cleared ~2s later (matches the real handler's timing).
  var flashEl = document.createElement("div");
  flashEl.className = "sch-block";
  flashEl.classList.add("sch-flash");
  console.assert(flashEl.classList.contains("sch-flash"), "(d) sch-flash must be added immediately on gototimeline");
  setTimeout(function() {
    flashEl.classList.remove("sch-flash");
    console.assert(!flashEl.classList.contains("sch-flash"), "(d) sch-flash must be cleared ~2s after being added");
    console.log("timeline self-check (d) 2s clear verified");
  }, 2000);

  console.log("timeline self-check complete (a/b/c synchronous; d resolves in ~2s)");
}
_timelineSelfCheck();

function _weekSelfCheck() {
  if (location.hash !== "#weekcheck") return;
  var savedDate = new Date(cDate); // restore at the end so nothing is left navigated

  // (a) week-builder returns exactly 7 consecutive date keys containing dk(cDate).
  var probe = new Date(2026, 0, 14); // a Wednesday
  var days = wkDays(probe), keys = days.map(dk);
  console.assert(keys.length === 7, "(a) week strip must have exactly 7 days", keys.length);
  var consecutive = true;
  for (var i = 1; i < keys.length; i++) { if (days[i] - days[i - 1] !== 86400000) consecutive = false; }
  console.assert(consecutive, "(a) week days must be consecutive", keys);
  console.assert(keys.indexOf(dk(probe)) !== -1, "(a) week must contain the probe day", keys, dk(probe));

  // (b) tapping a computed day key sets cDate to it (simulate the wkday handler logic).
  var targetKey = keys[2];
  cDate = probe;
  var wp = targetKey.split("-"); cDate = new Date(+wp[0], +wp[1] - 1, +wp[2]);
  console.assert(dk(cDate) === targetKey, "(b) wkday tap must set cDate to the tapped key", dk(cDate), targetKey);

  // (c) "Today" chip visibility flips with selected-day == today.
  var todayKey = dk(new Date());
  cDate = new Date(); // selected == today -> chip hidden
  var chipHiddenOnToday = dk(cDate) === todayKey;
  console.assert(chipHiddenOnToday, "(c) chip must be hidden when selected day is today");
  cDate = probe; // selected != today (almost certainly) -> chip shown
  var chipShownElsewhere = dk(cDate) !== todayKey;
  console.assert(chipShownElsewhere, "(c) chip must show when selected day is not today");

  // (d) prev-week shifts all 7 keys back by 7 days.
  var prevProbe = new Date(probe); prevProbe.setDate(prevProbe.getDate() - 7);
  var prevKeys = wkDays(prevProbe).map(dk);
  var shiftedOk = true;
  for (var j = 0; j < 7; j++) { var back7 = new Date(days[j]); back7.setDate(back7.getDate() - 7); if (dk(back7) !== prevKeys[j]) shiftedOk = false; }
  console.assert(shiftedOk, "(d) prev-week keys must equal current week keys minus 7 days", prevKeys, keys);

  cDate = savedDate;
  console.log("week self-check complete");
}
_weekSelfCheck();

// ---- events ----
document.getElementById("app").addEventListener("click", function(e) {
  var t = e.target.closest("[data-a]");
  if (t) {
    var a = t.dataset.a;
    if (a === "help") { helpTopic = t.dataset.topic; render(); return; }
    if (a === "helpclose") { helpTopic = null; render(); return; }
    if (a === "importtab") { importTab = t.dataset.tab; aiStep = 0; render(); return; }
    if (a === "aiopen") {
      var svc = AI_SERVICES.filter(function(x) { return x.id === t.dataset.svc; })[0];
      if (!svc) return;
      copyImportPrompt();
      // window.open stays inside the click handler so the browser still counts this as a user
      // gesture. If a pop-up blocker eats it the clipboard copy has already happened, so the
      // flow degrades to "copy, then open it yourself" instead of failing outright.
      window.open(svc.url, "_blank", "noopener");
      aiStep = 1;
      render();
      return;
    }
    if (a === "vprefs") { view = "prefs"; render(); window.scrollTo(0, 0); return; }
    if (a === "doupdate") {
      toast("Checking for updates…");
      var applied = false;
      if (swReg) {
        swReg.update().catch(function() {});
        if (swReg.waiting) { swReg.waiting.postMessage("skipWaiting"); applied = true; }  // -> controllerchange -> reload
      }
      // If nothing was waiting, reg.update() may still fetch a new worker; reload to pick up fresh files.
      if (!applied) setTimeout(function() { location.reload(); }, 800);
      return;
    }
    if (a === "setupwithai") { view = "prefs"; importError = ""; importTab = "ai"; aiStep = 0; render(); setTimeout(function() { var panel = document.getElementById("schedule-import"); if (panel) panel.scrollIntoView({ behavior:carReducedMotion() ? "auto" : "smooth", block:"start" }); }, 0); return; }
    if (a === "importpreview") {
      var importInput = document.getElementById("import-json"); importDraft = importInput ? importInput.value : importDraft;
      var parsedImport = parseImportSchedule(importDraft);
      if (parsedImport.error) { importError = parsedImport.error; importPreview = null; render(); return; }
      importError = ""; importPreview = buildImportPreview(parsedImport.value); aiStep = 2; render(); return;
    }
    if (a === "importresolve") { if (importPreview && importPreview.rows[+t.dataset.i]) importPreview.rows[+t.dataset.i].choice = t.dataset.choice; render(); return; }
    if (a === "importrowshift") {
      if (!importPreview) return;
      if (!shiftRowToFreeSlot(importPreview, +t.dataset.i)) { toast("Nowhere free to shift to"); return; }
      rebuildImportPreview(); render(); return;
    }
    if (a === "importallmine" || a === "importallimport") { if (importPreview) importPreview.rows.forEach(function(row) { if (row.kind === "item" || row.kind === "prayer") row.choice = a === "importallmine" ? "mine" : "import"; }); render(); return; }
    if (a === "resetschedule") { if (!confirm("Reset your whole schedule? This clears all cards, items, times, day-scopes and prayer times, leaving an empty Daily Goals card. Your day-by-day completion history is kept.")) return; saveCards(seedCardsForState(false)); localStorage.removeItem(CARD_ITEMS_KEY); localStorage.removeItem(NOTIF_TIMES_KEY); localStorage.removeItem(HTN_DUR_KEY); localStorage.removeItem(NOTIF_DAYS_KEY); importPreview = null; aiStep = 0; render(); toast("Schedule reset"); return; }
    if (a === "importapply") { if (!importPreview) return; applyImportSchedule(importPreview, false); importPreview = null; importDraft = ""; importError = ""; aiStep = 0; parseText = ""; parseUnread = []; render(); toast("Schedule imported"); return; }
    // ---- "Type your day" parser (Feature 1/2/4/5) ----
    if (a === "parsecardchip") { parseCardId = t.dataset.c; render(); return; }
    if (a === "parserun") {
      var parseTa = document.getElementById("parse-text"); parseText = parseTa ? parseTa.value : parseText;
      var parseResult = parseScheduleText(parseText, parseCardId);
      parseUnread = parseResult.unread;
      var parseValidated = parseImportSchedule(JSON.stringify(parseResult.payload));
      if (parseValidated.value && parseValidated.value.cards.some(function(c) { return c.items.length; })) { importError = ""; importPreview = buildImportPreview(parseValidated.value); importPreview.fromParser = true; }
      else importPreview = null;
      render();
      setTimeout(function() { var panel = document.getElementById("schedule-import"); if (panel) panel.scrollIntoView({ behavior:carReducedMotion() ? "auto" : "smooth", block:"start" }); }, 0);
      return;
    }
    if (a === "parseunreadremove") { parseUnread = parseUnread.filter(function(u) { return u.i !== +t.dataset.i; }); render(); return; }
    if (a === "parseunreadretry") {
      var unreadIdx = +t.dataset.i;
      var unreadInput = document.getElementById("parse-unread-edit-" + unreadIdx);
      var retryResult = unreadInput ? parseOneLine(unreadInput.value.trim()) : null;
      if (!retryResult) { toast("Still couldn't read that. Try adding a time."); return; }
      parseUnread = parseUnread.filter(function(u) { return u.i !== unreadIdx; });
      // Routed like any other line (Fix 1), not force-fed to the chip card.
      var retryGuess = guessCardId(retryResult.name) || parseCardId;
      var retryCardName = (getCards().filter(function(c) { return c.id === retryGuess; })[0] || {}).name || "Daily Goals";
      var retryValidated = parseImportSchedule(JSON.stringify({ version:1, cards:[{ name:retryCardName, items:[retryResult] }] }));
      if (retryValidated.value) {
        var retryGroup = importPreview && importPreview.fromParser ? importPreview.data.cards.filter(function(c) { return c.name === retryCardName; })[0] : null;
        if (retryGroup) { retryGroup.items = retryGroup.items.concat(retryValidated.value.cards[0].items); importPreview = buildImportPreview(importPreview.data); }
        else if (importPreview && importPreview.fromParser) { importPreview.data.cards.push(retryValidated.value.cards[0]); importPreview = buildImportPreview(importPreview.data); }
        else importPreview = buildImportPreview(retryValidated.value);
        importPreview.fromParser = true;
      }
      // Feature 4, trigger 1: a corrected unread line — confirm once, then learn it.
      var retryPhrase = retryResult.name.toLowerCase();
      if (confirm('Remember "' + retryPhrase + '" = ' + retryResult.time + '?')) setLearnedPhrase(retryPhrase, retryResult.time, retryResult.duration);
      render();
      return;
    }
    if (a === "parserowtimesave") {
      if (!importPreview) return;
      var prowI = +t.dataset.i, prowRow = importPreview.rows[prowI], prowInput = document.getElementById("prow-time-" + prowI);
      var prowTime = prowInput ? prowInput.value : "";
      if (!prowRow || prowRow.kind !== "newitem" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(prowTime)) { toast("Enter a valid time"); return; }
      if (prowTime !== prowRow.incoming.time) {
        prowRow.incoming.time = prowTime;   // row.incoming IS the payload item, no lookup needed
        // Feature 4, trigger 2: editing a parsed row's time before applying — confirm once, then learn it.
        var prowPhrase = prowRow.incoming.name.toLowerCase();
        if (confirm('Remember "' + prowPhrase + '" = ' + prowTime + '?')) setLearnedPhrase(prowPhrase, prowTime, prowRow.incoming.duration);
        rebuildImportPreview();   // a new time can create or clear an overlap flag
        toast("Time updated");
      }
      render();
      return;
    }
    if (a === "phraseforget") { forgetPhrase(t.dataset.k); render(); return; }
    // Week strip nav (Task 6): prev/next shift by a week, tapping a pill jumps to that day.
    // Per-day steppers + Today jump-back (masthead). "today" also backs the week-strip pill, which
    // was rendering a data-a="today" button with no handler behind it until now.
    if (a === "prevday") { cDate.setDate(cDate.getDate() - 1); render(); return; }
    if (a === "nextday") { cDate.setDate(cDate.getDate() + 1); render(); return; }
    if (a === "today") { cDate = new Date(); render(); return; }
    if (a === "wkprev") { cDate.setDate(cDate.getDate() - 7); render(); return; }
    if (a === "wknext") { cDate.setDate(cDate.getDate() + 7); render(); return; }
    if (a === "wkday") {
      var wp = t.dataset.key.split("-");
      cDate = new Date(+wp[0], +wp[1] - 1, +wp[2]); render(); return;
    }
    // Toggle done-state for prayers, base-card items, or new-card items alike.
    // Same code path as the swipe-right-to-complete gesture (schGest below) — see schToggle().
    // Card's "on timeline" name-link (Task 14 #2): scroll the matching timeline block into
    // view and flash it for 2s in its own section color (sch-flash, keyed off --kc).
    if (a === "gototimeline") {
      var tgt = document.querySelector('.sch-block[data-block="' + CSS.escape(t.dataset.block) + '"]');
      if (tgt) {
        tgt.scrollIntoView({ behavior: carReducedMotion() ? "auto" : "smooth", block: "center" });
        tgt.classList.remove("sch-flash"); void tgt.offsetWidth;
        tgt.classList.add("sch-flash");
        setTimeout(function() { tgt.classList.remove("sch-flash"); }, 2000);
      }
      return;
    }
    if (a === "schtog") {
      // A completed swipe-right gesture already toggled + rendered this row; the
      // browser's post-touch synthetic click would otherwise flip it right back.
      if (Date.now() - schGestSwipedAt < 500) return;
      schToggle(t.dataset.f, t.dataset.k); render(); return;
    }
    // Single-open-editor (Task 12): opening Daily's editor closes Template's (if open) and vice
    // versa; re-tapping the same pencil (or hitting the editor's own Save button, which reuses
    // this same data-a) closes it. Either way the item being closed has its transient
    // tplRepeatMode entry cleared — every control in the editor commits live, so closing never
    // loses data, it just drops UI-only state that could otherwise resurface stale on reopen.
    if (a === "schedit") {
      var key = t.dataset.f + "::" + t.dataset.k;
      if (tplItemEdit) { delete tplRepeatMode[tplItemEdit]; tplItemEdit = null; }
      if (schEdit === key) { delete tplRepeatMode[key]; schEdit = null; } else { schEdit = key; }
      schAddCard = null; render(); return;
    }
    if (a === "schdel")       {
      var f2 = t.dataset.f, k2 = t.dataset.k;
      removeCardItem(f2, k2);
      delete tplRepeatMode[f2 + "::" + k2];
      schEdit = null; tplItemEdit = null; render(); toast("Removed"); return;
    }
    // Template row's revealed swipe-left delete button (discoverability alt to the editor's Delete).
    if (a === "gestdel")      {
      removeCardItem(t.dataset.f, t.dataset.k);
      render(); toast("Removed"); return;
    }
    // ---- Template: card management (add/rename/restyle/delete) ----
    if (a === "cardadd") {
      var newCard = addCard("New card");
      if (!newCard) { render(); return; }
      tplCardEdit = newCard.id; render();
      var ni = document.getElementById("cardname-" + newCard.id); if (ni) { ni.focus(); ni.select(); }
      return;
    }
    if (a === "cardrename") {
      tplCardEdit = t.dataset.c; render();
      var ni2 = document.getElementById("cardname-" + t.dataset.c); if (ni2) { ni2.focus(); ni2.select(); }
      return;
    }
    // ---- Overview: which of a card's items count toward its consistency grid. Lives here,
    // next to the grid it changes, rather than in the item editor where it was noise.
    if (a === "ovstatsedit")   { ovStatsEdit = t.dataset.c; render(); return; }
    if (a === "ovstatsclose")  { ovStatsEdit = null; render(); return; }
    if (a === "ovintroclose")  { localStorage.setItem(OV_INTRO_KEY, "true"); render(); return; }
    if (a === "ovstatstoggle") { setItemShow(t.dataset.c, t.dataset.k, !getItemShow(t.dataset.c, t.dataset.k)); render(); return; }
    if (a === "carddel")      {
      if (confirm("Delete this card? Its items will be removed from your plan.")) {
        deleteCard(t.dataset.c); render(); toast("Card deleted");
      }
      return;
    }
    // ---- Template: item scheduling (time set via .sch-timeinp change handler) ----
    if (a === "tpledit") {
      var tk = t.dataset.f + "::" + t.dataset.k;
      if (schEdit) { delete tplRepeatMode[schEdit]; schEdit = null; }
      if (tplItemEdit === tk) { delete tplRepeatMode[tk]; tplItemEdit = null; } else { tplItemEdit = tk; }
      render(); return;
    }
    if (a === "tplrepeat")    {
      var tf = t.dataset.f, tn = t.dataset.k, mode = t.dataset.mode;
      tplRepeatMode[tf + "::" + tn] = mode;
      if (mode === "every") setItemDays(tf, tn, null);
      render(); return;
    }
    if (a === "cardadditemsave") {
      var cid2 = t.dataset.c, ni4 = document.getElementById("ca-name-" + cid2);
      var nm2 = (ni4 && ni4.value || "").trim();
      if (!nm2) { if (ni4) ni4.focus(); return; }
      if (!addCardItem(cid2, nm2)) { toast("Already exists"); if (ni4) ni4.select(); return; }
      render();
      // stay in the add box, ready for the next item — the whole point of the inline add.
      var ni5 = document.getElementById("ca-name-" + cid2); if (ni5) ni5.focus();
      return;
    }
    // ---- Item editor (Task 12): duration presets, overview-stats switch ----
    if (a === "weighttoggle") { setWeightOn(!weightOn()); render(); return; }
    if (a === "pehartoggle") { setPeharOn(!peharOn()); render(); return; }
    if (a === "prayerstoggle") {
      var wasPrayersOn = prayersOn();
      setPrayersOn(!wasPrayersOn);
      // Flipping the flag alone leaves any existing reminder_times rows for prayers untouched
      // (htn_times is intentionally left set so times survive an off/on round-trip — same as
      // before this feature). Off must still stop delivery; on should restore whatever each
      // prayer's bell+time already say (Task: task notifications, note 6).
      PRAYERS.forEach(function(pn) { if (wasPrayersOn) pushSaveReminderTime("prayers", pn, ""); else syncPrayerReminder(pn); });
      render(); return;
    }
    // Add-forms' compact duration control (no persisted item yet — just patches the readout/
    // hidden value in place, no render(), so it doesn't blur the name field mid-typing).
    if (a === "adddurpreset") {
      var adTarget = t.dataset.target, adVal = t.dataset.val;
      var adValInp = document.getElementById(adTarget + "-val"); if (adValInp) adValInp.value = adVal;
      var adReadEl = document.getElementById(adTarget + "-read"); if (adReadEl) adReadEl.textContent = fmtDur(+adVal);
      var adWrap = t.closest(".sch-adddur");
      if (adWrap) { var chips = adWrap.querySelectorAll(".sch-durchip"); for (var ci2 = 0; ci2 < chips.length; ci2++) chips[ci2].classList.toggle("on", chips[ci2] === t); }
      return;
    }
    // ---- Template: prayers card ----
    if (a === "prayerbell") {
      var pbk = t.dataset.k;
      if (getPrayerBells()[pbk]) { var offBells = getPrayerBells(); offBells[pbk] = false; savePrayerBells(offBells); syncPrayerReminder(pbk); render(); return; }
      ensureBellPermission(function(ok) { var bells = getPrayerBells(); bells[pbk] = ok; savePrayerBells(bells); syncPrayerReminder(pbk); render(); });
      return;
    }
    // ---- Onboarding (Task 9A) ----
    if (a === "onbtoggle") {
      var k = t.dataset.k;
      if (k === "prayers") setPrayersOn(!prayersOn());
      else if (k === "pehar") setPeharOn(!peharOn());
      else if (k === "weight") setWeightOn(!weightOn());
      render(); return;
    }
    if (a === "onbstep1") { onbStep = 2; render(); return; }
    if (a === "onbstep2") { onbStep = prayersOn() ? 3 : 4; render(); return; }
    if (a === "onbskip1")  { onbStep = 4; render(); return; }
    if (a === "onbcontinue") {
      PRAYERS.forEach(function(name) {
        var el = document.getElementById("onb-" + name), v = el && el.value;
        if (v) setNotifTime("prayers", name, v);
      });
      onbStep = 4; render(); return;
    }
    if (a === "onbfinish") { finishOnboarding(); return; }
    // One-day (today-only) item removal (Task 9C) — the delete affordance on "today"-tagged rows.
    if (a === "oddel") { removeOnedayItem(t.dataset.f, t.dataset.k); schEdit = null; render(); toast("Removed"); return; }
    // One-day (today-only) add, per card — stores into the day record only.
    if (a === "odaddsave")    {
      var cid = t.dataset.c, nameInp = document.getElementById("od-name-" + cid);
      var nm = (nameInp && nameInp.value || "").trim();
      if (!nm) { if (nameInp) nameInp.focus(); return; }
      if (hasDayItem(cData, cid, nm)) { toast("Already added today"); if (nameInp) nameInp.select(); return; }
      addOnedayItem(cData, cid, nm, null, null);
      sDay(); render();
      var ni6 = document.getElementById("od-name-" + cid); if (ni6) ni6.focus();
      return;
    }
    if (a === "gapquick") { schQuickGap = { start:+t.dataset.start, cardId:"habits" }; schAddCard = null; schEdit = null; render(); var gn = document.getElementById("gap-name"); if (gn) gn.focus(); return; }
    if (a === "gapquickcard") { if (schQuickGap) { schQuickGap.cardId = t.dataset.c; render(); } return; }
    if (a === "gapquicksave") {
      var gapName = (document.getElementById("gap-name").value || "").trim(), gapCard = schQuickGap && schQuickGap.cardId || "habits";
      if (!gapName) { toast("Enter a name"); return; }
      if (hasDayItem(cData, gapCard, gapName)) { toast("Already added today"); return; }
      var gapTime = document.getElementById("gap-time").value, gapDur = parseInt(document.getElementById("gap-dur-val").value, 10);
      addOnedayItem(cData, gapCard, gapName, gapTime, gapDur); sDay(); schQuickGap = null; render(); toast("Added for today"); return;
    }
    if (a === "copyyesterday") {
      var copied = copyYesterdayOneday(cData, dk(cDate));
      if (copied) sDay(); render(); toast(copied ? "Copied " + copied + " from yesterday" : "Nothing new from yesterday"); return;
    }
  }
  var dayBtn = e.target.closest(".sch-day");
  if (dayBtn) {
    var wrap = dayBtn.closest(".sch-days");
    var current = getItemDays(wrap.dataset.field, wrap.dataset.name);
    var set = current ? current.slice() : [0, 1, 2, 3, 4, 5, 6];
    var dow = +dayBtn.dataset.dow, di = set.indexOf(dow);
    if (di === -1) set.push(dow); else set.splice(di, 1);
    set.sort(function(x, y) { return x - y; });
    setItemDays(wrap.dataset.field, wrap.dataset.name, set);
    render();
  }
});
document.getElementById("app").addEventListener("change", function(e) {
  // Fix 1: the preview's Card dropdown. The override is stashed on the incoming item itself, so a
  // full rebuild (which recomputes NEW-vs-CONFLICT against the newly chosen card) preserves it.
  var csel = e.target.closest('[data-a="importrowcard"]');
  if (csel && importPreview) {
    var crow = importPreview.rows[+csel.dataset.i];
    if (crow && crow.incoming) {
      if (String(csel.value).indexOf("__new_") === 0) delete crow.incoming._card; else crow.incoming._card = csel.value;
      rebuildImportPreview();
      render();
    }
    return;
  }
  var dinp = e.target.closest(".sch-durinp");
  if (dinp && dinp.dataset.field) {
    var mins = parseInt(dinp.value, 10);
    if (mins && mins > 0) setItemDur(dinp.dataset.field, dinp.dataset.name, mins);
    render();
    return;
  }
  var inp = e.target.closest(".sch-timeinp");
  if (inp && inp.dataset.field) {
    setNotifTime(inp.dataset.field, inp.dataset.name, inp.value);
    // The per-item bell is gone: a timed non-prayer item reminds automatically, and clearing
    // its time clears the reminder. Prayers keep their own dedicated bell in renderPrayersCard,
    // so their flag is left alone here.
    if (inp.dataset.field !== "prayers") setItemBell(inp.dataset.field, inp.dataset.name, !!inp.value);
    syncItemReminder(inp.dataset.field, inp.dataset.name);
    render();
    return;
  }
  // weight (#wi) handled by production's own change listener on #content
});
// Duration slider (Task 12) — commits via setItemDur on every drag tick ("input", not "change"),
// live-patching just the readout + preset highlight in place rather than calling render(), since a
// full re-render would destroy/recreate the <input type="range"> mid-drag and drop the gesture.
document.getElementById("app").addEventListener("input", function(e) {
  // Both import textareas are rendered FROM these vars (esc(parseText) / esc(importDraft)), but the
  // vars were only written inside the parserun/importpreview click handlers. So any render() that
  // happened while text sat unsaved in the box wiped it — and clicking from the box toward the
  // button is itself enough to trigger one (focusout below). Sync on input: the box is the source
  // of truth the moment it changes, and no re-render can lose what the user typed.
  if (e.target.id === "parse-text") { parseText = e.target.value; return; }
  if (e.target.id === "import-json") { importDraft = e.target.value; return; }
});
// Enter in a card's "add for today"/"add a recurring goal" name field saves;
// Enter in a card-rename input blurs (triggers the focusout save below).
document.getElementById("app").addEventListener("keydown", function(e) {
  if (e.target.id && e.target.id.indexOf("od-name-") === 0 && e.key === "Enter") {
    e.preventDefault();
    var cid = e.target.id.slice("od-name-".length);
    var b = document.querySelector('[data-a="odaddsave"][data-c="' + cid + '"]');
    if (b) b.click();
  }
  if (e.target.id && e.target.id.indexOf("ca-name-") === 0 && e.key === "Enter") {
    e.preventDefault();
    var cid2 = e.target.id.slice("ca-name-".length);
    var b2 = document.querySelector('[data-a="cardadditemsave"][data-c="' + cid2 + '"]');
    if (b2) b2.click();
  }
  if (e.target.id && e.target.id.indexOf("cardname-") === 0 && e.key === "Enter") { e.preventDefault(); e.target.blur(); }
});
// Card rename: save on blur (covers click-away as well as Enter above).
document.getElementById("app").addEventListener("focusout", function(e) {
  if (e.target.id && e.target.id.indexOf("cardname-") === 0) {
    var cid3 = e.target.id.slice("cardname-".length), val = e.target.value.trim();
    if (val) renameCard(cid3, val);
    tplCardEdit = null; render();
  }
  // Only re-render when the step actually moved. Rendering on every click-away rebuilt the whole
  // panel mid-interaction, which is how the pasted JSON used to disappear before the Preview click
  // landed (the input handler above now also keeps importDraft in sync regardless).
  if (e.target.id === "import-json" && e.target.value.trim()) {
    importDraft = e.target.value;
    if (aiStep < 2) { aiStep = 2; render(); }
  }
});

// ============================================================
// ROW GESTURES (Task 8) — swipe-right-to-complete on Daily rows (.sch-rep /
// .sch-block, wrapped in .sch-gest[data-gest="complete"]), swipe-left-to-delete
// on Template rows (.sch-planrow, wrapped in .sch-gest[data-gest="delete"]).
// Delegated on #app (stable across renders), registered BEFORE the day-swipe
// IIFE below so a touch that starts on a gesture row can win via
// stopImmediatePropagation() before it bubbles into the day-swipe listener
// (day-swipe listens on #app itself, same node).
// ============================================================
var schGestActive = null; // {row, wrap, kind, f, k, sx, sy}

// Pure classifier — no reduced-motion check here, so gestures behave identically
// whether motion is on or off (only the live drag *animation* is gated on reduced-motion).
function schGestClassify(dx, dy, kind) {
  if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.5) return "ignore"; // mostly-vertical -> scroll wins
  if (Math.abs(dx) < 10) return "tap";
  if (kind === "complete" && dx > 55) return "complete";
  if (kind === "delete" && dx < -55) return "delete";
  return "cancel"; // moved, but under threshold -> snap back
}

(function() {
  var appEl = document.getElementById("app");

  appEl.addEventListener("touchstart", function(e) {
    var row = e.target.closest(".sch-gest-row");
    schGestActive = null;
    if (!row) return;
    var wrap = row.closest(".sch-gest");
    if (!wrap) return;
    // Claim this touch before carousel-swipe / day-swipe (both listening further
    // up or on this same node) get a chance to act on it.
    e.stopImmediatePropagation();
    schGestActive = { row: row, wrap: wrap, kind: wrap.dataset.gest, f: wrap.dataset.f, k: wrap.dataset.k,
      sx: e.touches[0].clientX, sy: e.touches[0].clientY };
  }, { passive: true });

  appEl.addEventListener("touchmove", function(e) {
    if (!schGestActive) return;
    e.stopImmediatePropagation();
    if (carReducedMotion()) return; // motion off: skip the live drag animation, gesture logic still runs on release
    var t = e.touches[0], dx = t.clientX - schGestActive.sx;
    var clamped = schGestActive.kind === "complete" ? Math.max(0, dx) : Math.min(0, dx);
    schGestActive.row.style.transform = "translateX(" + clamped + "px)";
  }, { passive: true });

  appEl.addEventListener("touchend", function(e) {
    if (!schGestActive) return;
    e.stopImmediatePropagation();
    var st = schGestActive, row = st.row, wrap = st.wrap;
    var t = e.changedTouches[0], dx = t.clientX - st.sx, dy = t.clientY - st.sy;
    var verdict = schGestClassify(dx, dy, st.kind);
    schGestActive = null;
    if (verdict === "complete") {
      row.style.transform = "";
      schGestSwipedAt = Date.now(); // guards the schtog click handler against a synthetic ghost-click
      schToggle(st.f, st.k);
      render();
      return;
    }
    if (verdict === "delete") {
      // iOS-style: stays open showing the red Delete button until tapped (or the row re-renders).
      row.style.transform = "translateX(-64px)";
      return;
    }
    // tap / ignore / cancel (under threshold) -> snap back; a real tap's click still reaches
    // the underlying control since we never called preventDefault on any of these touch events.
    row.style.transform = "";
  }, { passive: true });
})();

// ---- self-check (run with the page open at #gestcheck) ----
function _gestureSelfCheck() {
  if (location.hash !== "#gestcheck") return;

  // (a) classifier verdicts
  console.assert(schGestClassify(5, 0, "complete") === "tap", "(a) a 5px move should classify as a tap");
  console.assert(schGestClassify(70, 0, "complete") === "complete", "(a) +70px on a Daily row should classify as complete");
  console.assert(schGestClassify(-70, 0, "delete") === "delete", "(a) -70px on a Template row should classify as delete");
  console.assert(schGestClassify(10, 40, "complete") === "ignore", "(a) a mostly-vertical move should classify as ignore");

  // (b) completionRampColor is wired into the ring's stroke
  console.assert(completionRampColor(20) === "#b47a70", "(b) 20% should map to the red bucket");
  console.assert(completionRampColor(55) === "#bfa46a", "(b) 55% should map to the amber bucket");
  console.assert(completionRampColor(85) === "#93a877", "(b) 85% should map to the sage bucket");
  console.assert(completionRampColor(100) === "#79a06b", "(b) 100% should map to the green bucket");
  console.assert(/completionRampColor\(pct\)/.test(rSchedule.toString()), "(b) the sch-fill stroke must read from completionRampColor(pct)");

  // (c) reduced-motion forced must not change any gesture verdict (motion off, gestures still on).
  carForceReduced = true;
  console.assert(schGestClassify(5, 0, "complete") === "tap", "(c) reduced-motion: tap verdict unchanged");
  console.assert(schGestClassify(70, 0, "complete") === "complete", "(c) reduced-motion: complete verdict unchanged");
  console.assert(schGestClassify(-70, 0, "delete") === "delete", "(c) reduced-motion: delete verdict unchanged");
  console.assert(schGestClassify(10, 40, "complete") === "ignore", "(c) reduced-motion: ignore verdict unchanged");
  carForceReduced = false;

  // (d) a simulated complete-gesture flips the underlying done-state via the exact same code path
  // (schToggle) the real gesture-release calls — on a throwaway day key, restored/cleaned after.
  var savedCDate = cDate, savedCData = cData;
  var testKey = "2000-01-01", hadRecord = localStorage.getItem("ht_" + testKey);
  cDate = new Date(2000, 0, 1);
  cData = gDay(testKey);
  cData.habits["__gestcheck__"] = false;
  schToggle("habits", "__gestcheck__");
  console.assert(cData.habits["__gestcheck__"] === true, "(d) schToggle (the gesture-release code path) should flip the done-state");
  if (hadRecord) localStorage.setItem("ht_" + testKey, hadRecord); else localStorage.removeItem("ht_" + testKey);
  cDate = savedCDate; cData = savedCData;

  console.log("gesture self-check complete");
}
_gestureSelfCheck();

// Day-level swipe (Task 6): horizontal swipe on the Daily view shifts cDate by one day.
// Delegated on #app (stable across renders) since .sch-view is rebuilt on every render.
(function() {
  var sx = 0, sy = 0, active = false;
  var appEl = document.getElementById("app");
  appEl.addEventListener("touchstart", function(e) {
    active = !!e.target.closest(".sch-view");
    if (!active) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });
  appEl.addEventListener("touchend", function(e) {
    if (!active) return;
    active = false;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    cDate.setDate(cDate.getDate() + (dx < 0 ? 1 : -1));
    render();
  }, { passive: true });
})();

// ---- self-check (run with the page open at #finalcheck) ----
// Task 9 wrap-up: onboarding gate, dScore's new-card denominator, one-day delete, dead-CSS removal.
// Every real localStorage key touched is saved before and restored after.
function _finalSelfCheck() {
  if (location.hash !== "#finalcheck") return;

  // (a) onboarding gate predicate: shows when ht_onboarded is absent (and view is daily), hides
  // once set. (hash === "#onboard" is a separate, hard-coded branch — not exercised here since
  // this self-check itself runs under #finalcheck.)
  var savedFlag = localStorage.getItem(ONBOARD_KEY), savedView = view;
  localStorage.removeItem(ONBOARD_KEY);
  view = "daily";
  console.assert(shouldShowOnboarding() === true, "(a) onboarding must show when ht_onboarded is absent and view is daily");
  localStorage.setItem(ONBOARD_KEY, "true");
  console.assert(shouldShowOnboarding() === false, "(a) onboarding must hide once ht_onboarded is set");
  if (savedFlag === null) localStorage.removeItem(ONBOARD_KEY); else localStorage.setItem(ONBOARD_KEY, savedFlag);
  view = savedView;

  // (b) wrapped dScore counts a new-card item in the denominator — hand-computed independently
  // of dScore itself (straight loops over the day record + gDayCards), then compared.
  var savedCDateB = cDate, savedCDataB = cData;
  var testKey = "2000-01-02", hadRecordB = localStorage.getItem("ht_" + testKey);
  getCards(); // ensure migrateCardsIfNeeded() has run — addCard()/getCardMeta() don't trigger it
              // themselves, and every other self-check on this page early-returns on hash mismatch
              // before ever calling getCards(), so under #finalcheck this is the first cards touch.
  var testCard = addCard("__finalcheck__");
  addCardItem(testCard.id, "__fc_item__");
  cDate = new Date(2000, 0, 2);
  cData = gDay(testKey); // backfills day.cards[testCard.id].__fc_item__ = false
  cData.cards[testCard.id]["__fc_item__"] = true; // hand-mark it done
  sDay();
  cDate = savedCDateB; cData = savedCDataB;

  var handPd = 0; if (prayersOn()) PRAYERS.forEach(function(p) { if (gDay(testKey).prayers[p]) handPd++; });
  var handDone = 0, handTotal = 0;
  gDayCards(testKey).forEach(function(row) { row.items.forEach(function(it) { handTotal++; if (it.done) handDone++; }); });
  var handScore = Math.round((handPd + handDone) / ((prayersOn() ? 5 : 0) + handTotal) * 100);
  console.assert(handTotal > 0 && handDone > 0, "(b) fixture must actually include a done new-card item", handTotal, handDone);
  console.assert(dScore(testKey) === handScore, "(b) wrapped dScore should match the hand-computed (prayers+cards)/(5+total) value", dScore(testKey), handScore);

  deleteCard(testCard.id);
  if (hadRecordB) localStorage.setItem("ht_" + testKey, hadRecordB); else localStorage.removeItem("ht_" + testKey);

  // (c) deleting a one-day item removes it from the day record + onedayTimes.
  var savedCDateC = cDate, savedCDataC = cData;
  var odKey = "2000-01-03", hadRecordC = localStorage.getItem("ht_" + odKey);
  cDate = new Date(2000, 0, 3);
  cData = gDay(odKey);
  cData.habits["__od_item__"] = false;
  cData.onedayTimes = cData.onedayTimes || {};
  cData.onedayTimes["habits::__od_item__"] = "08:00";
  removeOnedayItem("habits", "__od_item__");
  console.assert(!("__od_item__" in cData.habits), "(c) removeOnedayItem must delete the item from the day record");
  console.assert(!("habits::__od_item__" in cData.onedayTimes), "(c) removeOnedayItem must clear its onedayTimes entry");
  if (hadRecordC) localStorage.setItem("ht_" + odKey, hadRecordC); else localStorage.removeItem("ht_" + odKey);
  cDate = savedCDateC; cData = savedCDataC;

  // (d) dead-CSS removal. Source grepped by hand before removing: `class="sch-any"` never appears
  // anywhere in this file's emitted markup (only its now-deleted CSS rule did) — genuinely dead.
  // `.sch-anylbl` (YOUR PLAN / HABIT-CARD CONSISTENCY headings) and `.sch-seg`/`.sch-segbtn`
  // (Repeat toggle, prayer school toggle, onboarding's Hanafi/Shafi toggle) are still emitted by
  // rTemplate/rOverview/templateEditorHTML/renderPrayersCard/rOnboarding, so those stay — removing
  // them would have broken live UI. Assert the DOM after a real render has no .sch-any node.
  render();
  console.assert(document.querySelector(".sch-any") === null, "(d) no element should carry the removed .sch-any class after a render");

  console.log("final self-check complete");
}
_finalSelfCheck();

// ---- self-check (run with the page open at #durcheck) ----
// Pure function fixtures for (a)/(c)/(d)/(e); (b) touches htn_dur, saved/restored.
function _durationSelfCheck() {
  if (location.hash !== "#durcheck") return;

  // (a) dur formatter
  console.assert(fmtDur(35) === "35m", "(a) 35 should format as 35m", fmtDur(35));
  console.assert(fmtDur(120) === "2h", "(a) 120 should format as 2h", fmtDur(120));
  console.assert(fmtDur(66) === "1.1h", "(a) 66 should format as 1.1h", fmtDur(66));

  // (b) unset durations fall back to 35 (prayers) / 30 (everything else)
  var savedDurMap = localStorage.getItem(HTN_DUR_KEY);
  localStorage.removeItem(HTN_DUR_KEY);
  console.assert(effectiveDur("prayers", "Fajr", false, {}) === 35, "(b) unset prayer duration should default to 35");
  console.assert(effectiveDur("habits", "__nope__", false, {}) === 30, "(b) unset card-item duration should default to 30");
  if (savedDurMap === null) localStorage.removeItem(HTN_DUR_KEY); else localStorage.setItem(HTN_DUR_KEY, savedDurMap);

  // (c) 06:30(120m) + 09:00(60m) -> exactly one 08:30-09:00 (30m) open block, none before/after
  var fixtureItems = [
    { id:"x", name:"a", start:390, end:510 }, // 06:30 + 120m
    { id:"x", name:"b", start:540, end:600 }  // 09:00 + 60m
  ];
  var withGaps = insertOpenBlocks(fixtureItems);
  console.assert(withGaps.length === 3, "(c) exactly one open block should be inserted", withGaps.length);
  var ob = withGaps[1];
  console.assert(ob.openBlock === true && ob.start === 510 && ob.end === 540, "(c) open block should span 08:30-09:00", ob);
  console.assert(withGaps[0].openBlock !== true && withGaps[2].openBlock !== true, "(c) no filler before the first or after the last item", withGaps);

  // (d) next-prayer countdown: soonest future prayer, rolls to Fajr once past Isha
  var times = { Fajr:"05:30", Dhuhr:"13:10", Asr:"17:35", Maghrib:"19:25", Isha:"21:25" };
  var soon = computeNextPrayer(17 * 60, times); // 17:00, before Asr
  console.assert(soon && soon.name === "Asr" && soon.mins === 35, "(d) 17:00 should pick Asr, 35m out", soon);
  var afterIsha = computeNextPrayer(22 * 60, times); // 22:00, after Isha
  console.assert(afterIsha && afterIsha.name === "Fajr", "(d) after Isha should roll to tomorrow's Fajr", afterIsha);

  // (e) an open block carries no done-state/id -> uncheckable, and can't land in any Tasks/chip
  // count (those are summed from dayItemsForCard/cardItems, which open blocks never enter).
  console.assert(typeof ob.done === "undefined" && typeof ob.id === "undefined", "(e) open block must carry no done-state or id", ob);

  console.log("duration self-check complete");
}
_durationSelfCheck();

// ---- self-check (run with the page open at #editcheck) ----
// Task 12: item editor redesign. Every real localStorage key touched (cards/card-items/htn_dur)
// is created under a throwaway __editcheck__ card and torn down again; schEdit/tplItemEdit/
// onbStep are saved and restored so this never leaves the live view mid-edit.
function _editorSelfCheck() {
  if (location.hash !== "#editcheck") return;

  // (a) setItemShow(false) then getItemShow===false, and the item is excluded from
  // renderCardConsistencySlides' output.
  getCards(); // ensure migrateCardsIfNeeded() has run before addCard()
  var testCard = addCard("__editcheck__");
  addCardItem(testCard.id, "__ec_item__");
  setItemShow(testCard.id, "__ec_item__", true);
  console.assert(getItemShow(testCard.id, "__ec_item__") === true, "(a) getItemShow should read back true after setItemShow(true)");
  setItemShow(testCard.id, "__ec_item__", false);
  console.assert(getItemShow(testCard.id, "__ec_item__") === false, "(a) getItemShow should read back false after setItemShow(false)");
  var fixtureCard = { id: testCard.id, name: testCard.name, icon: testCard.icon, color: testCard.color, items: cardItemsFor(testCard.id) };
  var slides = renderCardConsistencySlides([], [fixtureCard], (function() { var o = {}; o[testCard.id] = {}; return o; })());
  // The card still renders when nothing on it is tracked (vanishing removed the only way back in),
  // but the untracked item must be absent from the grid and the picker must be reachable.
  console.assert(slides.length === 1, "(a) a card with nothing tracked should still render one slide", slides);
  console.assert(slides[0].indexOf("Nothing tracked on this card") !== -1, "(a) an item with s:false must be excluded from the grid", slides[0]);
  console.assert(slides[0].indexOf('data-a="ovstatsedit"') !== -1, "(a) the slide must still offer the stats picker", slides[0]);
  deleteCard(testCard.id);

  // (b) duration round-trips through setItemDur/getItemDur and formats human-readable via fmtDur.
  // The slider UI is gone, but the model is not: the parser, the import path and the gap quick-add
  // all still write durations, and the timeline renders block lengths from them.
  var savedDur = localStorage.getItem(HTN_DUR_KEY);
  setItemDur("habits", "__ec_dur__", 95);
  console.assert(getItemDur("habits", "__ec_dur__") === 95, "(b) setItemDur should persist a slider commit");
  console.assert(fmtDur(getItemDur("habits", "__ec_dur__")) === "1.6h", "(b) 95min should format human-readable", fmtDur(getItemDur("habits", "__ec_dur__")));
  setItemDur("habits", "__ec_dur__", 30);
  if (savedDur === null) localStorage.removeItem(HTN_DUR_KEY); else localStorage.setItem(HTN_DUR_KEY, savedDur);

  // (c) opening editor B clears editor A's open-key — exercise the exact mutual-close branch the
  // tpledit click handler runs (schedit's branch is the mirror image, already covered by symmetry).
  var savedSchEdit = schEdit, savedTplItemEdit = tplItemEdit;
  schEdit = "habits::__ec_a__"; tplItemEdit = null;
  if (schEdit) { delete tplRepeatMode[schEdit]; schEdit = null; } // tpledit's mutual-close step
  tplItemEdit = "habits::__ec_b__";
  console.assert(schEdit === null && tplItemEdit === "habits::__ec_b__", "(c) opening a Template editor must close any open Daily editor", schEdit, tplItemEdit);
  schEdit = savedSchEdit; tplItemEdit = savedTplItemEdit;

  // (d) onboarding prayer-setup inputs carry the 5 prayer-time defaults.
  var savedOnbStep = onbStep;
  onbStep = 3;
  var host = document.createElement("div");
  host.innerHTML = rOnboarding();
  var defaultsOk = true;
  Object.keys(ONB_DEFAULTS).forEach(function(name) {
    var el = host.querySelector("#onb-" + name);
    if (!el || el.getAttribute("value") !== ONB_DEFAULTS[name]) defaultsOk = false;
  });
  console.assert(defaultsOk, "(d) onboarding prayer-setup inputs must carry the 5 prayer-time defaults", ONB_DEFAULTS);
  onbStep = savedOnbStep;

  console.log("editor self-check complete");
}
_editorSelfCheck();

// ---- self-check (run with the page open at #uicheck) ----
// Task 13: status-card columns / vibrant palette / weight tile / gear removal.
// Uses the same untouched probe date (2000-01-01) as _dailySelfCheck's (e) — gDay()
// never persists, so no real localStorage record is created or needs restoring.
function _uiSelfCheck() {
  if (location.hash !== "#uicheck") return;

  // (a) CARD_PALETTE has 12 entries, none the reserved prayer green.
  console.assert(CARD_PALETTE.length === 12, "(a) CARD_PALETTE should have 12 entries", CARD_PALETTE.length);
  console.assert(CARD_PALETTE.indexOf("#82a06e") === -1, "(a) CARD_PALETTE must never include the reserved prayer green", CARD_PALETTE);

  var savedCDate = cDate, savedCData = cData;
  cDate = new Date(2000, 0, 1);
  var html = rSchedule();
  cDate = savedCDate; cData = savedCData;
  var host = document.createElement("div");
  host.innerHTML = html;

  // (b) status card renders one count column per card, plus Prayers when enabled.
  var cols = host.querySelectorAll(".sch-statcol");
  console.assert(cols.length === getCards().length + (prayersOn() ? 1 : 0), "(b) status card should match the prayer toggle", cols.length, getCards().length + (prayersOn() ? 1 : 0));

  // (c) no .sch-gear element after a Daily render — the Template nav tab replaces it.
  console.assert(host.querySelector(".sch-gear") === null, "(c) .sch-gear must not exist after a Daily render");

  // (d) the weight tile only renders when there IS weight history (the manual toggle is gone),
  // so assert its shape only when present rather than forcing it on.
  var wi = host.querySelector("#wi");
  if (wi) console.assert(wi.value === "" || wi.getAttribute("placeholder") !== "0.0", "(d) empty weight must not render as a literal 0.0", wi.outerHTML);

  console.log("ui self-check complete");
}
_uiSelfCheck();

// ---- self-check (run with the page open at #navcheck) ----
// Task: ? and nav placement consistency across Daily/Overview/Template.
function _navHeaderSelfCheck() {
  if (location.hash !== "#navcheck") return;
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  var savedDate = cDate, savedData = cData;
  try {
    cDate = new Date(2000, 0, 1);
    cData = gDay(dk(cDate));

    // (a) every ? that renders must point at a topic that actually exists. Per-page ? buttons
    // were deleted with the help layer; a button whose topic is gone opens an empty sheet.
    var everything = rSchedule() + rOverview() + rTemplate() + rPrefs();
    (everything.match(/data-topic="([a-z]+)"/g) || []).forEach(function(m) {
      var topic = m.replace(/.*="/, "").replace('"', "");
      assert(!!HELP_TOPICS[topic], "(a) a ? button points at the deleted topic '" + topic + "'");
    });

    // (a2) Plan carries the gear, Settings carries the way back, and the junk drawer moved.
    assert(rTemplate().indexOf('data-a="vprefs"') !== -1, "(a2) Plan must carry the settings gear");
    assert(rPrefs().indexOf('data-a="vset"') !== -1, "(a2) Settings must carry a way back to Plan");
    assert(rTemplate().indexOf("Cloud Sync") === -1, "(a2) Cloud Sync must have left the Plan page");
    assert(rPrefs().indexOf("Cloud Sync") !== -1, "(a2) Cloud Sync must live on Settings");
    assert(rTemplate().indexOf('data-a="resetschedule"') === -1, "(a2) Reset must have left the Plan page");
    assert(rPrefs().indexOf('data-a="resetschedule"') !== -1, "(a2) Reset must live on Settings");

    // (b) nav renders immediately after the header on all 3 views — no page-specific block
    // (week-strip, month-arrows) sits between </header> and the nav.
    [rSchedule(), rOverview(), rTemplate(), rPrefs()].forEach(function(html, i) {
      var label = ["Daily", "Overview", "Plan", "Settings"][i];
      var headerCloseIdx = html.indexOf("</header>");
      var navIdx = html.indexOf('class="sch-nav');
      assert(headerCloseIdx !== -1 && navIdx !== -1 && navIdx > headerCloseIdx, label + " nav must come after </header>");
      var between = html.slice(headerCloseIdx, navIdx);
      assert(between.indexOf("sch-week") === -1, "(b) " + label + " must not have the week-strip between header and nav");
      assert(between.indexOf("sch-dnav") === -1, "(b) " + label + " must not have month-arrows between header and nav");
    });

    // (c) Daily's week-strip still renders, after the nav.
    var dailyHtml = rSchedule();
    var navEndIdx = dailyHtml.indexOf('class="sch-nav');
    assert(dailyHtml.indexOf("sch-week") > navEndIdx, "(c) week-strip must still render, after the nav");

    // (d) Overview's month steppers live INSIDE the header, flanking the month title — an
    // unlabelled arrow pair floating in its own row under the nav read as broken chrome.
    var ovHtml = rOverview();
    var ovHeaderCloseIdx = ovHtml.indexOf("</header>");
    assert(ovHtml.indexOf('data-a="omp"') < ovHeaderCloseIdx && ovHtml.indexOf('data-a="omn"') < ovHeaderCloseIdx, "(d) both month arrows must sit inside the header");
    assert(ovHtml.indexOf("sch-dnav") === -1, "(d) the detached month-arrow row must be gone");

    console.log("NAVCHECK PASS");
  } catch(e) {
    console.log("NAVCHECK FAIL: " + e.message);
  } finally {
    cDate = savedDate; cData = savedData;
  }
}
_navHeaderSelfCheck();

// ---- self-check (run with the page open at #setupcheck) ----
function _setupSelfCheck() {
  if (location.hash !== "#setupcheck") return;
  var savedPrayers = localStorage.getItem(PRAYERS_ON_KEY), savedWeight = localStorage.getItem(WEIGHT_ON_KEY);
  var savedDate = cDate, savedData = cData;
  // Prayer time is staged through the LOCAL htn_times map, never setNotifTime() — setNotifTime
  // also fires pushSaveReminderTime(), which upserts/deletes a row in the real Supabase
  // reminder_times table for a signed-in user. Two such calls (set + restore) are independent
  // async requests with no ordering guarantee, so a check that used them could permanently
  // leave the user's real Fajr reminder at the fixture value. Restoring the raw JSON string
  // is exact and stays entirely offline.
  var savedTimes = localStorage.getItem(NOTIF_TIMES_KEY);
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  try {
    cDate = new Date(2000, 0, 4);
    setWeightOn(false);
    assert(weightOn() === false, "weight flag did not disable");
    assert(rSchedule().indexOf('id="wi"') === -1, "weight tile remains on Daily");
    setWeightOn(true);
    assert(weightOn() === true && rSchedule().indexOf('id="wi"') !== -1, "weight tile did not restore");
    assert(rPrefs().indexOf('data-a="weighttoggle"') !== -1, "the weight switch must live on Settings");

    var tm = getNotifTimesMap(); tm[notifKey("prayers", "Fajr")] = "05:30"; saveNotifTimesMap(tm);
    setPrayersOn(false);
    assert(prayersOn() === false, "prayer flag did not disable");
    var noPrayerDaily = rSchedule();
    assert(noPrayerDaily.indexOf('data-block="prayers::') === -1, "prayer nodes remain on Pehar");
    assert(noPrayerDaily.indexOf('data-cardchip="prayers"') === -1, "Prayers status chip remains");
    setPrayersOn(true);
    assert(prayersOn() === true && rSchedule().indexOf('data-block="prayers::Fajr"') !== -1, "prayer nodes did not restore");

    // Fresh-profile seed, asserted through the explicit override — the alternative (deleting
    // ht_cards + ht_d + every ht_<date> record to fake a new profile) would put every real day
    // record in a delete/restore window that any thrown error or closed tab turns into data loss.
    var freshCards = seedCardsForState(false);
    assert(freshCards.length === 1 && freshCards[0].id === "habits", "fresh seed is not Daily Goals only");
    assert(seedCardsForState(true).length === 3, "existing-profile seed must stay the 3 base cards");
    console.log("SETUPCHECK PASS");
  } catch(e) {
    console.log("SETUPCHECK FAIL: " + e.message);
  } finally {
    if (savedTimes === null) localStorage.removeItem(NOTIF_TIMES_KEY); else localStorage.setItem(NOTIF_TIMES_KEY, savedTimes);
    if (savedPrayers === null) localStorage.removeItem(PRAYERS_ON_KEY); else localStorage.setItem(PRAYERS_ON_KEY, savedPrayers);
    if (savedWeight === null) localStorage.removeItem(WEIGHT_ON_KEY); else localStorage.setItem(WEIGHT_ON_KEY, savedWeight);
    cDate = savedDate; cData = savedData;
  }
}
_setupSelfCheck();

// ---- self-check (run with the page open at #cutcheck) ----
// Guards the deletions. Every one of these controls existed and was removed on purpose; if any
// comes back, something answered a request by adding an option instead of making a decision.
function _cutSelfCheck() {
  if (location.hash !== "#cutcheck") return;
  var savedDate = cDate, savedData = cData;
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  try {
    cDate = new Date(2000, 0, 1);
    cData = gDay(dk(cDate));

    // (a) the item editor is exactly Time, Repeat, Delete.
    var ed = itemEditorHTML("habits", "__cut__", "schedit");
    assert(ed.indexOf('type="time"') !== -1, "(a) the editor must keep Time");
    assert(ed.indexOf('sch-daysrow') !== -1 && ed.indexOf('data-dow="0"') !== -1, "(a) the editor must keep the Repeat day pills");
    assert(ed.indexOf('data-a="tplrepeat"') === -1, "(a) the Every/Custom segment must be gone (all 7 pills lit = every day)");
    assert(ed.indexOf('data-a="schdel"') !== -1, "(a) the editor must keep Delete");
    assert(ed.indexOf("sch-durslider") === -1, "(a) the duration slider must be gone");
    assert(ed.indexOf('data-a="edurpreset"') === -1, "(a) the duration presets must be gone");
    assert(ed.indexOf('data-a="itembell"') === -1, "(a) the per-item bell must be gone");
    assert(ed.indexOf('data-a="showtoggle"') === -1, "(a) the stats toggle must be gone from the editor");

    // (b) the deleted globals are absent from every view.
    var all = rSchedule() + rOverview() + rTemplate() + rPrefs();
    ['data-a="cardstyle"', 'data-a="showtoggle"'].forEach(function(sel) {
      assert(all.indexOf(sel) === -1, "(b) " + sel + " must be gone");
    });

    // (c) the deleted functions no longer exist.
    ["renderSetupBlock", "renderStylePopover", "tourMark", "aiTourMark", "renderTourBackdrop"].forEach(function(fn) {
      assert(typeof window[fn] === "undefined", "(c) " + fn + " must be gone");
    });

    console.log("CUTCHECK PASS");
  } catch(e) {
    console.log("CUTCHECK FAIL: " + e.message);
  } finally { cDate = savedDate; cData = savedData; }
}
_cutSelfCheck();

// ---- self-check (run with the page open at #statscheck) ----
function _statsSelfCheck() {
  if (location.hash !== "#statscheck") return;
  var savedFlag = localStorage.getItem(CARDS_STATS_KEY);
  var savedStore = localStorage.getItem(CARD_ITEMS_KEY);
  var savedOv = ovStatsEdit;
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  try {
    // (a) tracking starts OFF: a brand-new item is NOT tracked until the user turns it on in the
    // Overview picker (image-5 decision — default off + first-visit nudge).
    var store = getCardItemsStore();
    store.__sc__ = [];
    saveCardItemsStore(store);
    addCardItem("__sc__", "__probe__");
    assert(getItemShow("__sc__", "__probe__") === false, "(a) a new item must default to NOT tracked");

    // (b) a card with nothing tracked still renders a slide carrying the pencil affordance (the
    // early-return trap made the card vanish, which took away the only way back in).
    var fakeCard = { id:"__sc__", name:"Probe", icon:"fa-star", color:"#C9943E", items:[{ n:"__off__" }] };
    var slides = renderCardConsistencySlides([{ key:"2000-01-01" }], [fakeCard], { __sc__:{} });
    assert(slides.length === 1, "(b) a card with nothing tracked must still render one slide");
    assert(slides[0].indexOf('data-a="ovstatsedit"') !== -1, "(b) the slide must carry the pencil affordance");
    assert(slides[0].indexOf('data-a="ovstatstoggle"') === -1, "(b) the picker is a modal now, not inline in the slide");

    // (c) the picker MODAL (opened on a REAL card — the only way in practice — so it reads from
    // getCards()) lists the card's items and setItemShow round-trips. Uses the guaranteed base
    // "habits" card so it never trips the 5-card cap.
    var savedOv2 = ovStatsEdit;
    addCardItem("habits", "__mi__");
    ovStatsEdit = "habits";
    var modal = renderOvStatsModal();
    ovStatsEdit = savedOv2;
    assert(modal.indexOf('data-a="ovstatstoggle"') !== -1, "(c) the modal must render a toggle row");
    assert(modal.indexOf('data-a="ovstatsclose"') !== -1, "(c) the modal must have a close control");
    setItemShow("habits", "__mi__", true);
    assert(getItemShow("habits", "__mi__") === true, "(c) setItemShow must round-trip");
    removeCardItem("habits", "__mi__");

    console.log("STATSCHECK PASS");
  } catch(e) {
    console.log("STATSCHECK FAIL: " + e.message);
  } finally {
    ovStatsEdit = savedOv;
    if (savedStore === null) localStorage.removeItem(CARD_ITEMS_KEY); else localStorage.setItem(CARD_ITEMS_KEY, savedStore);
    if (savedFlag === null) localStorage.removeItem(CARDS_STATS_KEY); else localStorage.setItem(CARDS_STATS_KEY, savedFlag);
  }
}
_statsSelfCheck();

// ---- self-check (run with the page open at #slopcheck) ----
// Offline and text-only, so it stays cheap to keep green.
function _slopSelfCheck() {
  if (location.hash !== "#slopcheck") return;
  var savedDate = cDate, savedData = cData, savedTab = importTab;
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  try {
    cDate = new Date(2000, 0, 1);
    cData = gDay(dk(cDate));

    // (a) no em-dash or en-dash in any rendered view. The parser placeholder is stripped first:
    // it carries deliberate en-dash time ranges as an INPUT example, and TIME_RANGE_RE matches
    // on them, so rewriting it would break parsing. Same reason importPrompt() and the "See
    // example" block are excluded by construction (neither renders into these four views).
    importTab = "type";
    var views = { Daily:rSchedule(), Overview:rOverview(), Plan:rTemplate(), Settings:rPrefs() };
    Object.keys(views).forEach(function(k) {
      var html = views[k].replace(/placeholder="[^"]*"/g, "");
      assert(html.indexOf("—") === -1, "(a) " + k + " still contains an em-dash");
      assert(html.indexOf("–") === -1, "(a) " + k + " still contains an en-dash");
    });

    // (b) no emoji in any rendered view.
    Object.keys(views).forEach(function(k) {
      ["🔥", "⚠", "🕐", "✕"].forEach(function(ch) {
        assert(views[k].indexOf(ch) === -1, "(b) " + k + " still contains an emoji");
      });
    });

    // (c) the AI tab renders the service buttons and one instruction line, not the step list.
    importTab = "ai";
    var ai = renderImportPanel();
    AI_SERVICES.forEach(function(svc) {
      assert(ai.indexOf('data-a="aiopen" data-svc="' + svc.id + '"') !== -1, "(c) the " + svc.label + " button must render");
    });
    var stepHits = IMPORT_GUIDE_STEPS.filter(function(s) { return ai.indexOf(esc(s)) !== -1; }).length;
    assert(stepHits === 0, "(c) the five-step list must not render inline");

    console.log("SLOPCHECK PASS");
  } catch(e) {
    console.log("SLOPCHECK FAIL: " + e.message);
  } finally {
    cDate = savedDate; cData = savedData; importTab = savedTab;
  }
}
_slopSelfCheck();


// ---- self-check (run with the page open at #importtabcheck) ----
function _importTabSelfCheck() {
  if (location.hash !== "#importtabcheck") return;
  var savedTab = importTab;
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  try {
    importTab = "type";
    var typeHtml = renderImportPanel();
    assert(typeHtml.indexOf('id="parse-text"') !== -1, "type tab must render the parser textarea");
    assert(typeHtml.indexOf('id="import-json"') === -1, "type tab must not render the paste box");

    importTab = "ai";
    var aiHtml = renderImportPanel();
    assert(aiHtml.indexOf('id="import-json"') !== -1, "ai tab must render the paste box");
    assert(aiHtml.indexOf('id="parse-text"') === -1, "ai tab must not render the parser textarea");

    // both tab buttons are always present so switching is always possible
    assert(aiHtml.indexOf('data-a="importtab" data-tab="type"') !== -1 && aiHtml.indexOf('data-a="importtab" data-tab="ai"') !== -1, "both tab buttons must always render");

    // The AI tab shows ONE instruction line tied to where the user is, plus the three service
    // buttons. The old five-step wall read as generated; the full list lives in the ? topic.
    var stepHits = IMPORT_GUIDE_STEPS.filter(function(s) { return aiHtml.indexOf(esc(s)) !== -1; }).length;
    assert(stepHits === 0, "the five-step list must not render inline any more, got " + stepHits + " steps");
    assert(AI_STEP_TEXT.some(function(txt) { return aiHtml.indexOf(esc(txt)) !== -1; }), "the AI tab must render one instruction line");
    AI_SERVICES.forEach(function(svc) {
      assert(aiHtml.indexOf('data-a="aiopen" data-svc="' + svc.id + '"') !== -1, "the " + svc.label + " button must render");
    });

    // Both textareas render FROM importDraft/parseText, so a re-render mid-typing silently wiped
    // unsaved input — clicking from the box toward its own button was enough to trigger one.
    // The panel must round-trip whatever is currently in those vars.
    var savedDraft = importDraft, savedParse = parseText;
    try {
      importDraft = '{"version":1,"cards":[]}';
      importTab = "ai";
      assert(renderImportPanel().indexOf(esc(importDraft)) !== -1, "the paste box must re-render with its current text, not blank");
      parseText = "Gym 6:30-7:30am";
      importTab = "type";
      assert(renderImportPanel().indexOf(esc(parseText)) !== -1, "the type-your-day box must re-render with its current text, not blank");
    } finally { importDraft = savedDraft; parseText = savedParse; }

    console.log("IMPORTTABCHECK PASS");
  } catch(e) {
    console.log("IMPORTTABCHECK FAIL: " + e.message);
  } finally {
    importTab = savedTab;
  }
}
_importTabSelfCheck();

// ---- self-check (run with the page open at #importcheck) ----
function _importSelfCheck() {
  if (location.hash !== "#importcheck") return;
  var keys = [CARDS_KEY, CARDS_V1_KEY, CARD_ITEMS_KEY, "ht_d", NOTIF_TIMES_KEY, HTN_DUR_KEY, NOTIF_DAYS_KEY, PRAYERS_ON_KEY, "ht_migrated_v3"];
  var saved = {}; keys.forEach(function(k) { saved[k] = localStorage.getItem(k); });
  var savedDate = cDate, savedData = cData;
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  function restore() { keys.forEach(function(k) { if (saved[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[k]); }); }
  try {
    localStorage.setItem(CARDS_V1_KEY, "true");
    saveCards([{id:"habits",name:"Daily Goals",icon:"fa-bullseye",color:"#e0a33a",base:true}]);
    localStorage.setItem("ht_d", JSON.stringify({habits:[],ex:[],hl:[],prayers:[],water:false}));
    localStorage.removeItem(CARD_ITEMS_KEY); localStorage.removeItem(NOTIF_TIMES_KEY); localStorage.removeItem(HTN_DUR_KEY); localStorage.removeItem(NOTIF_DAYS_KEY);
    setPrayersOn(true);
    var goodText = '{"version":1,"prayers":{"Fajr":{"time":"05:30","duration":30}},"cards":[{"name":"Study","items":[{"name":"CEH","time":"06:30","duration":120,"days":["Sat","Sun","Mon"]}]}]}';
    var parsed = parseImportSchedule(goodText); assert(!!parsed.value, "good payload was rejected");
    var untouched = JSON.stringify([getCardMeta(), getNotifTimesMap(), getDurMap(), getDaysMap()]);
    assert(!!parseImportSchedule("{").error && !!parseImportSchedule('{"version":2,"cards":[]}').error, "bad JSON or shape was accepted");
    assert(untouched === JSON.stringify([getCardMeta(), getNotifTimesMap(), getDurMap(), getDaysMap()]), "invalid payload wrote data");
    var defaults = parseImportSchedule('{"version":1,"cards":[{"name":"Study","items":[{"name":"Only name"}]}]}').value.cards[0].items[0];
    assert(defaults.duration === 30 && defaults.days === null, "missing item defaults are wrong");
    var preview = buildImportPreview(parsed.value); applyImportSchedule(preview, true);
    var study = getCards().filter(function(c) { return c.name === "Study"; })[0], k = study.id + "::CEH";
    assert(getNotifTimesMap()[k] === "06:30" && getDurMap()[k] === 120 && JSON.stringify(getDaysMap()[k]) === JSON.stringify([0,1,6]), "translator did not write card timing keys");
    assert(getNotifTimesMap()[notifKey("prayers","Fajr")] === "05:30" && getDurMap()[notifKey("prayers","Fajr")] === 30, "translator did not write prayer maps");
    var beforeName = getCardMeta().length, mergeData = parseImportSchedule('{"version":1,"cards":[{"name":"Study","items":[{"name":"CEH","time":"09:00","duration":45},{"name":"New item"}]}]}').value, merge = buildImportPreview(mergeData);
    assert(merge.rows.some(function(r) { return r.kind === "item" && r.name === "CEH"; }), "collision by card and item name was missed");
    applyImportSchedule(merge, true); assert(getNotifTimesMap()[k] === "06:30" && templateNamesFor(study.id).indexOf("New item") !== -1 && getCardMeta().length === beforeName, "keep-mine merge was not additive");
    merge = buildImportPreview(mergeData); merge.rows.forEach(function(r) { if (r.kind === "item") r.choice = "import"; }); applyImportSchedule(merge, true);
    assert(getNotifTimesMap()[k] === "09:00" && getDurMap()[k] === 45, "keep-imported did not overwrite collision");
    var unique = buildImportPreview(parseImportSchedule('{"version":1,"cards":[{"name":"Fitness","items":[{"name":"Run"}]},{"name":"Work","items":[{"name":"Deep work"}]}]}').value); applyImportSchedule(unique, true);
    var newCards = getCards().filter(function(c) { return c.name === "Fitness" || c.name === "Work"; });
    assert(newCards.length === 2 && newCards[0].color !== newCards[1].color && newCards[0].icon !== newCards[1].icon && newCards.every(function(c) { return c.color !== "#82a06e"; }), "new cards did not receive unique non-green color/icon assignments");
    var dup = buildImportPreview(parseImportSchedule('{"version":1,"cards":[{"name":"Study","items":[{"name":"Physio","time":"09:00","days":["Sat"]},{"name":"Physio","time":"11:00","days":["Wed"]}]}]}').value);
    assert(dup.rows.filter(function(r){ return r.kind === "newitem"; }).length === 2, "duplicate import item names must both survive as distinct items");

    // ---- 2026-08-13 import fixes ----
    // Reset to a known profile: Daily Goals + a Fitness card holding "Exercise", Asr at 17:35/35m.
    saveCards([{id:"habits",name:"Daily Goals",icon:"fa-bullseye",color:"#e0a33a",base:true}]);
    localStorage.setItem("ht_d", JSON.stringify({habits:[],ex:[],hl:[],prayers:[],water:false}));
    localStorage.removeItem(CARD_ITEMS_KEY); localStorage.removeItem(NOTIF_TIMES_KEY); localStorage.removeItem(HTN_DUR_KEY); localStorage.removeItem(NOTIF_DAYS_KEY);
    var fit = addCard("Fitness"); addCardItem(fit.id, "Exercise");
    setNotifTime("prayers", "Asr", "17:35"); setItemDur("prayers", "Asr", 35);

    // (1) routing: an item sharing a word with an existing card (or its items) goes there even when
    // the payload grouped it under an invented card name; a genuinely unmatched item does not get
    // forced onto a card by the guess.
    assert(guessCardId("Exercise") === fit.id && guessCardId("Fitness class") === fit.id, "routing: an item matching an existing card/item should target that card");
    assert(guessCardId("Physiotherapy") === null, "routing: an unmatched item must NOT be guessed onto a card");
    var routed = buildImportPreview(parseImportSchedule('{"version":1,"cards":[{"name":"Study","items":[{"name":"Exercise","time":"20:00"},{"name":"Physiotherapy","time":"09:00"}]}]}').value);
    function routedRow(n) { return routed.rows.filter(function(r){ return r.incoming.name === n; })[0]; }
    assert(routedRow("Exercise").targetId === fit.id, "routing: Exercise should have been re-routed to the existing Fitness card, not swept into the invented Study card");
    assert(String(routedRow("Physiotherapy").targetId).indexOf("__new_") === 0, "routing: only the item nothing matched should still be creating the payload's own card");
    // the parser side of the same rule: unmatched lines fall back to the chip card (Daily Goals).
    var pRouted = parseScheduleText("Exercise 8-9pm\nPhysiotherapy 1:30-4pm on Sat", "habits");
    assert(pRouted.payload.cards.filter(function(c){ return c.name === "Fitness"; })[0].items[0].name === "Exercise", "routing: the parser must route Exercise to Fitness, not dump the whole day on the chip card");
    assert(pRouted.payload.cards.filter(function(c){ return c.name === "Daily Goals"; })[0].items[0].name === "Physiotherapy", "routing: an unmatched parsed line falls back to the picked chip card");

    // (2) the Card dropdown's override wins over the guess — in the preview AND in what apply writes.
    routed.rows.filter(function(r){ return r.incoming.name === "Exercise"; })[0].incoming._card = "habits";
    var overridden = buildImportPreview(routed.data);
    assert(overridden.rows.filter(function(r){ return r.incoming.name === "Exercise"; })[0].targetId === "habits", "override: the dropdown choice must beat the keyword guess in the preview");
    applyImportSchedule(overridden, true);
    assert(templateNamesFor("habits").indexOf("Exercise") !== -1, "override: apply must honour the row's chosen card, not the guess");

    // (3) prayer split preserves the requested duration: 120m across a 35m Asr -> 50m + 70m.
    setPrayersOn(true);
    var split = parseImportSchedule('{"version":1,"cards":[{"name":"Daily Goals","items":[{"name":"Research","time":"16:45","duration":120}]}]}').value;
    splitAroundPrayers(split);
    var pieces = split.cards[0].items;
    assert(pieces.length === 2 && pieces[0].duration + pieces[1].duration === 120, "split: the two pieces must sum to the requested 120m");
    assert(pieces[0].duration === 50 && pieces[1].time === "18:10" && pieces[1].duration === 70, "split: pieces should be 16:45+50m and 18:10+70m");
    assert(pieces[0].name === "Research" && pieces[1].name === "Research-2", "split: pieces use the -2 dedup style, not invented prose names");
    assert(!!pieces[0].note && !!pieces[1].note, "split: both pieces must carry a note explaining the reshape");
    var again = JSON.stringify(splitAroundPrayers(split).cards[0].items);
    assert(again === JSON.stringify(pieces), "split: re-running must be a no-op (preview rebuilds call it repeatedly)");

    // (4) notes survive parsing at both levels, and their absence still validates.
    var noted = parseImportSchedule('{"version":1,"flow":"morning is deep work","cards":[{"name":"Daily Goals","items":[{"name":"Deep work","time":"09:00","note":"moved 30m later"}]}]}').value;
    assert(noted.notes === "morning is deep work" && noted.cards[0].items[0].note === "moved 30m later", "notes: top-level flow and per-item note must survive parseImportSchedule");
    assert(!!parseImportSchedule('{"version":1,"cards":[{"name":"Daily Goals","items":[{"name":"Plain"}]}]}').value, "notes: a payload with no notes at all must still validate");

    // (5) overlaps are flagged on both rows, and the one-tap shift moves ONLY the tapped one.
    setPrayersOn(false);
    var ov = buildImportPreview(parseImportSchedule('{"version":1,"cards":[{"name":"Daily Goals","items":[{"name":"A","time":"09:00","duration":60},{"name":"B","time":"09:30","duration":60},{"name":"C","time":"14:00","duration":30,"days":["Sat"]},{"name":"D","time":"14:00","duration":30,"days":["Sun"]}]}]}').value);
    function ovRow(n) { return ov.rows.filter(function(r){ return r.incoming.name === n; })[0]; }
    assert(ovRow("A").overlap && ovRow("B").overlap, "overlap: two intersecting rows must both be flagged");
    assert(!ovRow("C").overlap && !ovRow("D").overlap, "overlap: same clock time on disjoint days is not an overlap");
    var bTime = ovRow("B").incoming.time;
    assert(shiftRowToFreeSlot(ov, ov.rows.indexOf(ovRow("B"))), "overlap: the one-tap shift should have moved B");
    assert(ovRow("B").incoming.time === "10:00" && ovRow("A").incoming.time === "09:00" && bTime === "09:30", "overlap: shift moves only the tapped row, to the end of what it collided with");
    assert(/moved/.test(ovRow("B").incoming.note), "overlap: a shifted row must report the move as a note");
    setPrayersOn(true);
    console.log("IMPORTCHECK PASS");
  } catch(e) { console.log("IMPORTCHECK FAIL: " + e.message); }
  finally { restore(); cDate = savedDate; cData = savedData; }
}
_importSelfCheck();

// ---- self-check (run with the page open at #peharcheck) ----
function _peharSelfCheck() {
  if (location.hash !== "#peharcheck") return;
  var savedDate = cDate, savedData = cData, todayKey = "2000-01-05", yesterdayKey = "2000-01-04";
  var savedToday = localStorage.getItem("ht_" + todayKey), savedYesterday = localStorage.getItem("ht_" + yesterdayKey);
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  try {
    var fixture = insertOpenBlocks([{ id:"habits", name:"__pc_a__", start:480, end:510 }, { id:"habits", name:"__pc_b__", start:540, end:570 }]);
    assert(timelineNowItem(fixture, 485).name === "__pc_a__", "NOW did not land on the timed block");
    assert(timelineNowItem(fixture, 520).openBlock === true, "NOW did not land on the Free time gap");

    var flash = document.createElement("div"); flash.className = "sch-block"; flash.classList.add("sch-flash");
    assert(flash.classList.contains("sch-flash") && document.querySelector("style").textContent.indexOf("schFlashPulse") !== -1, "gototimeline flash does not carry the matching pulse class/keyframe");

    cDate = new Date(2000, 0, 5); cData = gDay(todayKey);
    addOnedayItem(cData, "habits", "__pc_gap__", "10:30", 30);
    assert(cData.onedayTimes["habits::__pc_gap__"] === "10:30" && cData.onedayDur["habits::__pc_gap__"] === 30, "quick-add did not write the default habits one-day map");

    var overlaps = buildTimeline([{ id:"habits", color:"#000", icon:"fa-circle", name:"Daily Goals" }], { prayers:{}, habits:{ __pc_overlap_a__:false, __pc_overlap_b__:false }, cards:{}, onedayTimes:{ "habits::__pc_overlap_a__":"09:00", "habits::__pc_overlap_b__":"09:15" }, onedayDur:{ "habits::__pc_overlap_a__":30, "habits::__pc_overlap_b__":30 } }, 3);
    var ovByName = {}; overlaps.forEach(function(x){ ovByName[x.name] = x; });
    assert(ovByName["__pc_overlap_a__"] && ovByName["__pc_overlap_a__"].overlap && ovByName["__pc_overlap_b__"] && ovByName["__pc_overlap_b__"].overlap, "overlap detection did not flag both items");
    assert(rSchedule.toString().indexOf("Free time") !== -1 && rSchedule.toString().indexOf("Open block") === -1, "Free time copy is missing or the old gap label remains");

    var yesterday = gDay(yesterdayKey); addOnedayItem(yesterday, "habits", "__pc_copy__", "11:00", 45); localStorage.setItem("ht_" + yesterdayKey, JSON.stringify(yesterday));
    cDate = new Date(2000, 0, 5); cData = gDay(todayKey);
    var once = copyYesterdayOneday(cData, todayKey), twice = copyYesterdayOneday(cData, todayKey);
    assert(once === 1 && twice === 0 && cData.onedayTimes["habits::__pc_copy__"] === "11:00", "copy yesterday did not add once and skip duplicates");
    console.log("PEHARCHECK PASS");
  } catch(e) {
    console.log("PEHARCHECK FAIL: " + e.message);
  } finally {
    if (savedToday === null) localStorage.removeItem("ht_" + todayKey); else localStorage.setItem("ht_" + todayKey, savedToday);
    if (savedYesterday === null) localStorage.removeItem("ht_" + yesterdayKey); else localStorage.setItem("ht_" + yesterdayKey, savedYesterday);
    cDate = savedDate; cData = savedData;
  }
}
_peharSelfCheck();

// ---- self-check (run with the page open at #notifcheck) ----
function _notifSelfCheck() {
  if (location.hash !== "#notifcheck") return;
  var keys = [ITEM_BELL_KEY, PRAYER_BELL_KEY, NOTIF_TIMES_KEY, HTN_DUR_KEY, PRAYERS_ON_KEY, CARDS_KEY, CARDS_V1_KEY, CARD_ITEMS_KEY];
  var saved = {}; keys.forEach(function(k) { saved[k] = localStorage.getItem(k); });
  var savedPush = pushSaveReminderTime, calls = [];
  // Spy — records every call instead of touching Supabase, so this stays entirely offline (same
  // reasoning #setupcheck/#importcheck already document for their own raw-map staging above).
  pushSaveReminderTime = function(field, name, time) { calls.push({ field:field, name:name, time:time }); };
  var savedPermDesc = Object.getOwnPropertyDescriptor(Notification, "permission");
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  function lastCall() { return calls[calls.length - 1]; }
  try {
    localStorage.setItem(CARDS_V1_KEY, "true");
    saveCards([{id:"habits",name:"Daily Goals",icon:"fa-bullseye",color:"#e0a33a",base:true}]);
    localStorage.removeItem(CARD_ITEMS_KEY); localStorage.removeItem(NOTIF_TIMES_KEY); localStorage.removeItem(HTN_DUR_KEY); localStorage.removeItem(ITEM_BELL_KEY);
    setPrayersOn(true);

    // (a) bell-on for a timed non-prayer item writes the reminder row; bell-off clears it.
    setNotifTime("habits", "__nc_item__", "07:00");
    setItemBell("habits", "__nc_item__", true);
    syncItemReminder("habits", "__nc_item__");
    assert(lastCall().field === "habits" && lastCall().name === "__nc_item__" && lastCall().time === "07:00", "(a) bell-on did not write the reminder row for a timed item");
    setItemBell("habits", "__nc_item__", false);
    syncItemReminder("habits", "__nc_item__");
    assert(lastCall().time === "", "(a) bell-off did not clear the reminder row");

    // (b) clearing the time (bell still on) also clears the row.
    setItemBell("habits", "__nc_item__", true);
    setNotifTime("habits", "__nc_item__", "");
    syncItemReminder("habits", "__nc_item__");
    assert(lastCall().time === "", "(b) clearing the time did not clear the reminder row");

    // (c) deleting an item clears the row (removeCardItem's own setNotifTime(...,"") call,
    // unconditional since before this feature) and drops its stale bell flag. removeCardItem
    // requires the item to actually exist in the card's template array (returns false, no-op,
    // otherwise) so add it for real first, same as the app does before anyone gets to delete it.
    addCardItem("habits", "__nc_del__");
    setNotifTime("habits", "__nc_del__", "08:00"); setItemBell("habits", "__nc_del__", true);
    calls.length = 0;
    removeCardItem("habits", "__nc_del__");
    assert(calls.some(function(c) { return c.field === "habits" && c.name === "__nc_del__" && c.time === ""; }), "(c) deleting a bell-on item did not clear its reminder row");
    assert(getItemBell("habits", "__nc_del__") === false, "(c) deleting an item left its bell flag set");

    // (d) the per-item bell UI is gone: a timed non-prayer item reminds automatically. The editor
    // must render no bell at all, and the flag is driven by whether a time is set (see the
    // .sch-timeinp change handler, which is what the UI now calls in the bell's place).
    setNotifTime("habits", "__nc_edit__", "");
    assert(itemEditorHTML("habits", "__nc_edit__", "schedit").indexOf('data-a="itembell"') === -1, "(d) an untimed item must not render a bell");
    setNotifTime("habits", "__nc_edit__", "09:15");
    assert(itemEditorHTML("habits", "__nc_edit__", "schedit").indexOf('data-a="itembell"') === -1, "(d) a timed item must not render a bell either, reminders are automatic now");
    // the auto-on/auto-off contract the change handler implements
    setItemBell("habits", "__nc_edit__", !!"09:15");
    assert(getItemBell("habits", "__nc_edit__") === true, "(d) setting a time must turn the reminder on");
    setItemBell("habits", "__nc_edit__", !!"");
    assert(getItemBell("habits", "__nc_edit__") === false, "(d) clearing a time must turn the reminder off");

    // (e) prayers still work through the same generic path (syncPrayerReminder is now a
    // thin alias for syncItemReminder("prayers", name), storage untouched).
    setNotifTime("prayers", "Fajr", "05:20");
    var pb = getPrayerBells(); pb.Fajr = true; savePrayerBells(pb);
    syncPrayerReminder("Fajr");
    assert(lastCall().field === "prayers" && lastCall().name === "Fajr" && lastCall().time === "05:20", "(e) prayer bell-on did not write the reminder row");
    pb = getPrayerBells(); pb.Fajr = false; savePrayerBells(pb);
    syncPrayerReminder("Fajr");
    assert(lastCall().time === "", "(e) prayer bell-off did not clear the reminder row");

    // (f) turning prayers off must clear every prayer's reminder row even if its bell was on
    // (htn_times itself is deliberately left set, same as before this feature).
    pb = getPrayerBells(); pb.Dhuhr = true; savePrayerBells(pb);
    setNotifTime("prayers", "Dhuhr", "13:10");
    calls.length = 0;
    var wasOn = prayersOn(); setPrayersOn(false);
    PRAYERS.forEach(function(pn) { if (wasOn) pushSaveReminderTime("prayers", pn, ""); else syncPrayerReminder(pn); });
    assert(calls.some(function(c) { return c.field === "prayers" && c.name === "Dhuhr" && c.time === ""; }), "(f) prayers-off did not clear a bell-on prayer's reminder row");
    setPrayersOn(wasOn);

    // (g) permission gate: an already-denied permission resolves to false without prompting.
    Object.defineProperty(Notification, "permission", { value:"denied", configurable:true });
    var gateResult = null;
    ensureBellPermission(function(ok) { gateResult = ok; });
    assert(gateResult === false, "(g) an already-denied permission must resolve the gate to false");

    // (h) import fold notice: a group past the 5-card cap increments preview.folded; a group
    // matching an existing card name never counts, even once the cap is hit.
    saveCards([
      {id:"habits",name:"Daily Goals",icon:"fa-bullseye",color:"#e0a33a",base:true},
      {id:"c1",name:"A",icon:"fa-star",color:"#e07a3a"},{id:"c2",name:"B",icon:"fa-star",color:"#e05a6f"},
      {id:"c3",name:"C",icon:"fa-star",color:"#d64f8f"},{id:"c4",name:"D",icon:"fa-star",color:"#7a6ce0"}
    ]);
    var foldPreview = buildImportPreview({ version:1, cards:[{ name:"E", items:[{ name:"Overflow item" }] }] });
    assert(foldPreview.folded === 1, "(h) a group past the 5-card cap must count as folded");
    var noFoldPreview = buildImportPreview({ version:1, cards:[{ name:"A", items:[{ name:"Existing-name match" }] }] });
    assert(noFoldPreview.folded === 0, "(h) a group matching an existing card name must not count as folded");

    console.log("NOTIFCHECK PASS");
  } catch(e) {
    console.log("NOTIFCHECK FAIL: " + e.message);
  } finally {
    pushSaveReminderTime = savedPush;
    if (savedPermDesc) Object.defineProperty(Notification, "permission", savedPermDesc);
    keys.forEach(function(k) { if (saved[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[k]); });
  }
}
_notifSelfCheck();

// ---- self-check (run with the page open at #parsecheck) ----
function _parseSelfCheck() {
  if (location.hash !== "#parsecheck") return;
  var keys = [PHRASE_LEARNED_KEY, NOTIF_TIMES_KEY, PRAYERS_ON_KEY];
  var saved = {}; keys.forEach(function(k) { saved[k] = localStorage.getItem(k); });
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  try {
    localStorage.removeItem(PHRASE_LEARNED_KEY);
    setPrayersOn(true);
    setNotifTime("prayers", "Fajr", "05:30");

    // (a) sample lines -> correct name/start/duration/days.
    var gym = parseOneLine("Gym 6:30–7:30am");
    assert(gym.name === "Gym" && gym.time === "06:30" && gym.duration === 60 && gym.days === undefined, "(a) explicit am/pm range did not resolve name/start/duration");
    var meeting = parseOneLine("Team meeting Mon/Wed 10–11am");
    assert(meeting.name === "Team meeting" && meeting.time === "10:00" && meeting.duration === 60 && JSON.stringify(meeting.days) === JSON.stringify(["Mon", "Wed"]), "(a) day-scoped range did not resolve name/days");
    var physio = parseOneLine("Physiotherapy 1:30–4pm on Sat");
    assert(physio.name === "Physiotherapy" && physio.time === "13:30" && physio.duration === 150 && JSON.stringify(physio.days) === JSON.stringify(["Sat"]), "(a) mixed 24h-start/pm-end range with a day did not resolve correctly");

    // (b) am/pm back-fill: end's meridiem back-fills a bare start (11-1pm -> 11:00, 120min).
    var backfill = parseOneLine("Deep work 11-1pm");
    assert(backfill.time === "11:00" && backfill.duration === 120, "(b) am/pm back-fill did not produce 11:00/120");

    // (c) prayer-anchored line uses the user's own set Fajr time (+5 for "after").
    var anchored = parseOneLine("Quiet time after Fajr");
    assert(anchored.name === "Quiet time" && anchored.time === "05:35" && anchored.duration === 30, "(c) prayer-anchored phrase did not use the set Fajr time");

    // (d) a learned phrase overrides the built-in dictionary for the same line.
    var beforeLearn = parseOneLine("Yoga morning");
    assert(beforeLearn.time === "08:00", "(d) setup sanity: built-in 'morning' dictionary word should resolve to 08:00 before learning");
    setLearnedPhrase("yoga morning", "06:45", 45);
    var afterLearn = parseOneLine("Yoga morning");
    assert(afterLearn.time === "06:45" && afterLearn.duration === 45, "(d) a learned phrase did not override the built-in dictionary");
    forgetPhrase("yoga morning");
    assert(getLearnedPhrase("yoga morning") === null, "(d) forgetPhrase did not remove the learned entry");
    setLearnedPhrase("yoga morning", "06:45", 45); // re-add so the integration parse below also covers it

    // (b2) midnight wrap — two explicit meridiems can only mean the range crossed midnight, so the
    // duration is measured across it (this used to read 11:45pm–12am as 30m).
    var wrapShort = parseOneLine("Surah Mulk 11:45pm-12am");
    assert(wrapShort.time === "23:45" && wrapShort.duration === 15, "(b2) 11:45pm-12am must be 15m, not 30m");
    var wrapLong = parseOneLine("Night shift 11pm-1am");
    assert(wrapLong.time === "23:00" && wrapLong.duration === 120, "(b2) 11pm-1am must be 120m");
    var pmOpen = parseOneLine("Study 6:30pm-8");
    assert(pmOpen.time === "18:30" && pmOpen.duration === 90, "(b2) an ambiguous end still gets the 12h nudge, not a whole day");

    // (e) a truly vague line (no time, no phrase, no day) lands in `unread`, never silently dropped.
    assert(parseOneLine("Something someday maybe") === null, "(e) a vague line with no resolvable time should return null (unread)");

    // (f) full parseScheduleText + integration: readable lines produce a payload that passes
    // parseImportSchedule cleanly (same validation/dedup the AI-JSON path reuses); the vague line
    // surfaces in `unread` instead of being dropped.
    var sample = "Gym 6:30–7:30am\nTeam meeting Mon/Wed 10–11am\nSomething someday maybe\nYoga morning";
    var result = parseScheduleText(sample, "habits");
    assert(result.unread.length === 1 && result.unread[0].text === "Something someday maybe", "(f) the vague line did not surface in `unread`");
    // items may now be spread over several cards (Fix 1 routing), so count across the payload.
    function allItems(payload) { return payload.cards.reduce(function(acc, c) { return acc.concat(c.items); }, []); }
    assert(allItems(result.payload).length === 3, "(f) all three readable lines should have produced items");
    var validated = parseImportSchedule(JSON.stringify(result.payload));
    assert(!!validated.value && allItems(validated.value).length === 3, "(f) the parsed payload did not pass parseImportSchedule cleanly");
    var yogaItem = allItems(validated.value).filter(function(it) { return it.name === "Yoga morning"; })[0];
    assert(!!yogaItem && yogaItem.time === "06:45" && yogaItem.duration === 45, "(f) the learned phrase's time/duration did not survive the parseImportSchedule round trip");

    // (g) day forms that used to leak into the name: space-separated lists and the
    // weekdays/weekends/daily keywords must scope the item and leave a clean name.
    var spaced = parseOneLine("Run 6am Sat Sun");
    assert(spaced.name === "Run" && JSON.stringify(spaced.days) === JSON.stringify(["Sun", "Sat"]), "(g) space-separated days did not parse (name/days)");
    var multi = parseOneLine("Gym 7am Mon Wed Fri");
    assert(multi.name === "Gym" && JSON.stringify(multi.days) === JSON.stringify(["Mon", "Wed", "Fri"]), "(g) three space-separated days did not parse");
    var wd = parseOneLine("Deep work 10-12 weekdays");
    assert(wd.name === "Deep work" && JSON.stringify(wd.days) === JSON.stringify(["Mon", "Tue", "Wed", "Thu", "Fri"]), "(g) 'weekdays' did not expand to Mon-Fri");
    var we = parseOneLine("Hike 9am weekends");
    assert(we.name === "Hike" && JSON.stringify(we.days) === JSON.stringify(["Sun", "Sat"]), "(g) 'weekends' did not expand to Sat/Sun");
    var dal = parseOneLine("Standup 9am daily");
    assert(dal.name === "Standup" && dal.days === undefined, "(g) 'daily' did not strip to a clean name with no day scope");
    var evd = parseOneLine("Quran 5am every day");
    assert(evd.name === "Quran" && evd.days === undefined, "(g) 'every day' did not strip to a clean name with no day scope");

    // (h) AI paste path: a fenced/prose-wrapped reply (the common real output) must parse.
    var wrapped = "Here is your plan:\n```json\n{\"version\":1,\"cards\":[{\"name\":\"Daily Goals\",\"items\":[{\"name\":\"Gym\",\"time\":\"06:30\"}]}]}\n```\nEnjoy!";
    var unfenced = parseImportSchedule(wrapped);
    assert(!!unfenced.value && unfenced.value.cards[0].items[0].name === "Gym", "(h) a fenced+prose AI reply was rejected");

    console.log("PARSECHECK PASS");
  } catch(e) { console.log("PARSECHECK FAIL: " + e.message); }
  finally { keys.forEach(function(k) { if (saved[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, saved[k]); }); }
}
_parseSelfCheck();

// ---- self-check (run with the page open at #helpcheck) ----
function _helpSelfCheck() {
  if (location.hash !== "#helpcheck") return;
  var savedTopic = helpTopic;
  function assert(ok, reason) { if (!ok) throw new Error(reason); }
  try {
    // (a) only the two flows the UI genuinely cannot explain itself keep a ? button.
    var keys = Object.keys(HELP_TOPICS).sort();
    assert(keys.length === 2 && keys[0] === "import" && keys[1] === "prayers", "only the import and prayers topics may survive, got " + keys.join(","));
    keys.forEach(function(k) {
      assert(!!HELP_TOPICS[k].title, k + " is missing a title");
      assert(Array.isArray(HELP_TOPICS[k].steps) && HELP_TOPICS[k].steps.length > 0, k + " has no steps");
    });

    // (b) the overlay still opens, closes, and no longer offers to replay a tour that is gone.
    helpTopic = "prayers";
    var sheet = renderHelpOverlay();
    assert(sheet.indexOf(esc(HELP_TOPICS.prayers.title)) !== -1, "the overlay must render the selected topic's title");
    assert(sheet.indexOf('data-a="helpclose"') !== -1, "the overlay is missing a close control");
    assert(sheet.indexOf('data-a="tourstart"') === -1, "the replay-tour link must be gone");
    helpTopic = null;
    assert(renderHelpOverlay() === "", "the overlay must render nothing when helpTopic is null");

    // (c) the tour engine is gone entirely, not merely unreferenced.
    ["tourMark", "aiTourMark", "renderTourBackdrop", "advanceAiTour", "coachTip", "tourHi"].forEach(function(fn) {
      assert(typeof window[fn] === "undefined", "(c) " + fn + " must be gone");
    });

    console.log("HELPCHECK PASS");
  } catch(e) {
    console.log("HELPCHECK FAIL: " + e.message);
  } finally { helpTopic = savedTopic; }
}
_helpSelfCheck();

if (window.schPeharTick) clearInterval(window.schPeharTick);
window.schPeharTick = setInterval(function() {
  if (view === "daily" && isT(cDate) && !shouldShowOnboarding()) render();
}, 60000);

render();
