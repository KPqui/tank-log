/* Flowerphile · rules.js — the app's own small brain (tier 0)
   Two jobs, both pure functions (no network, no DOM), so they run instantly on the phone and can be tested:
   1. plan(p, ctx)        keeps a rolling plan of the next days for every plant from germination until the cure
                          is finished, from phase templates. Never duplicates (each generated task has a `gen` key).
   2. afterLog(p, log, ctx) reacts the moment a log is saved (and again on the next sync for the newest log):
                          values outside the target range add a task or pull an existing step forward right away,
                          urgent ones a "Check in with Claude" for the next morning. Returns {tasks, moves, why};
                          a move is {id, due, why} for a task that already exists.
   3. focus(day)          the part of the process the review questions this week (water, feed, light, climate,
                          training), the same for the app and the nightly review.
   The nightly review (Claude) still adds judgment on top: photos, free text, feed steps, timing. */
(function(){
  const D = s => new Date(s + "T12:00:00");
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diff = (a, b) => Math.round((D(b) - D(a)) / 864e5);
  const HORIZON = 7;                                        // days of plan kept ready ahead

  const has = (ctx, p, gen) => ctx.tasks.some(t => t.run === p.id && t.gen === gen);
  const openSoon = (ctx, p, re, days) => ctx.tasks.some(t => t.run === p.id && t.status === "open" && re.test(t.title) && (!t.due || diff(ctx.today, t.due) <= days));
  const task = (p, gen, due, title, detail, trigger, extra) => Object.assign({id:"g-" + gen.replace(/[^a-z0-9]+/gi, "-") + "-" + p.id, run:p.id, gen, due, title, detail, trigger, status:"open", src:"app"}, extra || {});

  /* --- 1. phase templates --- */
  function plan(p, ctx){
    const T = ctx.today, ph = ctx.phase, start = ctx.phaseStart, out = [];
    if (!ph) return out;
    const want = (gen, due, title, detail, trigger) => { if (due >= T && diff(T, due) <= HORIZON && !has(ctx, p, gen)) out.push(task(p, gen, due, title, detail, trigger)); };
    if (ph === "germ"){
      for (let k = 0; k <= HORIZON; k++) want("germ-check-" + add(T, k), add(T, k), "Check the seed", "Moist, not wet. Look for the tail; plant it once it's 0.5–1 cm.", "Daily until it sprouts");
    }
    if (ph === "grow" || ph === "bloom"){
      // a check every 3 days unless one is already planned (the nightly review adds its own)
      for (let k = 0; k <= HORIZON; k += 3){ const d = add(T, k);
        if (!ctx.tasks.some(t => t.run === p.id && t.status === "open" && /^check\b/i.test(t.title) && t.due && Math.abs(diff(d, t.due)) <= 1))
          want("check-" + d, d, (ctx.check || {}).title || "Check: values, photo, sensor file", (ctx.check || {}).detail || "Log pH, EC and water temperature, take a photo, add the sensor file.", "Every 3 days" + (ph === "bloom" ? " (daily on bloom days 15–49)" : "")); }
    }
    if (ph === "dry" && start){
      for (let k = 0; k <= HORIZON; k++){ const d = add(T, k), day = diff(start, d);
        want("dry-check-" + d, d, "Check the drying", "Note the drying space's RH and temperature, weigh the same sample, bend a small stem.", "Daily while drying (day " + day + ")"); }
      const snap = add(start, 7); if (snap >= T) want("dry-snap", snap, "Snap test", "Small stems should snap, not bend. If they snap and the sample has lost ~72–75 %, it's time for jars.", "About 7 days in");
    }
    if ((ph === "cure" || ph === "done") && start){
      const cureDay = d => diff(start, d);
      for (let k = 0; k <= HORIZON; k++){ const d = add(T, k), cd = cureDay(d);
        if (ph === "cure" && cd >= 0 && cd < 14) want("cure-burp-" + d, d, "Burp jars", "Open every jar about 10 minutes (longer if a jar reads over 63 %). Note the jar RH.", "Daily, cure days 1–14 (day " + (cd + 1) + ")");
        if (ph === "cure" && cd >= 14 && cd < 56 && (cd - 14) % 7 === 0) want("cure-burp-" + d, d, "Burp jars", "Open each jar for a few minutes, smell, note the jar RH.", "Every 7 days from cure day 15");
        if (cd >= 56 && (cd - 56) % 30 === 0) want("store-check-" + d, d, "Storage check", "Look, smell, check the jar RH (58–62 %). Swap a spent humidity pack.", "Monthly in storage");
      }
      if (ph === "cure"){ const rd = add(start, 28); if (rd <= add(T, HORIZON)) want("cure-ready", rd < T ? T : rd, "Ready check", "After 28 days: smell, taste a small bud, check that jar RH stays at 58–62 %. If it's good, weigh it and close the run in Plan.", "Cure day 28"); }
    }
    return out;
  }



  function doseText(p, from, to){
    const r = p.doseRef, vol = (p.setup && p.setup.volume) || (r && r.l);
    if (!r || !vol) return "Add a small amount of your nutrients (CalMag first if you use it, then the other parts one by one, stirring in between), aiming for about +" + Math.max(0.1, Math.round((to - from) * 10) / 10) + " EC.";
    const per = r.ec * r.l / vol, ml = Math.max(0.5, Math.round((to - from) / per * 2) / 2);
    return "Add about " + ml + " ml each of " + (r.parts || "your nutrient parts") + " (≈ +" + Math.round(per * 100) / 100 + " EC per ml each in " + vol + " L), stirring in between.";
  }

  /* --- trends: rate of change per day from the last logs (least squares), so frequent small logs sharpen the picture --- */
  function series(ctx, p, key, log, hours){
    const until = Date.parse(log.at || (ctx.today + "T12:00:00")), since = until - (hours || 72) * 36e5;
    const pts = ctx.logs.filter(l => l.run === p.id && l.id !== log.id && l[key] != null && Date.parse(l.at) >= since && Date.parse(l.at) <= until).map(l => ({t: Date.parse(l.at), v: +l[key]}));
    if (log[key] != null) pts.push({t: until, v: +log[key]});
    return pts.sort((a, b) => a.t - b.t);
  }
  function slope(pts){                                   // units per day; null without 3 points over ≥ 12 h
    if (pts.length < 3 || pts[pts.length - 1].t - pts[0].t < 12 * 36e5) return null;
    const n = pts.length, mx = pts.reduce((a, p) => a + p.t, 0) / n, my = pts.reduce((a, p) => a + p.v, 0) / n;
    let num = 0, den = 0; for (const p of pts){ num += (p.t - mx) * (p.v - my); den += (p.t - mx) ** 2; }
    return den ? num / den * 864e5 : null;
  }
  const wd = (s, T) => { const n = diff(T, s); return n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : (n > 1 && n < 7) || (n < -1 && n > -7) ? D(s).toLocaleDateString("en-GB", {weekday: "short"}) : D(s).toLocaleDateString("en-GB", {day: "numeric", month: "short"}); };

  /* EC in hydro: a falling EC means the plant is eating faster than planned. Below the target range the next feed
     step moves to today (or one is added); a fast drop inside the range pulls it to tomorrow. Above the range by
     0.2+ the answer is plain water, never more nutrients. Gate: water not warm (feeding warm water stresses roots). */
  const FEED = /feed|nutrient|\bEC\b.*(to|→)/i;
  function ecReact(p, log, ctx, rng, out, moves, why){
    const T = ctx.today, tomorrow = add(T, 1), ec = log.ec, lo = rng[0], hi = rng[1];
    // a dose in ml only when the plant has its own reference (p.doseRef {ml, ec, l, parts}: "ml of each part raise EC by ec in l litres");
    // without one the step stays generic, because nutrient lines differ a lot
    const dose = (from, to) => doseText(p, from, to);
    const prev = ctx.logs.filter(l => l.run === p.id && l.id !== log.id && l.ec != null && (l.at || "") < (log.at || "~")).sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0];
    const feed = ctx.tasks.filter(t => t.run === p.id && t.status === "open" && FEED.test(t.title) && !/plain water/i.test(t.title)).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"))[0];
    const warm = log.water != null && log.water > 23.5;
    const pull = (when, reason) => {
      if (feed){ if (!feed.due || feed.due > when){ moves.push({id: feed.id, due: when, why: reason + " \"" + feed.title + "\" moved to " + (when === T ? "today" : "tomorrow") + "."}); why.push(reason); } }
      else if (!openSoon(ctx, p, FEED, 2)){
        const aim = Math.round(hi * 10) / 10;
        out.push(task(p, "feed-" + T, when, "Feed step to EC " + aim.toFixed(1), "EC " + ec + " is below " + lo + "–" + hi + ". " + dose(ec, aim) + " Wait 15 minutes, measure. Skip if leaf tips are burnt" + (warm ? "; cool the water first" : "") + ".", "EC below target"));
        why.push(reason);
      }
    };
    const sl = slope(series(ctx, p, "ec", log, 72));
    if (ec < lo) pull(T, "EC fell to " + ec + ", below " + lo + "–" + hi + ": the plant is eating.");
    else if (sl != null && sl <= -0.08 && (ec - lo) / -sl <= 2) pull(tomorrow, "EC falling ~" + Math.abs(sl).toFixed(2) + "/day; it reaches " + lo + " within 2 days.");
    else if (prev && prev.ec - ec >= 0.15 && D(log.date || T) - D(prev.date || T) <= 3 * 864e5 && ec <= lo + 0.1) pull(tomorrow, "EC dropped " + prev.ec + " → " + ec + " within a few days.");
    if (ec > hi + 0.2 && !openSoon(ctx, p, /plain water/i, 1)){
      out.push(task(p, "ec-high-" + T, T, "Top off with plain water", "EC " + ec + " is above " + lo + "–" + hi + ". Top off with plain (distilled) water only, no nutrients, measure again tomorrow.", "After your log")); why.push("EC " + ec + " high"); }
  }

  /* --- 3. weekly focus: one part of the process gets questioned each week --- */
  const FOCUS = [
    {k:"water", t:"Water", q:"Is the water source, temperature and change rhythm still right?"},
    {k:"feed", t:"Feed", q:"Does the EC curve match how fast the plant eats? Any tip burn or pale new growth?"},
    {k:"light", t:"Light", q:"PPFD at the canopy, lamp height, light hours: still right for this stage?"},
    {k:"climate", t:"Climate", q:"Air, RH and VPD day vs night: where does the space drift?"},
    {k:"training", t:"Training", q:"Is the shape still working? What needs tying, topping or clearing?"}
  ];
  function isoWeek(s){ const d = D(s); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7); }
  function focus(day){ const w = isoWeek(day); return Object.assign({week: w}, FOCUS[w % FOCUS.length]); }

  /* --- 2. instant reactions to a new log --- */
  function afterLog(p, log, ctx){
    const out = [], moves = [], why = [], T = ctx.today, tomorrow = add(T, 1), ph = ctx.phase;
    const urgent = reason => { if (!ctx.tasks.some(t => t.run === p.id && t.status === "open" && /check in with (claude|your ai)/i.test(t.title))){
      out.push(task(p, "checkin-" + T, tomorrow, ctx.profile ? "Check in with your AI" : "Check in with Claude", reason, "Tomorrow morning", {urgent: true})); why.push("check-in added"); } };
    const sn = log.sensor || {};
    if (ph === "cure" || ph === "done"){
      const rh = log.jar_rh;
      if (rh != null){
        const prev = ctx.logs.filter(l => l.run === p.id && l.id !== log.id && l.jar_rh != null).sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0];
        if (rh > 63 && !openSoon(ctx, p, /burp longer/i, 1)){ out.push(task(p, "cure-moist-" + T, T, "Burp longer", "Jar RH is " + rh + " %, above 58–63 %. Leave the jars open 20–30 minutes today.", "After your log")); why.push("jar RH " + rh + " %"); }
        if (rh >= 65 && prev && prev.jar_rh >= 65) urgent("Jar RH has stayed at 65 % or more (" + prev.jar_rh + " → " + rh + " %). Risk of mould; consider taking the humidity pack out or a few hours open.");
        const js = slope(series(ctx, p, "jar_rh", log, 96));
        if (rh <= 63 && rh >= 61 && js != null && js >= 0.5 && !openSoon(ctx, p, /burp longer/i, 1)){ out.push(task(p, "cure-rising-" + T, T, "Burp longer", "Jar RH is climbing ~" + js.toFixed(1) + " %/day (now " + rh + " %). Leave the jars open 20–30 minutes.", "Jar RH trend")); why.push("jar RH rising"); }
        if (rh < 55 && !openSoon(ctx, p, /humidity pack/i, 3)){ out.push(task(p, "cure-dry-" + T, T, "Add a humidity pack", "Jar RH is " + rh + " %, below 58 %. Add a 62 % pack and keep the jars closed.", "After your log")); why.push("jar RH " + rh + " %"); }
      }
    }
    if (ph === "dry" && sn.havg != null){
      if (sn.havg > 65) urgent("The drying space averaged " + sn.havg + " % RH over the last day (aim 55–62 %). Mould risk.");
      else if (sn.havg < 50 && !openSoon(ctx, p, /slow the dry/i, 2)){ out.push(task(p, "dry-fast-" + T, T, "Slow the dry", "RH averaged " + sn.havg + " %, below 55 %. Raise the humidity or close the vent a bit, or the buds dry too fast.", "After your log")); why.push("dry RH " + sn.havg + " %"); }
    }
    if (ph === "grow" || ph === "bloom"){
      const tg = p.targets || {}, hydro = (p.medium || "hydro") === "hydro";
      if (log.water != null && log.water > 25) urgent("Water at " + log.water + " °C (aim 18–23). Warm water holds less oxygen; root rot risk.");
      else if (hydro && log.water != null && log.water > 23.5 && !openSoon(ctx, p, /cool the water/i, 1)){
        out.push(task(p, "water-warm-" + T, T, "Cool the water", "Water at " + log.water + " °C, above 23. Fresh ice packs in the water bath or the tray, lid shut, check again in a few hours.", "After your log")); why.push("water " + log.water + " °C"); }
      if (log.ph != null && (log.ph < 5.4 || log.ph > 6.6)) urgent("pH " + log.ph + " is outside 5.4–6.6.");
      else if (hydro && log.ph != null && tg.ph && (log.ph < tg.ph[0] - 0.15 || log.ph > tg.ph[1] + 0.15) && !openSoon(ctx, p, /adjust ph/i, 1)){
        out.push(task(p, "ph-" + T, T, "Adjust pH", "pH " + log.ph + " is outside " + tg.ph[0] + "–" + tg.ph[1] + ". A few drops at a time, stir, wait 10–15 minutes, measure again.", "After your log")); why.push("pH " + log.ph); }
      if (sn.tmax != null && sn.tmax > 30) urgent("Air peaked at " + sn.tmax + " °C in the last day.");
      if (hydro && log.ec != null && tg.ec) ecReact(p, log, ctx, tg.ec, out, moves, why);
      // pH drift: projected outside the target within a day → adjust tomorrow (before it becomes urgent)
      if (hydro && log.ph != null && tg.ph && log.ph >= tg.ph[0] - 0.15 && log.ph <= tg.ph[1] + 0.15){
        const ps = slope(series(ctx, p, "ph", log, 48));
        if (ps != null && Math.abs(ps) >= 0.15 && (log.ph + ps < tg.ph[0] || log.ph + ps > tg.ph[1]) && !openSoon(ctx, p, /adjust ph/i, 2)){
          out.push(task(p, "ph-drift-" + T, tomorrow, "Adjust pH", "pH is drifting " + (ps > 0 ? "up" : "down") + " ~" + Math.abs(ps).toFixed(2) + "/day (now " + log.ph + "). Correct back to " + tg.ph[0] + "–" + tg.ph[1] + ", a few drops at a time.", "pH trend")); why.push("pH drifting " + (ps > 0 ? "+" : "") + ps.toFixed(2) + "/day"); }
      }
      // water warming day over day
      if (hydro && log.water != null && log.water <= 23.5 && log.water >= 22){
        const ws = slope(series(ctx, p, "water", log, 72));
        if (ws != null && ws >= 0.5 && !openSoon(ctx, p, /cool the water/i, 2)){
          out.push(task(p, "water-trend-" + T, tomorrow, "Cool the water", "Water is warming ~" + ws.toFixed(1) + " °C/day (now " + log.water + " °C). Swap the ice packs or the tray before it passes 23.", "Water trend")); why.push("water +" + ws.toFixed(1) + " °C/day"); }
      }
    }
    return {tasks: out, moves, why};
  }

  /* --- 4. the quiet acknowledgement after a log: what the app saw and what (if anything) it changed --- */
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
  const NAMES = {ph: "pH", ec: "EC", water: "water", jar_rh: "jar RH", air: "air", rh: "RH", runoff_ec: "runoff EC", runoff_ph: "runoff pH", res_ec: "res. EC", res_ph: "res. pH"};
  const UNIT = {water: " °C", jar_rh: " %", air: " °C", rh: " %"};
  function ack(p, log, ctx, r){
    const T = ctx.today, tg = ctx.targets || p.targets || {}, bad = [], ok = [], trend = [];
    for (const k of Object.keys(NAMES)){
      const v = log[k]; if (v == null) continue;
      const rg = tg[k], name = NAMES[k];
      if (rg && v < rg[0]) bad.push(name + " " + v + (UNIT[k] || "") + " low (" + rg[0] + "–" + rg[1] + ")");
      else if (rg && v > rg[1]) bad.push(name + " " + v + (UNIT[k] || "") + " high (" + rg[0] + "–" + rg[1] + ")");
      else if (rg) ok.push(name);
      const sl = slope(series(ctx, p, k, log, 72)), thr = {ph: 0.1, ec: 0.05, water: 0.4, jar_rh: 0.5}[k];
      if (sl != null && thr && Math.abs(sl) >= thr) trend.push(name + " " + (sl > 0 ? "+" : "−") + Math.abs(sl).toFixed(k === "ph" || k === "ec" ? 2 : 1) + (UNIT[k] || "") + "/day");
      else {
        const prev = ctx.logs.filter(l => l.run === p.id && l.id !== log.id && l[k] != null && (l.at || "") < (log.at || "~")).sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0];
        if (prev && prev[k] !== v && diff(prev.date, log.date || T) <= 2) trend.push(name + " " + (v > prev[k] ? "+" : "−") + Math.abs(Math.round((v - prev[k]) * 100) / 100) + " since " + (prev.date === (log.date || T) ? "earlier" : wd(prev.date, T).replace("today", "earlier")));
      }
    }
    const sn = log.sensor; const parts = [];
    if (bad.length) parts.push(bad.join(", "));
    if (ok.length) parts.push((ok.length > 2 ? "all in range" : ok.join(" and ") + " in range"));
    if (trend.length) parts.push(trend.slice(0, 2).join(", "));
    if (sn && sn.src === "bridge" && sn.temp != null) parts.push("air " + sn.temp + "° / " + Math.round(sn.rh) + " %");
    const changed = [];
    for (const m of (r && r.moves) || []){ const t = ctx.tasks.find(x => x.id === m.id); if (t) changed.push(lc(t.title) + " → " + wd(m.due, T)); }
    for (const t of (r && r.tasks) || []) changed.push("+ " + lc(t.title) + " " + wd(t.due, T));
    if (changed.length) parts.push(changed.join(", "));
    else {
      const nx = ctx.tasks.filter(t => t.run === p.id && t.status === "open" && t.due && t.due >= T && !/^check\b/i.test(t.title)).sort((a, b) => a.due.localeCompare(b.due))[0];
      parts.push(nx ? "plan unchanged · next: " + lc(nx.title) + " " + wd(nx.due, T) : "plan unchanged");
    }
    return "Noted · " + parts.filter(Boolean).join(" · ");
  }

  /* --- 5. plan upkeep the nightly review used to do, now on every sync (moves, closes, ramp) ---
     - a check counts as done when a log with values or a photo arrived since the day before it was due
     - old app checks that were skipped close once a newer one is planned
     - overdue big tasks roll to the next weekend day or off day
     - never two stressors (big tasks, topping, defoliation, water change, flip, training) on one day per plant
     - hydro EC ramp: a feed step every ≥ 4 days while EC sits in range, water ≤ 23 °C and no notes about burnt tips */
  const STRESS = /\btop|defol|clear lower|water change|12\s*\/\s*12|manifold|transplant|\blst\b|bend|supercrop/i;
  const suitable = (p, s) => { const d = D(s).getDay(); return d === 0 || d === 6 || (p.offDays || []).includes(s); };
  const nextSuitable = (p, s, avoid) => { let d = s; for (let i = 0; i < 21; i++){ if (suitable(p, d) && !(avoid || []).includes(d)) return d; d = add(d, 1); } return s; };
  function maintain(p, ctx){
    const T = ctx.today, moves = [], close = [], tasks = [], open = ctx.tasks.filter(t => t.run === p.id && t.status === "open");
    const logs = ctx.logs.filter(l => l.run === p.id).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    const substantial = l => (l.photos || []).length || ["ph", "ec", "water", "jar_rh", "weight", "height", "res_ec", "water_l", "res_l"].some(k => l[k] != null);
    // checks done by logs
    for (const t of open.filter(t => /^check\b/i.test(t.title) && t.due && t.due <= T)){
      const l = logs.find(l => substantial(l) && l.date >= add(t.due, -1) && l.date <= T);
      if (l) close.push({id: t.id, at: l.at, why: "\"" + t.title + "\" done by your log (" + l.date.slice(5) + ")."});
      else if (t.gen && t.due < add(T, -1) && open.some(x => x !== t && /^check\b/i.test(x.title) && x.due && x.due >= T)) close.push({id: t.id, skipped: true, why: "Skipped check from " + t.due.slice(5) + " closed; a newer one is planned."});
    }
    // overdue big tasks roll to the next suitable day
    for (const t of open.filter(t => t.size === "big" && t.due && t.due < T)){ const d = nextSuitable(p, T); if (d !== t.due) moves.push({id: t.id, due: d, why: "\"" + t.title + "\" was overdue; moved to the next weekend/off day (" + d.slice(5) + ")."}); }
    // one stressor per day
    const due = id => (moves.find(m => m.id === id) || {}).due || (open.find(t => t.id === id) || {}).due;
    const stress = open.filter(t => t.due && (t.size === "big" || STRESS.test(t.title))).sort((a, b) => a.due.localeCompare(b.due) || (a.order || 99) - (b.order || 99));
    const taken = new Set();
    for (const t of stress){ let d = due(t.id); if (d < T) continue;
      if (taken.has(d)){ const nd = t.size === "big" ? nextSuitable(p, add(d, 1), [...taken]) : (() => { let x = add(d, 1); while (taken.has(x)) x = add(x, 1); return x; })();
        const m = moves.find(m => m.id === t.id); if (m){ m.due = nd; m.why = "\"" + t.title + "\" was overdue; moved to " + nd.slice(5) + " (next free weekend/off day, one stressful step per day)."; } else moves.push({id: t.id, due: nd, why: "\"" + t.title + "\" moved to " + nd.slice(5) + ": never two stressful steps on one day."}); d = nd; }
      taken.add(d); }
    // hydro EC ramp
    const hydro = (p.medium || "hydro") === "hydro", tg = (p.targets || {}).ec;
    if (hydro && tg && (ctx.phase === "grow" || ctx.phase === "bloom") && !open.some(t => FEED.test(t.title))){
      const lastEc = logs.find(l => l.ec != null), lastW = logs.find(l => l.water != null);
      const burnt = logs.some(l => diff(l.date, T) <= 4 && /tip|burn|claw|crisp/i.test(l.note || ""));
      const fedAt = ctx.tasks.filter(t => t.run === p.id && t.status === "done" && FEED.test(t.title) && t.doneAt).map(t => t.doneAt.slice(0, 10)).sort().pop();
      const since = fedAt ? diff(fedAt, T) : (p.sprout ? diff(p.sprout, T) - 10 : 0);
      const ceil = ctx.phase === "bloom" ? 1.6 : 1.2;
      if (lastEc && diff(lastEc.date, T) <= 2 && lastEc.ec >= tg[0] && lastEc.ec <= tg[1] && (!lastW || lastW.water <= 23) && !burnt && since >= 4 && tg[1] < ceil){
        const aim = [Math.round((tg[0] + 0.2) * 10) / 10, Math.round(Math.min(ceil, tg[1] + 0.2) * 10) / 10];
        tasks.push(task(p, "ramp-" + T, add(T, 1), "Feed step to EC " + aim[0] + "–" + aim[1], "EC has held in " + tg[0] + "–" + tg[1] + " and the last step was " + since + " days ago. " + doseText(p, lastEc.ec, aim[1]) + " Measure after 15 minutes. Ticking it done moves the EC target to " + aim[0] + "–" + aim[1] + ".", "Leaf tips clean, water ≤ 23 °C", {aim}));
      }
    }
    return {tasks, moves, close};
  }
  window.Rules = {plan, afterLog, focus, isoWeek, ack, maintain, slope};
})();
