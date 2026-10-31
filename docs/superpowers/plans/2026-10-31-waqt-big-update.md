# Waqt Big Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ship Waqt tab shell, slots, Pehar declutter, calculators, reminders, widgets, sync.

**Architecture:** `js/waqt.js` overrides the legacy `app.js` `render()` with a dispatcher (waqt.js:1888) that maps `view` → a render fn: `daily`→`rSchedule()`, `overview`→`rOverview()`, `settings`→`rTemplate()`, `prefs`→`rPrefs()`. The live "Today" screen is `rSchedule()`, which also renders the Pehar rail inline (the `if(peharOn()){…}` block, ~waqt.js:2331). This update splits that rail into its own `pehar` view, replaces the top `renderNav()` segment tabs with a bottom tab bar, adds item slots/flags, day-object occurrence/priority/reminder state, and extends the existing template/day LWW sync to carry the new fields. **Each task MUST read the real function body before editing — line numbers drift.**

**Tech Stack:** Vanilla JS/CSS PWA, Supabase, Deno, Scriptable.

**Spec:** docs/superpowers/specs/2026-10-31-waqt-big-update-design.md

## Global Constraints

- branch-only never main (branch redesign).
- keep live palette exactly: --bg:#0C0C0C; surfaces #131313/#1A1A1A; lines #2A2725; text #E8E2D9; muted #7A756E; gold --ac:#C9943E, hover #DBA84E, tint rgba(201,148,62,.12); ok #4A8C5C; danger #B84C4C; prayer/sage #7B9E6B; weight/blue #5A8FA8; health/copper #B87333; Pehar dots dawn #5A8FA8, noon #C9943E, afternoon #DBA84E, dusk #B87333, night #7B9E6B.
- no emoji in UI/widgets.
- vanilla JS only, no new deps/framework.
- commit frequently.
- co-author trailer Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>.

## Review Focus

- Legacy time/days item appears once: Task 2 #slotscheck.
- Out-of-day slot creates no occurrence: Task 2 #slotscheck.
- Optional miss changes no denominator/streak/grid: Task 4 #calculatorscheck.
- Completed priority item does not carry: Task 5 #prioritycheck.
- Interval reminder re-arms from completion date: Task 6 #reminderscheck.

---

## Phase 1 — Shell

### Task 1: Split Pehar into its own view + bottom tab bar

**Reality (read first):** The live render dispatcher is in `js/waqt.js` at ~1888 (`render = function(){ … if(view==="daily") h=rSchedule(); else if(view==="settings") h=rTemplate(); else if(view==="overview") h=rOverview(); else if(view==="prefs") h=rPrefs(); … content.innerHTML = h + renderHelpOverlay()+renderOvStatsModal(); }`). `rSchedule()` (~2241) renders the Today screen AND the Pehar rail inline — the rail is the `if (peharOn()) { … }` block starting ~2331 (`sch-peharhead` + `sch-rail`). The top segment tabs are `renderNav(active)` (~1372), called inside `rSchedule`/`rTemplate`/`rPrefs`/`rOverview`. View names are `daily|overview|settings|prefs` — do NOT rename them; add `pehar`.

**Files:**
- Modify: js/waqt.js — dispatcher ~1888 (add `pehar` branch + append bottom bar), `rSchedule()` ~2241 (extract rail), remove `renderNav(...)` calls in rSchedule/rTemplate/rPrefs/rOverview (~2290, 1560, 1575, 1838), event delegator (add `tab` action).
- Modify: css/waqt.css (add `.waqt-tabs`).

**Interfaces:**
- Consumes: `rSchedule()`, `rOverview()`, `rTemplate()`, `rPrefs()`, `peharOn()`, `buildTimeline`, `insertOpenBlocks`, `getCards`, `dowOf`, `renderHelpOverlay`, `renderOvStatsModal` (all existing).
- Produces: `rPehar(): string` (the extracted rail, standalone); `renderTabBar(active: string): string`; new view value `"pehar"`.

- [ ] **Step 1: Write failing self-check**

