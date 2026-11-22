/* Flowerphile feed.js (v54, pure): dose suggestions that learn from the grower's own feeds, and top-off learning.
   No DOM, no network. Window.Feed.

   Feed logs carry log.feed = {vol: litres in the bucket/res after the step, ml: {product: ml}, ecBefore?}.
   A calibration point = how much EC one ml per litre of the EC-carrying parts (all parts together, in the ratio used)
   added: k = (EC after − EC before) / (Σ ml of EC parts / vol).
     EC after  = the next log with an EC 1–36 h later (settled; no water change or feed in between), else this log's EC.
     EC before = feed.ecBefore, else the water's own EC on a water change (setup.waterEc, 0 for distilled/RO),
                 else the last EC logged in the 48 h before.
   Prior before any point: plant.doseRef {ml, ec, l, parts} (e.g. 1 ml each of 3 parts in 7.5 L ≈ +0.2) → k0,
   else a generic 0.5 with a wide range. Additives that don't carry EC (Cleanse, enzymes, silica…) keep their ml per litre.

   Top-offs: log.top_l = litres added. Rate = top_l / days since the last top-off or water change.
   Feed.drink gives the average per day for the plant's current phase (and overall), Feed.odd flags a rate that is
   50 % above or below the average of the earlier ones (an early signal: roots, heat, or a leak). */
