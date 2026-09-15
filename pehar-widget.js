// Pehar widget for Scriptable — renders the user's Waqt schedule.
// This file is fetched and run by a small loader you paste into Scriptable (get it from
// Waqt -> Settings -> Home screen widget). The loader sets TOKEN, SUPABASE_URL and ANON_KEY
// as globals, then runs this. Home-screen widgets are full colour; lock-screen widgets are
// monochrome (an iOS rule). Updating this file updates everyone's widget.
(async () => {
  const GOLD = "#c9943e", INK = "#1a1512", FG = "#e8e2d9", MUT = "#8a8177";

  async function getFeed() {
    try {
      const r = new Request(SUPABASE_URL + "/rest/v1/rpc/get_widget_feed");
      r.method = "POST";
      r.headers = { apikey: ANON_KEY, Authorization: "Bearer " + ANON_KEY, "Content-Type": "application/json" };
      r.body = JSON.stringify({ p_token: TOKEN });
      return (await r.loadJSON()) || {};
    } catch (e) { return { error: true }; }
  }
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const toMin = (t) => { const p = (t || "0:0").split(":"); return (+p[0]) * 60 + (+p[1]); };
  const pretty = (t) => { const a = (t || "0:0").split(":").map(Number); let h = a[0]; const m = a[1]; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return h + (m ? ":" + String(m).padStart(2, "0") : "") + ap; };
  function pickNowNext(items) {
    const n = nowMin(); let now = null, next = null;
    for (const it of items) { const s = toMin(it.t), e = it.end ? toMin(it.end) : s + 30; if (s <= n && n < e) now = it; if (s > n && !next) next = it; }
    return { now, next };
  }

  const feed = await getFeed();
  const items = feed.items || [];
  const fam = (typeof config !== "undefined" && config.widgetFamily) || "large";
  const lock = fam.indexOf("accessory") === 0;
  const w = new ListWidget();

  if (lock) {
    // iOS forces lock-screen widgets to monochrome; don't set a background.
    const { now, next } = pickNowNext(items);
    if (fam === "accessoryInline") {
      w.addText(now ? ("Now " + now.n) : (next ? ("Next " + next.n + " " + pretty(next.t)) : "No plan"));
    } else if (fam === "accessoryCircular") {
      const a = w.addText(String(feed.done || 0)); a.font = Font.boldSystemFont(20); a.centerAlignText();
      const b = w.addText("/" + (feed.total || items.length)); b.font = Font.systemFont(9); b.centerAlignText();
    } else {
      const h = w.addText("PEHAR"); h.font = Font.boldSystemFont(9); h.textOpacity = 0.7; w.addSpacer(2);
      if (now) { const x = w.addText("Now " + now.n); x.font = Font.mediumSystemFont(13); }
      if (next) { const y = w.addText("Next " + next.n + " " + pretty(next.t)); y.font = Font.systemFont(12); y.textOpacity = 0.75; }
      if (!now && !next) w.addText(feed.error ? "Open Waqt" : "Nothing scheduled");
    }
  } else {
    w.backgroundColor = new Color(INK);
    w.setPadding(14, 15, 12, 15);
    const head = w.addStack(); head.centerAlignContent();
    const ht = head.addText("PEHAR"); ht.font = Font.boldSystemFont(10); ht.textColor = new Color(MUT);
    head.addSpacer();
    const c = head.addText((feed.done || 0) + " / " + (feed.total || items.length)); c.font = Font.mediumSystemFont(10); c.textColor = new Color(GOLD);
    w.addSpacer(fam === "large" ? 7 : 9);
    const n = nowMin();
    // Focus on what's ahead: drop items that are already finished AND done, so a busy day's
    // remaining schedule fits. Missed (past but not done) items stay visible.
    const upcoming = items.filter(function(it) { const s = toMin(it.t), e = it.end ? toMin(it.end) : s + 30; return e >= n || !it.done; });
    const max = fam === "large" ? 14 : (fam === "medium" ? 4 : 3);
    const gap = fam === "large" ? 5 : (fam === "small" ? 5 : 7);
    const fsz = fam === "large" ? 12 : 12.5;
    let shown = 0;
    for (const it of upcoming) {
      if (shown >= max) { const more = w.addText("+" + (upcoming.length - shown) + " more"); more.font = Font.systemFont(10); more.textColor = new Color(MUT); break; }
      const s = toMin(it.t), e = it.end ? toMin(it.end) : s + 30, isNow = s <= n && n < e;
      const row = w.addStack(); row.centerAlignContent();
      const bar = row.addStack(); bar.backgroundColor = new Color(it.c || GOLD); bar.size = new Size(3, 18); bar.cornerRadius = 2;
      row.addSpacer(8);
      const name = row.addText(it.n); name.lineLimit = 1;
      name.font = it.done ? Font.systemFont(fsz) : (isNow ? Font.boldSystemFont(fsz) : Font.mediumSystemFont(fsz));
      name.textColor = new Color(FG, it.done ? 0.45 : 1);
      row.addSpacer();
      const tm = row.addText(isNow ? "now" : pretty(it.t)); tm.font = Font.systemFont(9.5); tm.textColor = new Color(isNow ? GOLD : MUT);
      w.addSpacer(gap);
      shown++;
    }
    if (shown === 0) { const em = w.addText(feed.error ? "Open Waqt to sync" : (items.length ? "All done for today" : "No timed items today")); em.font = Font.systemFont(12); em.textColor = new Color(MUT); }
  }

  if (typeof Script !== "undefined") { Script.setWidget(w); Script.complete(); }
  if (typeof config === "undefined" || !config.runsInWidget) {
    if (lock && w.presentAccessoryRectangular) w.presentAccessoryRectangular();
    else if (fam === "large") w.presentLarge();
    else if (fam === "medium") w.presentMedium();
    else w.presentSmall();
  }
})();