~~~js
(function(){if(location.hash!=="#shellcheck")return;
console.assert(typeof rPehar==="function" && rPehar().indexOf("sch-rail")!==-1,"rPehar renders rail");
console.assert(rSchedule().indexOf("sch-rail")===-1,"rail left the Today view");
var bar=renderTabBar("pehar");
console.assert(bar.indexOf('data-tab="pehar"')!==-1 && bar.indexOf('class="waqt-tab on"')!==-1,"active pehar tab");
console.assert(bar.indexOf("fa-")===-1 && bar.indexOf("<svg")!==-1,"inline SVG icons, no FontAwesome/emoji");
console.assert(rSchedule().indexOf("renderNav(")===-1 && rSchedule().indexOf('data-a="vov"')===-1,"top segment nav removed");
console.log("shell self-check complete");})();
~~~

- [ ] **Step 2: Run and verify fail**

Run: `python3 -m http.server 5177` then open `http://localhost:5177/index.html#shellcheck`. Expected: `rPehar is not defined`.

- [ ] **Step 3: Extract rPehar, add bottom bar, wire the dispatcher**

Extract the `if (peharOn()) { … }` rail block from `rSchedule()` into a standalone `rPehar()` (return `'<div class="sch-view">'+railHtml+'</div>'`; remove the pehar-gating `if` so the Pehar tab always shows the rail, keeping the "Nothing scheduled yet" empty state). In `rSchedule()` delete that block and the `renderNav("daily")` call. Remove the `renderNav(...)` calls from `rTemplate`/`rPrefs`/`rOverview` too.

~~~js
// add the new view to the dispatcher (~waqt.js:1888)
if (view === "daily") h = rSchedule();
else if (view === "pehar") h = rPehar();
else if (view === "settings") h = rTemplate();
else if (view === "overview") h = rOverview();
else if (view === "prefs") h = rPrefs();
else { originalRender(); return; }
document.getElementById("content").innerHTML = h + renderTabBar(view) + renderHelpOverlay() + renderOvStatsModal();

// bottom tab bar — maps the 5 spec tabs to the real view names; inline-SVG line icons, NO emoji
function renderTabBar(active){
  var tabs=[
    ["overview","Overview","M4 6h6v6H4zM14 6h6v6h-6zM4 16h6v4H4zM14 16h6v4h-6z"],
    ["daily","Today","M5 5h14v14H5z M9 12l2 2 4-4"],
    ["pehar","Pehar","M12 4v8l5 3 M12 21a9 9 0 1 1 0-18"],
    ["settings","Template","M4 5h16M4 10h16M4 15h10"],
    ["prefs","Settings","M12 9a3 3 0 1 0 0 6 M12 3v2M12 19v2M5 12H3M21 12h-2"]];
  return '<nav class="waqt-tabs" aria-label="Main navigation">'+tabs.map(function(x){
    return '<button type="button" class="waqt-tab'+(active===x[0]?" on":"")+'" data-a="tab" data-tab="'+x[0]+'">'
      +'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+x[2]+'"/></svg><span>'+x[1]+'</span></button>';
  }).join("")+'</nav>';
}

// event delegator (add alongside the other data-a handlers)
if(a==="tab"){ view=t.dataset.tab; render(); if(view==="pehar"){var n=document.querySelector(".sch-rail .now");if(n)n.scrollIntoView({block:"center"});} return; }
~~~

~~~css
.waqt-tabs{position:sticky;bottom:12px;z-index:30;display:flex;justify-content:space-around;gap:4px;margin:18px auto 8px;padding:6px;max-width:540px;background:var(--cd);border:1px solid var(--line);border-radius:22px}
.waqt-tab{min-width:56px;padding:7px 5px;display:flex;flex-direction:column;align-items:center;gap:3px;color:var(--smut);background:transparent;border:0;border-radius:16px;cursor:pointer;font:600 10px/1 "Space Grotesk",sans-serif}
.waqt-tab svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.waqt-tab.on{color:var(--stext);background:var(--acd)}
~~~

- [ ] **Step 4: Run and verify pass**

Run: open `http://localhost:5177/index.html#shellcheck`. Expected: `shell self-check complete`; five tabs render at the bottom with line icons, Today no longer shows the rail, Pehar tab shows it, no top segment tabs anywhere.

- [ ] **Step 5: Commit**

