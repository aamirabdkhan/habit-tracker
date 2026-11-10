// Stats widget for Scriptable — renders daily progress ring, counts, and next item.
// This file is fetched and run by a small loader pasted into Scriptable (get it from
// Waqt -> Settings -> Home screen widget). The loader sets TOKEN, SUPABASE_URL and ANON_KEY
// as globals, then runs this. Home-screen widgets are full colour; lock-screen widgets are
// monochrome (an iOS rule).
(async () => {
  const GOLD = "#C9943E";
  const TEXT = "#E8E2D9";
  const MUTED = "#7A756E";
  const BG = "#0C0C0C";
  const CARD_BG = "#1A1A1A";
  const LINE = "#2A2725";
  const SAGE = "#7B9E6B";
  const COPPER = "#B87333";
  const DANGER = "#B84C4C";

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

  function createProgressRing(pct, size) {
    const dc = new DrawContext();
    dc.size = new Size(size, size);
    dc.opaque = false;
    dc.respectScreenScale = true;

    const strokeWidth = 5;
    const radius = (size - strokeWidth) / 2;
    const cx = size / 2;
    const cy = size / 2;

    // Background track circle
    dc.setStrokeColor(new Color(LINE));
    dc.setLineWidth(strokeWidth);
    dc.strokeEllipse(new Rect(strokeWidth / 2, strokeWidth / 2, radius * 2, radius * 2));

    // Foreground progress arc
    const val = Math.max(0, Math.min(100, Math.round(pct)));
    if (val > 0) {
      dc.setStrokeColor(new Color(GOLD));
      dc.setLineWidth(strokeWidth);
      if (val >= 100) {
        dc.strokeEllipse(new Rect(strokeWidth / 2, strokeWidth / 2, radius * 2, radius * 2));
      } else {
        const points = [];
        const startAngle = -Math.PI / 2;
        const sweep = (2 * Math.PI) * (val / 100);
        const steps = Math.max(8, Math.floor(64 * (val / 100)));
        for (let i = 0; i <= steps; i++) {
          const theta = startAngle + (sweep * i / steps);
          const x = cx + radius * Math.cos(theta);
          const y = cy + radius * Math.sin(theta);
          points.push(new Point(x, y));
        }
        const p = new Path();
        p.addLines(points);
        dc.addPath(p);
        dc.strokePath();
      }
    }

    // Percentage value centered inside the ring
    dc.setTextAlignedCenter();
    dc.setTextColor(new Color(TEXT));
    const fontSize = val >= 100 ? 17 : 20;
    dc.setFont(Font.boldSystemFont(fontSize));
    const textY = Math.round((size - 22) / 2);
    dc.drawTextInRect(`${val}%`, new Rect(0, textY, size, 28));

    return dc.getImage();
  }

  const feed = await getFeed();
  const stats = (feed && feed.stats) || {};

  let percent = 0;
  if (typeof stats.percent === "number") {
    percent = Math.max(0, Math.min(100, Math.round(stats.percent)));
  } else if (typeof feed.total === "number" && feed.total > 0 && typeof feed.done === "number") {
    percent = Math.max(0, Math.min(100, Math.round((feed.done / feed.total) * 100)));
  }

  const counts = Array.isArray(stats.counts) ? stats.counts : [];
  const nextItem = stats.next || feed.nextPrayer || null;

  const fam = (typeof config !== "undefined" && config.widgetFamily) || "medium";
  const isLock = fam.indexOf("accessory") === 0;
  const lock = isLock;

  const w = new ListWidget();

  if (isLock) {
    // iOS lock-screen accessory widget: monochrome one-liner (percent + next)
    const nextName = nextItem && nextItem.name ? nextItem.name : (feed.error ? "Open Waqt" : "Done");
    let nextInStr = "";
    if (nextItem && nextItem.in) {
      const inClean = String(nextItem.in).replace(/^in\s+/, "");
      nextInStr = ` in ${inClean}`;
    }
    const monoOneLiner = `${percent}% \u00B7 Next: ${nextName}${nextInStr}`;

    if (fam === "accessoryCircular") {
      const a = w.addText(`${percent}%`);
      a.font = Font.boldSystemFont(14);
      a.centerAlignText();
      const b = w.addText(nextItem && nextItem.name ? nextItem.name : "Waqt");
      b.font = Font.systemFont(9);
      b.centerAlignText();
    } else if (fam === "accessoryRectangular") {
      const h = w.addText("STATS");
      h.font = Font.boldSystemFont(9);
      h.textOpacity = 0.7;
      w.addSpacer(2);
      const t = w.addText(monoOneLiner);
      t.font = monoFont(11, "bold");
    } else {
      // accessoryInline
      const t = w.addText(monoOneLiner);
      t.font = monoFont(11);
    }
  } else {
    // Home-screen medium widget: full colour
    w.backgroundColor = new Color(BG);
    w.setPadding(14, 16, 12, 16);

    // Top section: Progress ring on left, counts columns on right
    const top = w.addStack();
    top.centerAlignContent();

    const ringImg = createProgressRing(percent, 68);
    const ringWImg = top.addImage(ringImg);
    ringWImg.imageSize = new Size(68, 68);

    top.addSpacer(14);

    const statsStack = top.addStack();
    statsStack.centerAlignContent();

    if (fam === "small") {
      // Compact: one combined total instead of per-card columns (ring + Next line render regardless).
      let totalDone = 0, totalCount = 0;
      for (let i = 0; i < counts.length; i++) {
        totalDone += typeof counts[i].done === "number" ? counts[i].done : 0;
        totalCount += typeof counts[i].total === "number" ? counts[i].total : 0;
      }
      const total = statsStack.addText(`${totalDone}/${totalCount}`);
      total.font = Font.boldSystemFont(17);
      total.textColor = new Color(TEXT);
      statsStack.addSpacer(5);
      const totalLabel = statsStack.addText("TODAY");
      totalLabel.font = monoFont(7, "medium");
      totalLabel.textColor = new Color(MUTED);
    } else if (counts.length === 0) {
      const noCounts = statsStack.addText(feed.error ? "Open Waqt to sync" : "No active counts");
      noCounts.font = Font.systemFont(12);
      noCounts.textColor = new Color(MUTED);
    } else {
      const visibleCounts = counts.slice(0, 5);
      for (let i = 0; i < visibleCounts.length; i++) {
        const c = visibleCounts[i];
        const col = statsStack.addStack();
        col.layoutVertically();

        const doneVal = typeof c.done === "number" ? c.done : 0;
        const totalVal = typeof c.total === "number" ? c.total : 0;
        const val = col.addText(`${doneVal}/${totalVal}`);
        val.font = Font.boldSystemFont(17);
        val.textColor = new Color(TEXT);
        val.lineLimit = 1;
        val.minimumScaleFactor = 0.7;

        col.addSpacer(5);

        // Keep labels to one short word so 5 columns never collide ("Healthy Lifestyle" -> HEALTHY,
        // "Extra Deeds" -> EXTRA); shrink any still-long single word to fit.
        let lblText = String(c.label || "").toUpperCase().trim();
        if (lblText.indexOf(" ") !== -1) lblText = lblText.split(/\s+/)[0];
        const lbl = col.addText(lblText);
        lbl.font = monoFont(7, "medium");
        lbl.textColor = new Color(MUTED);
        lbl.lineLimit = 1;
        lbl.minimumScaleFactor = 0.6;

        if (i < visibleCounts.length - 1) {
          statsStack.addSpacer();
        }
      }
    }

    w.addSpacer(10);

    // Divider line
    const div = w.addStack();
    div.size = new Size(0, 1);
    div.backgroundColor = new Color(LINE);

    w.addSpacer(8);

    // Next line: Dot + Next: NAME · in X
    const nextStack = w.addStack();
    nextStack.centerAlignContent();

    const dot = nextStack.addStack();
    dot.size = new Size(7, 7);
    dot.cornerRadius = 3.5;
    dot.backgroundColor = new Color(SAGE);

    nextStack.addSpacer(6);

    const nextPrefix = nextStack.addText("Next: ");
    nextPrefix.font = monoFont(11);
    nextPrefix.textColor = new Color(MUTED);

    if (nextItem && nextItem.name) {
      const nName = nextStack.addText(nextItem.name);
      nName.font = monoFont(11, "bold");
      nName.textColor = new Color(TEXT);

      if (nextItem.in) {
        const inStr = String(nextItem.in);
        const inText = inStr.startsWith("in ") ? inStr.slice(3) : inStr;
        const nIn = nextStack.addText(" \u00B7 in " + inText);
        nIn.font = monoFont(11);
        nIn.textColor = new Color(MUTED);
      }
    } else {
      const nNone = nextStack.addText(feed.error ? "Open Waqt to sync" : "All caught up");
      nNone.font = monoFont(11);
      nNone.textColor = new Color(MUTED);
    }
  }

  try { w.refreshAfterDate = new Date(Date.now() + 15 * 60000); } catch (e) {}
  if (typeof Script !== "undefined") {
    Script.setWidget(w);
    Script.complete();
  }
  if (typeof config === "undefined" || !config.runsInWidget) {
    if (lock && w.presentAccessoryRectangular) {
      w.presentAccessoryRectangular();
    } else if (fam === "large") {
      w.presentLarge();
    } else if (fam === "small") {
      w.presentSmall();
    } else {
      w.presentMedium();
    }
  }
})();
