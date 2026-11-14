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

/* Wallich leaflet: long, narrow lanceolate blade, widest near the lower third, a long drawn-out point,
   coarse saw teeth that lean toward the tip. tw (-1..1) turns the blade so one half reads narrower. */
function leaflet(C, base, a, L, o){
  o = o || {}; const r = o.r || (() => 0.5);
  const W = L * (o.wide || 0.066) * (0.94 + r() * 0.12), tw = o.tw || 0, lw = o.lw || 0.42, z = o.z || 0;
  const N = 48, ax = axis(base, a, L, o.bend || 0, N);
  const at = t => { const fi = Math.min(N - 1e-6, t * N), i = Math.floor(fi), u = fi - i, p = ax[i], q = ax[i + 1];
    const nr = normalAt(ax, Math.round(fi)); return {p: [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u], n: nr}; };
  const wid = t => W * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.55))), 0.85);
  const nT = Math.max(4, Math.min(20, Math.round(o.teeth || (4 + L * 0.5)))), t0 = 0.1, t1 = 0.95, dt = (t1 - t0) / nT;
  const side = s => {
    const k = 1 + s * tw * 0.45, pts = [];
    const pt = (t, w) => { const q = at(t); return [q.p[0] + q.n[0] * w * k * s, q.p[1] + q.n[1] * w * k * s]; };
    for (let t = 0; t < t0; t += t0 / 3) pts.push(pt(t, wid(t)));
    for (let j = 0; j < nT; j++){
      const tn = t0 + j * dt, tt = tn + dt * (0.8 + r() * 0.1);
      pts.push(pt(tn, wid(tn) * 0.55));
      pts.push(pt(tt, wid(tt) * (1.08 + (o.serr || 1) * 0.08)));
    }
    pts.push(pt(1, 0));
    return pts;
  };
  const L1 = side(1), R1 = side(-1);
  const outline = L1.concat(R1.reverse()); outline.push(outline[0]);
  C.poly(outline, {w: lw, fill: o.fill == null ? true : o.fill, op: o.op, z});
  const mo = tw * W * 0.25;
  const mid = []; for (let i = 0; i <= N * 0.92; i += 2){ const q = at(i / N); mid.push([q.p[0] + q.n[0] * mo, q.p[1] + q.n[1] * mo]); }
  C.poly(mid, {w: lw * 0.5, op: o.op, z: z + 0.01});
  if (L > 5 && o.veins !== false){                       // faint side veins running forward into every second tooth
    for (const s of [1, -1]) for (let j = 1; j < nT - 2; j += 2){
      const tn = t0 + j * dt, q0 = at(tn - dt * 0.9), q1 = at(tn + dt * 0.6), k = 1 + s * tw * 0.45;
      C.poly([[q0.p[0] + q0.n[0] * mo, q0.p[1] + q0.n[1] * mo], [q1.p[0] + q1.n[0] * wid(tn) * 0.7 * k * s, q1.p[1] + q1.n[1] * wid(tn) * 0.7 * k * s]], {w: lw * 0.4, op: (o.op || 1) * 0.55, z: z + 0.01});
    }
  }
  if (Math.abs(tw) > 0.35){                              // the turned-away half gets a few shading strokes
    const s = tw > 0 ? -1 : 1, k = 1 + s * tw * 0.45;
    for (let t = 0.14; t < 0.8; t += 0.07 + r() * 0.04){
      const q = at(t), q2 = at(t + 0.05), w = wid(t) * k * 0.75;
      C.poly([[q.p[0] + q.n[0] * mo, q.p[1] + q.n[1] * mo], [q2.p[0] + q2.n[0] * w * s, q2.p[1] + q2.n[1] * w * s]], {w: lw * 0.45, op: (o.op || 1) * 0.6, z: z + 0.01});
    }
  }
  return ax[N];
}

