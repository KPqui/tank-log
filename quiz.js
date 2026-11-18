/* Flowerphile · quiz.js — the new-plant questionnaire (pure logic, no DOM).
   Quiz.questions(ctx) → the steps to ask, in order (some only show for some answers).
   Quiz.derive(ans, ctx) → what the answers mean: plant fields, setup record, targets, first plan steps, early flags.
   ctx = {plant (existing or draft), entry (library.json row or null), sheet (strains.json sheet or null),
          grown (bool: this strain was grown before), past ([{from, text}] learnings of earlier runs), today, defaults (DEFAULT_TARGETS)}
   Every answer is stored in plant.setup so the nightly review (and later any AI) can read the same facts. */
(function(){
  const D = s => new Date(s + "T12:00:00");
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
  const short = s => D(s).toLocaleDateString("en-GB", {day: "numeric", month: "short"});

  const GROWS = [
    ["hydro|dwc", "Hydro · DWC", "bucket with an air stone"],
    ["living-soil|hand", "Living soil · by hand"], ["living-soil|autopot", "Living soil · Autopot"],
    ["soil|hand", "Soil · by hand"], ["soil|autopot", "Soil · Autopot"],
    ["coco|hand", "Coco · by hand"], ["coco|drip", "Coco · drip"]
  ];
  const WATER = {
    distilled: {l: "Distilled or RO", ec: 0.0, sub: "EC about 0.0"},
    filtered:  {l: "Filter pitcher (e.g. Aarke)", ec: 0.4, sub: "EC about 0.4–0.6"},
    tap:       {l: "Tap water", ec: 0.7, sub: "Berlin tap is hard; measure it"},
    rain:      {l: "Rain water", ec: 0.05, sub: "EC about 0.0–0.1"}
  };

  // what the strain sheet / library row tells us
  function strainFacts(ctx){
    const e = ctx.entry || {}, sh = ctx.sheet || {};
    const type = (sh.type || "") + " " + (e.kind || "");
    const kind = /auto/i.test(type) ? "auto" : /photo/i.test(type) ? "photo" : null;
    let flower = e.flower || null;
    if (!flower && sh.flowering){ const m = sh.flowering.match(/~?\s*(\d+)\s*days/i), w = sh.flowering.match(/(\d+)\s*[–-]\s*(\d+)\s*weeks/i);
      flower = m ? +m[1] : w ? Math.round((+w[1] + +w[2]) / 2 * 7) : null; }
    const hm = (sh.height || "").match(/(\d+)\s*[–-]\s*(\d+)\s*cm/i), heightMax = hm ? +hm[2] : null;
    const g = ((sh.genetics || "") + " " + (e.genetics || "")).toLowerCase();
    const ind = g.match(/(\d+)\s*%\s*indica/), sat = g.match(/(\d+)\s*%\s*sativa/);
    const indica = ind ? +ind[1] : sat ? 100 - +sat[1] : /indica/.test(g) && !/sativa/.test(g) ? 70 : /sativa/.test(g) && !/indica/.test(g) ? 30 : 50;
    const stretch = kind === "auto" ? 1.3 : indica >= 70 ? 1.5 : indica <= 30 ? 2.5 : 2;     // rough rule: canopy height × this after the flip
    return {kind, flower, heightMax, stretch, name: sh.name || e.name || (ctx.plant && ctx.plant.strain) || "this strain"};
  }

  function questions(ctx){
    const p = ctx.plant || {}, f = strainFacts(ctx), isNew = !p.id;
    const Q = [];
    if (isNew) Q.push({id: "basics", type: "form", title: "What are you growing?", why: "Pick from your seeds or type a name. The rest of the questions use its sheet."});
    Q.push({id: "seed", type: "one", title: "What kind of seed?", why: f.kind ? "Your library lists " + f.name + " as " + (f.kind === "auto" ? "an autoflower" : "a photoperiod") + "." : "Autoflowers bloom on their own; photoperiods wait for 12/12.",
      opts: [["auto", "Autoflower"], ["photo", "Photoperiod"], ["unsure", "Not sure"]], def: () => p.kind || f.kind});
    Q.push({id: "where", type: "one", title: "Where does it grow?", opts: [["indoor", "Indoor", "tent, fridge, cupboard"], ["outdoor", "Outdoor", "balcony, garden"]], def: () => p.where || "indoor"});
    Q.push({id: "grow", type: "one", title: "In what?", why: "Medium and watering. Colours and log fields follow this.", opts: GROWS, def: () => p.medium ? p.medium + "|" + (p.system || "hand") : null});
    Q.push({id: "volume", type: "one", num: "L", title: a => /^hydro/.test(a.grow || "") ? "Reservoir working volume?" : "Pot size?",
      why: a => /^hydro/.test(a.grow || "") ? "What's really in the bucket, not the label. Feed doses and water-change rhythm scale with it." : "Bigger pots buffer mistakes and hold water longer.",
      opts: a => (/^hydro/.test(a.grow || "") ? [5, 7.5, 10, 15, 20] : [11, 15, 20, 30, 50]).map(v => [v, v + " L"]), def: () => (p.setup || {}).volume});
    Q.push({id: "light", type: "text", title: "Which light?", why: "Model or wattage, as exact as you know it. Optional.", placeholder: "e.g. Mars Hydro TS 600", show: a => a.where !== "outdoor", def: () => (p.setup || {}).light});
    Q.push({id: "lampMax", type: "one", num: "cm", title: "How high can the lamp go?", why: "Highest lamp position above the pot rim (or the bucket lid). This sets when to flip.",
      show: a => a.where !== "outdoor", opts: [40, 60, 80, 100, 120].map(v => [v, v + " cm"]), def: () => (p.setup || {}).lampMax});
    Q.push({id: "floor", type: "one", title: "How big is the floor?", show: a => a.where !== "outdoor",
      opts: [["40x45", "About 40 × 45 cm", "fridge, small box"], ["60x60", "60 × 60 cm"], ["80x80", "80 × 80 cm"], ["100x100", "100 × 100 cm"], ["120x120", "120 × 120 cm or more"]], def: () => (p.setup || {}).floor});
    Q.push({id: "heightLimit", type: "one", num: "cm", title: "Any height limit outside?", why: "Balcony screen, neighbours, wind.", show: a => a.where === "outdoor",
      opts: [[0, "No limit"], [100, "About 1 m"], [150, "About 1.5 m"], [200, "About 2 m"]], def: () => (p.setup || {}).heightLimit});
    Q.push({id: "water", type: "one", title: "Which water?", opts: Object.entries(WATER).map(([k, w]) => [k, w.l, w.sub]), def: () => (p.setup || {}).water});
    Q.push({id: "waterEc", type: "one", num: "EC", title: "EC of that water before anything goes in?", why: "Measure it once if you can. It eats into the room for nutrients.",
      opts: [0, 0.2, 0.4, 0.6, 0.8].map(v => [v, v.toFixed(1)]), def: a => (p.setup || {}).waterEc ?? (WATER[a.water] ? Math.round(WATER[a.water].ec * 5) / 5 : null)});
    Q.push({id: "goal", type: "one", title: "What's the goal?", opts: [["big", "One big plant", "fill the space"], ["small", "Several small plants"], ["test", "A test run", "learn the strain, keep it simple"]], def: () => (p.setup || {}).goal});
    if (!ctx.grown){
      Q.push({id: "stretch", type: "one", title: "How will you keep the height in check?",
        why: a => { const room = roomOf(a); return "First time with " + f.name + ". " + (f.heightMax ? "The sheet says up to " + f.heightMax + " cm. " : "") + (a.seed === "auto" ? "Autos stretch a little in early bloom." : "Expect about ×" + f.stretch + " stretch after the flip.") + (room ? " You have about " + room + " cm of canopy room." : ""); },
        opts: a => a.seed === "auto" ? [["train", "Bend it flat (LST)"], ["room", "It has room"]] : [["flip", "Flip early"], ["train", "Train it flat", "topping, manifold, LST"], ["both", "Both"], ["room", "It has room"]],
        def: () => (p.setup || {}).stretch});
      if (f.flower) Q.push({id: "timing", type: "one", title: "Does the timing work?",
        why: a => "Bloom runs about " + f.flower + " days (sheet; count from the flip, real runs often go longer)." + (endOf(a, ctx) ? " That points to a harvest around " + short(endOf(a, ctx)) + "." : ""),
        opts: [["fine", "That works"], ["by", "It must be done by a date"], ["unsure", "Not sure yet"]], date: "by", def: () => (p.setup || {}).timing});
    }
    return Q.filter(q => q);
  }

  const roomOf = a => a.where === "outdoor" ? (a.heightLimit || null) : a.lampMax ? Math.max(10, a.lampMax - 30) : null;   // LEDs want ~30 cm to the canopy
  function flipAtOf(a, ctx){
    if (a.seed === "auto" || a.where === "outdoor") return null;
    const room = roomOf(a); if (!room) return null;
    const f = strainFacts(ctx), train = a.stretch === "train" || a.stretch === "both";
    return Math.max(15, Math.round(room / f.stretch * (train ? 1.15 : 1) / 5) * 5);
  }
  function endOf(a, ctx){
    const f = strainFacts(ctx), p = ctx.plant || {}; if (!f.flower) return null;
    if (a.seed === "auto"){ const s = p.sprout || p.start || a.start || ctx.today; return add(s, 25 + f.flower); }
    const flip = p.flip || p.flipEst; return flip ? add(flip, f.flower) : null;
  }

  function derive(a, ctx){
    const p = ctx.plant || {}, f = strainFacts(ctx), T = ctx.today, flags = [], tasks = [];
    const [medium, system] = (a.grow || "hydro|dwc").split("|"), hydro = medium === "hydro", vol = +a.volume || null;
    const flipAt = flipAtOf(a, ctx), end = endOf(a, ctx), room = roomOf(a);
    const id = p.id || a.id;
    const t = (gen, title, detail, trigger, due, extra) => tasks.push(Object.assign({id: "s-" + gen + "-" + id, run: id, gen: "setup-" + gen, title, detail, trigger, due: due || null, status: "open", src: "setup"}, extra || {}));
    const has = re => (ctx.tasks || []).some(x => x.run === id && x.status !== "done" && re.test(x.title));

    // targets: medium defaults; hydro EC floor leaves room for the water's own EC
    const targets = Object.assign({}, (ctx.defaults || {})[medium] || {});
    if (hydro && targets.ec){ const w = +a.waterEc || 0; targets.ec = [Math.max(0.4, Math.round((w + 0.2) * 10) / 10), targets.ec[1]]; }

    // first plan steps (only where the plan has nothing like it yet)
    if (hydro && vol && !has(/water change/i)){
      const every = vol <= 10 ? 8 : 12;
      t("wc", "Water change", "With " + vol + " L it's about every " + every + " days. Distilled + CalMag first, then A and B to the target EC; rinse the air stone." + (a.water === "filtered" ? " Filtered water: 50/50 with distilled for fresh mixes once the target EC is ~0.8+, distilled for top-offs." : ""), "Every ~" + every + " days", add(p.sprout || T, 14) < T ? add(T, every) : add(p.sprout || T, 14), {size: "big"});
    }
    if (flipAt && !has(/12\s*\/\s*12|flip/i)) t("flip", "Switch light to 12/12", "Flip when the plant is about " + flipAt + " cm above the " + (hydro ? "lid" : "pot rim") + ": with ×" + f.stretch + " stretch it ends near " + room + " cm, under the lamp's limit.", "Height ~" + flipAt + " cm", null, {size: "big"});
    if (a.seed === "auto" && (a.stretch === "train" || a.goal === "big") && !has(/lst|bend/i)) t("lst", "Bend the main stem (LST)", "Tie the top down sideways so the side shoots catch up. No topping on an autoflower after ~day 21.", "Veg days 14–21");
    else if (a.seed !== "auto" && (a.goal === "big" || a.stretch === "train" || a.stretch === "both") && !has(/\btop|manifold/i)) t("top", "Top above node 3", "Cut the main stem just above node 3; the two shoots become your mains.", "5–6 nodes");

    // early warnings
    if (hydro && vol && vol <= 8) flags.push({lvl: "warn", k: "small-res", text: "Small reservoir (" + vol + " L): EC and pH move fast, most in bloom days 20–60. Top off with plain water daily then, and change the water every ~8 days."});
    if (room && f.heightMax && a.seed !== "auto" && f.heightMax > room && a.stretch !== "flip" && a.stretch !== "both" && a.stretch !== "train") flags.push({lvl: "warn", k: "stretch", text: f.name + " can reach " + f.heightMax + " cm; you have ~" + room + " cm of canopy room. Flip around " + (flipAt || "?") + " cm and train it flat."});
    else if (flipAt) flags.push({lvl: "info", k: "flip", text: "Flip at about " + flipAt + " cm above the " + (hydro ? "lid" : "rim") + " (×" + f.stretch + " stretch into ~" + room + " cm of room)."});
    if (a.floor === "40x45" && a.goal === "small") flags.push({lvl: "warn", k: "floor", text: "A 40 × 45 cm floor fits one plant well. Several small ones will shade each other."});
    if (a.water === "filtered") flags.push({lvl: "info", k: "water", text: "Pitcher filters swap calcium and magnesium for sodium, which builds up in a recirculating bucket. Use it 50/50 with distilled for fresh mixes from EC ~0.8, distilled for top-offs. A Berlin water analysis or a small RO unit would settle it."});
    if (a.water === "tap") flags.push({lvl: "info", k: "water", text: "Tap water EC " + (a.waterEc ?? "?") + ": measure it, cut CalMag accordingly, and keep the target EC above the water's own."});
    if (hydro && a.where !== "outdoor") flags.push({lvl: "info", k: "warm", text: "DWC water above 23 °C invites root rot. Keep the cooling (water bath, ice packs) ready before the lamp goes up."});
    if (a.seed === "unsure") flags.push({lvl: "info", k: "seed", text: "Seed type unknown: watch for pistils from veg day ~21. If they come on 18/6, it's an autoflower."});
    if (a.timing === "by" && a.by && end && end > a.by) flags.push({lvl: "warn", k: "timing", text: "Harvest lands around " + short(end) + ", after your date (" + short(a.by) + ")." + (a.seed === "auto" ? "" : " Flip earlier or pick a faster strain.")});
    if (!ctx.grown) flags.push({lvl: "info", k: "new", text: "First run of " + f.name + ": count bloom from the flip and judge ripeness by the buds, not the sheet."});
    for (const l of (ctx.past || []).slice(0, 3)) flags.push({lvl: "info", k: "past", text: "From " + l.from + ": " + l.text});

    const setup = {at: T, seed: a.seed, where: a.where, medium, system, volume: vol, light: a.light || null, lampMax: a.lampMax ?? null, floor: a.floor || null, heightLimit: a.heightLimit ?? null,
      water: a.water || null, waterEc: a.waterEc ?? null, goal: a.goal || null, stretch: a.stretch || null, timing: a.timing || null, by: a.by || null, flipAt, endEst: end};
    const fields = {medium, system, where: a.where || "indoor", kind: a.seed === "unsure" ? null : a.seed};
    return {fields, setup, targets, tasks, flags, flipAt, end};
  }
  window.Quiz = {questions, derive, strainFacts, WATER};
})();
