// Priority widget for Scriptable — renders carried priority one-time tasks and late age.
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

  const feed = await getFeed();
  const priorityList = (feed && Array.isArray(feed.priority)) ? feed.priority : [];

  const fam = (typeof config !== "undefined" && config.widgetFamily) || "medium";
  const isLock = fam.indexOf("accessory") === 0;
  const lock = isLock;

  const w = new ListWidget();

  if (isLock) {
    // iOS lock-screen accessory widget: monochrome
    if (priorityList.length === 0) {
      if (fam === "accessoryInline") {
        w.addText("Priority: All clear");
      } else if (fam === "accessoryCircular") {
        const a = w.addText("0");
        a.font = Font.boldSystemFont(20);
        a.centerAlignText();
        const b = w.addText("CLEAR");
        b.font = Font.systemFont(8);
        b.centerAlignText();
      } else {
        const h = w.addText("PRIORITY");
        h.font = Font.boldSystemFont(9);
        h.textOpacity = 0.7;
        w.addSpacer(2);
        w.addText(feed.error ? "Open Waqt" : "All clear");
      }
    } else {
      const topItem = priorityList[0];
      const topAge = typeof topItem.age === "number" ? topItem.age : 0;
      const topChip = topAge <= 0 ? "today" : `${topAge}d late`;

      if (fam === "accessoryInline") {
        w.addText(`Priority: ${topItem.name || "Task"} (${topChip})`);
      } else if (fam === "accessoryCircular") {
        const a = w.addText(String(priorityList.length));
        a.font = Font.boldSystemFont(20);
        a.centerAlignText();
        const b = w.addText("PRIORITY");
        b.font = Font.systemFont(8);
        b.centerAlignText();
      } else {
        const h = w.addText("PRIORITY");
        h.font = Font.boldSystemFont(9);
        h.textOpacity = 0.7;
        w.addSpacer(2);
        const maxAcc = Math.min(2, priorityList.length);
        for (let i = 0; i < maxAcc; i++) {
          const item = priorityList[i];
          const itemAge = typeof item.age === "number" ? item.age : 0;
          const chip = itemAge <= 0 ? "today" : `${itemAge}d late`;
          const rowText = w.addText(`${item.name || "Task"} \u00B7 ${chip}`);
          rowText.font = Font.systemFont(11);
          rowText.lineLimit = 1;
          rowText.minimumScaleFactor = 0.7;
        }
      }
    }
  } else {
    // Home-screen medium widget: full colour
    w.backgroundColor = new Color(BG);
    w.setPadding(16, 18, 14, 18);

    // Eyebrow
    const eyebrow = w.addText("PRIORITY");
    eyebrow.font = monoFont(10, "medium");
    eyebrow.textColor = new Color(MUTED);

    w.addSpacer(10);

    if (priorityList.length === 0) {
      w.addSpacer();
      const emptyStack = w.addStack();
      emptyStack.centerAlignContent();
      const emptyLabel = emptyStack.addText(feed.error ? "Open Waqt to sync" : "All clear");
      emptyLabel.font = Font.systemFont(14);
      emptyLabel.textColor = new Color(MUTED);
      w.addSpacer();
    } else {
      // Large lists every priority; medium caps and reserves the final row for a "+N more" count.
      const cap = fam === "large" ? priorityList.length : 4;
      const overflow = priorityList.length > cap;
      const visible = priorityList.slice(0, overflow ? cap - 1 : cap);
      for (let i = 0; i < visible.length; i++) {
        const it = visible[i];
        const nameStr = String(it.name || "Untitled");
        const age = typeof it.age === "number" ? it.age : 0;

        const row = w.addStack();
        row.centerAlignContent();

        const nameTxt = row.addText(nameStr);
        nameTxt.font = Font.mediumSystemFont(13.5);
        nameTxt.textColor = new Color(TEXT);
        nameTxt.lineLimit = 1;

        row.addSpacer();

        // Age chip: age 0 => 'today', else age+'d late'
        const isToday = age <= 0;
        const isUrgent = age >= 3;
        const chipText = isToday ? "today" : `${age}d late`;
        const chipColorHex = isToday ? GOLD : (isUrgent ? DANGER : COPPER);

        const chip = row.addStack();
        chip.centerAlignContent();
        chip.cornerRadius = 9;
        chip.borderWidth = 1;
        chip.borderColor = new Color(chipColorHex, 0.8);
        chip.backgroundColor = new Color(chipColorHex, 0.12);
        chip.setPadding(3, 7, 3, 7);

        const chipLabel = chip.addText(chipText);
        chipLabel.font = monoFont(9.5, "medium");
        chipLabel.textColor = new Color(chipColorHex);

        if (i < visible.length - 1) {
          w.addSpacer(7);
          const div = w.addStack();
          div.size = new Size(0, 1);
          div.backgroundColor = new Color(LINE);
          w.addSpacer(7);
        }
      }
      if (overflow) {
        w.addSpacer(7);
        const moreRow = w.addStack();
        moreRow.centerAlignContent();
        const moreTxt = moreRow.addText(`+${priorityList.length - visible.length} more`);
        moreTxt.font = monoFont(10, "medium");
        moreTxt.textColor = new Color(MUTED);
        moreRow.addSpacer();
      }
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