/* palmate leaf: long thin petiole, leaflets fanned unevenly, each hanging a little under its own weight */
function fanLeaf(C, node, a, size, n, o){
  o = o || {}; const r = o.r || (() => 0.5);
  const droop = o.droop == null ? 1 : o.droop, side = Math.cos(rad(a)) >= 0 ? 1 : -1;
  const pet = axis(node, a, size * (o.petiole || 0.5), -side * 16 * droop, 10);
  C.poly(pet, {w: (o.lw || 0.42) * 1.15, op: o.op, z: (o.z || 0) - 0.01});
  const tip = pet[pet.length - 1], pa = (o.face == null ? a - side * 10 * droop : o.face);
  const spread = n === 1 ? 0 : n === 3 ? 72 : n === 5 ? 135 : n === 7 ? 190 : 225;
  const rel = [1, .88, .7, .5, .32];
  const order = []; for (let k = 0; k < n; k++) order.push(k);
  order.sort((x, y) => Math.abs(y - (n - 1) / 2) - Math.abs(x - (n - 1) / 2));   // outer leaflets first, centre on top
  for (const k of order){
    const rank = Math.abs(k - (n - 1) / 2);
    const off = n === 1 ? 0 : -spread / 2 + spread * k / (n - 1) + (r() - 0.5) * 12;
    const L = size * rel[Math.min(4, Math.round(rank))] * (0.93 + r() * 0.14);
    const la = pa + off, c = Math.cos(rad(la));
    const bend = -Math.sign(c || side) * (8 + 22 * Math.abs(c)) * droop * (o.curl || 1) + (r() - 0.5) * 16;
    const tw = (r() < 0.45 ? (r() - 0.5) * 1.8 : 0);
    leaflet(C, tip, la, L, {r, bend, tw, lw: o.lw, op: o.op, z: (o.z || 0) + 0.02 - rank * 0.002, wide: o.wide, serr: o.serr, veins: o.veins, fill: o.fill});
  }
  return tip;
}
/* draw into a scratch canvas, then squash it toward the node: a leaf pointing at or away from the viewer */
function foreshort(C, node, k, fn){
  const T = new Canvas(); fn(T);
  for (const it of T.items){ it.pts = it.pts.map(p => [node[0] + (p[0] - node[0]) * (k.x || 1), node[1] + (p[1] - node[1]) * (k.y || 1)]); C.items.push(it); }
}

/* bract/calyx: a small pointed teardrop, two fine stigmas from the tip */
function calyx(C, p, a, s, o){
  o = o || {}; const pts = [];
  for (let i = 0; i <= 14; i++){
    const t = i / 14 * Math.PI * 2;
    const x = Math.sin(t) * 0.4 * s * (1 - 0.4 * Math.cos(t)), y = (1 - Math.cos(t)) * 0.5 * s;
    const ca = Math.cos(rad(a - 90)), sa = Math.sin(rad(a - 90));
    pts.push([p[0] + x * ca - y * sa, p[1] + x * sa + y * ca]);
  }
  C.poly(pts, {w: o.lw || 0.36, fill: o.fill == null ? true : o.fill, z: o.z || 3, op: o.op});
  C.poly([add(p, a, s * 0.12), add(p, a, s * 0.78)], {w: 0.18, z: (o.z || 3) + 0.01, op: (o.op || 1) * 0.6});
  if (o.hatch) for (let k = 0; k < 3; k++){ const q = add(p, a, s * (0.25 + 0.17 * k)); C.poly([q, add(q, a - 70, s * 0.22)], {w: 0.2, z: (o.z || 3) + 0.01, op: 0.7}); }
  if (o.hair){
    const tip = add(p, a, s * 0.98);
    for (const d of [-18, 16]){
      const h = o.ripe ? axis(tip, a + d * 1.4, s * 0.55, d > 0 ? -150 : 150, 6) : axis(tip, a + d, s * 0.95, d > 0 ? -30 : 30, 5);
      C.poly(h, {w: 0.2, z: (o.z || 3) + 0.02, op: o.op});
    }
  }
}

