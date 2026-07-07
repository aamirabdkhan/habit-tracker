var WML = 250;
var PRAYERS = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
var SEED_H = [];
var SEED_EX = [{n:"Surah Mulk",s:false},{n:"Ruqyah",s:false},{n:"Night Duas",s:false},{n:"Tahajjud",s:true}];
var SEED_HL = [{n:"Exercise",s:true}];
var SEED_RD = ["Quran (Arabic)","Quran (Translation)"];
var RCOLS = ["#C9943E","#5A8FA8","#7B9E6B","#B87333","#B84C4C","#8B7BB8","#5A9E8F","#C97B4C","#6B8EC9","#C96B8E"];
var REFK = ["good","bad","learn","gratitude","next"];
var REFL = {good:"What went well today?",bad:"What didn't go well / could be improved?",learn:"What did I learn today?",gratitude:"What am I grateful for today?",next:"One thing to do better tomorrow"};
var REFP = {good:"Write about your wins...",bad:"What could have been better...",learn:"Lessons from today...",gratitude:"Count your blessings...",next:"Focus for tomorrow..."};
var cDate = new Date();
var cData = null;
var svT = null;
var view = "daily";
var oMonth = new Date();

// ===== REFLECTION MODAL STATE =====
var rflStep = 0;
var rflAnswers = {};

