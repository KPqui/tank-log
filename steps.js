/* Flowerphile · steps.js — tier 0 step feedback (no AI). Pure, no DOM.
   When a log describes a step (a chip, the note, or an open step it names), the app answers the step itself:
   what was done, what to expect in the next days, what to look at, which photos make it judgeable, and a
   follow-up check on day 1–3. A question in the note is noticed too.
     Steps.LIST                       the step table
     Steps.detect(log, open)          → {step, task?} or null   open = this plant's open tasks
     Steps.forTask(task)              → step or null (title match; for photo hints on planned steps)
     Steps.ack(step, log)             → one short line ("Manifold noted · expect … · photo: …"); what to look for goes into the follow-up check
     Steps.follow(step, p, log, T)    → a follow-up task (or null)
     Steps.question(note)             → true when the note asks something
   Wording: days, never weeks; beginner-friendly; no promises the plant can't keep. */
(function(){
  const LIST = [
    {id:"manifold", shot:"top-down close-up of the hub", name:"Manifold", howto:"manifold", re:/manifold/i,
     expect:"a slight droop for 1–2 days; new growth from both kept arms within 3–5 days",
     look:"the hub stays green and firm, no yellowing or black at the cut",
     before:"a top-down photo of the whole plant", after:"a top-down close-up of the hub (both kept shoots and the cut stump) and a side view of the cleared stem",
     follow:2, check:"Check the manifold", detail:"Are both arms pushing new growth? Hub green and firm, cut dry? A top-down close-up helps your AI judge it."},
    {id:"topping", shot:"top-down close-up of the cut", name:"Topping", howto:"topping", re:/\btopp(ed|ing)\b(?!\s*off)|\btop(ped)? (it|the main|above)/i,
     expect:"growth pauses 1–2 days; two new tops from the node below within 3–5 days",
     look:"both shoots at the cut start to grow, the cut dries clean",
     before:"a top-down photo of the tip you cut", after:"a top-down close-up of the cut node",
     follow:3, check:"Check the topping", detail:"Two new shoots growing from the node below the cut? Cut dry, no rot?"},
    {id:"fim", shot:"close-up of the pinched top", name:"FIM", re:/\bfim(med|ming)?\b/i,
     expect:"a pause of 1–2 days; often 2–4 new tips from the pinched top",
     look:"new tips at the pinched spot, no rot",
     after:"a top-down close-up of the pinched top", follow:3, check:"Check the FIM", detail:"How many new tips came out? Any brown, mushy tissue?"},
    {id:"supercrop", shot:"close-up of the bend", name:"Supercropping", re:/supercrop|super.?crop/i,
     expect:"the bent branch may hang for a day, then lifts; a knuckle forms over 3–7 days",
     look:"the branch isn't snapped through; no dark, soft spot at the bend",
     after:"a close-up of the bend", follow:2, check:"Check the bent branch", detail:"Has it lifted again? Is a knuckle forming? Tape or a tie if it's hanging loose."},
    {id:"training", shot:"top-down of the canopy", name:"Training", howto:"lst", re:/\blst\b|low.?stress|tied (it )?down|bent (it|the|over|down)|bending|tie.?down/i, chip:"Trained",
     expect:"the tips turn back up to the light within about a day",
     look:"no white creases or kinks at the bends; ties not cutting into the stem",
     before:"a top-down photo of the canopy", after:"a top-down photo showing how flat and even the tops are now",
     follow:2, check:"Check the ties", detail:"Tips turned back up? Loosen or move ties that cut in; bend new tall shoots down too."},
    {id:"defol", shot:"the same side view as before", name:"Leaf removal", howto:"clear-lower", re:/defol|clear(ed|ing)? (out )?(the )?(lower|bottom|under)|lollipop|removed (some )?(fan )?leaves|stripped/i, chip:"Trimmed",
     expect:"a mild pause of a day or two; more light reaches the lower sites",
     look:"no wilting; remaining leaves stay green",
     before:"a side view of the plant", after:"the same side view, from the same spot",
     follow:2, check:"Check after the leaf removal", detail:"Plant upright and green? Don't take more until it has grown back a bit."},
    {id:"transplant", shot:"side view in the new pot", name:"Transplant", re:/transplant|repott?ed|potted up|up.?potted|new pot/i,
     expect:"some droop for 1–2 days while the roots settle",
     look:"leaves perk up again by day 2; soil not soaking wet",
     after:"a side view of the plant in its new pot", follow:2, check:"Check after the transplant", detail:"Leaves perked up again? Water only when the pot feels lighter."},
    {id:"water", shot:"close-up of the roots", name:"Water change", howto:"water-change", re:/water change|changed the water|fresh (reservoir|res|water)|new (reservoir|res)/i, chip:"Water change",
     expect:"pH can drift in the first hours as the fresh water settles",
     look:"pH and EC back in range after about an hour and again the next day; roots white, no slime",
     after:"a close-up of the roots while the lid is off", follow:1, check:"Check pH and EC after the water change", detail:"Measure pH and EC once more; fresh water often drifts on the first day."},
    {id:"flip", shot:"side view with something for scale", name:"The flip", howto:"flip", re:/12\s*\/\s*12|\bflip(ped)?\b|switched to (bloom|flower)|bloom started/i,
     expect:"the plant stretches over the next ~14–21 days; first pistils around day 7–14",
     look:"keep the lamp distance as the tops climb",
     before:"a side view with something for scale", after:"the same side view every few days, to see the stretch",
     follow:7, check:"Check the stretch", detail:"Measure the height and compare with the flip day. First white pistils yet?"},
    {id:"light", shot:"the top leaves", name:"Light change", re:/light (changed|raised|lowered|up|down)|lamp (raised|lowered|up|down|higher|lower)|dimm(ed|er)/i, chip:"Light changed",
     expect:"the top leaves adjust within 1–2 days",
     look:"no bleaching, upward-curling (tacoing) or praying hard at the tops",
     after:"a photo of the top leaves", follow:2, check:"Check the top leaves", detail:"Pale or curling tops mean too much light: raise or dim a little."},
    {id:"harvest", shot:"whole plant, one bud close-up, a handful (result photos)", name:"Harvest", re:/harvest(ed)?|chopp?ed|cut (it )?down/i,
     expect:"the drying takes over; the app plans the daily checks",
     look:"buds not touching while they hang; the drying space in range",
     before:"the whole plant on harvest day, a close-up of one bud and a handful of buds (the run's result picture)", after:"the plant or branches hanging",
     follow:0},
    {id:"planted", name:"Planting", re:/planted (the )?(seed|it)|seed (is )?in (the )?(soil|medium|cube|plug)/i, chip:"Planted",
     expect:"the seedling breaks the surface within 2–7 days",
     look:"keep it warm and the top just moist, not wet",
     follow:0}
  ];
  const D = s => new Date(s + "T12:00:00");
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
  const byId = id => LIST.find(s => s.id === id) || null;
  const forTask = t => t && t.title ? LIST.find(s => s.re.test(t.title) && !/^check\b/i.test(t.title)) || null : null;

  function question(note){
    const n = String(note || "");
    return /\?/.test(n) || /(^|[.!\n]\s*)(how|why|what|when|should|is it|are they|can i|do i|does)\b/i.test(n);
  }
  function detect(log, open){
    const note = String(log.note || ""), chips = log.actions || [];
    // an open, due step the note or a chip names wins: it tells us what was planned and can be closed
    const due = (open || []).filter(t => t.status === "open" && t.due && t.due <= (log.date || t.due) && !/^check\b/i.test(t.title));
    for (const t of due){ const s = forTask(t); if (s && (s.re.test(note) || (s.chip && chips.includes(s.chip)))) return {step: s, task: t}; }
    for (const s of LIST) if (s.re.test(note)) return {step: s};
    for (const s of LIST) if (s.chip && chips.includes(s.chip)) return {step: s};
    return null;
  }
  function ack(step, log){
    const parts = [step.name + " noted", "expect: " + step.expect];
    const n = (log.photos || []).length;
    if (step.shot && n < 2) parts.push((n ? "also useful: " : "photo: ") + step.shot);
    return parts.join(" · ");
  }
  function follow(step, p, log, T){
    if (!step.follow || !step.check) return null;
    const day = log.date || T;
    return {id: "step-" + step.id + "-" + day.replace(/-/g, "") + "-" + p.id, run: p.id, title: step.check, detail: step.detail, trigger: "Day " + (step.follow + 1) + " after the " + step.name.toLowerCase(),
      due: add(day, step.follow), status: "open", src: "app", gen: "step-" + step.id + "-" + day, howto: step.howto || undefined};
  }
  window.Steps = {LIST, byId, forTask, detect, ack, follow, question};
})();
