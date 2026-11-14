/* Flowerphile specimen: an ink drawing of the plant's current state.
   Line style modelled on Wallich's "Cannabis Indica" plate (Roxburgh, c. 1830s, public domain):
   long narrow serrated leaflets with a midrib, thin double-line stem, small bract clusters at the nodes,
   cut stalk. Every other state (seed to jar) is derived from that one plate.

   Specimen.draw(state) returns SVG markup for viewBox "0 0 120 200".
   state = {phase, sproutDays, nodes, flowerDays, ripe, dryDays, cureDays, done, germ:{soaked,tail,planted}, roots, seed} */
(function(){
"use strict";
const VB_W = 120, VB_H = 200, GROUND = 186;

function rng(seed){ let s = (seed * 9301 + 49297) % 233280 || 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const rad = a => a * Math.PI / 180;
const add = (p, a, l) => [p[0] + Math.cos(rad(a)) * l, p[1] + Math.sin(rad(a)) * l]; // world: y up, angle 0 = right, 90 = up

/* --- primitives collected in world space (y up) --- */
function Canvas(){ this.items = []; }
Canvas.prototype.poly = function(pts, o){ this.items.push(Object.assign({pts}, o)); return this; };

// a curved axis from p0 at angle a, length l, bending by "bend" degrees over its length (negative = droops)
function axis(p0, a, l, bend, n){
  n = n || 16; const pts = [p0]; let p = p0;
  for (let i = 1; i <= n; i++){ const t = i / n; p = add(p, a + bend * t, l / n); pts.push(p); }
  return pts;
}
function normalAt(pts, i){
  const a = pts[Math.max(0, i-1)], b = pts[Math.min(pts.length-1, i+1)];
  const dx = b[0]-a[0], dy = b[1]-a[1], d = Math.hypot(dx,dy) || 1; return [-dy/d, dx/d];
}

/* Wallich leaflet: long, narrow, widest at ~1/3, long tapering point, forward-pointing teeth */
function leaflet(C, base, a, L, o){
  o = o || {}; const r = o.r;
  const W = L * (o.wide || 0.085), bend = o.bend || 0, teeth = Math.max(5, Math.round(Math.sqrt(L) * (o.toothDensity || 4.2)));
  const ax = axis(base, a, L, bend, teeth * 2);
  const N = ax.length - 1;
  const left = [], right = [];
  for (let i = 0; i <= N; i++){
    const t = i / N;
    let w = W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.9) * (t < 0.06 ? t / 0.06 : 1);
    const tooth = (i % 2 === 1 && t > 0.08 && t < 0.94) ? 1 + 0.5 * (o.serr == null ? 1 : o.serr) : 1;
    const nrm = normalAt(ax, i), j = r ? (r() - 0.5) * 0.06 * W : 0;
    // teeth lean forward: shift the tooth tip slightly toward the tip
    const fwd = tooth > 1 ? 0.35 * (L / N) : 0;
    const dir = ax[Math.min(N, i+1)], prev = ax[Math.max(0, i-1)];
    const dx = (dir[0]-prev[0]) / 2, dy = (dir[1]-prev[1]) / 2, dl = Math.hypot(dx,dy) || 1;
    const fx = dx / dl * fwd, fy = dy / dl * fwd;
    left.push([ax[i][0] + nrm[0] * (w * tooth + j) + fx, ax[i][1] + nrm[1] * (w * tooth + j) + fy]);
    right.push([ax[i][0] - nrm[0] * (w * tooth - j) + fx, ax[i][1] - nrm[1] * (w * tooth - j) + fy]);
  }
  const outline = left.concat(right.reverse());
  outline.push(outline[0]);
  C.poly(outline, {w: o.lw || 0.62, fill: true, op: o.op, z: o.z || 0});
  C.poly(ax.slice(0, Math.round(N * 0.92)), {w: (o.lw || 0.62) * 0.55, op: o.op, z: (o.z || 0) + 0.01});
  return ax[N];
}

/* palmate leaf: petiole + n leaflets fanned around the petiole tip */
function fanLeaf(C, node, a, size, n, o){
  o = o || {}; const r = o.r;
  const pl = size * (o.petiole || 0.55), droop = o.droop == null ? 1 : o.droop;
  const side = Math.cos(rad(a)) >= 0 ? 1 : -1;
  const pet = axis(node, a, pl, -side * 18 * droop, 8);
  C.poly(pet, {w: o.lw ? o.lw * 1.15 : 0.75, op: o.op, z: o.z || 0});
  const tip = pet[pet.length - 1];
  const pa = a - side * 14 * droop; // direction the leaf faces
  const spread = n === 1 ? 0 : n === 3 ? 62 : n === 5 ? 120 : n === 7 ? 172 : 205;
  const rel = [1, .86, .66, .46, .3];
  for (let k = 0; k < n; k++){
    const off = n === 1 ? 0 : -spread / 2 + spread * k / (n - 1);
    const rank = Math.abs(k - (n - 1) / 2);
    const L = size * rel[Math.min(4, Math.round(rank))] * (1 + (r ? (r()-0.5) * 0.08 : 0));
    const la = pa + off;
    // gravity: leaflets pointing sideways droop more
    const bend = -side * (8 + 22 * Math.abs(Math.cos(rad(la)))) * droop * (Math.cos(rad(la)) * side > 0 ? 1 : -0.5) * (o.curl || 1);
    leaflet(C, tip, la, L, {r, bend, lw: o.lw, op: o.op, z: (o.z || 0) + 0.02 + rank * -0.001, wide: o.wide, serr: o.serr});
  }
  return tip;
}

/* teardrop bract/calyx as in the plate's node clusters, pistil hairs from the tip */
function calyx(C, p, a, s, o){
  o = o || {}; const pts = [];
  for (let i = 0; i <= 14; i++){
    const t = i / 14 * Math.PI * 2;
    const x = Math.sin(t) * 0.42 * s * (1 - 0.35 * Math.cos(t)), y = (1 - Math.cos(t)) * 0.5 * s;
    const ca = Math.cos(rad(a - 90)), sa = Math.sin(rad(a - 90));
    pts.push([p[0] + x * ca - y * sa, p[1] + x * sa + y * ca]);
  }
  C.poly(pts, {w: o.lw || 0.5, fill: true, z: o.z || 3, op: o.op});
  if (o.hatch) for (let k = 0; k < 2; k++){ const q = add(p, a, s * (0.3 + 0.2 * k)); C.poly([add(q, a + 120, s * 0.18), add(q, a - 60, s * 0.18)], {w: 0.3, z: (o.z || 3) + 0.01}); }
  if (o.hair){
    const tip = add(p, a, s);
    for (const d of [-22, 18]){
      const h = o.ripe ? axis(tip, a + d, s * 0.7, d > 0 ? -160 : 160, 6) : axis(tip, a + d, s * 0.9, d > 0 ? -25 : 25, 4);
      C.poly(h, {w: 0.32, z: (o.z || 3) + 0.02, op: o.op});
    }
  }
}

/* modern cola: stacked calyx clusters with sugar leaflets, along an axis */
function cola(C, base, a, len, fat, o){
  o = o || {}; const r = o.r; const ax = axis(base, a, len, o.bend || 0, 10);
  const n = Math.max(3, Math.round(len * 1.4));
  for (let i = 0; i < n; i++){
    const t = i / (n - 1), p = ax[Math.round(t * (ax.length - 1))];
    const w = fat * (0.55 + 0.45 * Math.sin(Math.PI * (0.15 + 0.75 * t))) * (t > 0.85 ? 0.7 : 1);
    for (const sgn of [-1, 1]){
      const ca = a + sgn * (38 + r() * 20);
      calyx(C, add(p, ca, w * 0.25), ca - sgn * 18, w * (0.55 + r() * 0.25), {hair: o.hair, ripe: o.ripe, hatch: o.ripe, z: 3 + t, op: o.op});
    }
    if (i % 3 === 1 && o.sugar) leaflet(C, add(p, a + (i % 2 ? 50 : -50), w * 0.2), a + (i % 2 ? 62 : -62), w * 1.6, {r, bend: i % 2 ? -12 : 12, lw: 0.45, z: 2.5 + t, serr: 0.8, toothDensity: 1.6});
  }
  calyx(C, ax[ax.length - 1], a, fat * 0.6, {hair: o.hair, ripe: o.ripe, z: 4.2, op: o.op});
}

/* --- the plant --- */
function plant(C, s){
  const r = rng(s.seed || 7);
  const nodes = Math.max(0, Math.round(s.nodes || 0));
  const fw = (s.flowerDays || 0) / 7;           // bloom weeks
  const bloom = fw >= 1.2, pistils = fw >= 0.6;
  const stretchFrom = s.flipNode || nodes + 1; // nodes grown after the flip stretch
  const dry = s.phase === "dry";
  const fade = s.ripe || 0;                     // 0..1 late-bloom fading of fan leaves
  // internodes
  const inter = [2.4];                           // hypocotyl to cotyledons
  for (let i = 1; i <= nodes; i++) inter.push((2.0 + 1.0 * Math.min(i, 6)) * (i >= stretchFrom ? 1.4 : 1));
  const top = inter.reduce((a, b) => a + b, 0) + (nodes ? 1.2 : 0);
  const sway = r() * 6 - 3, ph = r() * 6;
  // stem: double line, slight wander
  const stemPts = []; let y = 0, k = 0;
  for (let i = 0; i <= 30; i++){ const t = i / 30; stemPts.push([Math.sin(t * 3 + ph) * 0.3 + sway * t * t * 0.15, t * top]); }
  const thick = 0.22 + 0.05 * Math.min(nodes, 10) + (bloom ? 0.12 : 0);
  const at = h => { const t = Math.min(1, h / top); const i = Math.round(t * 30); return stemPts[i]; };
  const edgeL = stemPts.map((p, i) => [p[0] - thick * (1 - 0.6 * i / 30), p[1]]);
  const edgeR = stemPts.map((p, i) => [p[0] + thick * (1 - 0.6 * i / 30), p[1]]);
  C.poly(edgeL, {w: 0.8, z: 1}); C.poly(edgeR, {w: 0.8, z: 1});
  // a few ridge lines like the plate's stalk
  if (nodes >= 3) C.poly(stemPts.slice(0, 18).map(p => [p[0] + thick * 0.2, p[1]]), {w: 0.25, z: 1, op: 0.7});

  // cotyledons (until ~5 nodes, then gone)
  if (nodes <= 5){
    const h0 = inter[0], p0 = at(h0), cs = 1.7 + Math.min(nodes, 3) * 0.15;
    for (const side of [-1, 1]){
      const pts = []; const a0 = side > 0 ? 8 : 172;
      for (let i = 0; i <= 16; i++){ const t = i / 16 * Math.PI * 2; const lx = (1 - Math.cos(t)) * 0.5 * cs, ly = Math.sin(t) * cs * 0.3;
        const ca = Math.cos(rad(a0 - (nodes > 3 ? side * 25 : 0))), sa = Math.sin(rad(a0 - (nodes > 3 ? side * 25 : 0)));
        pts.push([p0[0] + lx * ca - ly * sa, p0[1] + lx * sa + ly * ca]); }
      C.poly(pts, {w: 0.6, fill: true, z: 2, op: nodes > 3 ? 0.6 : 1});
    }
  }
  // nodes with leaf pairs
  let h = inter[0];
  const tipsForCola = [];
  for (let i = 1; i <= nodes; i++){
    h += inter[i];
    const p = at(h), fromTop = nodes - i;           // 0 = newest
    const grow = fromTop === 0 ? 0.42 : fromTop === 1 ? 0.75 : 1;
    let n = Math.min(2 * i - 1, (s.maxLeaflets || 7));
    const bloomLeaf = i >= stretchFrom + 1;
    if (bloomLeaf) n = Math.max(1, n - 2 * Math.min(2, i - stretchFrom));   // flowering nodes: fewer leaflets
    const size = (2.4 + 1.25 * Math.min(i, 6)) * grow * (bloomLeaf ? 0.7 : 1);
    const facing = i % 2 === 1;                       // alternate the pair's orientation like a real phyllotaxis
    const upper = i > nodes * 0.6;
    const lostToFade = !dry && fade > 0 && i <= Math.round(nodes * 0.35 * fade);
    const dryLeaf = dry && !bloomLeaf;                 // fan leaves are stripped for hanging
    if (!lostToFade && !dryLeaf){
      for (const side of [-1, 1]){
        const behind = !facing && side < 0;
        const base = facing ? 30 + (upper ? 18 : 0) : 52;
        const a = side > 0 ? base + r() * 8 : 180 - base - r() * 8;
        fanLeaf(C, p, a, size * (behind ? 0.8 : 1), n, {r, z: behind ? 0.5 : 2 + i * 0.01, op: behind ? 0.55 : 1,
          droop: dry ? 1.8 : 1 + fade * 0.8, curl: 1 + fade, lw: dry ? 0.5 : 0.62});
      }
    } else if (dry && bloomLeaf){
      for (const side of [-1, 1]) leaflet(C, p, side > 0 ? 40 : 140, size * 0.7 * (1 - 0.25 * Math.min(1, (s.dryDays || 0) / 10)), {r, bend: side * -25 * (1 + (s.dryDays || 0) / 6), lw: 0.45, z: 2});
    }
    // side branches from older nodes
    const br = nodes - i - 2;
    if (i >= 2 && br >= 2 && i < nodes - 1){
      for (const side of (i % 2 ? [1] : [-1])){
        const ba = side > 0 ? 58 : 122, bl = Math.min(br, 4) * 2.2 * (i >= stretchFrom ? 1.6 : 1);
        const bpts = axis(p, ba, bl, side * 12, 8);
        C.poly(bpts, {w: 0.55, z: 1.5});
        const bt = bpts[bpts.length - 1];
        if (!dry && br >= 2) for (const sd of [-1, 1]) fanLeaf(C, bt, (side > 0 ? 50 : 130) + sd * 40, size * 0.45, Math.max(1, Math.min(5, 2 * br - 3)), {r, z: 1.6, lw: 0.5, droop: 1 + fade});
        if (pistils && i >= nodes * 0.45) tipsForCola.push({p: bt, a: ba - side * 12, len: bl * 0.55});
      }
    }
    // the plate's small axillary bract clusters
    if (pistils && i >= stretchFrom - 1 && i < nodes){
      for (const side of [-1, 1]){
        const ca = side > 0 ? 62 : 118;
        if (bloom) cola(C, add(p, ca, 0.4), ca, Math.min(6, 0.8 + fw * 0.7) * (0.5 + 0.5 * i / nodes), Math.min(3, 0.9 + fw * 0.3), {r, hair: true, ripe: fade > 0.5, sugar: fw > 3, op: 1});
        else calyx(C, add(p, ca, 0.3), ca, 1.0, {hair: true, z: 3});
      }
    }
  }
  // apex: unfolding tip or the main cola
  const apex = at(top);
  if (bloom){
    const L = Math.min(20, 4 + fw * 2.6), F = Math.min(4.6, 1.4 + fw * 0.55);
    cola(C, at(top - L * 0.55), 90 + sway * 0.3, L, F, {r, hair: true, ripe: fade > 0.5, sugar: true});
    for (const t of tipsForCola) cola(C, t.p, t.a, Math.min(7, t.len + fw), F * 0.65, {r, hair: true, ripe: fade > 0.5, sugar: fw > 3});
  } else if (pistils){
    for (const d of [-20, 0, 20]) calyx(C, apex, 90 + d, 1.0, {hair: true, z: 3});
  } else if (nodes){
    for (const d of [-28, 28]) leaflet(C, apex, 90 + d, 1.6, {r, bend: d > 0 ? 10 : -10, lw: 0.5, z: 3});
  }
  return {top, thick};
}

function seedShape(C, p, s, o){
  o = o || {}; const pts = [];
  for (let i = 0; i <= 24; i++){ const t = i / 24 * Math.PI * 2; pts.push([p[0] + Math.sin(t) * s * 0.42 * (1 - 0.12 * Math.cos(t)), p[1] + Math.cos(t) * s * 0.55]); }
  C.poly(pts, {w: 0.7, fill: true, z: 2});
  C.poly([[p[0] - s * 0.02, p[1] - s * 0.52], [p[0] + s * 0.05, p[1]], [p[0] - s * 0.02, p[1] + s * 0.53]], {w: 0.4, z: 2.1});
  const r = rng(11);
  for (let i = 0; i < 26; i++){ const a = r() * 6.28, d = Math.sqrt(r()) * 0.85; const q = [p[0] + Math.sin(a) * s * 0.36 * d, p[1] + Math.cos(a) * s * 0.48 * d];
    C.poly([q, [q[0] + 0.12, q[1] + 0.05]], {w: 0.55, z: 2.2, op: 0.8}); }
}

function ground(C, w, o){
  o = o || {}; const r = rng(3);
  C.poly([[-w, 0], [w, 0]], {w: 0.7, z: 0});
  for (let i = 0; i < 9; i++){ const x = -w + (2 * w) * (i + 0.5) / 9 + (r() - 0.5); C.poly([[x, -0.2], [x - 0.9, -1.2]], {w: 0.35, z: 0, op: 0.7}); }
  if (o.roots){ // DWC: roots hanging into the water
    const L = o.roots;
    for (let i = 0; i < 5; i++){ const a = -90 + (i - 2) * 14 + (r() - 0.5) * 8; C.poly(axis([(i - 2) * 0.25, 0], a, L * (0.6 + r() * 0.5), (r() - 0.5) * 40, 10), {w: 0.4, z: 0, op: 0.75, nofit: true}); }
  }
}

function jar(C, s){
  const r = rng(s.seed || 5), W = 13, H = 20;
  // glass
  C.poly([[-W/2, 0.8], [-W/2, H - 3], [-W/2 + 1.2, H - 1.6], [W/2 - 1.2, H - 1.6], [W/2, H - 3], [W/2, 0.8], [W/2 - 0.8, 0], [-W/2 + 0.8, 0], [-W/2, 0.8]], {w: 0.8, z: 1});
  C.poly([[-W/2 + 1.1, 2], [-W/2 + 1.1, H - 4]], {w: 0.3, z: 1.1, op: 0.6}); // glint
  // lid with hatching
  C.poly([[-W/2 + 0.6, H - 1.6], [-W/2 + 0.6, H + 1], [W/2 - 0.6, H + 1], [W/2 - 0.6, H - 1.6]], {w: 0.8, z: 4, fill: true});
  for (let x = -W/2 + 1.4; x < W/2 - 0.8; x += 0.9) C.poly([[x, H - 1.4], [x + 0.6, H + 0.8]], {w: 0.3, z: 4.1});
  // buds inside
  const fill = s.done ? 0.62 : 0.72;
  for (let i = 0; i < 9; i++){
    const p = [-W/2 + 3 + (i % 3) * (W - 6) / 2 + (r() - 0.5), 1.6 + Math.floor(i / 3) * (H * fill - 3) / 3 + r()];
    cola(C, p, 90 + (r() - 0.5) * 120, 2.2 + r() * 1.2, 1.7 + r() * 0.4, {r, hair: false, ripe: true, sugar: false, op: 0.95});
  }
  // tag on a string
  C.poly([[W/2 - 1, H - 0.4], [W/2 + 2.2, H - 3.5]], {w: 0.35, z: 5});
  C.poly([[W/2 + 1.6, H - 3.6], [W/2 + 5.2, H - 4.8], [W/2 + 5.8, H - 8.2], [W/2 + 2.2, H - 7], [W/2 + 1.6, H - 3.6]], {w: 0.5, z: 5, fill: true});
  if (s.done) for (let k = 0; k < 3; k++) C.poly([[W/2 + 2.4, H - 5.2 - k * 0.7], [W/2 + 4.8, H - 6 - k * 0.7]], {w: 0.3, z: 5.1});
}

/* --- render --- */
function render(C, o){
  o = o || {};
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of C.items) if (!it.nofit) for (const p of it.pts){ if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const m = 5, bw = Math.max(1, x1 - x0), cx = (x0 + x1) / 2;
  let k, Y;
  if (o.anchorTop){ k = Math.min((VB_W - 2 * m) / bw, (VB_H - 16) / Math.max(1, y1 - y0), o.maxScale || 9); Y = p => 8 + (y1 - p[1]) * k; }
  else {
    k = Math.min((VB_W - 2 * m) / bw, (GROUND - 8) / Math.max(1, y1), o.maxScale || 9);
    Y = p => GROUND - p[1] * k;
  }
  const items = C.items.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  let out = '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">';
  for (const it of items){
    const d = "M" + it.pts.map(p => (VB_W / 2 + (p[0] - cx) * k).toFixed(1) + " " + Y(p).toFixed(1)).join("L");
    out += '<path d="' + d + '"' + (it.fill ? ' style="fill:var(--paper)"' : '') + ' stroke-width="' + (it.w || 0.6) + '"' + (it.op != null && it.op < 1 ? ' opacity="' + it.op + '"' : '') + '/>';
  }
  return out + '</g>';
}

function draw(s){
  s = Object.assign({phase: "grow", nodes: 0, seed: 7}, s || {});
  const C = new Canvas();
  if (s.phase === "germ"){
    const g = s.germ || {};
    if (g.planted || g.tail){
      if (g.planted) ground(C, 5);
      const p = [0, g.planted ? -2.2 : 2.5];
      seedShape(C, p, 2.2);
      if (g.tail) C.poly(axis([p[0], p[1] - 1.2], -100, 2.6, -30, 8), {w: 0.6, z: 3});
      return render(C, {maxScale: 14});
    }
    seedShape(C, [0, 2], 2.4);
    if (g.soaked) for (let i = 0; i < 3; i++) C.poly(axis([-3 + i * 3, -0.6], 0, 2, 0, 6).map((q, j) => [q[0], q[1] + Math.sin(j) * 0.25]), {w: 0.4, op: 0.6});
    return render(C, {maxScale: 14});
  }
  if (s.phase === "cure" || s.phase === "done"){ jar(C, Object.assign({}, s, {done: s.phase === "done"})); return render(C, {maxScale: 6}); }
  if (s.phase === "grow" && (s.sproutDays || 0) < 2 && !s.nodes){
    // hooked sprout still wearing its seed coat
    ground(C, 4);
    const st = axis([0, 0], 90, 3.2, -150, 14);
    C.poly(st.map(p => [p[0] - 0.18, p[1]]), {w: 0.7, z: 1}); C.poly(st.map(p => [p[0] + 0.18, p[1]]), {w: 0.7, z: 1});
    seedShape(C, add(st[st.length - 1], -70, 0.6), 1.4);
    return render(C, {maxScale: 8});
  }
  if (s.phase === "dry"){
    // the whole plant cut and hung upside down; the cut stalk at the top like the plate's
    const D = new Canvas();
    const info = plant(D, Object.assign({}, s, {phase: "dry"}));
    // flip: y -> -y so the base is at the top
    for (const it of D.items) it.pts = it.pts.map(p => [p[0], -p[1]]);
    const t = info.thick;
    // cut face (oblique ellipse) and hanging string
    const ell = []; for (let i = 0; i <= 14; i++){ const a = i / 14 * Math.PI * 2; ell.push([Math.cos(a) * t * 1.2, 1.2 + Math.sin(a) * t * 0.6 + Math.cos(a) * 0.5]); }
    D.poly([[-t, 0], [-t, 1.0]], {w: 0.8, z: 1}); D.poly([[t, 0], [t, 1.6]], {w: 0.8, z: 1});
    D.poly(ell, {w: 0.6, z: 1.2});
    D.poly([[-t * 1.2, 0.6], [-3, 3.2]], {w: 0.4, z: 0.9}); D.poly([[t * 1.2, 0.8], [3, 3.2]], {w: 0.4, z: 0.9});
    D.poly([[-6, 3.2], [6, 3.2]], {w: 0.7, z: 0.9});
    return render(D, {maxScale: 4.5, anchorTop: true});
  }
  // grow
  const info = plant(C, s);
  ground(C, Math.max(4, Math.min(12, 3 + (s.nodes || 0) * 1.1)), {roots: s.roots ? Math.min(14, 1.5 + (s.nodes || 0) * 1.6) : 0});
  return render(C, {maxScale: 9});
}

window.Specimen = {draw, VB: "0 0 " + VB_W + " " + VB_H};
})();
