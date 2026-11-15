/* Flowerphile · rules.js — the app's own small brain (tier 0)
   Two jobs, both pure functions (no network, no DOM), so they run instantly on the phone and can be tested:
   1. plan(p, ctx)        keeps a rolling plan of the next days for every plant from germination until the cure
                          is finished, from phase templates. Never duplicates (each generated task has a `gen` key).
   2. afterLog(p, log, ctx) reacts the moment a log is saved: values outside the safe range add a task right away,
                          urgent ones a "Check in with Claude" for the next morning.
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
          want("check-" + d, d, "Check: values, photo, sensor file", "Log pH, EC and water temperature, take a photo, add the sensor file.", "Every 3 days" + (ph === "bloom" ? " (daily in weeks 3–7 of bloom)" : "")); }
    }
    if (ph === "dry" && start){
      for (let k = 0; k <= HORIZON; k++){ const d = add(T, k), day = diff(start, d);
        want("dry-check-" + d, d, "Check the drying", "Note the dry fridge's RH and temperature, weigh the same sample, bend a small stem.", "Daily while drying (day " + day + ")"); }
      const snap = add(start, 7); if (snap >= T) want("dry-snap", snap, "Snap test", "Small stems should snap, not bend. If they snap and the sample has lost ~72–75 %, it's time for jars.", "About a week in");
    }
    if ((ph === "cure" || ph === "done") && start){
      const cureDay = d => diff(start, d);
      for (let k = 0; k <= HORIZON; k++){ const d = add(T, k), cd = cureDay(d);
        if (ph === "cure" && cd >= 0 && cd < 14) want("cure-burp-" + d, d, "Burp jars", "Open every jar about 10 minutes (longer if a jar reads over 63 %). Note the jar RH.", "Daily, weeks 1–2 of the cure (day " + cd + ")");
        if (ph === "cure" && cd >= 14 && cd < 56 && (cd - 14) % 7 === 0) want("cure-burp-" + d, d, "Burp jars", "Open each jar for a few minutes, smell, note the jar RH.", "Weekly from week 3 of the cure");
        if (cd >= 56 && (cd - 56) % 30 === 0) want("store-check-" + d, d, "Storage check", "Look, smell, check the jar RH (58–62 %). Swap a spent humidity pack.", "Monthly in storage");
      }
      if (ph === "cure"){ const rd = add(start, 28); if (rd <= add(T, HORIZON)) want("cure-ready", rd < T ? T : rd, "Ready check", "After 4 weeks: smell, taste a small bud, check that jar RH stays at 58–62 %. If it's good, weigh it and close the run in Plan.", "4 weeks into the cure"); }
    }
    return out;
  }

  /* --- 2. instant reactions to a new log --- */
  function afterLog(p, log, ctx){
    const out = [], why = [], T = ctx.today, tomorrow = add(T, 1), ph = ctx.phase;
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
      if (log.water != null && log.water > 25) urgent("Water at " + log.water + " °C (aim 18–23). Warm water holds less oxygen; root rot risk.");
      if (log.ph != null && (log.ph < 5.4 || log.ph > 6.6)) urgent("pH " + log.ph + " is outside 5.4–6.6.");
      if (sn.tmax != null && sn.tmax > 30) urgent("Air peaked at " + sn.tmax + " °C in the last day.");
    }
    return {tasks: out, why};
  }
  window.Rules = {plan, afterLog};
})();