~~~bash
git add js/waqt.js css/waqt.css
git commit -m "feat: add Waqt bottom tab shell" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
~~~

## Phase 2 — Slots core

### Task 2: Item slots, migration, occurrence timeline, AI and editor

**Reality (read first):** `getCards()` returns card metadata; a card's items for a given day come from `dayItemsForCard(card, cData, dow)` (used in `rSchedule`), not `card.items`. The real `buildTimeline(cards, day, dow)` already walks cards → day items; extend its per-item loop to expand `slotsForDay(item,dow)` into one occurrence each, rather than replacing the whole function with the illustrative body below. Current single-time scheduling lives in `htn_*` (device-local) + `cData.onedayTimes`/`onedayDur`; the slots field moves the per-item time/days onto the synced item object. Verify `timeToMin`, `effectiveDur`, `dowOf`, `gDef`, `getCardItemsStore` signatures before use.

**Files:**
- Modify: js/waqt.js:1-235, 400-453, 524-564, 693-760, 929-945, 1080-1142, 2016-2098, 2550-2850.

**Interfaces:**
- Produces: itemSlots(item: Object): Array<{time:string,days?:number[]}>; migrateItemSlots(): boolean; occurrenceKey(cardId:string,name:string,time:string):string; slotsForDay(item:Object,dow:number):Array<Object>; schToggleOccurrence(field:string,name:string,time:string):void.

- [ ] **Step 1: Write failing #slotscheck**

~~~js
(function(){if(location.hash!=="#slotscheck")return;
var legacy={n:"CEH",time:"06:25",days:[1,2,3,4,5]};
console.assert(JSON.stringify(itemSlots(legacy))===JSON.stringify([{time:"06:25",days:[1,2,3,4,5]]),"legacy accessor");
console.assert(slotsForDay({slots:[{time:"06:25",days:[1]},{time:"20:00",days:[0,6]}]},1)[0].time==="06:25","day filter");
console.assert(occurrenceKey("habits","CEH","06:25")==="habits::CEH::06:25","key");
console.assert(buildTimeline([{id:"habits",color:"#5A8FA8",items:[{n:"CEH",slots:[{time:"06:25"},{time:"20:00"}]}]}],{habits:{},cards:{}},1).length===2,"expansion");
console.log("slots self-check complete");})();
~~~

- [ ] **Step 2: Run and verify fail**

Run: open index.html#slotscheck. Expected: ReferenceError: itemSlots is not defined.

- [ ] **Step 3: Implement slots and occurrence completion**

~~~js
var SLOTS_MIGRATION_KEY="ht_slots_v1";
function itemSlots(item){if(Array.isArray(item&&item.slots))return item.slots.filter(function(s){return /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time);});return item&&/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time||"")?[{time:item.time,days:item.days}]:[];}
function normalizeItem(item){var x=typeof item==="string"?{n:item,s:false,c:"rings"}:item;x.slots=itemSlots(x);delete x.time;delete x.days;return x;}
function migrateItemSlots(){if(localStorage.getItem(SLOTS_MIGRATION_KEY))return false;var d=gDef(),changed=false;[d.habits,d.ex,d.hl].forEach(function(a){a.forEach(function(it,i){a[i]=normalizeItem(it);changed=true;});});var store=getCardItemsStore();Object.keys(store).forEach(function(id){store[id]=store[id].map(normalizeItem);changed=true;});if(changed){sDef(d);saveCardItemsStore(store);}localStorage.setItem(SLOTS_MIGRATION_KEY,"true");return changed;}
function occurrenceKey(cardId,name,time){return cardId+"::"+name+"::"+time;}
function slotsForDay(item,dow){return itemSlots(item).filter(function(s){return !s.days||s.days.indexOf(dow)!==-1;});}
function schToggleOccurrence(field,name,time){if(!cData.occurrences)cData.occurrences={};var key=occurrenceKey(field,name,time);cData.occurrences[key]=!cData.occurrences[key];sDay();}
function buildTimeline(cards,day,dow){var out=[];cards.forEach(function(card){card.items.forEach(function(it){slotsForDay(it,dow).forEach(function(slot){var start=timeToMin(slot.time),key=occurrenceKey(card.id,it.n,slot.time);out.push({id:card.id,name:it.n,time:slot.time,start:start,end:start+effectiveDur(card.id,it.n,false,day),color:card.color,block:key,done:!!(day.occurrences&&day.occurrences[key]),slot:slot});});});});return out.sort(function(a,b){return a.start-b.start;});}
~~~