function dk(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fLong(d) {
    return d.toLocaleDateString("en-US", {weekday:"long",year:"numeric",month:"long",day:"2-digit"});
}
function fMon(d) {
    return d.toLocaleDateString("en-US", {month:"long",year:"numeric"});
}
function greet() {
    var h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    if (h < 21) return "Good Evening";
    return "Good Night";
}
function isT(d) {
    var n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function isF(d) {
    var n = new Date(); n.setHours(0,0,0,0);
    var c = new Date(d); c.setHours(0,0,0,0);
    return c > n;
}
function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function esA(s) { return s.replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

function gDef() {
    try {
        var d = JSON.parse(localStorage.getItem("ht_d"));
        if (d && Array.isArray(d.habits)) {
            // Apply migration to clean up defaults for existing users
            if (!localStorage.getItem("ht_migrated_v3")) {
                // Remove Python and SOC Course
                d.habits = d.habits.filter(function(h) { return h !== "Python" && h !== "SOC Course"; });
                
                // Replace Physiotherapy with Exercise, remove others
                var hasPhysio = false;
                d.hl = d.hl.filter(function(item) {
                    if (item.n === "Physiotherapy") { hasPhysio = item.s; return false; }
                    if (item.n === "No Fap" || item.n === "No Porn" || item.n === "No Sugar" || item.n === "No Junk Food") { return false; }
                    return true;
                });
                
                if (!d.hl.find(function(item){ return item.n === "Exercise"; })) {
                    d.hl.unshift({n: "Exercise", s: hasPhysio});
                }
                
                // Clean up today's daily checklist as well
                var todayKey = dk(new Date());
                try {
                    var todayData = JSON.parse(localStorage.getItem("ht_" + todayKey));
                    if (todayData) {
                        delete todayData.habits["Python"];
                        delete todayData.habits["SOC Course"];
                        delete todayData.health["Physiotherapy"];
                        delete todayData.health["No Fap"];
                        delete todayData.health["No Porn"];
                        delete todayData.health["No Sugar"];
                        delete todayData.health["No Junk Food"];
                        if (todayData.health["Exercise"] === undefined) {
                            todayData.health["Exercise"] = false;
                        }
                        localStorage.setItem("ht_" + todayKey, JSON.stringify(todayData));
                    }
                } catch(err){}
                
                sDef(d);
                localStorage.setItem("ht_migrated_v3", "true");
            }
            if (!d.ex) d.ex = SEED_EX.map(function(x){return {n:x.n,s:x.s}});
            if (!d.hl) d.hl = SEED_HL.map(function(x){return {n:x.n,s:x.s}});
            if (!d.rd) d.rd = SEED_RD.slice();
            if (d.wt === undefined) d.wt = 8;
            d.ex = d.ex.map(function(x){ return typeof x === "string" ? {n:x,s:false} : x; });
            d.hl = d.hl.map(function(x){ return typeof x === "string" ? {n:x,s:false} : x; });
            return d;
        }
    } catch(e) {}
    return {
        habits: SEED_H.slice(),
        ex: SEED_EX.map(function(x){return {n:x.n,s:x.s}}),
        hl: SEED_HL.map(function(x){return {n:x.n,s:x.s}}),
        rd: SEED_RD.slice(),
        wt: 8
    };
}
function sDef(d) {
    try { localStorage.setItem("ht_d", JSON.stringify(d)); } catch(e) {}
    if (typeof dbSave === "function") dbSave("ht_d", d);
}

function mkDay() {
    var df = gDef(), tg = df.wt || 8;
    var habits = {}, prayers = {}, extra = {}, health = {};
    df.habits.forEach(function(h){ habits[h] = false; });
    PRAYERS.forEach(function(p){ prayers[p] = false; });
    df.ex.forEach(function(e){ extra[e.n] = false; });
    df.hl.forEach(function(h){ health[h.n] = false; });
    var reading = df.rd.map(function(n){ return {n:n, t:0}; });
    var reflections = {};
    REFK.forEach(function(k){ reflections[k] = ""; });
    return {habits:habits, prayers:prayers, extra:extra, reading:reading, water:Array(tg).fill(false), weight:"", health:health, goalRef:[], reflections:reflections};
}

function gDay(key) {
    try {
        var d = JSON.parse(localStorage.getItem("ht_" + key));
        if (d) {
            if (!Array.isArray(d.goalRef)) d.goalRef = [];
            if (!d.reflections) d.reflections = {};
            REFK.forEach(function(k){ if (!(k in d.reflections)) d.reflections[k] = ""; });
            if (!d.health) d.health = {};
            if (!d.extra) d.extra = {};
            var df = gDef(), tg = df.wt || 8;
            var newExtra = {};
            df.ex.forEach(function(e){ newExtra[e.n] = d.extra[e.n] || false; });
            d.extra = newExtra;
            var newHealth = {};
            df.hl.forEach(function(h){ newHealth[h.n] = d.health[h.n] || false; });
            d.health = newHealth;
            if (d.quran && !Array.isArray(d.reading)) {
                d.reading = [];
                if (d.quran.arabic) d.reading.push({n:"Quran (Arabic)",t:d.quran.arabic});
                if (d.quran.translation) d.reading.push({n:"Quran (Translation)",t:d.quran.translation});
                delete d.quran;
            }
            if (!Array.isArray(d.reading)) d.reading = [];
            df.rd.forEach(function(n){ if (!d.reading.find(function(r){return r.n===n})) d.reading.push({n:n,t:0}); });
            d.reading = d.reading.filter(function(r){ return df.rd.indexOf(r.n) !== -1; });
            if (!Array.isArray(d.water)) d.water = [];
            while (d.water.length < tg) d.water.push(false);
            d.water = d.water.slice(0, tg);
            return d;
        }
    } catch(e) {}
    return mkDay();
}
function sDay() { 
    try { localStorage.setItem("ht_" + dk(cDate), JSON.stringify(cData)); } catch(e) {} 
    if (typeof dbSave === "function") dbSave("ht_" + dk(cDate), cData); 
}
function dSave() { clearTimeout(svT); svT = setTimeout(sDay, 400); }

// Weight carryover: find the most recent recorded weight before a given date
function getLastWeight(beforeKey) {
    var d = new Date(beforeKey);
    for (var i = 1; i <= 60; i++) {
        var prev = new Date(d);
        prev.setDate(prev.getDate() - i);
        var k = dk(prev);
        try {
            var day = JSON.parse(localStorage.getItem("ht_" + k));
            if (day && day.weight && day.weight !== "") return day.weight;
        } catch(e) {}
    }
    return "";
}

function dScore(key) {
    var d = gDay(key), t = 0, c = 0;
    Object.values(d.habits).forEach(function(v){ t++; if(v) c++; });
    Object.values(d.prayers).forEach(function(v){ t++; if(v) c++; });
    Object.values(d.extra).forEach(function(v){ t++; if(v) c++; });
    Object.values(d.health).forEach(function(v){ t++; if(v) c++; });
    var df = gDef(), gm = (df.wt||8) * WML;
    t++; if (d.water.filter(Boolean).length * WML >= gm) c++;
    return t === 0 ? 0 : Math.round(c/t*100);
}
function sCls(s) { return s>=80?"g":s>=50?"o":s>0?"l":""; }

var tT = null;
function toast(m) {
    var e = document.getElementById("toast");
    if (!e) return;
    e.textContent = m;
    e.classList.add("sh");
    clearTimeout(tT);
    tT = setTimeout(function(){ e.classList.remove("sh"); }, 2200);
}

// ===== REFLECTION MODAL =====
function reflDone() {
    if (!cData) return false;
    return REFK.every(function(k){ return cData.reflections[k] && cData.reflections[k].trim(); });
}

function openReflModal() {
    rflStep = 0;
    rflAnswers = {};
    // Pre-fill from existing data
    REFK.forEach(function(k){ rflAnswers[k] = cData.reflections[k] || ""; });
    renderReflModal();
}

function renderReflModal() {
    var k = REFK[rflStep];
    var pips = REFK.map(function(_, i){
        var cls = i < rflStep ? "done" : i === rflStep ? "cur" : "";
        return '<div class="rfl-pip '+cls+'"></div>';
    }).join("");

    var html = '<div class="rfl-modal" id="rfl-modal">';
    html += '<div class="rfl-box">';
    html += '<div class="flex items-center justify-between mb-1">';
    html += '<p class="text-xs tracking-widest uppercase" style="color:var(--mt)">Daily Reflection</p>';
    html += '<button style="background:none;border:none;color:var(--mt);cursor:pointer;font-size:1.1rem;padding:2px 6px;border-radius:6px" id="rfl-close" title="Close"><i class="fas fa-xmark"></i></button>';
    html += '</div>';
    html += '<h2>'+REFL[k]+'</h2>';
    html += '<div class="rfl-prog">'+pips+'</div>';
    html += '<p class="text-xs mb-3" style="color:var(--mt)">'+(rflStep+1)+' of '+REFK.length+'</p>';
    html += '<textarea id="rfl-ta" class="rta" rows="4" placeholder="'+esA(REFP[k])+'">'+esc(rflAnswers[k])+'</textarea>';
    html += '<div class="flex gap-2 mt-4 justify-between">';
    if (rflStep > 0) html += '<button class="bt text-sm" id="rfl-back"><i class="fas fa-arrow-left mr-1.5"></i>Back</button>';
    else html += '<div></div>';
    if (rflStep < REFK.length - 1) {
        html += '<button class="bt bta text-sm" id="rfl-next">Next<i class="fas fa-arrow-right ml-1.5"></i></button>';
    } else {
        html += '<button class="bt bta text-sm" id="rfl-save"><i class="fas fa-check mr-1.5"></i>Save Reflection</button>';
    }
    html += '</div></div></div>';

    var ov = document.getElementById("rfl-overlay");
    ov.innerHTML = html;
    var ta = document.getElementById("rfl-ta");
    if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }

    // Events
    document.getElementById("rfl-close").onclick = closeReflModal;
    document.getElementById("rfl-modal").onclick = function(e){ if(e.target===this) closeReflModal(); };
    var nb = document.getElementById("rfl-next");
    if (nb) nb.onclick = function(){
        rflAnswers[REFK[rflStep]] = document.getElementById("rfl-ta").value;
        rflStep++;
        renderReflModal();
    };
    var bb = document.getElementById("rfl-back");
    if (bb) bb.onclick = function(){
        rflAnswers[REFK[rflStep]] = document.getElementById("rfl-ta").value;
        rflStep--;
        renderReflModal();
    };
    var sb = document.getElementById("rfl-save");
    if (sb) sb.onclick = function(){
        rflAnswers[REFK[rflStep]] = document.getElementById("rfl-ta").value;
        // Save all answers
        REFK.forEach(function(k){ cData.reflections[k] = rflAnswers[k]; });
        sDay();
        closeReflModal();
        // Update the reflection button indicator
        var dot = document.getElementById("rfl-indicator");
        if (dot && reflDone()) dot.style.display = "none";
        toast("Reflection saved!");
    };
    // Ctrl+Enter or Shift+Enter shortcuts
    ta.onkeydown = function(e){
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            rflAnswers[REFK[rflStep]] = ta.value;
            if (rflStep < REFK.length - 1) { rflStep++; renderReflModal(); }
            else { document.getElementById("rfl-save").click(); }
        }
    };
}

function closeReflModal() {
    document.getElementById("rfl-overlay").innerHTML = "";
}

// ===== RENDER HELPERS =====
function rComp(val, id, ph) {
    if (val && val.trim()) {
        return '<div class="rs" data-rid="'+id+'"><div class="rst">'+esc(val)+'</div><button class="reb" data-a="eref" data-rid="'+id+'"><i class="fas fa-pen-to-square"></i></button></div>';
    }
    return '<textarea class="rta" data-rid="'+id+'" placeholder="'+esA(ph||"Write...")+'">'+esc(val||"")+'</textarea>';
}
function sRefT(id, text) {
    if (id.indexOf("g-") === 0) { var i = +id.replace("g-",""); if(cData.goalRef[i]) cData.goalRef[i].text = text; }
    else if (id.indexOf("r-") === 0) { var k = id.replace("r-",""); if(cData.reflections.hasOwnProperty(k)) cData.reflections[k] = text; }
}
function gRefT(id) {
    if (id.indexOf("g-") === 0) { var i = +id.replace("g-",""); return (cData.goalRef[i]||{}).text||""; }
    if (id.indexOf("r-") === 0) { var k = id.replace("r-",""); return cData.reflections[k]||""; }
    return "";
}
function toSaved(id) {
    var text = gRefT(id); sRefT(id, text); sDay();
    var el = document.querySelector('[data-rid="'+id+'"]');
    if (el) { var p = el.closest(".rc,.grt"); if(p) p.innerHTML = rComp(text, id, ""); }
}
function toEdit(id, ph) {
    var text = gRefT(id);
    var el = document.querySelector('[data-rid="'+id+'"]');
    if (!el) return;
    var p = el.closest(".rc,.grt");
    if (!p) return;
    p.innerHTML = '<textarea class="rta" data-rid="'+id+'" placeholder="'+esA(ph||"Write...")+'">'+esc(text)+'</textarea>';
    var ta = p.querySelector("textarea");
    if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
}

function rChk(obj, field, cls, rem) {
    return Object.entries(obj).map(function(e){
        var n = e[0], c = e[1];
        return '<div class="ci '+cls+(c?' on':'')+'" data-a="tog" data-f="'+field+'" data-k="'+esA(n)+'" role="checkbox" aria-checked="'+c+'" tabindex="0"><div class="ck"><i class="fas fa-check"></i></div><span class="lb text-sm">'+esc(n)+'</span>'+(rem?'<button class="rm" data-a="rm-'+field+'" data-n="'+esA(n)+'"><i class="fas fa-xmark"></i></button>':'')+'</div>';
    }).join("");
}

function rNav(act) {
    return '<div class="flex items-center justify-center gap-2 mt-4 flex-wrap"><button class="bto'+(act==="daily"?' act':'')+'" data-a="vday"><i class="fas fa-calendar-day mr-1.5"></i>Daily</button><button class="bto'+(act==="overview"?' act':'')+'" data-a="vov"><i class="fas fa-chart-pie mr-1.5"></i>Overview</button><button class="bto'+(act==="settings"?' act':'')+'" data-a="vset"><i class="fas fa-gear mr-1.5"></i>Template</button></div>';
}

function rHead() {
    var td = isT(cDate), fu = isF(cDate);
    var done = reflDone();
    var h = '<header class="text-center mb-5">';
    h += '<p class="text-xs tracking-widest uppercase" style="color:var(--mt)">'+greet()+'</p>';
    h += '<h1 class="text-2xl md:text-3xl mt-1.5">'+fLong(cDate)+'</h1>';
    h += '<div class="flex items-center justify-center gap-2 mt-1">';
    if (td) h += '<span class="text-xs px-2.5 py-0.5 rounded-full" style="background:rgba(74,140,92,.15);color:var(--ok)">Today</span>';
    if (fu) h += '<span class="text-xs px-2.5 py-0.5 rounded-full" style="background:var(--acd);color:var(--ac)">Future</span>';
    h += '</div>';
    h += '<div class="flex items-center justify-center gap-3 mt-4">';
    h += '<button class="dnb" data-a="prev"><i class="fas fa-chevron-left text-xs"></i></button>';
    if (!td) h += '<button class="bt text-xs" data-a="today">Today</button>';
    h += '<button class="dnb" data-a="next"><i class="fas fa-chevron-right text-xs"></i></button>';
    h += '</div>';
    // Reflection button in header
    h += '<div class="flex items-center justify-center mt-3">';
    h += '<div class="rfl-btn-wrap">';
    h += '<button class="bt text-xs" data-a="openrefl" style="'+(done?'border-color:var(--ok);color:var(--ok)':'border-color:rgba(184,76,76,.5);color:var(--fg)')+'"><i class="fas fa-'+(done?'check-circle':'pen-fancy')+' mr-1.5" style="color:'+(done?'var(--ok)':'var(--dn)')+'"></i>'+(done?'Reflection done':'Daily Reflection')+'</button>';
    if (!done) h += '<span class="rfl-dot" id="rfl-indicator"></span>';
    h += '</div></div>';
    h += rNav("daily");
    h += '<div class="al"></div></header>';
    return h;
}

function rWeek() {
    var ds = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    var h = '<div class="flex justify-center gap-0.5 mb-5">';
    for (var i = -6; i <= 0; i++) {
        var d = new Date(cDate); d.setDate(d.getDate()+i);
        var k = dk(d), s = dScore(k), a = k===dk(cDate);
        h += '<div class="wk'+(a?' on':'')+'" data-a="goto" data-k="'+k+'"><span class="text-[10px]" style="color:'+(a?'var(--ac)':'var(--mt)')+'">'+ds[d.getDay()]+'</span><span class="text-xs font-semibold" style="color:'+(a?'var(--fg)':'var(--mt)')+'">'+d.getDate()+'</span><div class="wkd '+sCls(s)+'"></div></div>';
    }
    return h + '</div>';
}

function rHabits() {
    var h = cData.habits, keys = Object.keys(h), t = keys.length;
    var c = keys.filter(function(k){return h[k]}).length;
    var p = t===0 ? 0 : Math.round(c/t*100);
    var s = '<div class="cd ai" style="animation-delay:.05s"><div class="shd"><div class="sic" style="background:var(--acd);color:var(--ac)"><i class="fas fa-bullseye"></i></div><h2 class="stl">Daily Goals</h2></div>';
    s += '<div id="hl">'+rChk(h,"habits","",true)+'</div>';
    s += '<div class="flex items-center gap-2 mt-3"><input type="text" id="nh" class="inp flex-1 text-sm" placeholder="Add a new goal..." maxlength="60"><button class="bt bta text-sm" data-a="ah"><i class="fas fa-plus mr-1"></i>Add</button></div>';
    s += '<div class="mt-4"><div class="flex justify-between text-xs mb-1.5"><span style="color:var(--mt)">Goal completion</span><span id="hp" style="color:var(--ac);font-weight:600">'+p+'%</span></div>';
    s += '<div class="ptr"><div id="hf" class="pfl" style="width:'+p+'%;background:var(--ac)"></div></div>';
    if (p===100 && t>0) s += '<div class="cb" style="background:var(--acd);color:var(--ac)"><i class="fas fa-trophy mr-1"></i> All goals completed!</div>';
    s += '</div></div>';
    return s;
}

function rPrayers() {
    var p = cData.prayers, c = Object.values(p).filter(Boolean).length;
    var s = '<div class="cd ai" style="animation-delay:.1s"><div class="shd"><div class="sic" style="background:var(--prd);color:var(--pr)"><i class="fas fa-mosque"></i></div><h2 class="stl">Daily Prayers</h2><span class="ml-auto text-xs font-semibold" style="color:var(--pr)">'+c+'/5</span></div>';
    s += rChk(p,"prayers","pr",false);
    if (c===5) s += '<div class="cb" style="background:var(--prd);color:var(--pr)"><i class="fas fa-star-and-crescent mr-1"></i> All prayers completed \u2014 MashaAllah</div>';
    s += '</div>';
    return s;
}

function rExtra() {
    var ex = cData.extra, keys = Object.keys(ex);
    var c = keys.filter(function(k){return ex[k]}).length;
    var s = '<div class="cd ai" style="animation-delay:.15s"><div class="shd"><div class="sic" style="background:var(--prd);color:var(--pr)"><i class="fas fa-star-and-crescent"></i></div><h2 class="stl">Extra Deeds</h2><span class="ml-auto text-xs font-semibold" style="color:var(--pr)">'+c+'/'+keys.length+'</span></div>';
    s += '<div id="exl">'+rChk(ex,"extra","ex",true)+'</div>';
    s += '<div class="flex items-center gap-2 mt-3"><input type="text" id="ne" class="inp flex-1 text-sm" placeholder="Add an extra deed..." maxlength="60"><button class="bt bta text-sm" data-a="ae"><i class="fas fa-plus mr-1"></i>Add</button></div>';
    s += '</div>';
    return s;
}

function rReading() {
    var rows = "";
    cData.reading.forEach(function(r,i){
        rows += '<div class="rr"><div style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:'+RCOLS[i%RCOLS.length]+'"></div><span class="text-sm flex-1">'+esc(r.n)+'</span><input type="number" class="nin" id="ri'+i+'" min="0" placeholder="0" value="0" style="width:64px;font-size:.85rem"><button class="bt text-sm" data-a="ra" data-i="'+i+'">Add</button><span class="text-sm font-semibold ml-1" id="rt'+i+'" style="color:'+RCOLS[i%RCOLS.length]+'">'+r.t+' pg</span><button class="rm" data-a="rmr" data-i="'+i+'"><i class="fas fa-xmark"></i></button></div>';
    });
    var s = '<div class="cd ai" style="animation-delay:.2s"><div class="shd"><div class="sic" style="background:var(--prd);color:var(--pr)"><i class="fas fa-book-open-reader"></i></div><h2 class="stl">Reading</h2></div>';
    s += '<div id="rl">'+rows+'</div>';
    s += '<div class="flex items-center gap-2 mt-3"><input type="text" id="nr" class="inp flex-1 text-sm" placeholder="Add a book..." maxlength="60"><button class="bt bta text-sm" data-a="ar"><i class="fas fa-plus mr-1"></i>Add</button></div>';
    s += '</div>';
    return s;
}

function rWater() {
    var df = gDef(), tg = df.wt||8, gm = tg*WML;
    var fi = cData.water.filter(Boolean).length, ml = fi*WML;
    var p = Math.min(100, Math.round(ml/gm*100));
    var drops = "";
    for (var i=0; i<tg; i++) {
        var ch = cData.water[i]||false;
        drops += '<div class="wdr'+(ch?' f':'')+'" data-a="wt" data-i="'+i+'" role="checkbox" aria-checked="'+ch+'" tabindex="0"><i class="fas fa-droplet"></i></div>';
    }
    var s = '<div class="cd ai" style="animation-delay:.25s"><div class="shd"><div class="sic" style="background:var(--wad);color:var(--wa)"><i class="fas fa-bottle-water"></i></div><h2 class="stl">Water Intake</h2>';
    s += '<div class="ml-auto flex items-center gap-2"><button class="wtb" data-a="wta" data-d="-1">&minus;</button><span class="text-xs font-medium" style="color:var(--wa)">'+tg+' ('+gm+' ml)</span><button class="wtb" data-a="wta" data-d="1">+</button></div></div>';
    s += '<div class="wgr mb-4" id="wgr">'+drops+'</div>';
    s += '<div><div class="flex justify-between text-xs mb-1.5"><span style="color:var(--mt)">Intake</span><span id="wtx" style="color:var(--wa);font-weight:600">'+ml+' / '+gm+' ml</span></div>';
    s += '<div class="ptr"><div id="wfl" class="pfl" style="width:'+p+'%;background:var(--wa)"></div></div></div></div>';
    return s;
}

function rWeight() {
    var w = cData.weight;
    var carried = (!w || w === "") ? getLastWeight(dk(cDate)) : "";
    var placeholder = carried ? carried : "0.0";
    var displayVal = w || "";
    var statusTxt = w ? 'Saved: '+w+' kg' : (carried ? 'Carrying: '+carried+' kg (from previous day)' : 'Not recorded yet');
    var statusColor = w ? 'var(--ok)' : (carried ? 'var(--ac)' : 'var(--mt)');
    var s = '<div class="cd ai" style="animation-delay:.3s"><div class="shd"><div class="sic" style="background:var(--wad);color:var(--wa)"><i class="fas fa-weight-scale"></i></div><h2 class="stl">Weight</h2></div>';
    s += '<div class="flex items-center gap-3"><input type="number" class="nin" id="wi" step="0.1" value="'+displayVal+'" placeholder="'+placeholder+'" style="width:90px;font-size:1rem"><span class="text-sm" style="color:var(--mt)">kg</span><span class="text-xs ml-2" id="ws" style="color:'+statusColor+'">'+statusTxt+'</span></div>';
    s += '</div>';
    return s;
}

function rHealth() {
    var h = cData.health, keys = Object.keys(h), t = keys.length;
    var c = keys.filter(function(k){return h[k]}).length;
    var p = t===0 ? 0 : Math.round(c/t*100);
    var s = '<div class="cd ai" style="animation-delay:.35s"><div class="shd"><div class="sic" style="background:var(--hld);color:var(--hl)"><i class="fas fa-shield-heart"></i></div><h2 class="stl">Healthy Lifestyle</h2><span class="ml-auto text-xs font-semibold" style="color:var(--hl)">'+p+'%</span></div>';
    s += '<div id="hll">'+rChk(h,"health","hl",true)+'</div>';
    s += '<div class="flex items-center gap-2 mt-3"><input type="text" id="nhl" class="inp flex-1 text-sm" placeholder="Add a health goal..." maxlength="60"><button class="bt bta text-sm" data-a="ahl"><i class="fas fa-plus mr-1"></i>Add</button></div>';
    s += '<div class="mt-3"><div class="ptr"><div id="hfl" class="pfl" style="width:'+p+'%;background:var(--hl)"></div></div></div>';
    s += '</div>';
    return s;
}

function rGoalRef() {
    var g = "";
    cData.goalRef.forEach(function(gr,i){
        g += '<div class="gri"><div class="flex items-center gap-2 mb-2"><span class="text-sm font-semibold" style="color:var(--ac)">'+esc(gr.name)+'</span><button class="rm" data-a="rg" data-i="'+i+'"><i class="fas fa-xmark"></i></button></div>';
        g += '<div class="grt" id="gt'+i+'">'+rComp(gr.text,"g-"+i,"Write your reflection for this goal...")+'</div></div>';
    });
    var s = '<div class="cd ai" style="animation-delay:.4s"><div class="shd"><div class="sic" style="background:var(--acd);color:var(--ac)"><i class="fas fa-crosshairs"></i></div><h2 class="stl">Goal Reflection</h2></div>';
    s += '<div id="gl">'+g+'</div>';
    s += '<div class="flex items-center gap-2 mt-3"><input type="text" id="ng" class="inp flex-1 text-sm" placeholder="Add a goal to reflect on..." maxlength="80"><button class="bt bta text-sm" data-a="ag"><i class="fas fa-plus mr-1"></i>Add</button></div>';
    s += '</div>';
    return s;
}

function rFoot() {
    return '<footer class="text-center mt-8 pb-4"><div class="flex items-center justify-center gap-3"><button class="bt text-xs" data-a="exp"><i class="fas fa-download mr-1.5"></i>Export</button><button class="bt text-xs" data-a="impb"><i class="fas fa-upload mr-1.5"></i>Import</button><input type="file" id="imf" accept=".json" style="display:none"></div><p class="text-[10px] mt-4" style="color:var(--bd)">Data stored locally in your browser</p></footer>';
}

// ===== SETTINGS =====
function rSettings() {
    var df = gDef();
    var h = '<header class="text-center mb-6"><p class="text-xs tracking-widest uppercase" style="color:var(--mt)">Configuration</p><h1 class="text-2xl md:text-3xl mt-1.5">Template</h1><p class="text-xs mt-2" style="color:var(--mt)">Manage what appears on your daily page and monthly overview.</p>';
    h += rNav("settings");
    h += '<div class="al"></div></header>';

    h += '<div class="sync-card">';
    h += '<div class="sec-t"><i class="fas fa-rotate mr-1.5" style="color:var(--wa)"></i>Cloud Sync</div>';
    if (typeof sbClient === "undefined" || !sbClient) {
        h += '<p class="text-xs mb-3" style="color:var(--mt)">To enable sync, configure your Supabase URL and Anon Key in the source code.</p>';
        h += '<button class="bt text-sm opacity-50 cursor-not-allowed" disabled><i class="fas fa-lock mr-1.5"></i>Sync Disabled</button>';
    } else if (currentUser) {
        h += '<p class="text-xs mb-3" style="color:var(--mt)">Logged in as <strong>' + esc(currentUser.email) + '</strong>. Your data is synced automatically.</p>';
        h += '<div class="flex gap-2">';
        h += '<button class="bt text-sm" data-a="sync-now">' + (isSyncing ? '<i class="fas fa-spinner fa-spin mr-1.5"></i>Syncing...' : '<i class="fas fa-rotate mr-1.5"></i>Sync Now') + '</button>';
        h += '<button class="bt text-sm" data-a="signout" style="border-color:var(--dn);color:var(--dn)"><i class="fas fa-right-from-bracket mr-1.5"></i>Sign Out</button>';
        h += '</div>';
    } else {
        h += '<p class="text-xs mb-3" style="color:var(--mt)">Sign in to synchronize your habits and tracking data across multiple devices.</p>';
        h += '<button class="bt text-sm" data-a="show-login"><i class="fas fa-cloud mr-1.5"></i>Connect Cloud Sync</button>';
    }
    h += '</div>';

    h += '<div class="cd"><div class="sec-t"><i class="fas fa-bottle-water mr-1.5" style="color:var(--wa)"></i>Water Target</div>';
    h += '<div class="flex items-center gap-3"><button class="wtb" data-a="swta" data-d="-1">&minus;</button><span class="text-sm" id="swtv">'+(df.wt||8)+' glasses ('+((df.wt||8)*WML)+' ml)</span><button class="wtb" data-a="swta" data-d="1">+</button></div></div>';

    h += '<div class="cd"><div class="sec-t"><i class="fas fa-bullseye mr-1.5" style="color:var(--ac)"></i>Daily Goals</div>';
    df.habits.forEach(function(name,i){
        h += '<div class="sr"><span class="sr-nm">'+esc(name)+'</span><button class="rm" data-a="srh" data-i="'+i+'"><i class="fas fa-xmark"></i></button></div>';
    });
    h += '<div class="flex items-center gap-2 mt-2"><input type="text" id="snh" class="inp flex-1 text-sm" placeholder="Add goal..." maxlength="60"><button class="bt bta text-sm" data-a="sah"><i class="fas fa-plus mr-1"></i>Add</button></div></div>';

    h += '<div class="cd"><div class="sec-t"><i class="fas fa-star-and-crescent mr-1.5" style="color:var(--pr)"></i>Extra Deeds</div><p class="text-xs mb-3" style="color:var(--mt)">Toggle the streak switch to track that deed in the monthly overview.</p>';
    df.ex.forEach(function(e,i){
        h += '<div class="sr"><span class="sr-nm">'+esc(e.n)+'</span><button class="tog'+(e.s?' on':'')+'" data-a="tges" data-i="'+i+'" aria-label="Toggle streak" title="Track streak in overview"></button><button class="rm" data-a="sre" data-i="'+i+'"><i class="fas fa-xmark"></i></button></div>';
    });
    h += '<div class="flex items-center gap-2 mt-2"><input type="text" id="sne" class="inp flex-1 text-sm" placeholder="Add deed..." maxlength="60"><button class="bt bta text-sm" data-a="sae"><i class="fas fa-plus mr-1"></i>Add</button></div></div>';

    h += '<div class="cd"><div class="sec-t"><i class="fas fa-shield-heart mr-1.5" style="color:var(--hl)"></i>Healthy Lifestyle</div><p class="text-xs mb-3" style="color:var(--mt)">Toggle the streak switch to track that item in the monthly overview.</p>';
    df.hl.forEach(function(e,i){
        h += '<div class="sr"><span class="sr-nm">'+esc(e.n)+'</span><button class="tog'+(e.s?' on':'')+'" data-a="tghs" data-i="'+i+'" aria-label="Toggle streak" title="Track streak in overview"></button><button class="rm" data-a="srhl" data-i="'+i+'"><i class="fas fa-xmark"></i></button></div>';
    });
    h += '<div class="flex items-center gap-2 mt-2"><input type="text" id="snhl" class="inp flex-1 text-sm" placeholder="Add health goal..." maxlength="60"><button class="bt bta text-sm" data-a="sahl"><i class="fas fa-plus mr-1"></i>Add</button></div></div>';

    h += '<div class="cd"><div class="sec-t"><i class="fas fa-book-open-reader mr-1.5" style="color:var(--pr)"></i>Reading</div>';
    df.rd.forEach(function(name,i){
        h += '<div class="sr"><span class="sr-nm">'+esc(name)+'</span><button class="rm" data-a="srr" data-i="'+i+'"><i class="fas fa-xmark"></i></button></div>';
    });
    h += '<div class="flex items-center gap-2 mt-2"><input type="text" id="snr" class="inp flex-1 text-sm" placeholder="Add book..." maxlength="60"><button class="bt bta text-sm" data-a="sar"><i class="fas fa-plus mr-1"></i>Add</button></div></div>';

    h += '<div class="cd" style="border-color:rgba(184,76,76,.2)"><div class="sec-t" style="color:var(--dn)"><i class="fas fa-triangle-exclamation mr-1.5"></i>Danger Zone</div><button class="bt text-sm" data-a="clr" style="border-color:var(--dn);color:var(--dn)"><i class="fas fa-trash mr-1.5"></i>Clear All Data</button></div>';

    h += rFoot();
    return h;
}

// ===== PARTIAL UPDATES =====
function uHP() {
    var h=cData.habits,keys=Object.keys(h),t=keys.length,c=keys.filter(function(k){return h[k]}).length,p=t?Math.round(c/t*100):0;
    var f=document.getElementById("hf"),pt=document.getElementById("hp");
    if(f) f.style.width=p+"%"; if(pt) pt.textContent=p+"%";
    var cd=document.getElementById("hl"); if(!cd) return; cd=cd.closest(".cd");
    var o=cd.querySelector(".cb"); if(o) o.remove();
    if(p===100&&t>0){var d=document.createElement("div");d.className="cb";d.style.cssText="background:var(--acd);color:var(--ac)";d.innerHTML='<i class="fas fa-trophy mr-1"></i> All goals completed!';cd.appendChild(d)}
}
function uEP() {
    var keys=Object.keys(cData.extra),c=keys.filter(function(k){return cData.extra[k]}).length;
    var cards=document.querySelectorAll(".cd"); for(var i=0;i<cards.length;i++){if(cards[i].querySelector('[data-a="ae"]')){var ct=cards[i].querySelector(".shd .ml-auto");if(ct)ct.textContent=c+"/"+keys.length;break}}
}
function uWP() {
    var df=gDef(),tg=df.wt||8,gm=tg*WML,fi=cData.water.filter(Boolean).length,ml=fi*WML,p=Math.min(100,Math.round(ml/gm*100));
    var f=document.getElementById("wfl"),t=document.getElementById("wtx");
    if(f) f.style.width=p+"%"; if(t) t.textContent=ml+" / "+gm+" ml";
}
function uHL() {
    var h=cData.health,keys=Object.keys(h),t=keys.length,c=keys.filter(function(k){return h[k]}).length,p=t?Math.round(c/t*100):0;
    var f=document.getElementById("hfl"); if(f) f.style.width=p+"%";
    var cards=document.querySelectorAll(".cd"); for(var i=0;i<cards.length;i++){if(cards[i].querySelector('[data-a="ahl"]')){var ct=cards[i].querySelector(".shd .ml-auto");if(ct)ct.textContent=p+"%";break}}
}
function uWD() { var s=document.querySelector(".wk.on .wkd"); if(s) s.className="wkd "+sCls(dScore(dk(cDate))); }
function uAll() { uHP(); uEP(); uWP(); uHL(); uWD(); }

function reHL() { var e=document.getElementById("hl"); if(e) e.innerHTML=rChk(cData.habits,"habits","",true); uHP(); }
function reHLL() { var e=document.getElementById("hll"); if(e) e.innerHTML=rChk(cData.health,"health","hl",true); uHL(); }
function reEX() {
    var e=document.getElementById("exl"); if(!e) return;
    var keys=Object.keys(cData.extra),c=keys.filter(function(k){return cData.extra[k]}).length;
    e.innerHTML=rChk(cData.extra,"extra","ex",true);
    var cd=e.closest(".cd"); var ct=cd.querySelector(".shd .ml-auto"); if(ct) ct.textContent=c+"/"+keys.length;
}
function reRL() {
    var e=document.getElementById("rl"); if(!e) return;
    var rows="";
    cData.reading.forEach(function(r,i){rows+='<div class="rr"><div style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:'+RCOLS[i%RCOLS.length]+'"></div><span class="text-sm flex-1">'+esc(r.n)+'</span><input type="number" class="nin" id="ri'+i+'" min="0" placeholder="0" value="0" style="width:64px;font-size:.85rem"><button class="bt text-sm" data-a="ra" data-i="'+i+'">Add</button><span class="text-sm font-semibold ml-1" id="rt'+i+'" style="color:'+RCOLS[i%RCOLS.length]+'">'+r.t+' pg</span><button class="rm" data-a="rmr" data-i="'+i+'"><i class="fas fa-xmark"></i></button></div>'});
    e.innerHTML=rows;
}
function reWT() {
    var df=gDef(),tg=df.wt||8,gm=tg*WML,fi=cData.water.filter(Boolean).length,ml=fi*WML,p=Math.min(100,Math.round(ml/gm*100));
    var cards=document.querySelectorAll(".cd");
    for(var i=0;i<cards.length;i++){
        if(cards[i].querySelector(".wgr")){
            var cd=cards[i],lbl=cd.querySelector(".shd .ml-auto");
            if(lbl) lbl.innerHTML='<button class="wtb" data-a="wta" data-d="-1">&minus;</button><span class="text-xs font-medium" style="color:var(--wa)">'+tg+' ('+gm+' ml)</span><button class="wtb" data-a="wta" data-d="1">+</button>';
            var gr=document.getElementById("wgr"); if(gr){var d2="";for(var j=0;j<tg;j++){var ch=cData.water[j]||false;d2+='<div class="wdr'+(ch?' f':'')+'" data-a="wt" data-i="'+j+'" role="checkbox" aria-checked="'+ch+'" tabindex="0"><i class="fas fa-droplet"></i></div>'}gr.innerHTML=d2}
            var f=document.getElementById("wfl"),t=document.getElementById("wtx"); if(f) f.style.width=p+"%"; if(t) t.textContent=ml+" / "+gm+" ml"; break;
        }
    }
}
function reGL() {
    var e=document.getElementById("gl"); if(!e) return;
    var h="";
    cData.goalRef.forEach(function(gr,i){h+='<div class="gri"><div class="flex items-center gap-2 mb-2"><span class="text-sm font-semibold" style="color:var(--ac)">'+esc(gr.name)+'</span><button class="rm" data-a="rg" data-i="'+i+'"><i class="fas fa-xmark"></i></button></div><div class="grt" id="gt'+i+'">'+rComp(gr.text,"g-"+i,"Write your reflection for this goal...")+'</div></div>'});
    e.innerHTML=h;
}

// ===== OVERVIEW =====
function getMonthData() {
    var y=oMonth.getFullYear(),m=oMonth.getMonth(),days=new Date(y,m+1,0).getDate();
    var data=[];
    for(var d=1;d<=days;d++){var key=y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");data.push({day:d,key:key,data:gDay(key)})}
    return data;
}

// Build weight series: carry over previous day's weight if today has none
function buildWeightSeries(md) {
    var result = [];
    var lastKnown = null;
    var firstKey = md[0].key;
    var carried = getLastWeight(firstKey);
    if (carried !== "") lastKnown = parseFloat(carried);
    md.forEach(function(d) {
        if (d.data.weight && d.data.weight !== "") {
            lastKnown = parseFloat(d.data.weight);
            result.push({x: d.day, v: lastKnown, recorded: true});
        } else if (lastKnown !== null) {
            result.push({x: d.day, v: lastKnown, recorded: false});
        }
    });
    return result;
}

function drawLine(id, pts, color) {
    var c=document.getElementById(id); if(!c) return;
    var dp=window.devicePixelRatio||1,w=c.parentElement.clientWidth-10,h=160;
    if(w<50) w=300;
    c.width=w*dp;c.height=h*dp;c.style.width=w+"px";c.style.height=h+"px";
    var x=c.getContext("2d");x.scale(dp,dp);x.clearRect(0,0,w,h);
    var valid=pts.filter(function(p){return p.v!==null&&p.v!==undefined&&p.v!==""});
    if(valid.length<2){x.fillStyle="#7A756E";x.font="13px Space Grotesk";x.textAlign="center";x.fillText("Not enough data",w/2,h/2);return}
    var pd={t:15,b:25,l:44,r:10},cw=w-pd.l-pd.r,ch=h-pd.t-pd.b;
    var vals=valid.map(function(p){return p.v});
    var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);
    if(mn===mx){mn-=1;mx+=1}var rng=mx-mn;if(rng===0) rng=1;
    x.strokeStyle="rgba(255,255,255,0.05)";x.lineWidth=1;
    for(var i=0;i<=4;i++){var y=pd.t+ch*i/4;x.beginPath();x.moveTo(pd.l,y);x.lineTo(w-pd.r,y);x.stroke();x.fillStyle="#7A756E";x.font="10px Space Grotesk";x.textAlign="right";x.textBaseline="middle";x.fillText((mx-rng*i/4).toFixed(1),pd.l-5,y)}
    // Draw area under curve
    x.beginPath();valid.forEach(function(p,i){var px=pd.l+(p.x-1)/(pts.length-1||1)*cw;var py=pd.t+ch*(mx-p.v)/rng;i===0?x.moveTo(px,py):x.lineTo(px,py)});
    x.lineTo(pd.l+(valid[valid.length-1].x-1)/(pts.length-1||1)*cw,pd.t+ch);
    x.lineTo(pd.l+(valid[0].x-1)/(pts.length-1||1)*cw,pd.t+ch);x.closePath();
    x.fillStyle="rgba(184,115,51,0.12)";x.fill();
    // Draw line
    x.beginPath();x.strokeStyle=color;x.lineWidth=2.5;x.lineJoin="round";x.lineCap="round";
    valid.forEach(function(p,i){var px=pd.l+(p.x-1)/(pts.length-1||1)*cw;var py=pd.t+ch*(mx-p.v)/rng;i===0?x.moveTo(px,py):x.lineTo(px,py)});x.stroke();
    // Draw dots: filled for recorded, hollow for carried
    valid.forEach(function(p){
        var px=pd.l+(p.x-1)/(pts.length-1||1)*cw;var py=pd.t+ch*(mx-p.v)/rng;
        if(p.recorded!==false){
            x.beginPath();x.arc(px,py,4,0,Math.PI*2);x.fillStyle=color;x.fill();
            x.beginPath();x.arc(px,py,2,0,Math.PI*2);x.fillStyle="#0C0C0C";x.fill();
        } else {
            x.beginPath();x.arc(px,py,3,0,Math.PI*2);x.strokeStyle=color;x.lineWidth=1;x.globalAlpha=0.35;x.stroke();x.globalAlpha=1;
        }
    });
    var step=Math.max(1,Math.floor(pts.length/7));
    pts.forEach(function(p,i){if(i%step===0||i===pts.length-1){var px=pd.l+(p.x-1)/(pts.length-1||1)*cw;x.fillStyle="#7A756E";x.font="10px Space Grotesk";x.textAlign="center";x.textBaseline="top";x.fillText(p.x,px,h-pd.b+6)}});
}

function drawBars(id,vals,color,maxVal,goalVal) {
    var c=document.getElementById(id); if(!c) return;
    var dp=window.devicePixelRatio||1,w=c.parentElement.clientWidth-10,h=140;
    if(w<50) w=300;
    c.width=w*dp;c.height=h*dp;c.style.width=w+"px";c.style.height=h+"px";
    var x=c.getContext("2d");x.scale(dp,dp);x.clearRect(0,0,w,h);
    var pd={t:10,b:25,l:40,r:10},cw=w-pd.l-pd.r,ch=h-pd.t-pd.b;
    var mx=maxVal||Math.max.apply(null,vals.concat([1]));
    x.strokeStyle="rgba(255,255,255,0.05)";x.lineWidth=1;
    for(var i=0;i<=3;i++){var y=pd.t+ch*i/3;x.beginPath();x.moveTo(pd.l,y);x.lineTo(w-pd.r,y);x.stroke();x.fillStyle="#7A756E";x.font="10px Space Grotesk";x.textAlign="right";x.textBaseline="middle";x.fillText(Math.round(mx-mx*i/3),pd.l-5,y)}
    if(goalVal!==null&&goalVal<=mx){var gy=pd.t+ch*(mx-goalVal)/mx;x.strokeStyle="rgba(201,148,62,0.4)";x.setLineDash([4,4]);x.beginPath();x.moveTo(pd.l,gy);x.lineTo(w-pd.r,gy);x.stroke();x.setLineDash([]);x.fillStyle="#C9943E";x.font="9px Space Grotesk";x.textAlign="left";x.fillText("Goal",w-pd.r+2,gy-2)}
    var bw=Math.max(3,Math.min(12,(cw/vals.length)*0.7)),gap=cw/vals.length;
    vals.forEach(function(v,i){var bx=pd.l+gap*i+gap/2-bw/2;var bh=Math.max(0,v/mx*ch);var by=pd.t+ch-bh;x.fillStyle=v>0?color:"rgba(255,255,255,0.05)";x.beginPath();x.rect(bx,by,bw,bh);x.fill()});
    var step2=Math.max(1,Math.floor(vals.length/7));
    vals.forEach(function(v,i){if(i%step2===0||i===vals.length-1){var bx=pd.l+gap*i+gap/2;x.fillStyle="#7A756E";x.font="10px Space Grotesk";x.textAlign="center";x.textBaseline="top";x.fillText(i+1,bx,h-pd.b+6)}});
}

function rOverview() {
    var md=getMonthData(),y=oMonth.getFullYear(),m=oMonth.getMonth(),days=md.length;
    var tracked=0,habitSum=0,prayerSum=0,waterTotal=0,weightVals=[],maxStrk=0,curStrk=0;
    var prayerGrid=[],prayerCounts={};
    PRAYERS.forEach(function(p){prayerCounts[p]=0;prayerGrid.push([])});
    var allExtra=[],allHealth=[],readingTotals={};
    var dailyHabit=[],dailyWater=[];
    var df=gDef();
    df.ex.forEach(function(e){allExtra.push(e)});
    allExtra.forEach(function(e){prayerCounts["ex_"+e.n]=0});
    df.hl.forEach(function(e){allHealth.push(e)});
    allHealth.forEach(function(e){prayerCounts["hl_"+e.n]=0});

    md.forEach(function(d){
        var dd=d.data;
        var hasData=Object.keys(dd.habits).length>0||Object.keys(dd.prayers).length>0;
        if(hasData) tracked++;
        var hc=0,ht=Object.keys(dd.habits).length;
        Object.values(dd.habits).forEach(function(v){if(v) hc++});
        if(ht>0) habitSum+=hc/ht*100;
        var pc=0;
        Object.values(dd.prayers).forEach(function(v){if(v) pc++});
        prayerSum+=pc/5*100;
        PRAYERS.forEach(function(p,i){prayerGrid[i].push(dd.prayers[p]||false);if(dd.prayers[p])prayerCounts[p]++});
        allExtra.forEach(function(e){if(dd.extra[e.n])prayerCounts["ex_"+e.n]++});
        allHealth.forEach(function(e){if(dd.health[e.n])prayerCounts["hl_"+e.n]++});
        var wml=dd.water.filter(Boolean).length*WML;waterTotal+=wml;dailyWater.push(wml);
        if(dd.weight) weightVals.push(dd.weight);
        dd.reading.forEach(function(r){readingTotals[r.n]=(readingTotals[r.n]||0)+r.t});
        dailyHabit.push(ht?Math.round(hc/ht*100):0);
        var dayPct=ht?Math.round(hc/ht*100):0;
        if(dayPct>=50){curStrk++;if(curStrk>maxStrk)maxStrk=curStrk}else curStrk=0;
    });

    var dailyWeight = buildWeightSeries(md);

    var avgHabit=tracked?Math.round(habitSum/tracked):0,avgPrayer=tracked?Math.round(prayerSum/tracked):0;
    var recordedWeights=weightVals.filter(function(v){return v!==""&&v!==null&&v!==undefined});
    var wChange=recordedWeights.length>=2?(parseFloat(recordedWeights[recordedWeights.length-1])-parseFloat(recordedWeights[0])).toFixed(1):null;
    var lastW=recordedWeights.length?recordedWeights[recordedWeights.length-1]:null;
    if(!lastW){var cw2=getLastWeight(md[md.length-1].key);if(cw2)lastW=cw2;}
    var totalPages=Object.values(readingTotals).reduce(function(a,b){return a+b},0);

    var streakItems=[];
    allExtra.forEach(function(e){if(e.s){
        var daysArr=md.map(function(d){return d.data.extra[e.n]||false});
        var cur=0,best=0,tmp=0;
        for(var i=0;i<daysArr.length;i++){if(daysArr[i]){tmp++;if(tmp>best)best=tmp}else tmp=0}
        for(var j=daysArr.length-1;j>=0;j--){if(daysArr[j])cur++;else break}
        streakItems.push({name:e.n,days:daysArr,current:cur,best:best,rate:Math.round(daysArr.filter(function(v){return v}).length/daysArr.length*100)});
    }});
    allHealth.forEach(function(e){if(e.s){
        var daysArr=md.map(function(d){return d.data.health[e.n]||false});
        var cur=0,best=0,tmp=0;
        for(var i=0;i<daysArr.length;i++){if(daysArr[i]){tmp++;if(tmp>best)best=tmp}else tmp=0}
        for(var j=daysArr.length-1;j>=0;j--){if(daysArr[j])cur++;else break}
        streakItems.push({name:e.n,days:daysArr,current:cur,best:best,rate:Math.round(daysArr.filter(function(v){return v}).length/daysArr.length*100)});
    }});

    var h='<header class="text-center mb-5"><p class="text-xs tracking-widest uppercase" style="color:var(--mt)">Monthly Overview</p><h1 class="text-2xl md:text-3xl mt-1.5">'+fMon(oMonth)+'</h1><div class="flex items-center justify-center gap-3 mt-4"><button class="dnb" data-a="omp"><i class="fas fa-chevron-left text-xs"></i></button><button class="bt text-xs" data-a="back">Back to Daily</button><button class="dnb" data-a="omn"><i class="fas fa-chevron-right text-xs"></i></button></div>'+rNav("overview")+'<div class="al"></div></header>';

    h+='<div class="sg">';
    h+='<div class="sc"><div class="sv">'+tracked+'</div><div class="sl">Days Tracked</div></div>';
    h+='<div class="sc"><div class="sv" style="color:var(--ac)">'+avgHabit+'%</div><div class="sl">Avg Habits</div></div>';
    h+='<div class="sc"><div class="sv" style="color:var(--pr)">'+avgPrayer+'%</div><div class="sl">Avg Prayers</div></div>';
    h+='<div class="sc"><div class="sv" style="color:var(--wa)">'+(waterTotal/1000).toFixed(1)+'L</div><div class="sl">Total Water</div></div>';
    h+='<div class="sc"><div class="sv" style="color:var(--hl)">'+(lastW||'\u2014')+'</div><div class="sl">Current Weight</div></div>';
    var wChangeNum=wChange!==null?parseFloat(wChange):null;
    h+='<div class="sc"><div class="sv" style="color:'+(wChangeNum!==null&&wChangeNum<0?'var(--ok)':wChangeNum!==null&&wChangeNum>0?'var(--dn)':'var(--mt)')+'">'+(wChange!==null?(wChangeNum>0?'+':'')+wChange:'\u2014')+'</div><div class="sl">Weight Change</div></div>';
    h+='<div class="sc"><div class="sv" style="color:var(--ac)">'+maxStrk+'</div><div class="sl">Best Streak</div></div>';
    h+='<div class="sc"><div class="sv" style="color:var(--pr)">'+totalPages+'</div><div class="sl">Pages Read</div></div>';
    h+='</div>';

    h+='<div class="cd"><h3 class="text-sm font-semibold mb-3" style="color:var(--mt)">Daily Completion Heatmap</h3><div class="hmg">';
    ["S","M","T","W","T","F","S"].forEach(function(d){h+='<div class="hmh">'+d+'</div>'});
    var startDow=new Date(y,m,1).getDay();
    for(var i=0;i<startDow;i++) h+='<div class="hmc em"></div>';
    md.forEach(function(d){var s=dScore(d.key);var bg=s>=80?"rgba(74,140,92,0.5)":s>=50?"rgba(201,148,62,0.4)":s>0?"rgba(184,76,76,0.3)":"var(--sf)";var isTd=d.key===dk(new Date());h+='<div class="hmc'+(isTd?' today':'')+'" style="background:'+bg+'" title="Day '+d.day+': '+s+'%">'+d.day+'</div>'});
    h+='</div></div>';

    h+='<div class="cc2"><h3>Weight Trend</h3><p class="text-xs mb-2" style="color:var(--mt)">Solid dots = recorded · faint dots = carried from previous entry</p><div id="wcw"><canvas id="wc"></canvas></div></div>';
    h+='<div class="cc2"><h3>Daily Habit Completion</h3><div id="hbw"><canvas id="hb"></canvas></div></div>';

    h+='<div class="cd"><h3 class="text-sm font-semibold mb-3" style="color:var(--mt)">Prayer Consistency</h3><div class="phs"><div class="ph">';
    h+='<div style="display:flex;align-items:center;gap:3px;margin-bottom:2px"><div style="width:90px;flex-shrink:0"></div><div class="phg" style="--cols:'+days+';flex:1">';
    for(var d=0;d<days;d++){h+='<div class="phn">'+(((d+1)%5===1)||d===0?(d+1):'')+'</div>'}
    h+='</div></div>';
    for(var p=0;p<5;p++){
        var cnt=prayerGrid[p].filter(function(v){return v}).length;
        h+='<div style="display:flex;align-items:center;gap:3px;margin-bottom:3px">';
        h+='<div class="phl" style="width:90px;flex-shrink:0">'+PRAYERS[p]+' <span>('+cnt+'/'+days+')</span></div>';
        h+='<div class="phg" style="--cols:'+days+';flex:1">';
        for(var d=0;d<days;d++){h+='<div class="phc'+(prayerGrid[p][d]?' on':'')+'" title="'+PRAYERS[p]+' Day '+(d+1)+': '+(prayerGrid[p][d]?'Done':'Missed')+'"></div>'}
        h+='</div></div>';
    }
    h+='</div></div>';
    h+='<div class="flex items-center gap-3 mt-3 flex-wrap">';
    PRAYERS.forEach(function(p,i){var cnt=prayerCounts[p];var pct=tracked?Math.round(cnt/tracked*100):0;var clr=pct>=85?"var(--ok)":pct>=70?"var(--ac)":"var(--dn)";h+='<div class="flex items-center gap-1.5 text-xs"><div style="width:8px;height:8px;border-radius:2px;background:var(--pr)"></div><span style="color:var(--mt)">'+p+'</span><span style="color:'+clr+';font-weight:600">'+pct+'%</span></div>'});
    h+='</div></div>';

    if(streakItems.length>0){
        h+='<div class="cd"><h3 class="text-sm font-semibold mb-3" style="color:var(--mt)">Streak Tracker</h3><div class="stg">';
        streakItems.forEach(function(s){
            var clr=s.current===0?"var(--mt)":s.current<7?"var(--ac)":s.current<14?"var(--ok)":"#5ECC6F";
            var glow=s.current>=14?"text-shadow:0 0 20px rgba(94,204,111,0.4)":"";
            var pulse=s.current>0?"stc-act":"";
            h+='<div class="stc">';
            h+='<div class="stc-top"><span class="stc-nm">'+esc(s.name)+'</span></div>';
            h+='<div class="flex items-baseline gap-1.5 mb-1"><span class="stc-num '+pulse+'" style="color:'+clr+';'+glow+'">'+s.current+'</span><span class="stc-lbl">day streak</span></div>';
            h+='<div class="stc-dots">';
            s.days.forEach(function(d){h+='<div class="stc-dot'+(d?' on':'')+'"></div>'});
            h+='</div>';
            h+='<div class="stc-bot"><span>Best: '+s.best+' days</span><span>Rate: '+s.rate+'%</span></div>';
            h+='</div>';
        });
        h+='</div></div>';
    }

    h+='<div class="cc2"><h3>Water Intake (ml)</h3><div id="wbw"><canvas id="wb"></canvas></div></div>';

    if(Object.keys(readingTotals).length>0){
        h+='<div class="cd"><h3 class="text-sm font-semibold mb-3" style="color:var(--mt)">Reading Progress</h3>';
        var maxR=Math.max.apply(null,Object.values(readingTotals).concat([1]));
        var ri=0;
        Object.entries(readingTotals).forEach(function(entry){
            var name=entry[0],total=entry[1];
            h+='<div class="rbr"><div class="rbn">'+esc(name)+'</div><div class="rbt"><div class="rbf" style="width:0%;background:'+RCOLS[ri%RCOLS.length]+'" data-tw="'+Math.round(total/maxR*100)+'"></div></div><div class="rbv" style="color:'+RCOLS[ri%RCOLS.length]+'">'+total+' pg</div></div>';
            ri++;
        });
        h+='</div>';
    }

    h+=rFoot();
    document.getElementById("content").innerHTML=h;

    requestAnimationFrame(function(){
        drawLine("wc", dailyWeight, "#B87333");
        drawBars("hb",dailyHabit,"#C9943E",100,80);
        var wGoal=(df.wt||8)*WML;
        var wMax=Math.max.apply(null,dailyWater.concat([wGoal]));
        drawBars("wb",dailyWater,"#5A8FA8",wMax,wGoal);
        setTimeout(function(){document.querySelectorAll(".rbf[data-tw]").forEach(function(el){el.style.width=el.dataset.tw+"%"})},100);
    });
}

// ===== RENDER =====
function render() {
    if(view==="overview"){rOverview();return}
    if(view==="settings"){document.getElementById("content").innerHTML=rSettings();return}
    cData=gDay(dk(cDate));
    var h=rHead()+rWeek()+rHabits()+'<div class="dv"><div class="ln"></div><h2>Islamic Practices</h2><div class="ln"></div></div>'+rPrayers()+rExtra()+rReading()+'<div class="dv"><div class="ln"></div><h2>Health</h2><div class="ln"></div></div>'+rWater()+rWeight()+rHealth()+'<div class="dv"><div class="ln"></div><h2>Reflections</h2><div class="ln"></div></div>'+rGoalRef()+rFoot();
    document.getElementById("content").innerHTML=h;
}

// ===== EVENTS =====
var ct=document.getElementById("app");
ct.addEventListener("click",function(e){
    var t=e.target.closest("[data-a]"); if(!t) return; var a=t.dataset.a;

    if(a==="show-login" && typeof showAuthModal === "function"){showAuthModal("login");return}
    if(a==="show-signup" && typeof showAuthModal === "function"){showAuthModal("signup");return}
    if(a==="close-auth" && typeof closeAuthModal === "function"){closeAuthModal();return}
    if(a==="auth-tab" && typeof toggleAuthTab === "function"){toggleAuthTab(t.dataset.mode);return}
    if(a==="auth-submit" && typeof submitAuth === "function"){submitAuth(t.dataset.mode);return}
    if(a==="auth-google"){
        console.log("Google OAuth clicked. sbClient:", sbClient);
        if (typeof sbClient !== "undefined" && sbClient) {
            sbClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + window.location.pathname
                }
            }).then(function(res) {
                console.log("OAuth response:", res);
            }).catch(function(err) {
                console.error("OAuth error:", err);
            });
        } else {
            console.error("Supabase client (sbClient) is not initialized.");
        }
        return;
    }
    if(a==="signout" && typeof handleSignOut === "function"){handleSignOut();return}
    if(a==="sync-now" && typeof syncDown === "function"){syncDown();return}

    if(a==="prev"){cDate.setDate(cDate.getDate()-1);render();return}
    if(a==="next"){cDate.setDate(cDate.getDate()+1);render();return}
    if(a==="today"){cDate=new Date();render();return}
    if(a==="goto"){var p=t.dataset.k.split("-");cDate=new Date(+p[0],+p[1]-1,+p[2]);render();return}
    if(a==="vday"){view="daily";render();return}
    if(a==="vov"){view="overview";oMonth=new Date(cDate.getFullYear(),cDate.getMonth(),1);render();return}
    if(a==="vset"){view="settings";render();return}
    if(a==="back"){view="daily";render();return}
    if(a==="omp"){oMonth.setMonth(oMonth.getMonth()-1);rOverview();return}
    if(a==="omn"){oMonth.setMonth(oMonth.getMonth()+1);rOverview();return}
    if(a==="openrefl"){openReflModal();return}

    if(a==="tog"){var f=t.dataset.f,k=t.dataset.k;cData[f][k]=!cData[f][k];sDay();t.classList.toggle("on");t.setAttribute("aria-checked",cData[f][k]);uAll();return}

    if(a==="rm-habits"){e.stopPropagation();var n=t.dataset.n;delete cData.habits[n];sDay();var d=gDef();d.habits=d.habits.filter(function(x){return x!==n});sDef(d);t.closest(".ci").remove();uHP();toast("Removed");return}
    if(a==="rm-health"){e.stopPropagation();var n2=t.dataset.n;delete cData.health[n2];sDay();var dh=gDef();dh.hl=dh.hl.filter(function(x){return x.n!==n2});sDef(dh);t.closest(".ci").remove();uHL();toast("Removed");return}
    if(a==="rm-extra"){e.stopPropagation();var n3=t.dataset.n;delete cData.extra[n3];sDay();var de=gDef();de.ex=de.ex.filter(function(x){return x.n!==n3});sDef(de);t.closest(".ci").remove();reEX();toast("Removed");return}
    if(a==="rmr"){e.stopPropagation();var idx=+t.dataset.i;var nm=cData.reading[idx].n;cData.reading.splice(idx,1);sDay();var d2=gDef();d2.rd=d2.rd.filter(function(x){return x!==nm});sDef(d2);reRL();toast("Removed");return}
    if(a==="rg"){e.stopPropagation();var idx2=+t.dataset.i;cData.goalRef.splice(idx2,1);sDay();reGL();toast("Goal removed");return}

    if(a==="ah"){var inp=document.getElementById("nh"),nm=inp.value.trim();if(!nm){toast("Enter a name");return}if(cData.habits.hasOwnProperty(nm)){toast("Already exists");return}cData.habits[nm]=false;sDay();var d3=gDef();if(d3.habits.indexOf(nm)===-1){d3.habits.push(nm);sDef(d3)}inp.value="";reHL();toast("Added");return}
    if(a==="ahl"){var inp2=document.getElementById("nhl"),nm2=inp2.value.trim();if(!nm2){toast("Enter a name");return}if(cData.health.hasOwnProperty(nm2)){toast("Already exists");return}cData.health[nm2]=false;sDay();var d4=gDef();if(!d4.hl.find(function(x){return x.n===nm2})){d4.hl.push({n:nm2,s:false});sDef(d4)}inp2.value="";reHLL();toast("Added");return}
    if(a==="ae"){var inp3=document.getElementById("ne"),nm3=inp3.value.trim();if(!nm3){toast("Enter a name");return}if(cData.extra.hasOwnProperty(nm3)){toast("Already exists");return}cData.extra[nm3]=false;sDay();var d5=gDef();if(!d5.ex.find(function(x){return x.n===nm3})){d5.ex.push({n:nm3,s:false});sDef(d5)}inp3.value="";reEX();toast("Added");return}
    if(a==="ar"){var inp4=document.getElementById("nr"),nm4=inp4.value.trim();if(!nm4){toast("Enter a name");return}if(cData.reading.find(function(x){return x.n===nm4})){toast("Already exists");return}cData.reading.push({n:nm4,t:0});sDay();var d6=gDef();if(d6.rd.indexOf(nm4)===-1){d6.rd.push(nm4);sDef(d6)}inp4.value="";reRL();toast("Book added");return}

    if(a==="wt"){var wi=+t.dataset.i;cData.water[wi]=!cData.water[wi];sDay();t.classList.toggle("f");t.setAttribute("aria-checked",cData.water[wi]);uWP();uWD();return}
    if(a==="wta"){var delta=+t.dataset.d;var d7=gDef();var tg=(d7.wt||8)+delta;if(tg<1)tg=1;if(tg>30)tg=30;d7.wt=tg;sDef(d7);while(cData.water.length<tg)cData.water.push(false);cData.water=cData.water.slice(0,tg);sDay();reWT();uWD();return}

    if(a==="ra"){var ri2=+t.dataset.i;var inp5=document.getElementById("ri"+ri2);if(!inp5)return;var v=parseInt(inp5.value);if(!v||v<=0)return;cData.reading[ri2].t+=v;inp5.value="0";var sp=document.getElementById("rt"+ri2);if(sp)sp.textContent=cData.reading[ri2].t+" pg";sDay();toast("Added "+v+" page"+(v>1?"s":""));return}

    if(a==="ag"){var inp6=document.getElementById("ng"),nm5=inp6.value.trim();if(!nm5){toast("Enter a goal");return}cData.goalRef.push({name:nm5,text:""});sDay();inp6.value="";reGL();toast("Goal added");return}

    if(a==="eref"){var id=t.dataset.rid;var ph=id.indexOf("g-")===0?"Write your reflection for this goal...":(REFP[id.replace("r-","")]||"Write...");toEdit(id,ph);return}

    if(a==="swta"){var delta2=+t.dataset.d;var d8=gDef();var tg2=(d8.wt||8)+delta2;if(tg2<1)tg2=1;if(tg2>30)tg2=30;d8.wt=tg2;sDef(d8);var el=document.getElementById("swtv");if(el)el.textContent=tg2+" glasses ("+(tg2*WML)+" ml)";return}
    if(a==="sah"){var inp7=document.getElementById("snh"),nm6=inp7.value.trim();if(!nm6){toast("Enter a name");return}var d9=gDef();if(d9.habits.indexOf(nm6)!==-1){toast("Already exists");return}d9.habits.push(nm6);sDef(d9);inp7.value="";render();toast("Added");return}
    if(a==="srh"){e.stopPropagation();var i2=+t.dataset.i;var d10=gDef();d10.habits.splice(i2,1);sDef(d10);render();toast("Removed");return}
    if(a==="sae"){var inp8=document.getElementById("sne"),nm7=inp8.value.trim();if(!nm7){toast("Enter a name");return}var d11=gDef();if(d11.ex.find(function(x){return x.n===nm7})){toast("Already exists");return}d11.ex.push({n:nm7,s:false});sDef(d11);inp8.value="";render();toast("Added");return}
    if(a==="sre"){e.stopPropagation();var i3=+t.dataset.i;var d12=gDef();d12.ex.splice(i3,1);sDef(d12);render();toast("Removed");return}
    if(a==="tges"){e.stopPropagation();var i4=+t.dataset.i;var d13=gDef();d13.ex[i4].s=!d13.ex[i4].s;sDef(d13);t.classList.toggle("on");return}
    if(a==="sahl"){var inp9=document.getElementById("snhl"),nm8=inp9.value.trim();if(!nm8){toast("Enter a name");return}var d14=gDef();if(d14.hl.find(function(x){return x.n===nm8})){toast("Already exists");return}d14.hl.push({n:nm8,s:false});sDef(d14);inp9.value="";render();toast("Added");return}
    if(a==="srhl"){e.stopPropagation();var i5=+t.dataset.i;var d15=gDef();d15.hl.splice(i5,1);sDef(d15);render();toast("Removed");return}
    if(a==="tghs"){e.stopPropagation();var i6=+t.dataset.i;var d16=gDef();d16.hl[i6].s=!d16.hl[i6].s;sDef(d16);t.classList.toggle("on");return}
    if(a==="sar"){var inp10=document.getElementById("snr"),nm9=inp10.value.trim();if(!nm9){toast("Enter a name");return}var d17=gDef();if(d17.rd.indexOf(nm9)!==-1){toast("Already exists");return}d17.rd.push(nm9);sDef(d17);inp10.value="";render();toast("Added");return}
    if(a==="srr"){e.stopPropagation();var i7=+t.dataset.i;var d18=gDef();d18.rd.splice(i7,1);sDef(d18);render();toast("Removed");return}
    if(a==="clr"){if(confirm("This will delete ALL your habit tracking data. Are you sure?")){var keys2=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k && k.indexOf("ht_")===0)keys2.push(k)}keys2.forEach(function(k){localStorage.removeItem(k)});render();toast("All data cleared")}return}

    if(a==="exp"){var data={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k && k.indexOf("ht_")===0)try{data[k]=JSON.parse(localStorage.getItem(k))}catch(ex){}}var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});var a2=document.createElement("a");a2.href=URL.createObjectURL(blob);a2.download="habit-tracker-"+dk(new Date())+".json";a2.click();URL.revokeObjectURL(a2.href);toast("Exported");return}
    if(a==="impb"){document.getElementById("imf").click();return}
});

