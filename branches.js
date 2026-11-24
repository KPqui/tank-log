/* Flowerphile · branches.js — how the app adapts to the grow type and to the grower (pure data + small functions, no DOM).
   A plant's branch = medium (hydro, coco, soil, living-soil) × where (indoor, outdoor). The branch decides
   log fields, log chips, Today tiles, the routine check text, extra plan steps, weather reactions (outdoor),
   setup questions, targets and early flags. The grower's profile (profile.json, asked once) decides how much
   hand-holding and which measurements make sense:
     profile = {at, exp: "new"|"some"|"pro", germ: "yes"|"rough"|"no", meters: "none"|"ph"|"phec"|"sensors",
                known: {any:{water, waterEc, feed}, indoor:{light, lampMax, floor}, outdoor:{loc, heightLimit, spot, sun, roof}}}
   No profile (KP's own GitHub setup) = the full, precise behaviour of v46. */
(function(){
  const D = s => new Date(s + "T12:00:00");
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
  const diff = (a, b) => Math.round((D(b) - D(a)) / 864e5);
  const inGermany = (lat, lon) => lat != null && lat >= 47.2 && lat <= 55.1 && lon >= 5.8 && lon <= 15.1;

  /* ---- the grower ---- */
  const level = pr => !pr || !pr.exp ? "pro" : pr.exp === "new" ? "guide" : pr.exp === "pro" ? "pro" : "mid";
  const meters = pr => (pr && pr.meters) || "sensors";
  const canPh = pr => meters(pr) !== "none", canEc = pr => ["phec", "sensors"].includes(meters(pr));
  const of = p => ({medium: (p && p.medium) || "hydro", where: (p && p.where) || "indoor", system: (p && p.system) || "hand"});
  const soilish = m => m === "soil" || m === "living-soil";

  /* log fields for growing plants (veg/bloom); base = the v46 list from the app */
  function fields(p, pr, base){
    const b = of(p), lv = level(pr); let k = base.slice();
    if (b.medium !== "hydro"){
      if (!canPh(pr)) k = k.filter(x => !/^(ph|res_ph|runoff_ph)$/.test(x));
      if (!canEc(pr)) k = k.filter(x => !/^(ec|res_ec|runoff_ec)$/.test(x));
      if (lv === "guide") k = k.filter(x => !/^runoff_/.test(x));
    }
    if (lv !== "pro") k = k.filter(x => x !== "ppfd");
    if (lv === "guide") k = k.filter(x => x !== "nodes");
    if (b.where === "indoor" && pr && meters(pr) !== "sensors") k.push("air", "rh");   // a cheap hygrometer, typed in
    return [...new Set(k)];
  }

  /* log chips for growing plants */
  function chips(p){
    const b = of(p), auto = b.system === "autopot"; let a;
    if (b.medium === "hydro") a = ["Fed", "Topped off", "Water change", "pH adjusted", "Trimmed", "Trained"];
    else if (b.medium === "living-soil") a = [auto ? "Reservoir refilled" : "Watered", "Top-dressed", "Tea / amended", "Mulch topped up", "Pot felt light", "Pot felt heavy", "Gnats seen", "Trimmed", "Trained", "Pest check"];
    else if (b.medium === "coco") a = [auto ? "Reservoir refilled" : "Watered", "Fed", "Runoff", "Flushed", "Trimmed", "Trained", "Pest check"];
    else a = [auto ? "Reservoir refilled" : "Watered", "Fed", "Flushed", "Pot felt light", "Pot felt heavy", "Trimmed", "Trained", "Pest check"];
    if (b.where === "indoor") a.push("Light changed", "Sensor moved");
    else a.push("Sheltered", "Tied / staked", "Shook off rain", "Caterpillar check");
    return a;
  }
  const WATERED = ["Watered", "Reservoir refilled"], FED = ["Fed", "Top-dressed", "Top-fed", "Tea / amended"];

  /* Today: soil-type plants without measurements get "days since" tiles instead of empty pH/EC tiles */
  function dayTiles(p, pr){
    const b = of(p);
    if (b.medium === "hydro") return false;
    if (b.medium === "living-soil") return true;
    return !canEc(pr);                                  // soil/coco with an EC meter keep the measured tiles
  }

  /* the routine check (every 3 days in veg/bloom) */
  function check(p, pr){
    const b = of(p), lv = level(pr), out = b.where === "outdoor";
    if (b.medium === "hydro") return {title: "Check: values, photo, sensor file", detail: "Log pH, EC and water temperature, take a photo" + (meters(pr) === "sensors" ? ", add the sensor file." : ".")};
    const lift = "Lift the pot: light means water, heavy means wait. Water until a little runs out (or about 5–10 % of the soil volume in living soil), then let it dry back.";
    if (b.medium === "living-soil") return {title: "Check: pot weight, leaves, photo", detail: lift + " Look under a few leaves for mites and at the soil for gnats. Take a photo." + (lv === "guide" ? " Don't water on a schedule; water when the pot is light." : "")};
    if (b.medium === "coco") return {title: "Check: feed, runoff, photo", detail: "Coco never dries out: water with nutrients every 1–2 days until 10–20 % runs out." + (canEc(pr) ? " Log input pH/EC and runoff EC; runoff climbing above input means flush with plain pH'd water." : "") + " Take a photo."};
    return {title: "Check: pot weight, leaves, photo", detail: lift + (canPh(pr) ? " Note the pH of what goes in." : "") + " Take a photo." + (out ? " Outside, hot days can empty a pot in one afternoon." : "")};
  }

  /* extra plan steps per branch (same contract as Rules.plan: generated tasks with `gen`, never duplicated) */
  function plan(p, ctx, pr){
    const b = of(p), T = ctx.today, ph = ctx.phase, out = [];
    if (!["grow", "bloom"].includes(ph)) return out;
    const has = gen => ctx.tasks.some(t => t.run === p.id && t.gen === gen);
    const want = (gen, due, title, detail, trigger, extra) => { if (due >= T && diff(T, due) <= 7 && !has(gen)) out.push(Object.assign({id: "g-" + gen + "-" + p.id, run: p.id, gen, due, title, detail, trigger, status: "open", src: "app"}, extra || {})); };
    const sprout = p.sprout || (p.phases || {}).grow, flip = p.flip || (p.phases || {}).bloom;
    // v57: watering rhythm learned from the grower's own waterings (and pot weights, if any): one "lift the pot" step on the expected day
    if ((b.medium === "soil" || b.medium === "living-soil") && b.system !== "autopot" && window.Feed){
      const phaseAt = ctx.phaseAt || null, nw = window.Feed.nextWater(ctx.logs || [], p, phaseAt, ph);
      if (nw){ const due = nw.date < T ? T : nw.date;
        if (!ctx.tasks.some(t => t.run === p.id && t.status === "open" && t.kind === "water"))
          want("water-" + due, due, "Lift the pot: watering likely due", "Your rhythm: " + nw.how + ". Light → water until a little runs out" + (b.medium === "living-soil" ? " (or ~5–10 % of the soil volume)" : "") + ", then log Watered. Still heavy → wait, log \"Pot felt heavy\", and the app learns.", "Your watering rhythm", {kind: "water"}); }
    }
    if (b.medium === "living-soil"){
      if (ph === "grow" && sprout) want("ls-topdress-veg", add(sprout, 28), "Top-dress", "Scratch a handful of worm castings and a balanced dry amendment into the top 2 cm, then water it in and cover with mulch.", "Veg day ~28");
      if (ph === "bloom" && flip){ want("ls-topdress-b1", add(flip, 1), "Top-dress for bloom", "A bloom amendment (more phosphorus and potassium) scratched into the top layer, watered in, mulch back on.", "Start of bloom");
        want("ls-topdress-b21", add(flip, 21), "Top-dress", "The last top-dress of the run: after this, plain water only.", "Bloom day ~21"); }
    }
    if (b.medium === "soil" && !canEc(pr)){
      const last = ctx.logs.find(l => l.run === p.id && (l.actions || []).some(a => FED.includes(a)));
      const base = last ? last.date : sprout ? add(sprout, 21) : null;   // most bagged soils carry the first ~3 weeks
      if (base) want("soil-feed-" + add(base, 7), add(base, 7) < T ? T : add(base, 7), "Feed with the watering", "Mix your nutrients at ¼–½ of the bottle chart (more only if lower leaves pale). Feed one watering, plain water the next.", "About every 7 days from veg day ~21");
    }
    return out;
  }

  /* outdoor: weather → steps (w = Open-Meteo forecast with daily arrays; index 0 = today) */
  function weather(p, w, ctx){
    const out = [], T = ctx.today, ph = ctx.phase, d = (w && w.daily) || {};
    if (!["grow", "bloom"].includes(ph) || !d.time) return out;        // seeds start indoors; weather matters once it's outside
    const has = gen => ctx.tasks.some(t => t.run === p.id && t.gen === gen);
    const want = (gen, due, title, detail, trigger, extra) => { if (!has(gen)) out.push(Object.assign({id: "g-" + gen + "-" + p.id, run: p.id, gen, due, title, detail, trigger, status: "open", src: "app"}, extra || {})); };
    const days = d.time.slice(0, 3);
    days.forEach((day, i) => {
      if (day < T) return;
      const mn = (d.temperature_2m_min || [])[i], mx = (d.temperature_2m_max || [])[i], rain = (d.precipitation_sum || [])[i], gust = (d.wind_gusts_10m_max || [])[i], hum = (d.relative_humidity_2m_mean || [])[i];
      if (mn != null && mn < 3) want("wx-frost-" + day, i ? add(day, -1) : day, "Protect from frost", "Down to " + Math.round(mn) + " °C on " + day.slice(5) + ". Bring the pot in for the night or cover it with fleece.", "Frost forecast", {urgent: mn < 0});
      if (gust != null && gust >= 45) want("wx-wind-" + day, i ? add(day, -1) : day, "Stake and tie", "Gusts up to " + Math.round(gust) + " km/h. Tie the main stem to a stake, move the pot out of the wind if you can.", "Wind forecast");
      if (mx != null && mx >= 30 ) want("wx-heat-" + day, day, "Hot day: water early", "Up to " + Math.round(mx) + " °C. Water in the morning, check the pot again at mid-afternoon, shade dark pots.", "Heat forecast");
      if (ph === "bloom" && rain != null && rain >= 3) want("wx-rain-" + day, day, "After the rain: shake off and look", "Shake water off the buds, give them air, and open the densest ones a little: grey fuzz or brown inside = bud rot, cut it out with a margin.", "Rain in bloom");
      if (ph === "bloom" && hum != null && hum >= 85 && (rain || 0) < 3) want("wx-damp-" + day, day, "Damp day: check for mould", "Humid air all day. Look inside the densest buds and at the leaves sticking to them.", "Humidity in bloom");
    });
    return out;
  }

  /* ---- setup questions per branch (quiz.js asks them; ids land in plant.setup) ---- */
  function questions(){
    const med = x => (x.grow || "").split("|")[0], out = x => x.where === "outdoor";
    return [
      {id: "spot", type: "one", title: "What kind of spot?", why: "Sets the weather warnings and how often to check.", show: out, opts: [["balcony", "Balcony or terrace"], ["garden", "Garden", "bed or big pot"], ["greenhouse", "Greenhouse or poly tunnel"]]},
      {id: "sun", type: "one", title: "Direct sun per day?", why: "In midsummer. Cannabis wants as much as it can get; under ~5 h it stays small and airy.", show: x => out(x) && x.spot !== "greenhouse", opts: [["low", "Under 4 h"], ["mid", "4–6 h"], ["high", "6 h or more"]]},
      {id: "roof", type: "one", title: "Rain on it?", why: "Rain on ripe buds is the main cause of mould outside.", show: x => out(x) && x.spot !== "greenhouse", opts: [["open", "Open sky"], ["cover", "Under a roof or overhang"], ["movable", "I can move it under cover"]]},
      {id: "feed", type: "one", title: "What do you feed?", why: "Decides the feeding steps in the plan.", show: x => ["soil", "coco"].includes(med(x)), opts: [["bottle", "Bottled nutrients", "from a grow shop"], ["organic", "Organic liquid or dry fertiliser"], ["none", "Nothing yet", "the soil is pre-fertilised"]]},
      {id: "soilsrc", type: "one", title: "Which living soil?", why: "Bagged soils carry food for the first 20–30 days; a reused bed needs a top-dress early.", show: x => med(x) === "living-soil", opts: [["bag", "Ready-made bag", "organic / living soil"], ["mix", "My own mix"], ["reused", "A reused (no-till) bed"]]}
    ];
  }

  /* targets per branch (start from the medium defaults the app passes in) */
  function targets(medium, where, pr, base){
    const t = Object.assign({}, base);
    if (where === "outdoor"){ delete t.air; delete t.rh; delete t.ppfd; }
    if (medium !== "hydro"){ if (!canPh(pr)) delete t.ph; if (!canEc(pr)) delete t.ec; }
    if (level(pr) !== "pro") delete t.ppfd;
    return t;
  }

  /* early flags per branch (source notes in comments; texts in plain words) */
  function flags(a, ctx){
    const pr = ctx.profile, [medium] = (a.grow || "hydro|dwc").split("|"), outdoor = a.where === "outdoor", vol = +a.volume || null, F = [];
    const f = (lvl, k, text) => F.push({lvl, k, text});
    const loc = a.loc || {}, de = inGermany(loc.lat, loc.lon);
    if (outdoor){
      // timing: autos ~10–12 weeks seed to harvest; a July start still finishes mid-Sep/early Oct (Dutch Passion); photos flower as days shorten
      if (a.seed === "auto") f("info", "out-timing", "Autoflower outside: put it out once nights stay above ~10 °C" + (de ? " (in Germany usually after mid-May)" : "") + ". It needs about 70–85 days from seed, so a start up to early July still finishes by early October.");
      else if (a.seed === "photo") f("info", "out-timing", "Photoperiod outside: it grows until the days shorten, starts flowering on its own" + (de ? " around late July to August" : " in late summer") + " and is ready late September to mid-October. Wet autumn weather is the main risk, so a fast, mould-resistant strain helps.");
      if (de) f("info", "law-de", "At home in Germany (KCanG): up to 3 plants per adult, kept out of reach of children and visitors. A privacy screen isn't required but helps; late-bloom smell can bother neighbours.");
      if (a.roof === "open") f("warn", "rain", "Open to the rain: in late bloom, shake the buds off after rain and look inside the densest ones for grey mould. A movable spot or a small roof saves a harvest in a wet September.");
      if (a.sun === "low") f("warn", "sun", "Under 4 h of direct sun is little for cannabis. A compact autoflower suits that spot best; expect a small harvest.");
      if (vol && vol < 15 && a.spot !== "greenhouse") f("info", "pot-heat", "This " + vol + " L pot dries out fast on hot days. Check it every day in summer; a bigger pot or a saucer with gravel buys time.");
      if (a.spot === "balcony") f("info", "wind", "Balconies catch wind: give it a stake early and tie the main stem before the buds get heavy.");
      f("info", "pests", "Outside, caterpillars hide inside buds in late summer (look for droppings) and aphids sit under young leaves. Check during the routine look.");
    }
    if (medium === "living-soil"){
      // watering 5–10 % of soil volume (BuildASoil via Cannabis Business Times); overwatering is the main organic failure
      f("info", "ls-water", "Living soil: no EC targets and no bottled food. Water by pot weight, about " + (vol ? Math.round(vol * 0.05 * 10) / 10 + "–" + Math.round(vol * 0.1 * 10) / 10 + " L for " + vol + " L of soil" : "5–10 % of the soil volume") + " at a time, and only when the pot feels light. Overwatering is the most common problem.");
      f("info", "ls-gnats", "Fungus gnats come from a wet top layer. A mulch layer, letting the top dry between waterings, and watering less often keep them down.");
      if (vol && vol < 25) f("info", "ls-small", "Smaller living-soil pots run out of food in bloom. The plan adds top-dresses at veg day ~28, the start of bloom and bloom day ~21.");
      if (a.soilsrc === "reused") f("info", "ls-reused", "Reused bed: top-dress before planting (castings + a balanced amendment) and keep the mulch or cover crop on.");
    }
    if ((medium === "soil" || medium === "coco") && a.feed === "bottle") f("info", "feed-dose", "Bottle charts are written for big plants under strong light. Start at ¼–½ of the chart and go up only when the lower leaves turn pale.");
    if (medium === "soil" && a.feed === "none") f("info", "feed-none", "Pre-fertilised soil usually feeds for 21–28 days. When the lower leaves turn pale yellow after that, it's hungry.");
    if (medium === "coco") f("info", "coco", "Coco holds almost no food: feed with nearly every watering and let 10–20 % run out so salts don't build up.");
    if (medium === "hydro" && pr && !canEc(pr)) f("warn", "hydro-meters", "Hydro needs a pH pen and an EC meter (about €30–60 together). Without them the water values are guesswork.");
    if (pr && pr.exp === "new") f("info", "new", "New to this? Every step in the plan has a short how-to where one exists. Log whenever you look at the plant; the plan adjusts to what you log.");
    return F.sort((x, y) => (y.lvl === "warn") - (x.lvl === "warn"));
  }

  /* answers worth remembering for the next plant: {questionId: bucket} */
  const KNOWN = {water: "any", waterEc: "any", feed: "any", light: "indoor", lampMax: "indoor", floor: "indoor", loc: "outdoor", heightLimit: "outdoor", spot: "outdoor", sun: "outdoor", roof: "outdoor"};
  function remember(pr, a){
    const k = JSON.parse(JSON.stringify((pr && pr.known) || {}));
    for (const [id, bucket] of Object.entries(KNOWN)){
      if (a[id] == null || a[id] === "") continue;
      if (bucket === "indoor" && a.where === "outdoor") continue;
      if (bucket === "outdoor" && a.where !== "outdoor") continue;
      (k[bucket] = k[bucket] || {})[id] = a[id];
    }
    return k;
  }
  const knownFor = (pr, id, where) => { const b = KNOWN[id], k = (pr && pr.known) || {}; if (!b) return undefined; if (b === "indoor" && where === "outdoor") return undefined; if (b === "outdoor" && where !== "outdoor") return undefined; return (k[b] || {})[id]; };

  window.Branch = {of, level, meters, canPh, canEc, fields, chips, dayTiles, check, plan, weather, questions, targets, flags, remember, knownFor, KNOWN, WATERED, FED, inGermany};
})();