~~~js
function importItem(value,prayer){var x=typeof value==="string"?{name:value}:value;if(!x||typeof x.name!=="string"||!x.name.trim())return null;var raw=Array.isArray(x.slots)?x.slots:(x.time?[{time:x.time,days:importDays(x.days)}]:[]);if(raw.some(function(s){return !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time);} ))return null;return {name:x.name.trim(),duration:+x.duration||30,slots:raw.map(function(s){return s.days?{time:s.time,days:importDays(s.days)}:{time:s.time};}),optional:!!x.optional,priority:!!x.priority};}
function importPrompt(){return 'Return JSON. One activity = one item. For several times use slots:[{time,days?}]; never duplicate activity. Set optional:true, priority:true, and reminders when requested.';}
~~~

- [ ] **Step 4: Run and verify pass**

Run: open index.html#slotscheck; import CEH at 6:25am weekdays and 8pm weekends.

Expected: slots self-check complete; editor Add time/repeater has per-slot day pills; each Pehar occurrence independently ticks.

- [ ] **Step 5: Commit**

~~~bash
git add js/waqt.js
git commit -m "feat: add multi-time Pehar slots" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
~~~

## Phase 3 — Declutter

### Task 3: On-Pehar disclosure and pills

**Files:**
- Modify: js/waqt.js:2099-2183, 2669-2678.
- Modify: css/waqt.css:200-300.

**Interfaces:**
- Produces: renderTimedDisclosure(card:Object,dow:number):string; expandedPeharCards: Object<string,boolean>.

- [ ] **Step 1: Write failing self-check**

~~~js
(function(){if(location.hash!=="#decluttercheck")return;var c={id:"habits",color:"#5A8FA8",items:[{n:"CEH",slots:[{time:"06:25"},{time:"20:00"}]}]};var h=renderTimedDisclosure(c,1);console.assert(h.indexOf("ON PEHAR · 2")!==-1,"count");console.assert(h.indexOf("sch-tlink")===-1,"chip wall removed");console.log("declutter self-check complete");})();
~~~

- [ ] **Step 2: Run and verify fail**

Run: open index.html#decluttercheck. Expected: ReferenceError: renderTimedDisclosure is not defined.

- [ ] **Step 3: Implement collapsed line, expanded pills, existing gototimeline action**

~~~js
var expandedPeharCards={};
function renderTimedDisclosure(card,dow){var timed=card.items.filter(function(it){return slotsForDay(it,dow).length;});if(!timed.length)return "";var count=timed.reduce(function(n,it){return n+slotsForDay(it,dow).length;},0);if(!expandedPeharCards[card.id])return '<button class="pehar-disclosure" data-a="pehartoggle" data-c="'+esA(card.id)+'">ON PEHAR · '+count+"</button>";return '<div class="pehar-disclosure open"><button data-a="pehartoggle" data-c="'+esA(card.id)+'">ON PEHAR · '+count+"</button>"+timed.map(function(it){return '<div class="pehar-pill-row" style="--kc:'+esA(card.color)+'"><b>'+esc(it.n)+"</b>"+slotsForDay(it,dow).map(function(s){return '<button data-a="gototimeline" data-block="'+esA(occurrenceKey(card.id,it.n,s.time))+'">'+esc(s.time)+"</button>";}).join("")+"</div>";}).join("")+"</div>";}
if(a==="pehartoggle"){expandedPeharCards[t.dataset.c]=!expandedPeharCards[t.dataset.c];render();return;}
~~~