ct.addEventListener("keydown",function(e){
    if(e.target.classList.contains("rta")&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();var id=e.target.dataset.rid;var text=e.target.value.trim();sRefT(id,text);sDay();var c=e.target.closest(".rc,.grt");if(c)c.innerHTML=rComp(text,id,"");return}
    if(e.key==="Enter"){
        if(e.target.id==="nh"){e.preventDefault();document.querySelector('[data-a="ah"]').click();return}
        if(e.target.id==="nhl"){e.preventDefault();document.querySelector('[data-a="ahl"]').click();return}
        if(e.target.id==="ne"){e.preventDefault();document.querySelector('[data-a="ae"]').click();return}
        if(e.target.id==="nr"){e.preventDefault();document.querySelector('[data-a="ar"]').click();return}
        if(e.target.id==="ng"){e.preventDefault();document.querySelector('[data-a="ag"]').click();return}
        if(e.target.id&&e.target.id.indexOf("ri")===0){e.preventDefault();var i=+e.target.id.replace("ri","");var btn=document.querySelector('[data-a="ra"][data-i="'+i+'"]');if(btn)btn.click();return}
        if(e.target.id==="snh"){e.preventDefault();document.querySelector('[data-a="sah"]').click();return}
        if(e.target.id==="sne"){e.preventDefault();document.querySelector('[data-a="sae"]').click();return}
        if(e.target.id==="snhl"){e.preventDefault();document.querySelector('[data-a="sahl"]').click();return}
        if(e.target.id==="snr"){e.preventDefault();document.querySelector('[data-a="sar"]').click();return}
    }
    if((e.key==="Enter"||e.key===" ")&&e.target.closest('[data-a="tog"]')){e.preventDefault();e.target.closest('[data-a="tog"]').click();return}
    if((e.key==="Enter"||e.key===" ")&&e.target.closest('[data-a="wt"]')){e.preventDefault();e.target.closest('[data-a="wt"]').click();return}
});

