// Pehar widget for Scriptable — renders the user's Waqt schedule.
// This file is fetched and run by a small loader pasted into Scriptable (get it from
// Waqt -> Settings -> Home screen widget). The loader sets TOKEN, SUPABASE_URL and ANON_KEY
// as globals, then runs this. Home-screen widgets are full colour; lock-screen widgets are
// monochrome (an iOS rule). Updating this file updates everyone's widget.
(async () => {
  const GOLD = "#C9943E";
  const TEXT = "#E8E2D9";
  const MUTED = "#7A756E";
  const BG = "#0C0C0C";
  const CARD_BG = "#1A1A1A";
  const LINE = "#2A2725";

  // Time-of-day tones matching approved Waqt demo
  const DAWN = "#5A8FA8";
  const NOON = "#C9943E";
  const AFTERNOON = "#DBA84E";
  const DUSK = "#B87333";
  const NIGHT = "#7B9E6B";

  async function getFeed() {
    try {
      if (typeof SUPABASE_URL === "undefined" || typeof ANON_KEY === "undefined" || typeof TOKEN === "undefined") {
        return { error: true };
      }
      const r = new Request(SUPABASE_URL + "/rest/v1/rpc/get_widget_feed");
      r.method = "POST";
      r.headers = { apikey: ANON_KEY, Authorization: "Bearer " + ANON_KEY, "Content-Type": "application/json" };
      r.body = JSON.stringify({ p_token: TOKEN });
      return (await r.loadJSON()) || {};
    } catch (e) {
      return { error: true };
    }
  }

  const nowMin = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };

  const toMin = (t) => {
    if (typeof t === "number") return t;
    const p = String(t || "0:0").split(":").map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0);
  };

  const formatTime = (t) => {
    if (typeof t === "number") {
      const h24 = Math.floor(t / 60) % 24;
      const m = t % 60;
      const ap = h24 >= 12 ? "pm" : "am";
      const h12 = h24 % 12 || 12;
      return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
    }
    const parts = String(t || "0:0").split(":").map(Number);
    let h = parts[0] || 0;
    const m = parts[1] || 0;
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ap}`;
  };

  const strike = (s) => (s || "").split("").map((c) => c + "\u0336").join("");

  function timeTone(min) {
    if (min < 420) return DAWN;
    if (min < 720) return NOON;
    if (min < 1020) return AFTERNOON;
    if (min < 1170) return DUSK;
    return NIGHT;
  }

  function monoFont(size, weight) {
    const bold = weight === "bold" || weight === "600" || weight === "700";
    try {
      return new Font(bold ? "Menlo-Bold" : "Menlo", size);
    } catch (e) {
      try {
        return bold ? Font.boldMonospacedSystemFont(size) : Font.regularMonospacedSystemFont(size);
      } catch (e2) {
        return bold ? Font.boldSystemFont(size) : Font.systemFont(size);
      }
    }
  }

  const feed = await getFeed();
  const rawItems = feed.items || feed.pehar || [];
  const fam = (typeof config !== "undefined" && config.widgetFamily) || "large";
  const isLock = fam.indexOf("accessory") === 0;
  const lock = isLock;

  // Normalize item fields matching computeWidgetPayload contract:
  // name (n), time (t), start, end, done, color (c), prayer, now
  const items = rawItems.map((it) => {
    const name = it.name || it.n || "";
    const timeStr = it.time || it.t || (typeof it.start === "string" ? it.start : "");
    const startMin = typeof it.start === "number" ? it.start : toMin(timeStr);
    const endMin = typeof it.end === "number"
      ? it.end
      : (it.end ? toMin(it.end) : startMin + (it.dur || 30));
    const color = it.color || it.c || it.kc || null;
    const done = !!it.done;
    const prayer = !!(it.prayer || it.isPrayer);
    const isNowExplicit = !!(it.now || it.isNow);
    const tag = it.tag || (prayer ? "PRAYER" : "");
    return {
      name,
      time: timeStr,
      start: startMin,
      end: endMin,
      color,
      done,
      prayer,
      tag,
      isNowExplicit,
      raw: it
    };
  });

  items.sort((a, b) => (a.start - b.start) || (b.prayer - a.prayer));

  const doneCount = typeof feed.done === "number" ? feed.done : items.filter((x) => x.done).length;
  const totalCount = typeof feed.total === "number" ? feed.total : items.length;

  const w = new ListWidget();

  if (isLock) {
    // iOS forces lock-screen accessory widgets to monochrome; do not set background
    const n = nowMin();
    let now = null, next = null;
    for (const it of items) {
      if (it.start <= n && n < it.end) now = it;
      if (it.start > n && !next) next = it;
    }
    if (fam === "accessoryInline") {
      w.addText(now ? ("Now " + now.name) : (next ? ("Next " + next.name + " " + formatTime(next.time || next.start)) : "No plan"));
    } else if (fam === "accessoryCircular") {
      const a = w.addText(String(doneCount)); a.font = Font.boldSystemFont(20); a.centerAlignText();
      const b = w.addText("/" + totalCount); b.font = Font.systemFont(9); b.centerAlignText();
    } else {
      const h = w.addText("PEHAR"); h.font = Font.boldSystemFont(9); h.textOpacity = 0.7; w.addSpacer(2);
      if (now) { const x = w.addText("Now " + now.name); x.font = Font.mediumSystemFont(13); }
      if (next) { const y = w.addText("Next " + next.name + " " + formatTime(next.time || next.start)); y.font = Font.systemFont(12); y.textOpacity = 0.75; }
      if (!now && !next) w.addText(feed.error ? "Open Waqt" : "Nothing scheduled");
    }
  } else {
    w.backgroundColor = new Color(BG);
    w.setPadding(14, 15, 12, 15);

    const n = nowMin();

    // Identify the active/focal "NOW" item:
    // 1. Explicit now flag if provided
    // 2. Item currently active (start <= n < end)
    // 3. First upcoming item (start > n)
    // 4. Fallback to last item (late night after all events)
    let nowIndex = items.findIndex((it) => it.isNowExplicit);
    if (nowIndex === -1) {
      nowIndex = items.findIndex((it) => it.start <= n && n < it.end);
    }
    if (nowIndex === -1) {
      nowIndex = items.findIndex((it) => it.start > n);
    }
    if (nowIndex === -1 && items.length > 0) {
      nowIndex = items.length - 1;
    }

    const maxRows = fam === "large" ? 7 : (fam === "medium" ? 4 : 3);

    // Window around NOW: show 1-2 completed/past items above, then NOW, then upcoming.
    // Slides dynamically through the day so evening items are never truncated.
    let windowItems = items;
    if (items.length > maxRows) {
      const idealPast = fam === "large" ? 2 : 1;
      let start = nowIndex - idealPast;
      let end = start + maxRows;
      if (end > items.length) {
        end = items.length;
        start = Math.max(0, end - maxRows);
      }
      if (start < 0) {
        start = 0;
        end = Math.min(items.length, start + maxRows);
      }
      windowItems = items.slice(start, end);
    }

    const nowItem = nowIndex >= 0 ? items[nowIndex] : null;

    if (fam === "large") {
      // Header matches the demo: greeting eyebrow, day, date on the left; a gold ring with the
      // done/total count on the right.
      const head = w.addStack();
      head.centerAlignContent();

      const headLeft = head.addStack();
      headLeft.layoutVertically();

      const nowD = new Date();
      const hr = nowD.getHours();
      const greet = hr < 12 ? "GOOD MORNING" : hr < 17 ? "GOOD AFTERNOON" : "GOOD EVENING";
      const eye = headLeft.addText(greet);
      eye.font = monoFont(9, "medium");
      eye.textColor = new Color(MUTED);

      headLeft.addSpacer(5);

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayLabel = headLeft.addText(dayNames[nowD.getDay()]);
      dayLabel.font = Font.boldSystemFont(22);
      dayLabel.textColor = new Color(TEXT);

      headLeft.addSpacer(3);

      const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
      const dt = headLeft.addText(`${monthNames[nowD.getMonth()]} ${nowD.getDate()} · ${nowD.getFullYear()}`);
      dt.font = monoFont(9);
      dt.textColor = new Color(MUTED);

      head.addSpacer();

      // Gold ring (bordered circle) with done/total, like the demo.
      const ring = head.addStack();
      ring.size = new Size(44, 44);
      ring.cornerRadius = 22;
      ring.borderWidth = 1;
      ring.borderColor = new Color(GOLD);
      ring.centerAlignContent();
      const pt = ring.addText(`${doneCount}/${totalCount}`);
      pt.font = monoFont(11, "bold");
      pt.textColor = new Color(GOLD);
      pt.centerAlignText();

      w.addSpacer(10);
      const divTop = w.addStack();
      divTop.size = new Size(0, 1);
      divTop.backgroundColor = new Color(LINE);
      w.addSpacer(10);
    } else {
      // Compact header for medium / small
      const head = w.addStack();
      head.centerAlignContent();
      const ht = head.addText("PEHAR");
      ht.font = monoFont(10, "bold");
      ht.textColor = new Color(MUTED);
      head.addSpacer();
      const c = head.addText(`${doneCount} / ${totalCount}`);
      c.font = monoFont(10, "bold");
      c.textColor = new Color(GOLD);

      w.addSpacer(5);
      const divTop = w.addStack();
      divTop.size = new Size(0, 1);
      divTop.backgroundColor = new Color(LINE);
      w.addSpacer(6);
    }

    if (windowItems.length === 0) {
      const em = w.addText(feed.error ? "Open Waqt to sync" : "No timed items today");
      em.font = Font.systemFont(12);
      em.textColor = new Color(MUTED);
    } else {
      const rowGap = fam === "large" ? 3 : 3;

      for (let i = 0; i < windowItems.length; i++) {
        const it = windowItems[i];
        const isNow = it === nowItem;

        // One demo-style row: [time] · [dot] · [entry card: color bar | name | tag].
        // Past = dimmed; strike ONLY ticked items; NOW = gold card.
        const isDone = it.done;
        const isPast = typeof it.start === "number" && it.start < n && !isNow;
        const dim = (isDone || isPast) && !isNow;
        const alpha = dim ? 0.42 : 1.0;
        const tone = isNow ? GOLD : (it.prayer ? timeTone(it.start) : (it.color || timeTone(it.start)));

        const row = w.addStack();
        row.centerAlignContent();

        // Fixed-width time column (height 0 = auto), right-aligned.
        const tcol = row.addStack();
        tcol.size = new Size(fam === "large" ? 52 : 46, 0);
        tcol.addSpacer();
        const tm = tcol.addText(formatTime(it.time || it.start));
        tm.font = monoFont(10, isNow ? "bold" : "regular");
        tm.textColor = isNow ? new Color(GOLD) : new Color(MUTED, alpha);
        tm.lineLimit = 1;

        row.addSpacer(8);

        // Timeline dot.
        const dotWrap = row.addStack();
        dotWrap.size = new Size(11, 11);
        dotWrap.centerAlignContent();
        const dot = dotWrap.addStack();
        const dsz = isNow ? 10 : 8;
        dot.size = new Size(dsz, dsz);
        dot.cornerRadius = dsz / 2;
        dot.backgroundColor = new Color(tone, dim ? 0.5 : 1.0);

        row.addSpacer(8);

        // Entry card.
        const card = row.addStack();
        card.centerAlignContent();
        card.cornerRadius = 9;
        card.borderWidth = 1;
        card.borderColor = isNow ? new Color(GOLD, 0.8) : new Color(LINE);
        card.backgroundColor = isNow ? new Color(GOLD, 0.16) : new Color(CARD_BG, dim ? 0.5 : 1.0);
        card.setPadding(7, 10, 7, 10);

        const bar = card.addStack();
        bar.backgroundColor = new Color(tone, dim ? 0.6 : 1.0);
        bar.size = new Size(3, 16);
        bar.cornerRadius = 1.5;
        card.addSpacer(9);

        const nameText = isDone ? strike(it.name) : it.name;
        const name = card.addText(nameText);
        name.lineLimit = 1;
        name.font = isNow ? Font.boldSystemFont(12) : (isDone ? Font.systemFont(12) : Font.mediumSystemFont(12));
        name.textColor = isNow ? new Color("#FFF7EA") : new Color(TEXT, alpha);
        if (isDone) { try { name.applyStrikethroughStyle = true; } catch (e) {} }

        card.addSpacer();

        const tagText = isNow ? "NOW" : (it.tag || "");
        if (tagText) {
          const tag = card.addText(tagText);
          tag.font = monoFont(9, isNow ? "bold" : "regular");
          tag.textColor = isNow ? new Color(GOLD) : new Color(MUTED, alpha);
          tag.lineLimit = 1;
        }

        if (i < windowItems.length - 1) {
          w.addSpacer(rowGap);
        }
      }
    }

    if (fam === "large" || fam === "medium") {
      w.addSpacer();

      const footDiv = w.addStack();
      footDiv.size = new Size(0, 1);
      footDiv.backgroundColor = new Color(LINE);
      w.addSpacer(fam === "large" ? 5 : 6);

      const foot = w.addStack();
      foot.centerAlignContent();

      if (fam !== "large") {
        const footLabel = foot.addText("PEHAR");
        footLabel.font = monoFont(9, "bold");
        footLabel.textColor = new Color(MUTED);
        foot.addSpacer();
      }

      const remaining = Math.max(0, totalCount - doneCount);
      const rem = foot.addText(`${remaining} LEFT TODAY`);
      rem.font = monoFont(9, "bold");
      rem.textColor = new Color(fam === "large" ? MUTED : GOLD);
    }
  }

  // Reload at the next item boundary (capped 2–60 min) so NOW/upcoming stay aligned with real
  // time. iOS honors this within its refresh budget; it can't be pushed live from the app.
  try {
    const nMin = nowMin();
    const up = items.map((x) => x.start).filter((s) => typeof s === "number" && s > nMin).sort((a, b) => a - b);
    const deltaMs = up.length ? (up[0] - nMin) * 60000 + 60000 : 15 * 60000;
    w.refreshAfterDate = new Date(Date.now() + Math.max(2 * 60000, Math.min(60 * 60000, deltaMs)));
  } catch (e) {}
  if (typeof Script !== "undefined") { Script.setWidget(w); Script.complete(); }
  if (typeof config === "undefined" || !config.runsInWidget) {
    if (lock && w.presentAccessoryRectangular) w.presentAccessoryRectangular();
    else if (fam === "large") w.presentLarge();
    else if (fam === "medium") w.presentMedium();
    else w.presentSmall();
  }
})();
