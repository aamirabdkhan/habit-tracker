// Prayer widget for Scriptable — the "current window" design (mockup C-v3): the prayer you're in
// right now, a bar draining until it ends, "ends in Xh Ym · <next> at <time>", and an adaptive dot
// row of every prayer you track. Fard = solid ring, voluntary (Duha/Tahajjud) = dashed ring; done =
// green, current = gold. All of it is computed LIVE from the clock against the times in the feed, so
// it stays correct whenever iOS refreshes (the app can't push a refresh).
//
// Fetched + run by the loader pasted into Scriptable (Waqt > Settings > Home screen widget), which
// sets TOKEN, SUPABASE_URL and ANON_KEY. Lock-screen widgets are monochrome (an iOS rule).
(async () => {
  const GOLD = "#C9943E";
  const TEXT = "#E8E2D9";
  const MUTED = "#7A756E";
  const BG = "#0C0C0C";
  const SAGE = "#7B9E6B";
  const DUSK = "#B87333";
  const TRACK = "#2A2725";

  async function getFeed() {
    try {
      if (typeof SUPABASE_URL === "undefined" || typeof ANON_KEY === "undefined" || typeof TOKEN === "undefined") return { error: true };
      const r = new Request(SUPABASE_URL + "/rest/v1/rpc/get_widget_feed");
      r.method = "POST";
      r.headers = { apikey: ANON_KEY, Authorization: "Bearer " + ANON_KEY, "Content-Type": "application/json" };
      r.body = JSON.stringify({ p_token: TOKEN });
      return (await r.loadJSON()) || {};
    } catch (e) { return { error: true }; }
  }

  function monoFont(size, bold) {
    try { return new Font(bold ? "Menlo-Bold" : "Menlo", size); }
    catch (e) { return bold ? Font.boldSystemFont(size) : Font.systemFont(size); }
  }
  function serifFont(size, bold) {
    try { return new Font(bold ? "Georgia-Bold" : "Georgia", size); }
    catch (e) { return bold ? Font.boldSystemFont(size) : Font.systemFont(size); }
  }

  function parseHM(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function fmtLeft(mins) { const h = Math.floor(mins / 60), m = mins % 60; return h > 0 ? `${h}h ${m}m` : `${m}m`; }
  function fmtClock(min) {
    min = ((min % 1440) + 1440) % 1440;
    let h = Math.floor(min / 60), m = min % 60, ap = h < 12 ? "am" : "pm";
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m < 10 ? "0" : ""}${m} ${ap}`;
  }

  // Draw a prayer dot as an image so voluntary prayers can have a real dashed ring (Scriptable
  // stacks can't dash a border). state: "done" | "now" | "upcoming".
  function dotImage(state, voluntary, mono) {
    const size = 13, scale = 3, S = size * scale;
    const ctx = new DrawContext();
    ctx.size = new Size(S, S); ctx.opaque = false; ctx.respectScreenScale = false;
    const cx = S / 2, r = S * 0.40;
    let ring = mono ? "#9A978F" : MUTED, fill = null;
    if (state === "done") { ring = mono ? "#CFCCC5" : SAGE; fill = ring; }
    else if (state === "now") { ring = mono ? "#FFFFFF" : GOLD; }
    if (voluntary) {
      // dotted ring = ring of small circles around the circumference
      const dots = 9, rr = S * 0.065;
      ctx.setFillColor(new Color(ring));
      for (let i = 0; i < dots; i++) {
        const a = (i / dots) * 2 * Math.PI, x = cx + r * Math.cos(a), y = cx + r * Math.sin(a);
        ctx.fillEllipse(new Rect(x - rr, y - rr, rr * 2, rr * 2));
      }
      if (fill) { const ir = r * 0.42; ctx.setFillColor(new Color(fill)); ctx.fillEllipse(new Rect(cx - ir, cx - ir, ir * 2, ir * 2)); }
    } else if (fill) {
      ctx.setFillColor(new Color(fill)); ctx.fillEllipse(new Rect(cx - r, cx - r, r * 2, r * 2));
    } else {
      ctx.setStrokeColor(new Color(ring)); ctx.setLineWidth(S * (state === "now" ? 0.11 : 0.085));
      ctx.strokeEllipse(new Rect(cx - r, cx - r, r * 2, r * 2));
    }
    return ctx.getImage();
  }

  const feed = await getFeed();
  const DEFAULT = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const raw = (feed && Array.isArray(feed.prayers) && feed.prayers.length) ? feed.prayers : DEFAULT.map((name) => ({ name, done: false, time: "", voluntary: false }));

  // Build the timed, time-sorted list and find the CURRENT window from the clock.
  const list = raw.map((p) => ({ name: p.name, done: !!p.done, voluntary: !!p.voluntary, min: parseHM(p.time) }))
    .filter((p) => p.min != null)
    .sort((a, b) => a.min - b.min);

  const nowD = new Date();
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();

  let cur = null, nxt = null, curStart = 0, nxtStart = 0, hasWindow = list.length > 0;
  if (hasWindow) {
    let ci = -1;
    for (let i = 0; i < list.length; i++) if (list[i].min <= nowMin) ci = i;
    if (ci === -1) { cur = list[list.length - 1]; curStart = cur.min - 1440; nxt = list[0]; nxtStart = nxt.min; }
    else {
      cur = list[ci]; curStart = cur.min;
      if (ci + 1 >= list.length) { nxt = list[0]; nxtStart = nxt.min + 1440; }
      else { nxt = list[ci + 1]; nxtStart = nxt.min; }
    }
  }
  const windowLen = Math.max(1, nxtStart - curStart);
  const frac = hasWindow ? Math.max(0, Math.min(1, (nowMin - curStart) / windowLen)) : 0;
  const leftMin = hasWindow ? Math.max(0, nxtStart - nowMin) : 0;

  const fam = (typeof config !== "undefined" && config.widgetFamily) || "medium";
  const isLock = fam.indexOf("accessory") === 0;
  const w = new ListWidget();

  if (isLock) {
    const name = hasWindow ? cur.name : (feed.error ? "Open Waqt" : "Prayers");
    const left = hasWindow ? `ends in ${fmtLeft(leftMin)}` : "";
    if (fam === "accessoryInline") {
      w.addText(`${name}${left ? " · " + left : ""}`);
    } else if (fam === "accessoryCircular") {
      const a = w.addText(name.slice(0, 4)); a.font = Font.boldSystemFont(12); a.centerAlignText();
      const b = w.addText(hasWindow ? fmtLeft(leftMin) : ""); b.font = Font.systemFont(9); b.centerAlignText();
    } else {
      const hh = w.addText("PRAYER NOW"); hh.font = Font.boldSystemFont(9); hh.textOpacity = 0.7;
      w.addSpacer(2);
      const t = w.addText(name); t.font = Font.boldSystemFont(16);
      if (left) { const c = w.addText(left); c.font = Font.systemFont(11); c.textOpacity = 0.75; }
    }
  } else {
    w.backgroundColor = new Color(BG);
    w.setPadding(16, 18, 14, 18);

    // Title: current prayer + "now"
    const top = w.addStack(); top.centerAlignContent();
    const nm = top.addText(hasWindow ? cur.name : (feed.error ? "Open Waqt" : "No prayers"));
    nm.font = serifFont(fam === "large" ? 34 : 28, true);
    nm.textColor = new Color(TEXT);
    top.addSpacer();
    if (hasWindow) { const nowLbl = top.addText("now"); nowLbl.font = monoFont(12); nowLbl.textColor = new Color(MUTED); }

    w.addSpacer(7);

    // "ends in X · next at HH:MM"
    if (hasWindow) {
      const line = w.addStack(); line.centerAlignContent();
      const e1 = line.addText("ends in "); e1.font = monoFont(12); e1.textColor = new Color(MUTED);
      const e2 = line.addText(fmtLeft(leftMin)); e2.font = monoFont(12, true); e2.textColor = new Color(GOLD);
      const e3 = line.addText(` · ${nxt.name} ${fmtClock(nxtStart)}`); e3.font = monoFont(12); e3.textColor = new Color(MUTED); e3.lineLimit = 1;
    }

    w.addSpacer(11);

    // Progress bar drawn as an image so the fill is truly proportional (stacks can't do % widths).
    if (hasWindow) {
      const BW = 320, BH = 6, sc = 3, W = BW * sc, H = BH * sc;
      const ctx = new DrawContext(); ctx.size = new Size(W, H); ctx.opaque = false; ctx.respectScreenScale = false;
      const rad = H / 2;
      ctx.setFillColor(new Color(TRACK)); ctx.fillRect(new Rect(0, 0, W, H));
      const fw = Math.max(H, W * frac);
      // approximate rounded fill with a rect (rounding is sub-pixel at this height)
      ctx.setFillColor(new Color(GOLD)); ctx.fillRect(new Rect(0, 0, fw, H));
      const barImg = w.addImage(ctx.getImage());
      // Without an explicit imageSize Scriptable draws the image at its full pixel size (960px wide),
      // overflowing the widget. Constrain it to a sensible display width.
      barImg.imageSize = new Size(fam === "large" ? 320 : 300, BH);
      barImg.cornerRadius = rad;
    }

    w.addSpacer(fam === "large" ? 16 : 13);

    // Dot row — one column per tracked prayer, in time order.
    const row = w.addStack(); row.centerAlignContent();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const state = (p === cur && hasWindow) ? "now" : (p.done ? "done" : "upcoming");
      const col = row.addStack(); col.layoutVertically(); col.centerAlignContent();
      const img = col.addImage(dotImage(state, p.voluntary, false));
      img.imageSize = new Size(15, 15);
      col.addSpacer(6);
      const lbl = col.addText(p.name.length > 5 ? p.name.slice(0, 4) : p.name);
      lbl.font = monoFont(9, state === "now");
      lbl.textColor = state === "now" ? new Color(GOLD) : new Color(MUTED);
      lbl.centerAlignText(); lbl.lineLimit = 1; lbl.minimumScaleFactor = 0.7;
      if (i < list.length - 1) row.addSpacer();
    }
  }

  try {
    const capMs = Math.max(2 * 60000, Math.min(60 * 60000, hasWindow ? leftMin * 60000 + 60000 : 15 * 60000));
    w.refreshAfterDate = new Date(Date.now() + capMs);
  } catch (e) {}

  if (typeof Script !== "undefined") { Script.setWidget(w); Script.complete(); }
  if (typeof config === "undefined" || !config.runsInWidget) {
    if (isLock && w.presentAccessoryRectangular) w.presentAccessoryRectangular();
    else if (fam === "large") w.presentLarge();
    else if (fam === "small") w.presentSmall();
    else w.presentMedium();
  }
})();
