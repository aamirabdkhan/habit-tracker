// Next prayer widget for Scriptable — renders active countdown and 5 daily prayer dots.
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

  function serifFont(size, bold) {
    try {
      return new Font(bold ? "Georgia-Bold" : "Georgia", size);
    } catch (e) {
      try {
        return bold ? Font.boldSerifSystemFont(size) : Font.regularSerifSystemFont(size);
      } catch (e2) {
        return bold ? Font.boldSystemFont(size) : Font.systemFont(size);
      }
    }
  }

  const feed = await getFeed();

  const DEFAULT_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const rawPrayers = (feed && Array.isArray(feed.prayers) && feed.prayers.length > 0)
    ? feed.prayers
    : DEFAULT_PRAYERS.map((name) => ({ name, done: false, time: "" }));

  // Compute the next prayer LIVE from the clock + the times in the feed, rather than trusting
  // feed.nextPrayer (which is baked when the app last published, so it goes stale — e.g. still
  // showing Asr at Isha time). This makes the widget correct whenever iOS refreshes it.
  function parseHM(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim()); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  function fmtIn(mins) { const h = Math.floor(mins / 60), m = mins % 60; return h > 0 ? `${h}h ${m}m` : `${m}m`; }
  const nowD = new Date();
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const timed = rawPrayers.map((p, i) => ({ i, min: parseHM(p.time) })).filter((p) => p.min != null);
  // next = earliest prayer still ahead today; after the last one, wrap to the first tomorrow.
  let nextIdx = -1, nextMin = null, nextDate = null;
  const ahead = timed.filter((p) => p.min > nowMin).sort((a, b) => a.min - b.min);
  if (ahead.length) { nextIdx = ahead[0].i; nextMin = ahead[0].min; }
  else if (timed.length) { const first = timed.slice().sort((a, b) => a.min - b.min)[0]; nextIdx = first.i; nextMin = first.min + 1440; }
  // Fall back to the server-baked value only when the feed carries no times at all.
  const baked = (feed && feed.nextPrayer) || (feed && feed.stats && feed.stats.next) || null;
  let nextPrayer = null;
  if (nextIdx >= 0) {
    nextPrayer = { name: rawPrayers[nextIdx].name || DEFAULT_PRAYERS[nextIdx] || "Prayer", in: fmtIn(nextMin - nowMin) };
    nextDate = new Date(nowD.getTime() + (nextMin - nowMin) * 60000);
  } else if (baked) {
    nextPrayer = baked;
  }

  const prayers = rawPrayers.map((p, idx) => {
    // Passed-by-clock prayers count as done (or explicitly ticked). The "next" one is highlighted.
    const pMin = parseHM(p.time);
    const isDone = !!p.done || (pMin != null && nextIdx >= 0 && nextMin < 1440 && pMin < nowMin && idx !== nextIdx);
    const isNext = idx === nextIdx;
    return {
      name: p.name || DEFAULT_PRAYERS[idx] || "Prayer",
      done: isDone && !isNext,
      next: isNext,
      time: p.time || ""
    };
  });

  const fam = (typeof config !== "undefined" && config.widgetFamily) || "medium";
  const isLock = fam.indexOf("accessory") === 0;
  const lock = isLock;

  const w = new ListWidget();

  if (isLock) {
    // iOS lock-screen accessory widget: monochrome
    const prayerName = nextPrayer && nextPrayer.name ? nextPrayer.name : (feed.error ? "Open Waqt" : "Done");
    let countdownStr = "";
    if (nextPrayer && nextPrayer.in) {
      const inClean = String(nextPrayer.in).replace(/^in\s+/, "");
      countdownStr = `in ${inClean}`;
    }

    if (fam === "accessoryInline") {
      w.addText(`Next: ${prayerName}${countdownStr ? " " + countdownStr : ""}`);
    } else if (fam === "accessoryCircular") {
      const a = w.addText(prayerName.slice(0, 4));
      a.font = Font.boldSystemFont(12);
      a.centerAlignText();
      const b = w.addText(nextPrayer && nextPrayer.in ? String(nextPrayer.in).replace(/^in\s+/, "") : "Done");
      b.font = Font.systemFont(9);
      b.centerAlignText();
    } else {
      // accessoryRectangular
      const h = w.addText("NEXT PRAYER");
      h.font = Font.boldSystemFont(9);
      h.textOpacity = 0.7;
      w.addSpacer(2);
      const t = w.addText(prayerName);
      t.font = Font.boldSystemFont(16);
      if (countdownStr) {
        const c = w.addText(countdownStr);
        c.font = Font.systemFont(11);
        c.textOpacity = 0.75;
      }
    }
  } else {
    // Home-screen medium widget: full colour
    w.backgroundColor = new Color(BG);
    w.setPadding(16, 18, 14, 18);

    // Eyebrow
    const eyebrow = w.addText("NEXT PRAYER");
    eyebrow.font = monoFont(10, "medium");
    eyebrow.textColor = new Color(MUTED);

    w.addSpacer(10);

    // Prayer Top: Big prayer name + countdown
    const prayerTop = w.addStack();
    prayerTop.centerAlignContent();

    const prayerNameStr = nextPrayer && nextPrayer.name ? nextPrayer.name : (feed.error ? "Open Waqt" : "Completed");
    const nameLabel = prayerTop.addText(prayerNameStr);
    nameLabel.font = serifFont(36, true);
    nameLabel.textColor = new Color(TEXT);

    prayerTop.addSpacer();

    let countStr = "";
    if (nextPrayer && nextPrayer.in) {
      const rawIn = String(nextPrayer.in);
      countStr = rawIn.startsWith("in ") ? rawIn : `in ${rawIn}`;
    } else if (!nextPrayer) {
      countStr = feed.error ? "to sync" : "for today";
    }

    if (countStr) {
      const countLabel = prayerTop.addText(countStr);
      countLabel.font = monoFont(13, "bold");
      countLabel.textColor = new Color(GOLD);
    }

    w.addSpacer();

    // Prayers dots row: done=filled (SAGE), next=ring (GOLD), later=muted (MUTED)
    const prayersStack = w.addStack();
    prayersStack.centerAlignContent();

    for (let i = 0; i < prayers.length; i++) {
      const p = prayers[i];
      const col = prayersStack.addStack();
      col.layoutVertically();
      col.centerAlignContent();

      // Uniform dot wrap stack to center dot horizontally and vertically
      const dotWrap = col.addStack();
      dotWrap.size = new Size(14, 14);
      dotWrap.centerAlignContent();

      const dot = dotWrap.addStack();
      if (p.done) {
        dot.size = new Size(10, 10);
        dot.cornerRadius = 5;
        dot.backgroundColor = new Color(SAGE);
      } else if (p.next) {
        dot.size = new Size(12, 12);
        dot.cornerRadius = 6;
        dot.borderWidth = 2;
        dot.borderColor = new Color(GOLD);
      } else {
        dot.size = new Size(10, 10);
        dot.cornerRadius = 5;
        dot.borderWidth = 1;
        dot.borderColor = new Color(MUTED);
      }

      col.addSpacer(6);

      const lbl = col.addText(p.name);
      lbl.font = monoFont(9, p.next ? "bold" : "regular");
      lbl.textColor = p.next ? new Color(GOLD) : new Color(MUTED);
      lbl.centerAlignText();

      if (i < prayers.length - 1) {
        prayersStack.addSpacer();
      }
    }
  }

  // Ask iOS to reload at the next prayer boundary (capped 2–60 min) so the widget flips right
  // when the prayer changes. iOS treats this as a hint within its refresh budget — it can't be
  // pushed from the app, but it keeps the widget from drifting far from real time.
  try {
    const capMs = Math.max(2 * 60000, Math.min(60 * 60000, nextDate ? nextDate.getTime() - Date.now() + 60000 : 15 * 60000));
    w.refreshAfterDate = new Date(Date.now() + capMs);
  } catch (e) {}

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