/* a flowering spike: loose clusters at first (as at the plate's nodes), closing into a cola with narrow sugar leaves */
function cola(C, base, a, len, fat, o){
  o = o || {}; const r = o.r || (() => 0.5); const ax = axis(base, a, len, o.bend || 0, 12);
  const n = Math.max(3, Math.round(len * (o.dense ? 1.3 : 0.75)));
  for (let i = 0; i < n; i++){
    const t = i / (n - 1), p = ax[Math.round(t * (ax.length - 1))];
    const w = fat * (0.55 + 0.45 * Math.sin(Math.PI * (0.15 + 0.75 * t))) * (t > 0.85 ? 0.75 : 1);
    const m = 3 + Math.floor(r() * 2);
    for (let j = 0; j < m; j++){
      const ca = a + (j - (m - 1) / 2) * (110 / m) + (r() - 0.5) * 18;
      calyx(C, add(p, ca, w * 0.2), ca, w * (0.55 + r() * 0.3), {hair: o.hair, ripe: o.ripe, hatch: o.ripe && r() < 0.6, z: 3 + t + j * 0.001, op: o.op});
    }
    if (o.sugar && i % 2 === 1){ const sg = i % 4 === 1 ? 1 : -1;
      leaflet(C, add(p, a + sg * 60, w * 0.15), a + sg * (55 + r() * 20), w * (1.7 + r() * 0.8), {r, bend: sg * -14, lw: 0.34, z: 2.5 + t, teeth: 5, veins: false, op: o.op}); }
  }
  calyx(C, ax[ax.length - 1], a, fat * 0.6, {hair: o.hair, ripe: o.ripe, z: 4.2, op: o.op});
}