~~~css
.pehar-disclosure{width:100%;margin-top:10px;padding:8px 0;color:#7A756E;background:none;border:0;border-top:1px solid #2A2725;font:10px "SF Mono",monospace;letter-spacing:.12em;text-align:left}.pehar-pill-row{display:flex;gap:7px;align-items:center;padding:7px 0;border-left:2px solid var(--kc)}.pehar-pill-row b{flex:1;padding-left:8px}.pehar-pill-row button{color:#E8E2D9;background:#1A1A1A;border:1px solid #2A2725;border-radius:999px;padding:3px 7px}
~~~

- [ ] **Step 4: Run and verify pass**

Run: open index.html#decluttercheck. Expected: declutter self-check complete; untimed rows only in cards, tappable time pills flash matching Pehar block.

- [ ] **Step 5: Commit**

~~~bash
git add js/waqt.js css/waqt.css
git commit -m "feat: collapse timed items into Pehar disclosure" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
~~~

## Phase 4 — Calculators

### Task 4: Voluntary exclusion and daily heatmap rule

**Files:**
- Modify: js/waqt.js:1644-1805, 1900-1960, 2016-2045.

**Interfaces:**
- Produces: isDailyRecurring(item:Object):boolean; scoreItems(items:Array):{done:number,total:number}; eligibleHeatmapItem(item:Object):boolean.

- [ ] **Step 1: Write failing self-check**

~~~js
(function(){if(location.hash!=="#calculatorscheck")return;var s=scoreItems([{done:true},{done:false,optional:true}]);console.assert(s.done===1&&s.total===1,"optional excluded");console.assert(isDailyRecurring({slots:[{time:"06:00"}]}),"daily");console.assert(!isDailyRecurring({slots:[{time:"06:00",days:[1]}]}),"weekly");console.log("calculators self-check complete");})();
~~~

- [ ] **Step 2: Run and verify fail**

Run: open index.html#calculatorscheck. Expected: ReferenceError: scoreItems is not defined.

- [ ] **Step 3: Implement pure helpers and use in ratio/streak/heatmap**

~~~js
function isDailyRecurring(item){var slots=itemSlots(item);return slots.length>0&&slots.every(function(s){return !s.days||s.days.length===7;});}
function eligibleHeatmapItem(item){return !item.optional&&isDailyRecurring(item);}
function scoreItems(items){return items.reduce(function(a,it){if(it.optional)return a;a.total++;if(it.done)a.done++;return a;},{done:0,total:0});}
function streakFromDayItems(days){return days.reduce(function(n,items){var s=scoreItems(items);return s.total&&s.done===s.total?n+1:0;},0);}
var scored=scoreItems(row.items.map(function(it){return {done:it.done,optional:it.optional};}));
var heatmapItems=card.items.filter(eligibleHeatmapItem);
if(!heatmapItems.length)return '<div class="ov-count">'+completedCount+" times done</div>";
~~~

- [ ] **Step 4: Run and verify pass**

Run: open index.html#calculatorscheck. Expected: optional completion counts as win; optional miss never penalizes; non-daily items show plain count, never grid.

- [ ] **Step 5: Commit**

~~~bash
git add js/waqt.js
git commit -m "feat: exclude voluntary items from score grids" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
~~~

### Task 5: Priority one-time carry-over and age

**Files:**
- Modify: js/waqt.js:153-186, 2050-2142, 2550-2850.

**Interfaces:**
- Produces: priorityAge(createdOn:string,todayKey:string):number; carryPriorityItems(previous:Object,today:Object,todayKey:string):number; priorityItemsForDay(day:Object,todayKey:string):Array<Object>.

- [ ] **Step 1: Write failing self-check**

~~~js
(function(){if(location.hash!=="#prioritycheck")return;console.assert(priorityAge("2026-10-27","2026-10-31")===4,"age");var y={oneDay:[{id:"p1",name:"Scooty",priority:true,createdOn:"2026-10-27",done:false}]},t={oneDay:[]};console.assert(carryPriorityItems(y,t,"2026-10-31")===1&&t.oneDay[0].name==="Scooty","carry");console.log("priority self-check complete");})();
~~~

- [ ] **Step 2: Run and verify fail**

Run: open index.html#prioritycheck. Expected: ReferenceError: priorityAge is not defined.

- [ ] **Step 3: Implement priority day objects and carry**

~~~js
function priorityAge(createdOn,todayKey){return Math.max(0,Math.round((new Date(todayKey+"T00:00:00")-new Date(createdOn+"T00:00:00"))/86400000));}
function carryPriorityItems(previous,today,todayKey){var added=0;(previous.oneDay||[]).forEach(function(it){if(it.priority&&!it.done&&!(today.oneDay||[]).some(function(x){return x.id===it.id;})){(today.oneDay||(today.oneDay=[])).push({id:it.id,name:it.name,cardId:it.cardId,priority:true,createdOn:it.createdOn,done:false});added++;}});return added;}
function priorityItemsForDay(day,todayKey){return (day.oneDay||[]).filter(function(it){return it.priority&&!it.done;}).map(function(it){return Object.assign({},it,{age:priorityAge(it.createdOn,todayKey)});});}
~~~

- [ ] **Step 4: Run and verify pass**

Run: open index.html#prioritycheck. Expected: priority self-check complete; unfinished priority reappears with today then Nd late; ordinary one-time/template items do not carry.

- [ ] **Step 5: Commit**

~~~bash
git add js/waqt.js
git commit -m "feat: carry priority one-time tasks" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
~~~

## Phase 5 — Reminders

### Task 6: Date/interval reminders, Today UI, AI, and Edge fires

**Files:**
- Modify: js/waqt.js:728-760, 929-945, 2241-2345, 2550-2850.
- Modify: js/push-client.js:14-90.
- Modify: supabase/functions/send-reminders/index.ts:1-145.
- Modify: supabase/cron.sql:1-30.

**Interfaces:**
- Produces: getReminders():Array<Object>; nextReminderFire(reminder:Object,fromDate:string):string; isReminderDue(reminder:Object,today:string):boolean; completeReminder(id:string,doneDate:string):void; isDateReminderDue(row:Object,isoDate:string):boolean.

- [ ] **Step 1: Write failing self-check**

~~~js
(function(){if(location.hash!=="#reminderscheck")return;var r={schedule:{kind:"interval",unit:"months",every:3},lastDone:"2026-01-31"};console.assert(nextReminderFire(r,"2026-01-31")==="2026-04-30","re-arm");console.assert(isReminderDue({nextFire:"2026-10-31"},"2026-10-31"),"due");console.log("reminders self-check complete");})();
~~~

- [ ] **Step 2: Run and verify fail**

Run: open index.html#reminderscheck. Expected: ReferenceError: nextReminderFire is not defined.

- [ ] **Step 3: Implement reminder model/UI and calendar Edge predicate**

~~~js
var REMINDERS_KEY="ht_reminders";
function getReminders(){try{return JSON.parse(localStorage.getItem(REMINDERS_KEY))||[];}catch(e){return [];}}
function saveReminders(rows){localStorage.setItem(REMINDERS_KEY,JSON.stringify(rows));localStorage.setItem(REMINDERS_KEY+"_mt",String(Date.now()));scheduleWidgetPublish();}
function nextReminderFire(r,fromDate){var d=new Date(fromDate+"T00:00:00"),s=r.schedule;if(s.kind==="fixed")return s.date||String(d.getFullYear())+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(s.day).padStart(2,"0");if(s.unit==="days")d.setDate(d.getDate()+s.every);if(s.unit==="weeks")d.setDate(d.getDate()+7*s.every);if(s.unit==="months")d.setMonth(d.getMonth()+s.every);return dk(d);}
function isReminderDue(r,today){return !r.snoozedUntil&&r.nextFire<=today;}
function completeReminder(id,doneDate){saveReminders(getReminders().map(function(r){if(r.id===id){r.lastDone=doneDate;r.nextFire=nextReminderFire(r,doneDate);}return r;}));}
function renderReminders(today){var due=getReminders().filter(function(r){return isReminderDue(r,today);});return '<section class="reminders"><h2>Reminders <small>'+due.length+"</small></h2>"+due.map(function(r){return '<button data-a="reminderdone" data-id="'+esA(r.id)+'">'+esc(r.name)+"</button>";}).join("")+"</section>";}
~~~

~~~ts
export function isDateReminderDue(row: { field: string; date?: string }, isoDate: string): boolean { return row.field === "date" && row.date === isoDate; }
const today = new Date().toISOString().slice(0, 10);
const dueRows = rows.filter((row) => row.field === "date" ? isDateReminderDue(row, today) : row.time === currentTime);
for (const row of dueRows) { const sentKey = row.field === "date" ? row.name+":"+row.date : row.name+":"+today+":"+row.time; if (await alreadySent(row.user_id,sentKey)) continue; await deliverPush(row.user_id,row.field==="date"?"Reminder due":row.name,row.name); await markSent(row.user_id,sentKey); }
~~~

~~~sql
select cron.schedule('send-reminders-every-minute','* * * * *',$$select net.http_post(url := current_setting('app.settings.supabase_url') || '/functions/v1/send-reminders',headers := jsonb_build_object('Authorization','Bearer ' || current_setting('app.settings.service_role_key')));$$);
~~~

- [ ] **Step 4: Run and verify pass**

Run: open index.html#reminderscheck; run deno check supabase/functions/send-reminders/index.ts.

Expected: reminders self-check complete; due badge, re-arm, fixed-date push, sent-log dedupe work.

- [ ] **Step 5: Commit**

~~~bash
git add js/waqt.js js/push-client.js supabase/functions/send-reminders/index.ts supabase/cron.sql
git commit -m "feat: add custom date reminders" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
~~~

## Phase 6 — Widgets

### Task 7: Stats, priority, next-prayer feed and Pehar repair

**Files:**
- Modify: js/waqt.js:101-152, 1572-1643.
- Modify: pehar-widget.js:1-87.
- Create: stats-widget.js.
- Create: priority-widget.js.
- Create: next-prayer-widget.js.
- Modify: sw.js:1-91.

**Interfaces:**
- Produces: computeWidgetPayload(): Object; buildPriorityWidget(payload:Object):ListWidget; buildNextPrayerWidget(payload:Object):ListWidget.

- [ ] **Step 1: Write failing self-check**

~~~js
(function(){if(location.hash!=="#widgetcheck")return;var p=computeWidgetPayload();console.assert(p.stats&&Array.isArray(p.stats.counts),"stats");console.assert(Array.isArray(p.priority),"priority");console.assert(p.nextPrayer===null||typeof p.nextPrayer.name==="string","next");console.log("widget self-check complete");})();
~~~

- [ ] **Step 2: Run and verify fail**

Run: open index.html#widgetcheck. Expected: payload assertions fail.

- [ ] **Step 3: Extend widget feed and Scriptable rows**

~~~js
function computeWidgetPayload(){var key=dk(new Date()),day=gDay(key),pehar=buildTimeline(getCards(),day,new Date().getDay()),prayers=pehar.filter(function(x){return x.prayer;}),next=computeNextPrayer(timeToMin(new Date().toTimeString().slice(0,5)),prayers.map(function(x){return x.time;}));return {date:key,pehar:pehar,stats:{percent:dScore(key),counts:widgetStatCounts(day)},priority:priorityItemsForDay(day,key),nextPrayer:next&&{name:next.name,time:next.time,in:fmtHM(next.minutes)}};}
function widgetStatCounts(day){return [{label:"PRAYERS",value:scoreItems(PRAYERS.map(function(n){return {done:!!day.prayers[n]};}))},{label:"DAILY",value:scoreItems(gDayCards(dk(cDate))[0].items)},{label:"EXTRA",value:scoreItems(gDayCards(dk(cDate))[1].items)},{label:"HEALTHY",value:scoreItems(gDayCards(dk(cDate))[2].items)},{label:"COMMITMENTS",value:scoreItems(priorityItemsForDay(day,dk(cDate)))}];}
~~~

~~~js
const now=new Date().getHours()*60+new Date().getMinutes();
const rows=payload.pehar.sort((a,b)=>a.start-b.start).filter(x=>x.end>=now-180).slice(0,8);
rows.forEach(x=>{const isNow=now>=x.start&&now<x.end;const row=w.addStack();row.backgroundColor=isNow?new Color("#1A1A1A"):new Color("#0C0C0C");const name=row.addText((isNow?"NOW · ":"")+x.name);name.font=isNow?Font.boldSystemFont(13):Font.systemFont(12);if(x.done){name.textOpacity=.45;name.applyStrikethroughStyle=true;}});
function buildPriorityWidget(payload){const w=new ListWidget();(payload.priority.length?payload.priority:[{name:"All clear",age:null}]).forEach(x=>w.addText(x.name+(x.age===null?"":" · "+(x.age?x.age+"d late":"today"))));return w;}
function buildNextPrayerWidget(payload){const w=new ListWidget(),n=payload.nextPrayer||{name:"No prayer time",in:""};w.addText(n.name).font=Font.boldSystemFont(24);w.addText(n.in);return w;}
~~~

- [ ] **Step 4: Run and verify pass**

Run: open index.html#widgetcheck; run all token-baked Scriptable loaders.

Expected: stats ring/five counts/Next line; priority chips; next prayer dots; Pehar past→NOW→upcoming includes evening and strikes only done.

- [ ] **Step 5: Commit**

~~~bash
git add js/waqt.js pehar-widget.js stats-widget.js priority-widget.js next-prayer-widget.js sw.js
git commit -m "feat: publish Waqt widget suite" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
~~~

## Phase 7 — Sync

### Task 8: Preserve scheduling fields through cloud round-trip

**Files:**
- Modify: js/supabase-sync.js:52-98, 120-196.
- Modify: js/waqt.js:400-453, 565-679.

**Interfaces:**
- Produces: mergeTemplate(local:Object,remote:Object,remoteUpdatedAt:string):Object; mergeData(local:Object,remote:Object,remoteUpdatedAt:string,localMt:number,key:string):Object.

- [ ] **Step 1: Write failing self-check**

~~~js
(function(){if(location.hash!=="#synccheck")return;var t=mergeTemplate({habits:[{n:"CEH",slots:[{time:"06:25"}],optional:true}],ex:[],hl:[]},null,"");console.assert(t.habits[0].slots[0].time==="06:25"&&t.habits[0].optional,"template");var d=mergeData({occurrences:{"habits::CEH::06:25":true},oneDay:[{id:"p1",priority:true}]},null,"",0,"ht_2026-10-31");console.assert(d.occurrences["habits::CEH::06:25"]&&d.oneDay[0].priority,"day");console.log("sync self-check complete");})();
~~~

- [ ] **Step 2: Run and verify fail**

Run: open index.html#synccheck. Expected: field-preservation assertion fails.

- [ ] **Step 3: Normalize fields without stripping them**

~~~js
function normTemplate(t){if(!t||typeof t!=="object")return t;["habits","ex","hl"].forEach(function(k){t[k]=dedupItemsByName(t[k]).map(function(it){if(typeof it==="string")return {n:it,s:false,c:"rings",slots:[]};return {n:it.n,s:!!it.s,c:it.c||"rings",slots:Array.isArray(it.slots)?it.slots:[],optional:!!it.optional,priority:!!it.priority};});});return t;}
function isSyncableKey(k){return !!k&&k.indexOf("ht_")===0&&k!=="ht_migrated_v3"&&!/_mt$/.test(k);}
function mergeData(local,remote,remoteUpdatedAt,localMt,key){if(!local)return remote;if(!remote)return local;var ts=remoteUpdatedAt?Date.parse(remoteUpdatedAt):0;if(ts>(localMt||0)){if(key)localStorage.setItem(key+"_mt",String(ts));return remote;}return local;}
~~~

- [ ] **Step 4: Run and verify pass**

Run: open index.html#synccheck; edit slot on one signed-in device then sync another.

Expected: sync self-check complete; ht_d_mt decides template LWW; day LWW keeps occurrence/priority state; ht_reminders syncs.

- [ ] **Step 5: Commit**

~~~bash
git add js/supabase-sync.js js/waqt.js
git commit -m "feat: sync Waqt scheduling state" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
~~~

## Final verification

- [ ] Open index.html#shellcheck, #slotscheck, #decluttercheck, #calculatorscheck, #prioritycheck, #reminderscheck, #widgetcheck, and #synccheck; each logs complete.
- [ ] Run deno check supabase/functions/send-reminders/index.ts.
- [ ] Run git branch --show-current; expected redesign.
- [ ] Run git log --format=%B -8; each update commit has trailer.

