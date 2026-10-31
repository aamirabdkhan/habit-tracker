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
    return {
      name,
      time: timeStr,
      start: startMin,
      end: endMin,
      color,
      done,
      prayer,
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
      // Header matching approved demo: Eyebrow + Day + Date on left, circular progress badge on right
      const head = w.addStack();
      head.centerAlignContent();

      const headLeft = head.addStack();
      headLeft.layoutVertically();

      const curHour = (new Date()).getHours();
      const eyebrowStr = curHour < 12 ? "GOOD MORNING" : (curHour < 17 ? "GOOD AFTERNOON" : "GOOD EVENING");
      const eb = headLeft.addText(eyebrowStr);
      eb.font = monoFont(9);
      eb.textColor = new Color(MUTED);

      headLeft.addSpacer(2);

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayStr = dayNames[(new Date()).getDay()];
      const dayLabel = headLeft.addText(dayStr);
      dayLabel.font = Font.boldSystemFont(22);
      dayLabel.textColor = new Color(TEXT);

      headLeft.addSpacer(2);

      const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
      const nowD = new Date();
      const dateStr = `${monthNames[nowD.getMonth()]} ${nowD.getDate()} · ${nowD.getFullYear()}`;
      const dt = headLeft.addText(dateStr);
      dt.font = monoFont(9);
      dt.textColor = new Color(MUTED);

      head.addSpacer();

      const prog = head.addStack();
      prog.centerAlignContent();
      prog.size = new Size(38, 38);
      prog.cornerRadius = 19;
      prog.borderWidth = 1;
      prog.borderColor = new Color(GOLD);
      prog.backgroundColor = new Color("#161412");
      const pt = prog.addText(`${doneCount}/${totalCount}`);
      pt.font = monoFont(10, "bold");
      pt.textColor = new Color(GOLD);
      pt.centerAlignText();

      w.addSpacer(8);
      const divTop = w.addStack();
      divTop.size = new Size(0, 1);
      divTop.backgroundColor = new Color(LINE);
      w.addSpacer(8);
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
      const rowGap = fam === "large" ? 4 : 3;

      for (let i = 0; i < windowItems.length; i++) {
        const it = windowItems[i];
        const isNow = it === nowItem;

        if (isNow) {
          // Highlighted NOW item: boxed, gold-accented, bold, with NOW marker
          const box = w.addStack();
          box.centerAlignContent();
          box.backgroundColor = new Color(CARD_BG);
          box.borderWidth = 1;
          box.borderColor = new Color(GOLD);
          box.cornerRadius = 8;
          box.setPadding(5, 8, 5, 8);

          const bar = box.addStack();
          bar.backgroundColor = new Color(GOLD);
          bar.size = new Size(3, 18);
          bar.cornerRadius = 1.5;

          box.addSpacer(8);

          const nameText = it.done ? strike(it.name) : it.name;
          const name = box.addText(nameText);
          name.lineLimit = 1;
          name.font = Font.boldSystemFont(12.5);
          name.textColor = new Color("#FFF7EA");
          if (it.done) {
            name.textOpacity = 0.6;
            try { name.applyStrikethroughStyle = true; } catch (e) {}
          }

          box.addSpacer();

          const marker = box.addText("NOW");
          marker.font = monoFont(9, "bold");
          marker.textColor = new Color(GOLD);

          box.addSpacer(6);

          const tm = box.addText(formatTime(it.time || it.start));
          tm.font = monoFont(10, "bold");
          tm.textColor = new Color(GOLD);
        } else {
          // Regular row: past (completed = dimmed + strike-through) or upcoming (normal)
          const row = w.addStack();
          row.centerAlignContent();
          row.setPadding(2, 4, 2, 4);

          const barTone = it.prayer ? timeTone(it.start) : (it.color || timeTone(it.start));
          const bar = row.addStack();
          bar.backgroundColor = new Color(barTone);
          bar.size = new Size(3, 16);
          bar.cornerRadius = 1.5;

          row.addSpacer(8);

          const isDone = it.done;
          const nameText = isDone ? strike(it.name) : it.name;
          const name = row.addText(nameText);
          name.lineLimit = 1;
          name.font = isDone ? Font.systemFont(12) : Font.mediumSystemFont(12);
          name.textColor = new Color(TEXT, isDone ? 0.42 : 1.0);
          if (isDone) {
            try { name.applyStrikethroughStyle = true; } catch (e) {}
          }

          row.addSpacer();

          const tm = row.addText(formatTime(it.time || it.start));
          tm.font = monoFont(10);
          tm.textColor = new Color(MUTED, isDone ? 0.42 : 1.0);
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
      w.addSpacer(6);

      const foot = w.addStack();
      foot.centerAlignContent();

      const footLabel = foot.addText("PEHAR");
      footLabel.font = monoFont(9, "bold");
      footLabel.textColor = new Color(MUTED);

      foot.addSpacer();

      const remaining = Math.max(0, totalCount - doneCount);
      const rem = foot.addText(`${remaining} LEFT TODAY`);
      rem.font = monoFont(9, "bold");
      rem.textColor = new Color(GOLD);
    }
  }

  if (typeof Script !== "undefined") { Script.setWidget(w); Script.complete(); }
  if (typeof config === "undefined" || !config.runsInWidget) {
    if (lock && w.presentAccessoryRectangular) w.presentAccessoryRectangular();
    else if (fam === "large") w.presentLarge();
    else if (fam === "medium") w.presentMedium();
    else w.presentSmall();
  }
})();