/* --- the plant --- */
function plant(C, s){
  const r = rng(s.seed || 7);
  const nodes = Math.max(0, Math.round(s.nodes || 0));
  const fw = (s.flowerDays || 0) / 7;           // bloom weeks
  const bloom = fw >= 1.2, pistils = fw >= 0.6;
  const stretchFrom = s.flipNode || nodes + 1;  // nodes grown after the flip stretch
  const altFrom = Math.min(stretchFrom + 1, 10); // upper nodes turn alternate, as on the plate
  const dry = s.phase === "dry";
  const fade = s.ripe || 0;
  const inter = [2.6];
  for (let i = 1; i <= nodes; i++) inter.push((2.2 + 1.05 * Math.min(i, 6)) * (i >= stretchFrom ? 1.4 : 1));
  const top = inter.reduce((a, b) => a + b, 0) + (nodes ? 1.2 : 0);
  const lean = (r() - 0.5) * 0.12, ph = r() * 6;
  const thick = 0.2 + 0.045 * Math.min(nodes, 10) + (bloom ? 0.1 : 0);
  // node heights and a stem that kinks a little at each alternate node
  const H = [0]; { let h = 0; for (let i = 0; i <= nodes; i++){ h += inter[i]; H.push(h); } }
  const xAt = (h, i) => lean * h * h / Math.max(8, top) + Math.sin(h / 9 + ph) * 0.35 + (i != null && i >= altFrom ? (i % 2 ? 1 : -1) * thick * 0.9 : 0);
  const sp = [[xAt(0), 0]];
  for (let i = 0; i <= nodes; i++){ const h0 = H[i], h1 = H[i + 1]; for (let k = 1; k <= 4; k++){ const h = h0 + (h1 - h0) * k / 4; sp.push([xAt(h, k === 4 ? i : null), h]); } }
  sp.push([xAt(top), top]);
  const wAt = j => thick * (1 - 0.65 * j / (sp.length - 1));
  C.poly(sp.map((p, j) => [p[0] - wAt(j), p[1]]), {w: 0.6, z: 1}); C.poly(sp.map((p, j) => [p[0] + wAt(j), p[1]]), {w: 0.6, z: 1});
  C.poly([[sp[0][0] - thick, 0], [sp[0][0] + thick, 0]], {w: 0.5, z: 1});
  if (nodes >= 3) C.poly(sp.slice(0, Math.round(sp.length * 0.6)).map((p, j) => [p[0] + wAt(j) * 0.25, p[1]]), {w: 0.2, z: 1.01, op: 0.6});
  const nodeAt = i => [xAt(H[i + 1], i), H[i + 1]];
  const apex = [xAt(top), top];

  if (nodes <= 5){                                // cotyledons, gone by the fifth node
    const p0 = nodeAt(0), cs = 1.8 + Math.min(nodes, 3) * 0.15;
    for (const side of [-1, 1]){
      const pts = []; const a0 = (side > 0 ? 10 : 170) - (nodes > 3 ? side * 30 : 0);
      for (let i = 0; i <= 16; i++){ const t = i / 16 * Math.PI * 2; const lx = (1 - Math.cos(t)) * 0.5 * cs, ly = Math.sin(t) * cs * 0.32;
        const ca = Math.cos(rad(a0)), sa = Math.sin(rad(a0)); pts.push([p0[0] + lx * ca - ly * sa, p0[1] + lx * sa + ly * ca]); }
      C.poly(pts, {w: 0.45, fill: true, z: 2, op: nodes > 3 ? 0.55 : 1});
      C.poly([p0, add(p0, a0, cs * 0.8)], {w: 0.2, z: 2.01, op: 0.6});
    }
  }
  const colas = [];
  for (let i = 1; i <= nodes; i++){
    const p = nodeAt(i), fromTop = nodes - i;
    const grow = fromTop === 0 ? 0.4 : fromTop === 1 ? 0.72 : 1;
    const bloomLeaf = i >= stretchFrom + 1;
    let n = Math.min(2 * i - 1, s.maxLeaflets || 7);
    if (bloomLeaf) n = Math.max(1, n - 2 * Math.min(2, i - stretchFrom));
    const size = (3.4 + 2.3 * Math.min(i, 6)) * grow * (bloomLeaf ? 0.62 : 1);
    const droop = (dry ? 1.9 : 1 + fade * 0.8) * (1 + Math.min(0.5, fromTop * 0.05));
    const lostToFade = !dry && fade > 0 && i <= Math.round(nodes * 0.35 * fade);
    const opts = z => ({r, z, droop, curl: 1 + fade, lw: dry ? 0.36 : 0.42});
    if (dry && bloomLeaf){
      for (const sd of [-1, 1]) leaflet(C, p, sd > 0 ? 40 : 140, size * 0.75 * (1 - 0.25 * Math.min(1, (s.dryDays || 0) / 10)), {r, bend: sd * -25 * (1 + (s.dryDays || 0) / 6), lw: 0.36, z: 2, teeth: 6});
    } else if (!lostToFade && !dry){
      if (i >= altFrom){                          // alternate: one leaf per node, sides swapping
        const sd = i % 2 ? 1 : -1;
        fanLeaf(C, p, sd > 0 ? 35 + r() * 15 : 145 - r() * 15, size, n, opts(2 + i * 0.01));
      } else if (i % 2 === 1){                    // pair spread left and right
        for (const sd of [-1, 1]) fanLeaf(C, p, sd > 0 ? 28 + r() * 14 : 152 - r() * 14, size, n, opts(2 + i * 0.01));
      } else {                                    // pair facing front and back: front one squashed toward us, back one faint
        const fa = r() < 0.5 ? -55 : -125;
        foreshort(C, p, {y: 0.78}, T => fanLeaf(T, p, fa, size, n, Object.assign(opts(2.2 + i * 0.01), {face: fa, droop: 0.4})));
        if (size > 3) foreshort(C, p, {y: 0.6}, T => fanLeaf(T, p, 90 + (r() - 0.5) * 30, size * 0.8, n, Object.assign(opts(0.5), {op: 0.4, droop: 0.3})));
      }
    }
    // side shoots from the older axils
    const br = nodes - i - 2;
    if (i >= 2 && br >= 2 && i < nodes - 1){
      const sd = i % 2 ? 1 : -1, ba = sd > 0 ? 58 : 122, bl = Math.min(br, 4) * 2.3 * (i >= stretchFrom ? 1.5 : 1);
      const bpts = axis(p, ba, bl, sd * 14, 8);
      C.poly(bpts.map(q => [q[0] - 0.12, q[1]]), {w: 0.4, z: 1.5}); C.poly(bpts.map(q => [q[0] + 0.12, q[1]]), {w: 0.4, z: 1.5});
      const bt = bpts[bpts.length - 1];
      if (!dry) fanLeaf(C, bpts[4], (sd > 0 ? 25 : 155), size * 0.5, Math.max(3, Math.min(5, 2 * br - 3)), {r, z: 1.6, lw: 0.38, droop: 1 + fade});
      if (!dry && !bloom) for (const d of [-25, 25]) leaflet(C, bt, ba - sd * 10 + d, size * 0.22, {r, z: 1.7, lw: 0.34, teeth: 4, veins: false});
      if (pistils && i >= nodes * 0.4) colas.push({p: bt, a: ba - sd * 16, len: bl * 0.6});
    }
    // the plate's small flower clusters in the axils
    if (pistils && i >= stretchFrom - 1 && i < nodes){
      const sd = i % 2 ? -1 : 1, ca = sd > 0 ? 64 : 116;
      if (bloom) cola(C, add(p, ca, 0.3), ca, Math.min(5, 0.8 + fw * 0.6) * (0.5 + 0.5 * i / nodes), Math.min(2.6, 0.9 + fw * 0.25), {r, hair: true, ripe: fade > 0.5, sugar: fw > 3, dense: fw > 4});
      else for (const d of [-14, 14]) calyx(C, add(p, ca + d, 0.3), ca + d, 1.0, {hair: true, z: 3});
    }
  }
  if (bloom){
    const L = Math.min(20, 4 + fw * 2.6), F = Math.min(4.2, 1.3 + fw * 0.5);
    cola(C, [xAt(top - L * 0.55), top - L * 0.55], 90 + lean * 30, L, F, {r, hair: true, ripe: fade > 0.5, sugar: true, dense: fw > 4});
    for (const t of colas) cola(C, t.p, t.a, Math.min(7, t.len + fw), F * 0.6, {r, hair: true, ripe: fade > 0.5, sugar: fw > 3, dense: fw > 4});
  } else if (pistils){
    for (const d of [-22, 0, 22]) calyx(C, apex, 90 + d, 1.0, {hair: true, z: 3});
  } else if (nodes){
    for (const d of [-30, 30]) leaflet(C, apex, 90 + d, 1.8, {r, bend: d > 0 ? 10 : -10, lw: 0.38, z: 3, teeth: 4, veins: false});
    leaflet(C, apex, 90, 1.4, {r, lw: 0.38, z: 3.1, teeth: 3, veins: false});
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

/* a cured nug: lumpy rounded outline, scaled with overlapping calyx tips, a trimmed leaf stub */
function nug(C, p, a, s, r){
  const pts = [], n = 22;
  for (let i = 0; i <= n; i++){ const t = i / n * Math.PI * 2, bump = 1 + (i % 2 ? 0.12 : -0.04) + (r() - 0.5) * 0.12;
    const x = Math.cos(t) * s * 0.42 * bump, y = Math.sin(t) * s * 0.6 * bump * (1 - 0.15 * Math.sin(t));
    const ca = Math.cos(rad(a - 90)), sa = Math.sin(rad(a - 90)); pts.push([p[0] + x * ca - y * sa, p[1] + x * sa + y * ca]); }
  pts[n] = pts[0];
  C.poly(pts, {w: 0.42, fill: true, z: 3});
  for (let k = 0; k < 7; k++){ const u = (r() - 0.5) * 0.6, v = (r() - 0.5) * 0.9;
    const q = [p[0] + (u * Math.cos(rad(a - 90)) - v * Math.sin(rad(a - 90))) * s, p[1] + (u * Math.sin(rad(a - 90)) + v * Math.cos(rad(a - 90))) * s];
    C.poly(axis(q, a + (r() - 0.5) * 50, s * 0.28, (r() - 0.5) * 60, 4), {w: 0.28, z: 3.01, op: 0.8}); }
  C.poly([add(p, a + 180, s * 0.5), add(p, a + 180, s * 0.75)], {w: 0.4, z: 2.9});
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
    const p = [-W/2 + 3.2 + (i % 3) * (W - 6.4) / 2 + (r() - 0.5) * 0.6, 3 + Math.floor(i / 3) * (H * fill - 3) / 3 + r()];
    nug(C, p, 90 + (r() - 0.5) * 140, 3.2 + r() * 1.2, r);
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
    out += '<path d="' + d + '"' + (it.fill ? ' style="fill:' + (typeof it.fill === 'string' ? it.fill : 'var(--paper)') + '"' : '') + ' stroke-width="' + (it.w || 0.6) + '"' + (it.op != null && it.op < 1 ? ' opacity="' + it.op + '"' : '') + '/>';
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
