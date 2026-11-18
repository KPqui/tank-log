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
          want("check-" + d, d, "Check: values, photo, sensor file", "Log pH, EC and water temperature, take a photo, add the sensor file.", "Every 3 days" + (ph === "bloom" ? " (daily on bloom days 15–49)" : "")); }
    }
    if (ph === "dry" && start){
      for (let k = 0; k <= HORIZON; k++){ const d = add(T, k), day = diff(start, d);
        want("dry-check-" + d, d, "Check the drying", "Note the dry fridge's RH and temperature, weigh the same sample, bend a small stem.", "Daily while drying (day " + day + ")"); }
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


  /* EC in hydro: a falling EC means the plant is eating faster than planned. Below the target range the next feed
     step moves to today (or one is added); a fast drop inside the range pulls it to tomorrow. Above the range by
     0.2+ the answer is plain water, never more nutrients. Gate: water not warm (feeding warm water stresses roots). */
  const FEED = /feed|nutrient|\bEC\b.*(to|→)/i;
  function ecReact(p, log, ctx, rng, out, moves, why){
    const T = ctx.today, tomorrow = add(T, 1), ec = log.ec, lo = rng[0], hi = rng[1];
    const vol = (p.setup && p.setup.volume) || 7.5, perMl = Math.round(0.2 * 7.5 / vol * 100) / 100;   // ≈ +0.2 EC per 1 ml each CalMag/A/B in 7.5 L
    const prev = ctx.logs.filter(l => l.run === p.id && l.id !== log.id && l.ec != null && (l.at || "") < (log.at || "~")).sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0];
    const feed = ctx.tasks.filter(t => t.run === p.id && t.status === "open" && FEED.test(t.title) && !/plain water/i.test(t.title)).sort((a, b) => (a.due || "9").localeCompare(b.due || "9"))[0];
    const warm = log.water != null && log.water > 23.5;
    const pull = (when, reason) => {
      if (feed){ if (!feed.due || feed.due > when){ moves.push({id: feed.id, due: when, why: reason + " \"" + feed.title + "\" moved to " + (when === T ? "today" : "tomorrow") + "."}); why.push(reason); } }
      else if (!openSoon(ctx, p, FEED, 2)){
        const aim = Math.round(hi * 10) / 10, ml = Math.max(0.5, Math.round((aim - ec) / perMl * 2) / 2);
        out.push(task(p, "feed-" + T, when, "Feed step to EC " + aim.toFixed(1), "EC " + ec + " is below " + lo + "–" + hi + ". Add about " + ml + " ml each of CalMag, then A and B (≈ +" + perMl + " EC per ml each in " + vol + " L), stir, wait 15 minutes, measure. Skip if leaf tips are burnt" + (warm ? "; cool the water first" : "") + ".", "EC below target"));
        why.push(reason);
      }
    };
    if (ec < lo) pull(T, "EC fell to " + ec + ", below " + lo + "–" + hi + ": the plant is eating.");
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
    const urgent = reason => { if (!ctx.tasks.some(t => t.run === p.id && t.status === "open" && /check in with claude/i.test(t.title))){
      out.push(task(p, "checkin-" + T, tomorrow, "Check in with Claude", reason, "Tomorrow morning", {urgent: true})); why.push("check-in added"); } };
    const sn = log.sensor || {};
    if (ph === "cure" || ph === "done"){
      const rh = log.jar_rh;
      if (rh != null){
        const prev = ctx.logs.filter(l => l.run === p.id && l.id !== log.id && l.jar_rh != null).sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0];
        if (rh > 63 && !openSoon(ctx, p, /burp longer/i, 1)){ out.push(task(p, "cure-moist-" + T, T, "Burp longer", "Jar RH is " + rh + " %, above 58–63 %. Leave the jars open 20–30 minutes today.", "After your log")); why.push("jar RH " + rh + " %"); }
        if (rh >= 65 && prev && prev.jar_rh >= 65) urgent("Jar RH has stayed at 65 % or more (" + prev.jar_rh + " → " + rh + " %). Risk of mould; consider taking the humidity pack out or a few hours open.");
        if (rh < 55 && !openSoon(ctx, p, /humidity pack/i, 3)){ out.push(task(p, "cure-dry-" + T, T, "Add a humidity pack", "Jar RH is " + rh + " %, below 58 %. Add a 62 % pack and keep the jars closed.", "After your log")); why.push("jar RH " + rh + " %"); }
      }
    }
    if (ph === "dry" && sn.havg != null){
      if (sn.havg > 65) urgent("The dry fridge averaged " + sn.havg + " % RH over the last day (aim 55–62 %). Mould risk.");
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
    }
    return {tasks: out, moves, why};
  }
  window.Rules = {plan, afterLog, focus, isoWeek};
})();