ct.addEventListener("input",function(e){if(e.target.classList.contains("rta")){sRefT(e.target.dataset.rid,e.target.value);dSave()}});

ct.addEventListener("change",function(e){
    if(e.target.id==="wi"){
        var v=parseFloat(e.target.value);
        cData.weight=isNaN(v)?"":v;
        sDay();
        var s=document.getElementById("ws");
        if(s) s.textContent=(!isNaN(v)&&v)?"Saved: "+v+" kg":"Not recorded yet";
        if(s) s.style.color=(!isNaN(v)&&v)?"var(--ok)":"var(--mt)";
        return;
    }
    if(e.target.id==="imf"){if(e.target.files[0]){var r=new FileReader();r.onload=function(ev){try{var d=JSON.parse(ev.target.result);Object.entries(d).forEach(function(entry){localStorage.setItem(entry[0],JSON.stringify(entry[1]));if(entry[0].indexOf("ht_")===0 && typeof dbSave === "function")dbSave(entry[0],entry[1])});render();toast("Imported")}catch(ex){toast("Invalid file")}};r.readAsText(e.target.files[0])}e.target.value="";return}
});

document.addEventListener("keydown",function(e){
    // Close modal on Escape
    if(e.key==="Escape"){
        if(document.getElementById("rfl-modal")){closeReflModal();return}
        var authEl = document.getElementById("auth-overlay");
        if(authEl && authEl.classList.contains("active") && typeof closeAuthModal === "function"){closeAuthModal();return}
    }
    if(view==="overview"){if(e.key==="ArrowLeft"){oMonth.setMonth(oMonth.getMonth()-1);rOverview()}else if(e.key==="ArrowRight"){oMonth.setMonth(oMonth.getMonth()+1);rOverview()}else if(e.key.toLowerCase()==="t"&&!e.ctrlKey&&!e.metaKey){view="daily";cDate=new Date();render()}return}
    if(view==="settings"){if(e.key==="Escape"){view="daily";render()}return}
    var tag=document.activeElement?document.activeElement.tagName:"";
    if(tag==="INPUT"||tag==="TEXTAREA"||tag==="BUTTON") return;
    if(e.key==="ArrowLeft"){cDate.setDate(cDate.getDate()-1);render()}else if(e.key==="ArrowRight"){cDate.setDate(cDate.getDate()+1);render()}else if(e.key.toLowerCase()==="t"&&!e.ctrlKey&&!e.metaKey){cDate=new Date();render()}else if(e.key.toLowerCase()==="m"&&!e.ctrlKey&&!e.metaKey){view="overview";oMonth=new Date(cDate.getFullYear(),cDate.getMonth(),1);render()}
});

render();

// ===== SERVICE WORKER (offline support) =====
if ('serviceWorker' in navigator) {
  var swCode = `
const CACHE = 'habit-tracker-v1';
const URLS = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Space+Grotesk:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.allSettled(URLS.map(function(u){ return c.add(u).catch(function(){}); }));
    }).then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (res && res.status === 200 && res.type !== 'opaque') {
          var clone = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
        }
        return res;
      }).catch(function() { return cached; });
    })
  );
});
`;
  var swBlob = new Blob([swCode], {type: 'application/javascript'});
  var swUrl = URL.createObjectURL(swBlob);
  navigator.serviceWorker.register(swUrl, {scope: './'}).catch(function(){});
}
