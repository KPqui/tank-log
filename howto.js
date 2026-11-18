/* Flowerphile · howto.js — small illustrated how-tos for techniques and routine steps (no network, no DOM).
   Each how-to: {id, title, match (regex on a task title), what, steps:[{fig, text}], watch:[…], vs?}.
   A task can name one directly with `howto: "<id>"`; otherwise the title is matched (first match wins, so the
   more specific ones come first). Figures are drawn here in the plate style: ink lines (currentColor), a thin
   green wash on leaves, a warm accent for cuts. Placeholders until the proper design pass. */
(function(){
  const F1 = n => Math.round(n * 10) / 10;
  const P = (d, o) => '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + ((o && o.w) || 0.9) + '" stroke-linecap="round" stroke-linejoin="round"' + (o && o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + (o && o.op ? ' opacity="' + o.op + '"' : '') + (o && o.col ? ' style="stroke:' + o.col + '"' : '') + '/>';
  const T = (x, y, s, o) => '<text x="' + x + '" y="' + y + '" font-size="' + ((o && o.size) || 7.5) + '" font-style="italic" text-anchor="' + ((o && o.anchor) || "middle") + '" fill="currentColor"' + (o && o.col ? ' style="fill:' + o.col + '"' : '') + '>' + s + '</text>';
  const CUT = "var(--high)";
  // one leaf: 3 or 5 narrow serrated-looking leaflets fanned around `ang` (degrees, 0 = right)
  function leaf(x, y, ang, s, o){
    o = o || {}; const n = o.n || 3, spread = n === 5 ? 28 : 32, out = [];
    for (let i = 0; i < n; i++){
      const a = (ang + (i - (n - 1) / 2) * spread) * Math.PI / 180, len = s * (1 - Math.abs(i - (n - 1) / 2) * 0.22);
      const tx = x + Math.cos(a) * len, ty = y + Math.sin(a) * len, nx = -Math.sin(a) * len * 0.13, ny = Math.cos(a) * len * 0.13;
      const mx = x + Math.cos(a) * len * 0.45, my = y + Math.sin(a) * len * 0.45;
      const d = "M" + F1(x) + " " + F1(y) + " Q" + F1(mx + nx) + " " + F1(my + ny) + " " + F1(tx) + " " + F1(ty) + " Q" + F1(mx - nx) + " " + F1(my - ny) + " " + F1(x) + " " + F1(y) + "Z";
      out.push('<path d="' + d + '" style="fill:var(--leaf);fill-opacity:' + (o.faint ? 0.12 : 0.45) + '" stroke="currentColor" stroke-width="0.6"' + (o.faint ? ' stroke-dasharray="1.5 1.5" opacity=".55"' : '') + '/>');
      out.push(P("M" + F1(x) + " " + F1(y) + " L" + F1(x + Math.cos(a) * len * 0.85) + " " + F1(y + Math.sin(a) * len * 0.85), {w: 0.35, op: o.faint ? 0.4 : 0.8}));
    }
    return out.join("");
  }
  const pair = (x, y, s, o) => leaf(x - 1, y, 200, s, o) + leaf(x + 1, y, -20, s, o);
  const nodeDot = (x, y) => '<circle cx="' + x + '" cy="' + y + '" r="1.2" fill="currentColor"/>';
  const cross = (x, y, r) => P("M" + (x - r) + " " + (y - r) + " L" + (x + r) + " " + (y + r) + " M" + (x + r) + " " + (y - r) + " L" + (x - r) + " " + (y + r), {w: 1.1, col: CUT});
  const cutMark = (x, y) => P("M" + (x - 7) + " " + (y + 2) + " L" + (x + 7) + " " + (y - 2), {w: 1.4, col: CUT}) + T(x + 16, y + 1, "cut", {col: CUT, size: 7});
  const arrow = (x1, y1, x2, y2, o) => { const a = Math.atan2(y2 - y1, x2 - x1), h = 4;
    return P("M" + x1 + " " + y1 + " Q" + F1((x1 + x2) / 2 + ((o && o.bend) || 0)) + " " + F1((y1 + y2) / 2 - ((o && o.bend) || 0)) + " " + x2 + " " + y2, {w: 0.8, dash: o && o.dash}) +
      P("M" + F1(x2 - h * Math.cos(a - 0.5)) + " " + F1(y2 - h * Math.sin(a - 0.5)) + " L" + x2 + " " + y2 + " L" + F1(x2 - h * Math.cos(a + 0.5)) + " " + F1(y2 - h * Math.sin(a + 0.5)), {w: 0.8}); };
  // pot / bucket lid at y = 100
  const lid = () => P("M18 100 L102 100", {w: 1.1}) + P("M24 100 L30 116 L90 116 L96 100", {w: 0.8, op: 0.7}) + P("M48 100 L50 106 L70 106 L72 100", {w: 0.7});
  const svg = (inner, vb) => '<svg viewBox="' + (vb || "0 0 120 120") + '" class="howfig" aria-hidden="true">' + inner + '</svg>';
  const PV = "18 30 90 90";                                // plant figures: crop to the plant so it reads at phone size

  // a straight plant: stem up from the lid with `n` nodes, 11 px apart
  function plant(n, o){
    o = o || {}; const y = i => 100 - 11 * i, top = o.cutAt ? y(o.cutAt) - 4 : o.noTip ? y(n) : y(n) - 6; let s = "";
    s += P("M60 100 L60 " + top, {w: 1.3});
    for (let i = 1; i <= n; i++){
      if (o.cutAt && i > o.cutAt){ s += P("M60 " + (y(o.cutAt) - 4) + " L60 " + (y(n) - 6), {w: 1, dash: "2 2", op: 0.45}); s += pair(60, y(i), 13 - i * 0.4, {faint: true}); continue; }
      const faint = o.remove && o.remove.includes(i);
      s += pair(60, y(i), 15 - i * 0.6, {faint, n: i > 2 ? 5 : 3}) + nodeDot(60, y(i));
      if (faint) s += cross(60, y(i), 3.5);
      if (o.numbers) s += T(48, y(i) + 2.5, String(i), {size: 7, anchor: "end"});
    }
    if (o.mark) s += '<circle cx="60" cy="' + y(o.mark) + '" r="5" fill="none" stroke="currentColor" stroke-width=".7" stroke-dasharray="1.5 1.2"/>' + T(84, y(o.mark) + 2.5, "node " + o.mark, {anchor: "start", size: 7});
    if (o.cutAt) s += cutMark(60, y(o.cutAt) - 4);
    if (!o.cutAt && !o.noTip && n) s += leaf(60, y(n) - 6, -90, 7);
    return s;
  }
  // two shoots rising from a node in a V
  function vShoots(x, y, h, o){
    o = o || {}; let s = "";
    for (const d of [-1, 1]){
      const x2 = x + d * (o.spread || 14), y2 = y - h;
      s += P("M" + x + " " + y + " Q" + (x + d * 3) + " " + (y - h * 0.4) + " " + x2 + " " + y2, {w: 1.1});
      const nn = o.nodes || 2;
      for (let k = 1; k <= nn; k++){ const t = k / (nn + 0.6), px = F1(x + d * 3 * (1 - t) * 2 * t + (x2 - x) * t * t), py = F1(y + (y2 - y) * t); s += leaf(px, py, d > 0 ? -25 : 205, 8, {n: 3}) + leaf(px, py, d > 0 ? -150 : -30, 6, {n: 3}); }
      s += leaf(x2, y2, -90 + d * 15, 6);
      if (o.cutTips) s += cutMark(x2, y2 + 3);
    }
    return s;
  }
  const FIG = {
    count: () => svg(lid() + plant(5, {numbers: true, mark: 3}), PV),
    cut3: () => svg(lid() + plant(5, {cutAt: 3}), PV),
    twoTops: () => svg(lid() + plant(3, {noTip: true}) + vShoots(60, 67, 30, {nodes: 2}) + arrow(30, 50, 44, 40, {bend: 4}) + T(26, 56, "2 new tops"), "10 30 100 90"),
    manifoldClear: () => svg(lid() + plant(3, {remove: [1, 2], cutAt: 3}) + T(20, 84, "remove", {col: CUT, size: 7, anchor: "start"}), "18 50 90 70"),
    manifoldBend: () => { let s = lid() + P("M60 100 L60 67", {w: 1.3}) + nodeDot(60, 67);
      for (const d of [-1, 1]){ const xr = 60 + d * 36; s += P("M60 67 Q" + (60 + d * 20) + " 70 " + xr + " 90 Q" + (xr + d * 6) + " 82 " + (xr + d * 4) + " 50", {w: 1.1}); s += P("M" + xr + " 90 L" + xr + " 100", {w: 0.6, dash: "1.5 1.2"}) + T(xr, 108, "tie", {size: 6.5});
        for (const yy of [80, 68, 56]) s += leaf(xr + d * 4.5, yy, d > 0 ? -20 : 200, 7) + leaf(xr + d * 4.5, yy, d > 0 ? 200 : -20, 6); s += leaf(xr + d * 4, 48, -90, 6); }
      return svg(s); },
    manifoldFour: () => { let s = lid() + P("M60 100 L60 67", {w: 1.3});
      for (const d of [-1, 1]){ const xr = 60 + d * 30; s += P("M60 67 Q" + (60 + d * 16) + " 72 " + xr + " 88 L" + xr + " 66", {w: 1.1}) + leaf(xr, 80, d > 0 ? -20 : 200, 7) + leaf(xr, 80, d > 0 ? 200 : -20, 6);
        s += vShoots(xr, 66, 26, {nodes: 1, spread: 9}); }
      return svg(s + T(60, 26, "4 even tops")); },
    lstBend: () => { let s = lid() + P("M60 100 Q60 80 74 74 Q92 68 98 70", {w: 1.3}) + P("M98 70 L100 100", {w: 0.6, dash: "1.5 1.2"}) + T(104, 108, "tie", {size: 6.5, anchor: "end"});
      for (const [x, y] of [[66, 80], [80, 72]]) s += P("M" + x + " " + y + " L" + (x - 2) + " " + (y - 22), {w: 0.9}) + leaf(x - 2, y - 22, -90, 6) + leaf(x - 1, y - 12, 200, 6) + leaf(x - 1, y - 12, -20, 6);
      return svg(s + leaf(98, 70, -10, 8) + arrow(40, 40, 54, 30, {bend: 5}) + T(32, 50, "shoots turn up")); },
    lstFlat: () => { let s = lid(); for (const x of [34, 50, 66, 82]) s += P("M" + x + " 98 L" + x + " 58", {w: 0.9}) + leaf(x, 58, -90, 7) + leaf(x, 70, 200, 6) + leaf(x, 70, -20, 6);
      return svg(s + P("M22 54 L98 54", {w: 0.6, dash: "2 2"}) + T(60, 46, "one even canopy")); },
    shade: () => { let s = lid() + plant(6); for (let i = 0; i < 6; i++) s += P("M" + (30 + i * 12) + " 2 L" + (32 + i * 12) + " 22", {w: 0.5, op: 0.6});
      return svg(s + '<rect x="22" y="70" width="76" height="28" rx="3" fill="currentColor" opacity=".08"/>' + T(105, 86, "shade", {anchor: "end", size: 7})); },
    clearLow: () => svg(lid() + plant(6, {remove: [1, 2]}) + T(20, 92, "remove", {col: CUT, size: 7, anchor: "start"}), PV),
    lollipop: () => { let s = lid() + P("M60 100 L60 32", {w: 1.3}); for (let i = 3; i <= 6; i++) s += pair(60, 100 - 11 * i, 16 - i, {n: 5}); s += leaf(60, 30, -90, 7);
      return svg(s + P("M60 100 L60 72", {w: 1.3}) + T(84, 92, "clear stem", {size: 7, anchor: "start"})); },
    mix: () => { let s = '<path d="M30 48 L32 108 L88 108 L90 48" fill="none" stroke="currentColor" stroke-width="1"/>' + P("M32 66 L88 66", {w: 0.5, op: 0.6}) + '<path d="M33 66 L35 106 L85 106 L87 66Z" style="fill:var(--soak);fill-opacity:.2"/>';
      [["CalMag", 28], ["part A", 60], ["part B", 92]].forEach(([l, x], i) => { s += '<rect x="' + (x - 7) + '" y="8" width="14" height="22" rx="2" fill="none" stroke="currentColor" stroke-width=".8"/>' + T(x, 38, (i + 1) + ". " + l, {size: 6.5}); });
      return svg(s + arrow(60, 40, 60, 60)); },
    lift: () => { let s = P("M24 70 L30 116 L90 116 L96 70", {w: 0.9}) + '<path d="M28 84 L31 114 L89 114 L92 84Z" style="fill:var(--soak);fill-opacity:.2"/>';
      s += P("M46 34 L48 44 L72 44 L74 34 Z", {w: 0.9}) + P("M60 34 L60 12", {w: 1.2}) + pair(60, 20, 10);
      for (let i = 0; i < 6; i++) s += P("M" + (50 + i * 4) + " 44 q" + (i % 2 ? 3 : -3) + " 10 " + (i % 2 ? -1 : 1) + " 20", {w: 0.5});
      return svg(s + arrow(84, 60, 84, 40) + T(98, 52, "lift", {size: 7})); },
    refill: () => { let s = lid() + '<path d="M26 104 L30 116 L90 116 L94 104Z" style="fill:var(--soak);fill-opacity:.3"/>' + P("M26 104 L94 104", {w: 0.6});
      s += P("M60 100 L60 70", {w: 1.2}) + pair(60, 82, 11) + leaf(60, 70, -90, 7);
      return svg(s + P("M100 100 L100 104", {w: 0.7}) + T(104, 98, "2–4 cm", {size: 6.5, anchor: "end"}) + T(60, 30, "water just below the pot")); },
    timer: () => { let s = '<circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" stroke-width="1"/>' + '<path d="M60 26 A34 34 0 0 1 60 94 Z" fill="currentColor" opacity=".75"/>' + '<path d="M60 26 A34 34 0 0 0 60 94 Z" style="fill:var(--warm);fill-opacity:.35"/>';
      return svg(s + T(42, 64, "12 h", {size: 9}) + T(78, 64, "12 h", {size: 9, col: "var(--paper)"}) + T(42, 108, "light") + T(78, 108, "dark")); },
    leak: () => { let s = '<rect x="30" y="14" width="60" height="92" rx="4" fill="currentColor" opacity=".8"/>' + P("M86 56 L92 56", {w: 1.2});
      for (let i = 0; i < 4; i++) s += P("M90 " + (40 + i * 8) + " L106 " + (34 + i * 9), {w: 0.6, col: "var(--warm)"});
      return svg(s + cross(100, 26, 5) + T(60, 116, "no light leaks")); },
    stretch: () => { let s = lid() + P("M38 100 L38 70", {w: 1.1}) + pair(38, 86, 8) + leaf(38, 70, -90, 6) + P("M80 100 L80 26", {w: 1.1}) + pair(80, 86, 9) + pair(80, 64, 9) + pair(80, 42, 8) + leaf(80, 26, -90, 6);
      return svg(s + arrow(48, 60, 66, 46, {bend: 5}) + T(58, 72, "×1.5–2.5")); },
    measure: () => { let s = '<path d="M34 60 L36 108 L84 108 L86 60" fill="none" stroke="currentColor" stroke-width=".9"/><path d="M35 74 L37 106 L83 106 L85 74Z" style="fill:var(--soak);fill-opacity:.25"/>';
      s += '<rect x="52" y="12" width="16" height="74" rx="4" fill="none" stroke="currentColor" stroke-width="1"/><rect x="55" y="20" width="10" height="12" fill="currentColor" opacity=".15"/>';
      return svg(s + T(60, 29, "EC", {size: 6.5})); },
    drops: () => { let s = '<path d="M34 64 L36 108 L84 108 L86 64" fill="none" stroke="currentColor" stroke-width=".9"/><path d="M35 78 L37 106 L83 106 L85 78Z" style="fill:var(--soak);fill-opacity:.25"/>';
      s += P("M56 10 L64 10 L63 34 L60 40 L57 34 Z", {w: 0.9}); for (const y of [48, 58]) s += '<path d="M60 ' + y + ' q-3 5 0 6 q3 -1 0 -6" fill="currentColor"/>';
      return svg(s + T(98, 30, "a few", {size: 7, anchor: "end"})); },
    wait: () => { let s = '<circle cx="60" cy="56" r="30" fill="none" stroke="currentColor" stroke-width="1"/>' + P("M60 56 L60 34 M60 56 L74 62", {w: 1.2});
      return svg(s + '<path d="M60 26 A30 30 0 0 1 90 56 L60 56Z" fill="currentColor" opacity=".12"/>' + T(60, 104, "15 min, then measure")); },
    jarOpen: () => { let s = '<path d="M38 40 L38 104 Q38 110 44 110 L76 110 Q82 110 82 104 L82 40" fill="none" stroke="currentColor" stroke-width="1"/>' + P("M36 40 L84 40", {w: 1});
      s += '<rect x="44" y="12" width="32" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1" transform="rotate(-18 60 16)"/>';
      for (const [x, y] of [[50, 92], [64, 96], [58, 80], [70, 84], [48, 70]]) s += '<ellipse cx="' + x + '" cy="' + y + '" rx="7" ry="5.5" style="fill:var(--leaf);fill-opacity:.4" stroke="currentColor" stroke-width=".6"/>';
      s += '<rect x="66" y="50" width="12" height="16" fill="none" stroke="currentColor" stroke-width=".7"/>' + T(72, 61, "RH", {size: 5.5});
      return svg(s + T(20, 30, "10–15 min", {size: 7, anchor: "start"})); },
    smell: () => { let s = '<path d="M44 56 L44 104 Q44 110 50 110 L70 110 Q76 110 76 104 L76 56" fill="none" stroke="currentColor" stroke-width="1"/>';
      for (let i = 0; i < 3; i++) s += P("M" + (52 + i * 8) + " 52 q-4 -8 0 -14 q4 -6 0 -14", {w: 0.7, op: 0.8});
      return svg(s + T(60, 14, "fresh = good · hay = dry", {size: 6.5}) + T(60, 118, "ammonia = too wet", {size: 6.5})); },
    snapYes: () => svg(P("M20 70 L58 66", {w: 2}) + P("M64 64 L100 50", {w: 2}) + P("M58 60 l3 4 l-3 4 M64 58 l-3 4 l3 4", {w: 0.8}) + T(60, 92, "snaps: ready for jars")),
    snapNo: () => svg(P("M20 76 Q60 40 100 76", {w: 2}) + T(60, 98, "bends: keep drying")),
  };

  const H = [
    {id: "manifold", title: "Manifold", match: /manifold/i,
     what: "A stricter version of topping. One cut, strip the lower growth, bend the two mains flat, top again. You end with 4 (or 8) tops of the same height on one stem, easy to light evenly in a small space.",
     steps: [{fig: "manifoldClear", text: "Top above node 3 and remove everything at nodes 1 and 2 (small shoots and leaves). All the energy goes into the two shoots at node 3."},
             {fig: "manifoldBend", text: "When the two mains are about 5 cm long, bend them outward and down toward the rim and tie them loosely. Let each grow 3–4 nodes."},
             {fig: "manifoldFour", text: "Top each main above its 2nd node. Now there are 4 even tops. Keep them level with ties."}],
     watch: ["It adds about 10–14 days of veg; worth it in a small space.", "Keep both sides the same: cut at the same node on each side.", "Bend slowly, close to a node. A kinked stem heals, a snapped one doesn't.", "Not for autoflowers.", "Nothing else stressful on the same day."],
     vs: "Topping is only the first cut and keeps the lower growth. LST bends without cutting. A SCROG net spreads the tops and can be combined with it."},
    {id: "topping", title: "Topping", match: /\btop(ping)?\b(?! off)|top above/i,
     what: "Cutting off the very top of the main stem, so the plant grows two main tops instead of one. It gets wider and lower.",
     steps: [{fig: "count", text: "Count the nodes from the bottom. A node is where a pair of leaves grows out of the stem. Wait until there are 5 or 6."},
             {fig: "cut3", text: "Cut the main stem a few millimetres above node 3. Clean, sharp scissors, one cut."},
             {fig: "twoTops", text: "The two shoots at node 3 become the new tops. Growth pauses for 2–4 days, then speeds up."}],
     watch: ["Only on a healthy plant.", "Not on an autoflower after about day 21: it has no time to recover.", "Nothing else stressful that day (no water change, no defoliation).", "Don't cut into the node itself."],
     vs: "Manifold starts with the same cut but strips the lower growth and tops again for 4 or 8 even tops. FIM pinches the tip instead of cutting it (3–4 messier tops). LST bends instead of cutting."},
    {id: "lst", title: "LST (bend and tie)", match: /\blst\b|low.stress|bend the main|tie (it )?down/i,
     what: "Low-stress training: bending and tying the stem so the plant grows flat and wide instead of tall. No cutting.",
     steps: [{fig: "lstBend", text: "Bend the main stem sideways, gently, and tie it to the rim. The side shoots now turn up toward the light."},
             {fig: "lstFlat", text: "Every few days, bend down whichever tip is tallest. The goal is one flat, even canopy."}],
     watch: ["Bend slowly; if a stem cracks a little, tape it, it usually heals.", "Check the ties every week so they don't cut into the stem.", "The safest training for autoflowers."],
     vs: "Topping and manifold cut the stem. Supercropping squeezes and bends a stem hard (more stress)."},
    {id: "clear-lower", title: "Clearing the lower third", match: /defol|clear lower|lower third|lollipop/i,
     what: "Removing the small shoots and leaves low on the plant. They get almost no light, so they only cost energy that could go to the tops.",
     steps: [{fig: "shade", text: "Look from the side: the bottom third sits in the shade of the canopy."},
             {fig: "clearLow", text: "Remove the small shoots and leaves there. Cut close to the stem."},
             {fig: "lollipop", text: "Keep the big fan leaves up top: they feed the plant. The result looks like a lollipop."}],
     watch: ["At most about a quarter of the leaves in one session.", "Space sessions 5–7 days apart (plants in DWC regrow leaves fast).", "Good times: just before the flip and around bloom day 21.", "Not on the same day as topping or a water change."],
     vs: "Defoliation in bloom also removes fan leaves that shade bud sites; it's more aggressive."},
    {id: "water-change", title: "Water change (DWC)", match: /water change/i,
     what: "Replacing the whole nutrient water in the bucket, so salts don't build up and the roots get fresh water.",
     steps: [{fig: "mix", text: "Mix the fresh water first, at about the same temperature as the old. CalMag first if you use it, then each part of your nutrients, stirring in between. pH last."},
             {fig: "lift", text: "Lift the net pot with the roots, empty the bucket, rinse it and the air stone."},
             {fig: "refill", text: "Refill so the water sits 2–4 cm below the net pot, put the plant back, check EC and pH after 15 minutes."}],
     watch: ["Roots out of the water only for a few minutes, and out of bright light.", "Temperature within ±2 °C of the old water.", "Never pour the concentrates into each other."]},
    {id: "flip", title: "Switching to 12/12 (the flip)", match: /12\s*\/\s*12|\bflip\b/i,
     what: "Photoperiod plants start flowering when the nights get long: 12 hours of light, 12 hours of real darkness.",
     steps: [{fig: "timer", text: "Set the timer to 12 hours on, 12 hours off (a plug timer or the lamp's own schedule)."},
             {fig: "leak", text: "Dark means dark: check for light leaks with the door closed. Small LEDs count."},
             {fig: "stretch", text: "Expect the stretch: the plant grows 1.5 to 2.5 times taller over the next 2–3 weeks. Keep the lamp distance."}],
     watch: ["Don't open the space or switch on a light during the dark hours.", "Autoflowers don't need this; they flower on their own.", "Do it on a day with nothing else stressful."]},
    {id: "feed", title: "A feed step", match: /feed step|\bfeed\b|nutrient/i,
     what: "Raising the strength of the nutrient water a little (EC), as the plant grows and eats more.",
     steps: [{fig: "measure", text: "Measure the EC before adding anything."},
             {fig: "mix", text: "CalMag first if you use it, then each part of your nutrients, stirring in between. Never pour concentrates into each other."},
             {fig: "wait", text: "Wait about 15 minutes, measure the EC, then adjust the pH last."}],
     watch: ["Small steps: +0.1 to 0.2 EC at a time.", "Watch the leaf tips for the next few days: burnt tips mean too much.", "Calculators overshoot; measure, then dose.", "Top off with plain water only."]},
    {id: "ph", title: "Adjusting pH", match: /adjust ph|\bph\b/i,
     what: "Bringing the water back into the range where roots can take up all nutrients (hydro: about 5.8–6.2).",
     steps: [{fig: "measure", text: "Measure with a calibrated meter."},
             {fig: "drops", text: "Add a few drops of pH Down (or Up), stir."},
             {fig: "wait", text: "Wait 10–15 minutes, measure again. Repeat in small steps."}],
     watch: ["Low-EC water reacts strongly: a few drops move it a lot.", "pH drifts after mixing; judge it again after an hour.", "Small, slow corrections beat chasing a number."]},
    {id: "burp", title: "Burping jars", match: /burp/i,
     what: "Opening the jars during the cure, so moisture from inside the buds can escape and fresh air gets in.",
     steps: [{fig: "jarOpen", text: "Open the jar for 10–15 minutes (longer if it reads over 63 %)."},
             {fig: "smell", text: "Smell it: fresh is good, hay means too dry, ammonia or sour means too wet (leave it open longer)."}],
     watch: ["Daily on cure days 1–14, then every 7 days.", "Target 58–63 % in the jar.", "Below 55 %: add a humidity pack and keep the jar closed."]},
    {id: "snap", title: "The snap test", match: /snap test|stems snap/i,
     what: "A quick check of whether drying is done and the buds can go into jars.",
     steps: [{fig: "snapYes", text: "Bend a small stem (as thin as a matchstick). A clean snap means it's ready for jars."},
             {fig: "snapNo", text: "If it bends, keep drying and test again tomorrow."}],
     watch: ["Buds should feel crisp outside, slightly spongy inside.", "Weigh the same sample: ready at about 72–75 % lost."]}
  ];
  const byId = id => H.find(x => x.id === id) || null;
  function find(title){ if (!title) return null; for (const x of H) if (x.match.test(title)) return x; return null; }
  function fig(id){ return FIG[id] ? FIG[id]() : ""; }
  window.HowTo = {all: H, byId, find, fig};
})();