(function(){
  const NO_EC = /cleanse|clean|silic|enzym|zym|root|rhizo|bacter|ph ?(up|down)|h2o2|peroxide|molass/i;
  const hours = (a, b) => (new Date(b) - new Date(a)) / 36e5;
  const r05 = x => Math.max(0, Math.round(x * 2) / 2), r2 = x => Math.round(x * 100) / 100;
  const isWC = l => (l.actions || []).includes("Water change");
  const isFeed = l => !!(l.feed && l.feed.ml) || (l.actions || []).includes("Fed");
  const ecParts = ml => Object.entries(ml || {}).filter(([n, v]) => +v > 0 && !NO_EC.test(n));
  const mine = (logs, p) => (logs || []).filter(l => l.run === p.id).sort((a, b) => a.at < b.at ? -1 : 1);

  function points(logs, p){
    const L = mine(logs, p), out = [];
    L.forEach((l, i) => {
      const f = l.feed; if (!f || !f.vol || !f.ml) return;
      const sum = ecParts(f.ml).reduce((s, [, v]) => s + +v, 0); if (!sum) return;
      let after = null;
      for (let j = i + 1; j < L.length; j++){ const n = L[j], h = hours(l.at, n.at); if (h > 36) break; if (isWC(n) || isFeed(n)) break; if (h >= 1 && n.ec != null){ after = +n.ec; break; } }
      if (after == null && l.ec != null) after = +l.ec;
      let before = f.ecBefore != null ? +f.ecBefore : null;
      if (before == null && isWC(l)) before = +((p.setup && p.setup.waterEc) || 0);
      if (before == null) for (let j = i - 1; j >= 0; j--){ const n = L[j]; if (hours(n.at, l.at) > 48) break; if (n.ec != null){ before = +n.ec; break; } }
      if (after == null || before == null) return;
      const k = (after - before) / (sum / f.vol);
      if (k > 0.05 && k < 3) out.push({at: l.at, k, vol: f.vol, from: before, to: after});
    });
    return out;
  }
  function prior(p){
    const r = p.doseRef; if (!r || !r.ml || !r.l) return {k: 0.5, basis: "generic", spread: 0.4};
    const parts = String(r.parts || "").split(/,| and /).filter(s => s.trim()).length || 3;
    return {k: r.ec / (r.ml * parts / r.l), basis: "label", spread: 0.3};
  }
  function lastFeed(logs, p){ const L = mine(logs, p).filter(l => l.feed && l.feed.ml); return L.length ? L[L.length - 1].feed : null; }
  function ratio(p, logs){
    const f = lastFeed(logs, p);
    if (f){ const e = ecParts(f.ml), s = e.reduce((a, [, v]) => a + +v, 0);
      return {parts: e.map(([n, v]) => [n, +v / s]), extras: Object.entries(f.ml).filter(([n, v]) => +v > 0 && NO_EC.test(n)).map(([n, v]) => [n, +v / f.vol])}; }
    const names = p.doseRef && p.doseRef.parts ? String(p.doseRef.parts).split(/,| and /).map(s => s.trim()).filter(Boolean) : ["CalMag", "Part A", "Part B"];
    return {parts: names.map(n => [n, 1 / names.length]), extras: []};
  }
  /* {from, to, vol} → {items:[{name, ml}], extras, basis, n, range:[lo,hi], text} or null */
  function suggest(p, logs, o){
    const vol = +o.vol || (p.setup && +p.setup.volume) || (lastFeed(logs, p) || {}).vol || (p.doseRef && p.doseRef.l);
    if (!vol || o.to == null || o.from == null || o.to <= o.from + 0.02) return null;
    const pts = points(logs, p).slice(-5), pr = prior(p);
    let k, lo, hi, basis;
    if (pts.length){ const ks = pts.map(x => x.k); k = ks.reduce((a, b) => a + b, 0) / ks.length; basis = "yours";
      const sp = pts.length >= 2 ? Math.max(0.1, (Math.max(...ks) - Math.min(...ks)) / 2 / k) : 0.2; lo = k * (1 - sp); hi = k * (1 + sp); }
    else { k = pr.k; basis = pr.basis; lo = k * (1 - pr.spread); hi = k * (1 + pr.spread); }
    const totalPerL = (o.to - o.from) / k, R = ratio(p, logs);
    const items = R.parts.map(([n, f]) => ({name: n, ml: r05(totalPerL * vol * f)})).filter(x => x.ml > 0);
    const extras = o.water ? R.extras.map(([n, perL]) => ({name: n, ml: r05(perL * vol)})).filter(x => x.ml > 0) : [];
    const used = items.reduce((s, x) => s + x.ml, 0) / vol, range = [r2(o.from + used * lo), r2(o.from + used * hi)];
    const same = items.length > 1 && items.every(x => x.ml === items[0].ml);
    const list = same ? items[0].ml + " ml each of " + items.map(x => x.name).join(", ") : items.map(x => x.ml + " ml " + x.name).join(", ");
    const why = basis === "yours" ? "from your " + pts.length + " measured feed" + (pts.length > 1 ? "s" : "") : basis === "label" ? "from your dose note, not measured yet" : "a first guess, not measured yet";
    const text = "About " + list + (extras.length ? " (+ " + extras.map(x => x.ml + " ml " + x.name).join(", ") + " as last time)" : "") + " in " + vol + " L → EC ≈ " + range[0] + "–" + range[1] + " (" + why + "). Add half, stir, measure, then the rest.";
    return {items, extras, basis, n: pts.length, range, vol, text};
  }

  /* top-offs: litres per day by phase */
  function drinkPoints(logs, p, phaseAt){
    const L = mine(logs, p), out = []; let last = null;
    for (const l of L){
      if (l.top_l != null && last){ const d = Math.max(0.25, hours(last, l.at) / 24); out.push({at: l.at, perDay: +l.top_l / d, phase: phaseAt ? phaseAt(l.date) : null}); }
      if (l.top_l != null || isWC(l)) last = l.at;
    }
    return out;
  }
  function drink(logs, p, phaseAt, phase){
    const pts = drinkPoints(logs, p, phaseAt), same = pts.filter(x => !phase || x.phase === phase).slice(-6), use = same.length >= 2 ? same : pts.slice(-6);
    if (!use.length) return null;
    const avg = use.reduce((s, x) => s + x.perDay, 0) / use.length, last = mine(logs, p).filter(l => l.top_l != null || isWC(l)).pop();
    return {perDay: r2(avg), n: use.length, phaseOnly: use === same, since: last ? last.at : null};
  }
  function expectTop(logs, p, phaseAt, phase, nowIso){
    const d = drink(logs, p, phaseAt, phase); if (!d || !d.since) return null;
    const days = Math.max(0, hours(d.since, nowIso) / 24);
    return {l: Math.round(d.perDay * days * 10) / 10, perDay: d.perDay, n: d.n, days: Math.round(days * 10) / 10,
      text: "Expect about " + (Math.round(d.perDay * days * 10) / 10) + " L (" + d.perDay + " L/day, average of " + d.n + " top-off" + (d.n > 1 ? "s" : "") + (d.phaseOnly ? " in this stage" : "") + ")."};
  }
  function odd(logs, p, entry, phaseAt){
    if (entry.top_l == null) return null;
    const pts = drinkPoints(logs.concat([entry]), p, phaseAt); if (pts.length < 4) return null;
    const cur = pts[pts.length - 1].perDay, prev = pts.slice(-6, -1), avg = prev.reduce((s, x) => s + x.perDay, 0) / prev.length;
    if (cur > avg * 1.5) return "drinking more than usual (" + r2(cur) + " vs " + r2(avg) + " L/day)";
    if (cur < avg * 0.5) return "drinking less than usual (" + r2(cur) + " vs " + r2(avg) + " L/day)";
    return null;
  }
  const api = {points, prior, suggest, drink, expectTop, odd, ecParts};
  if (typeof window !== "undefined") window.Feed = api;
  if (typeof module !== "undefined") module.exports = api;
})();
