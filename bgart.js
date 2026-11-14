/* Flowerphile background plates: hand-drawn pen work.
   A naturalist's afternoon sketch: lines overshoot, wobble and double up, hatching is uneven.
   BgArt.draw({W, H, scene, medium, phase, warm, weather, seed}) returns SVG markup (no <svg> wrapper). */
(function(){
"use strict";
function rng(seed){ let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

function Pen(seed){
  const r = rng(seed); this.r = r; this.out = []; this.clipN = 0; this.defs = [];
}
const f = n => (Math.round(n * 10) / 10).toString();
Pen.prototype.j = function(a){ return (this.r() - 0.5) * 2 * a; };
// a single hand-drawn stroke through points: jittered, overshooting, slightly varying weight
Pen.prototype.stroke = function(pts, o){
  o = o || {}; const r = this.r, w = (o.w || 0.6) * (0.8 + 0.4 * r()), jit = o.jit == null ? 0.6 : o.jit;
  const P = pts.map(p => [p[0] + this.j(jit), p[1] + this.j(jit)]);
  if (o.over !== false && P.length > 1){ // overshoot / undershoot ends like a quick pen
    const a = P[0], b = P[1], n = P.length, c = P[n - 2], d = P[n - 1];
    const os = (o.over || 3) * (r() * 1.4 - 0.3), oe = (o.over || 3) * (r() * 1.4 - 0.3);
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ld = Math.hypot(d[0] - c[0], d[1] - c[1]) || 1;
    P[0] = [a[0] - (b[0] - a[0]) / la * os, a[1] - (b[1] - a[1]) / la * os];
    P[n - 1] = [d[0] + (d[0] - c[0]) / ld * oe, d[1] + (d[1] - c[1]) / ld * oe];
  }
  let d = "M" + f(P[0][0]) + " " + f(P[0][1]);
  if (P.length === 2) d += "L" + f(P[1][0]) + " " + f(P[1][1]);
  else for (let i = 1; i < P.length - 1; i++){ const m = [(P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2]; d += "Q" + f(P[i][0]) + " " + f(P[i][1]) + " " + f(m[0]) + " " + f(m[1]); }
  if (P.length > 2) d += "L" + f(P[P.length - 1][0]) + " " + f(P[P.length - 1][1]);
  this.out.push(`<path d="${d}" stroke-width="${w.toFixed(2)}"${o.op != null ? ` opacity="${o.op.toFixed(2)}"` : ""}${o.clip ? ` clip-path="url(#${o.clip})"` : ""}${o.fill || o.color ? ` style="${o.fill ? "fill:" + o.fill + ";" : ""}${o.color ? "stroke:" + o.color : ""}"` : ""}${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`);
  if (o.twice && r() < o.twice) this.stroke(pts, Object.assign({}, o, {twice: 0, w: (o.w || 0.6) * 0.6, op: (o.op || 1) * 0.55, jit: jit * 1.8}));
};
// straight line drawn as a slightly bowed stroke
Pen.prototype.line = function(x0, y0, x1, y1, o){
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 40)), pts = [];
  const bow = this.j(Math.hypot(x1 - x0, y1 - y0) * 0.008), nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
  for (let i = 0; i <= n; i++){ const t = i / n, b = Math.sin(Math.PI * t) * bow; pts.push([x0 + (x1 - x0) * t + nx / nl * b, y0 + (y1 - y0) * t + ny / nl * b]); }
  this.stroke(pts, o);
};
Pen.prototype.ellipse = function(cx, cy, rx, ry, o){
  o = o || {}; const a0 = o.from == null ? this.r() * 6.28 : o.from, span = o.span || (Math.PI * 2 + 0.25 + this.r() * 0.3), n = Math.max(10, Math.round((rx + ry) / 3));
  const pts = []; for (let i = 0; i <= n; i++){ const a = a0 + span * i / n; pts.push([cx + Math.cos(a) * rx * (1 + this.j(0.03)), cy + Math.sin(a) * ry * (1 + this.j(0.03))]); }
  this.stroke(pts, Object.assign({over: false}, o));
};
Pen.prototype.clip = function(svgShape){ const id = "pc" + (this.clipN++) + "_" + Math.floor(this.r() * 1e5); this.defs.push(`<clipPath id="${id}">${svgShape}</clipPath>`); return id; };
// uneven parallel hatching inside a clip shape, optionally cross-hatched
Pen.prototype.hatch = function(box, clipId, o){
  o = o || {}; const ang = o.ang == null ? -0.8 : o.ang, gap = o.gap || 4, dx = Math.cos(ang), dy = Math.sin(ang);
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, L = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + 6;
  for (let t = -L; t < L; t += gap * (0.7 + this.r() * 0.6)){
    if (o.fade && this.r() > o.fade(t / L)) continue;
    const ox = cx - dy * t, oy = cy + dx * t, s = L * (0.75 + this.r() * 0.3), e = L * (0.75 + this.r() * 0.3);
    this.line(ox - dx * s, oy - dy * s, ox + dx * e, oy + dy * e, {w: o.w || 0.35, op: o.op, clip: clipId, over: 2, jit: 0.4});
  }
  if (o.cross) this.hatch(box, clipId, Object.assign({}, o, {cross: false, ang: ang + 1.2, gap: gap * 1.4, op: (o.op || 1) * 0.7}));
};
Pen.prototype.dots = function(n, fx, o){ o = o || {}; for (let i = 0; i < n; i++){ const p = fx(this.r); if (!p) continue; this.out.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${(o.r || 0.5) * (0.6 + this.r() * 0.8)}" style="fill:var(--ink);stroke:none" opacity="${(o.op || 0.8) * (0.5 + 0.5 * this.r())}"/>`); } };
Pen.prototype.svg = function(){ return { defs: this.defs.join(""), body: this.out.join("") }; };

/* ---------- pieces ---------- */
// watercolour wash: a ragged-edged tinted shape under the ink, mixed into the paper colour so it also works at night
const tint = (hex, k) => `color-mix(in srgb, var(--paper) ${100 - k}%, ${hex})`;
Pen.prototype.wash = function(d, hex, k, o){ o = o || {};
  this.out.push(`<path d="${d}" style="fill:${tint(hex, k)};stroke:none" filter="url(#wc)"${o.op != null ? ` opacity="${o.op}"` : ""}/>`); };
// a ragged blob path around a polygon, for washes
function blobPath(P, pts, j){ return "M" + pts.map(p => f(p[0] + P.j(j)) + " " + f(p[1] + P.j(j))).join("L") + "Z"; }
// root path: wanders downward, returns its points and spawns side roots that angle down and out
function rootTree(P, x, y, len, ang, depth, w, out){
  const pts = [[x, y]]; let cx = x, cy = y, a = ang;
  const n = Math.max(4, Math.round(len / 7));
  for (let i = 0; i < n; i++){
    a += P.j(0.22) + (Math.PI / 2 - a) * 0.08;             // gravity pulls the tip down
    cx += Math.cos(a) * len / n; cy += Math.sin(a) * len / n; pts.push([cx, cy]);
    if (depth > 0 && i > 0 && P.r() < (depth > 1 ? 0.5 : 0.32)){
      const sd = P.r() < 0.5 ? -1 : 1;
      rootTree(P, cx, cy, len * (0.22 + P.r() * 0.3) * (1 - i / n * 0.5), a + sd * (0.6 + P.r() * 0.5), depth - 1, w * 0.6, out);
    }
  }
  out.push({pts, w, depth});
}
function drawRoots(P, list, o){
  o = o || {};
  for (const rt of list){
    if (o.light){                                           // pale roots against dark soil: a paper core with ink edges on the thick ones
      P.stroke(rt.pts, {w: rt.w * 2.4 + 0.5, jit: 0.25, over: 0.5, color: "var(--paper)"});
      if (rt.w > 0.5) P.stroke(rt.pts.map((p, i, a) => { const q = a[Math.min(a.length - 1, i + 1)], r = a[Math.max(0, i - 1)], dx = q[0] - r[0], dy = q[1] - r[1], d = Math.hypot(dx, dy) || 1; return [p[0] - dy / d * rt.w * 1.3, p[1] + dx / d * rt.w * 1.3]; }), {w: 0.35, jit: 0.2, over: 0.5, op: 0.8});
    } else P.stroke(rt.pts, {w: 0.25 + rt.w * 0.7, jit: 0.25, over: 1, twice: rt.w > 0.5 ? 0.4 : 0});
    if (rt.depth === 0) for (let i = 1; i < rt.pts.length; i += 2) if (P.r() < 0.6){   // root hairs on the finest roots
      const p = rt.pts[i], ha = P.r() * 6.28, hl = 1.5 + P.r() * 2.5;
      P.line(p[0], p[1], p[0] + Math.cos(ha) * hl, p[1] + Math.abs(Math.sin(ha)) * hl, {w: 0.2, op: 0.55, over: 0, jit: 0.1, color: o.light ? "var(--paper)" : null});
    }
  }
}
function roots(P, x, y, len, ang, depth, w){ const L = []; rootTree(P, x, y, len, ang, depth, w, L); drawRoots(P, L); }
function bubble(P, x, y, rr){ P.ellipse(x, y, rr, rr * (0.9 + P.r() * 0.2), {w: 0.45, jit: 0.15, fill: "var(--paper)"}); if (rr > 2) P.ellipse(x - rr * 0.35, y - rr * 0.35, rr * 0.25, rr * 0.2, {w: 0.35, jit: 0.05, span: 2.4}); }
function cloud(P, cx, cy, cw, sun){
  // contour of overlapping lobes, drawn as several arcs, shaded underneath with hatching
  const lobes = 4 + Math.floor(P.r() * 3), hgt = cw * (0.22 + P.r() * 0.08);
  const parts = []; let x = cx - cw / 2;
  for (let i = 0; i < lobes; i++){ const rw = cw / lobes * (0.9 + P.r() * 0.5), rh = hgt * (0.35 + 0.55 * Math.sin(Math.PI * (i + 0.5) / lobes)) * (0.8 + P.r() * 0.35);
    const ex = x + rw / 2, ey = cy - rh * 0.55;
    parts.push(`<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(rw * 0.7)}" ry="${f(rh)}"/>`);
    P.ellipse(ex, ey, rw * 0.7, rh, {w: 0.65, from: Math.PI * (1.02 + P.r() * 0.1), span: Math.PI * (0.92 + P.r() * 0.1), twice: 0.5});
    if (P.r() < 0.6) P.ellipse(ex + rw * 0.1, ey + rh * 0.25, rw * 0.45, rh * 0.55, {w: 0.3, op: 0.6, from: Math.PI * 1.1, span: Math.PI * 0.6});  // inner billow
    x += rw * 0.72; }
  P.line(cx - cw / 2 - 4, cy + 2, x + 4, cy + 2 + P.j(2), {w: 0.6, twice: 0.6});
  const id = P.clip(parts.join("") + `<rect x="${f(cx - cw)}" y="${f(cy - hgt * 0.1)}" width="${f(cw * 2)}" height="${f(hgt)}"/>`);
  P.hatch([cx - cw / 2, cy - hgt * 0.5, x, cy + 4], id, {ang: 0.08, gap: 2.6, w: 0.3, op: 0.75, fade: t => t > -0.1 ? 1 : 0.15});
}
function treeline(P, y, W){
  // distant scribbled canopies, a few conifers
  let x = -10;
  while (x < W + 10){
    const w = 18 + P.r() * 30, h = 12 + P.r() * 22;
    if (P.r() < 0.25){ // conifer
      const pts = [[x, y]]; for (let k = 0; k < 6; k++){ pts.push([x + w * 0.5 * (k / 6), y - h * 1.4 * (k / 6) - P.r() * 2]); pts.push([x + w * 0.25 + w * 0.3 * (k / 6), y - h * 1.4 * (k / 6) + 2]); }
      pts.push([x + w / 2, y - h * 1.5]); for (let k = 6; k > 0; k--) pts.push([x + w - w * 0.5 * (k / 6), y - h * 1.4 * (k / 6) - P.r() * 2]); pts.push([x + w, y]);
      P.stroke(pts, {w: 0.5, jit: 0.6, over: 1});
    } else { // round crowns as loose scribble
      const pts = []; const n = 14; for (let k = 0; k <= n; k++){ const a = Math.PI + Math.PI * k / n; pts.push([x + w / 2 + Math.cos(a) * w / 2 * (0.85 + P.r() * 0.3), y - h / 2 + Math.sin(a) * h * (0.85 + P.r() * 0.3)]); }
      P.stroke(pts, {w: 0.5, jit: 1.1, over: 2});
      for (let k = 0; k < 4; k++) P.line(x + w * 0.2 + P.r() * w * 0.5, y - h * 0.3 - P.r() * h * 0.4, x + w * 0.35 + P.r() * w * 0.5, y - h * 0.1, {w: 0.3, op: 0.6, over: 1});
    }
    x += w * (0.75 + P.r() * 0.3);
  }
  P.line(-6, y + 1, W + 6, y + 1 + P.j(2), {w: 0.6, twice: 0.5});
}
function sun(P, x, y, R){
  P.ellipse(x, y, R, R, {w: 0.8, twice: 0.8});
  for (let i = 0; i < 30; i++){ const a = i / 30 * Math.PI * 2 + P.j(0.04), L = (i % 2 ? 6 : 13) * (0.8 + P.r() * 0.5);
    P.line(x + Math.cos(a) * (R + 3), y + Math.sin(a) * (R + 3), x + Math.cos(a) * (R + 3 + L), y + Math.sin(a) * (R + 3 + L), {w: 0.45, over: 1}); }
  const id = P.clip(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(R)}"/>`);
  P.hatch([x - R, y - R, x + R, y + R], id, {ang: 0.9, gap: 3.2, w: 0.3, op: 0.55});
}
function moon(P, x, y, R){
  P.ellipse(x, y, R, R, {from: -1.3, span: Math.PI * 1.15, w: 0.8, twice: 0.6});
  P.ellipse(x + R * 0.45, y - R * 0.1, R * 0.82, R * 0.9, {from: -1.6, span: Math.PI * 1.05, w: 0.6});
  for (let i = 0; i < 18; i++) P.dots(1, () => [x + P.j(R * 1.6) * 6, y + P.j(R) * 1.5 + 10], {r: 0.7});
}
function birds(P, x, y, n){ for (let i = 0; i < n; i++){ const bx = x + P.j(40), by = y + P.j(12), s = 3 + P.r() * 3; P.stroke([[bx - s, by - s * 0.4], [bx - s * 0.4, by - s * 0.6], [bx, by]], {w: 0.5, over: 0}); P.stroke([[bx, by], [bx + s * 0.4, by - s * 0.7], [bx + s, by - s * 0.3]], {w: 0.5, over: 0}); } }

function lampScene(P, W, warm){
  // grow fridge interior: side walls in perspective, an LED bar on hangers, a clip fan, light falling
  const t = 4, inset = W * 0.07;
  P.line(2, 0, inset, 210, {w: 0.7, twice: 0.6}); P.line(W - 2, 0, W - inset, 210, {w: 0.7, twice: 0.6});
  const wl = P.clip(`<polygon points="0,0 ${f(inset)},210 0,210"/>`), wr = P.clip(`<polygon points="${W},0 ${f(W - inset)},210 ${W},210"/>`);
  P.hatch([0, 0, inset, 210], wl, {ang: 1.45, gap: 3, w: 0.3, op: 0.6}); P.hatch([W - inset, 0, W, 210], wr, {ang: 1.7, gap: 3, w: 0.3, op: 0.6});
  // hangers: rope, ratchet, hook
  const bx0 = W * 0.17, bx1 = W * 0.83, by = 30;
  P.wash(blobPath(P, [[bx0, by + 8], [bx1, by + 8], [W - inset + 4, 240], [inset - 4, 240]], 3), "#e3b84a", 20);
  for (const hx of [bx0 + 14, bx1 - 14]){
    P.stroke([[hx + P.j(3), 0], [hx + P.j(1.5), 8], [hx, 14]], {w: 0.45});
    P.ellipse(hx, 16, 2.6, 3.6, {w: 0.55});
    P.stroke([[hx - 4, 21], [hx, 20], [hx + 4, 21], [hx + 4, 25], [hx - 4, 25], [hx - 4, 21]], {w: 0.55, over: 0});
    P.line(hx, 25, hx - 3, by, {w: 0.4}); P.line(hx, 25, hx + 3, by, {w: 0.4});
  }
  // LED bar in slight perspective: top face, front face, fins
  P.stroke([[bx0, by], [bx1, by], [bx1 - 5, by - 4], [bx0 + 5, by - 4], [bx0, by]], {w: 0.7, over: 1, fill: "var(--paper)"});
  P.stroke([[bx0, by], [bx0, by + 7], [bx1, by + 7], [bx1, by]], {w: 0.9, over: 2, twice: 0.7, fill: "var(--paper)"});
  for (let x = bx0 + 7; x < bx1 - 6; x += 4 + P.r() * 1.2) P.line(x, by - 3.4, x - 1.2, by - 0.6, {w: 0.35, over: 0.5, op: 0.8});
  { const id = P.clip(`<rect x="${f(bx0)}" y="${by}" width="${f(bx1 - bx0)}" height="7"/>`); P.hatch([bx0, by, bx1, by + 7], id, {ang: 1.2, gap: 1.8, w: 0.25, op: 0.5}); }
  P.line(inset, 210, inset + 10, 150, {w: 0.4, op: 0.6}); P.line(W - inset, 210, W - inset - 10, 150, {w: 0.4, op: 0.6}); P.line(inset + 10, 150, W - inset - 10, 150, {w: 0.35, op: 0.5, dash: "3 4"});
  for (let x = bx0 + 5; x < bx1 - 4; x += 5.5){ P.ellipse(x, by + 2.4, 0.9, 0.7, {w: 0.35, jit: 0.05}); P.ellipse(x + 2.7, by + 5, 0.9, 0.7, {w: 0.35, jit: 0.05}); }
  P.stroke([[bx1, by + 3], [bx1 + 10, by + 6], [bx1 + 16, by + 2], [bx1 + 20, -2]], {w: 0.45});  // power cord
  // light: fanned rays, broken and uneven, some running long
  for (let i = 0; i < 70; i++){
    const u = P.r(), x0 = bx0 + 4 + u * (bx1 - bx0 - 8), spread = (x0 - W / 2) * (0.35 + P.r() * 0.2), L = 70 + P.r() * 120 + (P.r() < 0.12 ? 60 : 0);
    let y = by + 9, segs = 2 + Math.floor(P.r() * 4);
    for (let s = 0; s < segs; s++){ const y1 = y + L / segs * (0.5 + P.r() * 0.6); if (y1 > by + 9 + L) break;
      const k0 = (y - by - 9) / 200, k1 = (y1 - by - 9) / 200;
      P.line(x0 + spread * k0, y, x0 + spread * k1, y1, {w: 0.32 + P.r() * 0.18, op: 0.75 - s * 0.12, over: 0.5, jit: 0.25}); y = y1 + 3 + P.r() * 8; }
  }
  // clip fan, right side: cage rings and spokes
  const fx = W - inset - 22, fy = 92, fr = 15;
  for (const k of [1, 0.72, 0.45, 0.2]) P.ellipse(fx, fy, fr * k, fr * k * 0.95, {w: k === 1 ? 0.8 : 0.4, twice: k === 1 ? 0.6 : 0});
  for (let i = 0; i < 12; i++){ const a = i / 12 * 6.283; P.line(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, {w: 0.3, over: 0.3}); }
  P.stroke([[fx, fy + fr], [fx + 2, fy + fr + 8], [fx + 8, fy + fr + 12], [W - inset + 2, fy + fr + 13]], {w: 0.6});
  for (let i = 0; i < 3; i++){ const y = fy - 6 + i * 6; P.stroke([[fx - fr - 4, y], [fx - fr - 12, y + P.j(1)], [fx - fr - 20, y + 2]], {w: 0.35, op: 0.7, over: 1}); }  // airflow
  if (warm) for (let i = 0; i < 7; i++){ const x0 = W * (0.25 + 0.5 * P.r()), y0 = 50 + P.r() * 70; const pts = []; for (let k = 0; k < 7; k++) pts.push([x0 + Math.sin(k * 1.3 + i) * 2.2, y0 - k * 5]); P.stroke(pts, {w: 0.35, op: 0.55}); }  // rising heat wisps
}
function skyScene(P, W, wx, night){
  const cloud_ = wx.cloud == null ? 45 : wx.cloud;
  P.wash(blobPath(P, [[-8, -8], [W + 8, -8], [W + 8, 150], [W * 0.6, 175], [W * 0.2, 160], [-8, 180]], 4), night ? "#22324f" : "#7fa9c9", night ? 30 : 18);
  if (night) moon(P, W * 0.72, 34, 12); else if (cloud_ < 75) sun(P, W * 0.72, 36, 13);
  const n = Math.round(1 + cloud_ / 22);
  for (let k = 0; k < n; k++) cloud(P, W * (0.08 + 0.84 * P.r()), 40 + 60 * P.r(), 60 + 80 * P.r());
  if (!night && P.r() < 0.8) birds(P, W * 0.3, 70, 3 + Math.floor(P.r() * 3));
  for (let i = 0; i < Math.min(140, (wx.rain || 0) * 45); i++){ const x = P.r() * W, y = 70 + P.r() * 110, L = 7 + P.r() * 6; P.line(x, y, x - L * 0.35, y + L, {w: 0.4, op: 0.5 + 0.4 * P.r(), over: 0.5}); }
  const g = wx.gust || 0;
  for (let i = 0; i < (g > 30 ? 4 : g > 15 ? 2 : 0); i++){ const y = 110 + P.r() * 50, x = P.r() * W * 0.4, L = 110 + P.r() * 110;
    const pts = []; for (let k = 0; k <= 10; k++){ const t = k / 10; pts.push([x + L * t, y + Math.sin(t * 6.28) * 4 * (1 - t)]); } pts.push([x + L + 8, y - 6]); pts.push([x + L + 2, y - 11]); P.stroke(pts, {w: 0.5, twice: 0.5}); }
  treeline(P, 196, W);
}
// caustic net: the wobbling light pattern seen through water, drawn as loose broken cells fading with depth
function caustics(P, W, y0, y1){
  for (let y = y0; y < y1; y += 10 + (y - y0) * 0.06){
    const k = 1 - (y - y0) / (y1 - y0), cw = 15 + P.r() * 8;
    for (let x = -10 + P.r() * cw; x < W + 10; x += cw * (0.8 + P.r() * 0.5)){
      const cx = x, cy = y + P.j(3), rx = cw * 0.5, ry = 4 + P.r() * 3, m = 5 + Math.floor(P.r() * 2), a0 = P.r() * 6;
      const vs = []; for (let i = 0; i < m; i++){ const a = a0 + i / m * 6.283; vs.push([cx + Math.cos(a) * rx * (0.75 + P.r() * 0.4), cy + Math.sin(a) * ry * (0.75 + P.r() * 0.4)]); }
      for (let i = 0; i < m; i++) if (P.r() < 0.62){ const a = vs[i], b = vs[(i + 1) % m], mid = [(a[0] + b[0]) / 2 + P.j(1.2), (a[1] + b[1]) / 2 + P.j(1.2)];
        P.stroke([a, mid, b], {w: 0.28, op: 0.12 + 0.45 * k, jit: 0.2, over: 0.4}); }
    }
  }
}
function hydroScene(P, W, top){
  // a cut-away DWC bucket: lid rim and net pot, air gap with hanging roots, the waterline, then water with
  // caustic light, a fibrous root mass, the air stone and its bubble column
  const cy = top + 20, rx = W * 0.62, ry = 13, wy = cy + 36, bot = top + 230;
  P.wash(blobPath(P, [[-8, wy], [W * 0.3, wy + 1], [W * 0.7, wy - 1], [W + 8, wy], [W + 8, bot], [-8, bot]], 2), "#3f93c4", 36);
  P.wash(blobPath(P, [[-8, wy + 2], [W + 8, wy + 2], [W + 8, wy + 16], [-8, wy + 22]], 3), "#3f93c4", 22);
  P.ellipse(W / 2, cy, rx, ry, {from: Math.PI, span: Math.PI, w: 0.9, twice: 0.7});
  P.ellipse(W / 2, cy + 7, rx, ry, {from: Math.PI * 1.05, span: Math.PI * 0.9, w: 0.5, op: 0.7});
  { const id = P.clip(`<path d="M${f(W / 2 - rx)} ${f(cy)} A ${f(rx)} ${ry} 0 0 1 ${f(W / 2 + rx)} ${f(cy)} L ${f(W / 2 + rx)} ${f(cy + 7)} A ${f(rx)} ${ry} 0 0 0 ${f(W / 2 - rx)} ${f(cy + 7)} Z"/>`); P.hatch([0, cy - ry, W, cy + 8], id, {ang: 1.35, gap: 2.4, w: 0.3, op: 0.6}); }
  P.ellipse(W / 2, cy - 2, 34, 8, {w: 0.8, twice: 0.6, fill: "var(--paper)"});
  for (let i = -3; i <= 3; i++) P.line(W / 2 + i * 9, cy - 8 + Math.abs(i) * 0.5, W / 2 + i * 10, cy + 6, {w: 0.35, over: 0.5});
  for (let i = 0; i < 16; i++){ const x = W / 2 + P.j(28), y = cy - 3 + P.j(4), rr = 1.6 + P.r() * 1.4; P.ellipse(x, y, rr, rr * 0.8, {w: 0.4, jit: 0.1, fill: "var(--paper)"}); }  // clay pebbles
  // waterline, glints and ripple rings where the roots go in
  P.line(-8, wy, W + 8, wy + P.j(1.5), {w: 0.7, twice: 0.8});
  for (let row = 0; row < 4; row++) for (let x = P.r() * 20 - 10; x < W; x += 9 + P.r() * 16){ const y = wy + 3 + row * 3.2 + P.j(0.6), L = 3 + P.r() * 9 - row; if (L > 1.5) P.line(x, y, x + L, y + P.j(0.4), {w: 0.3, op: 0.75 - row * 0.15, over: 0.3, jit: 0.1}); }
  for (const k of [1, 1.7, 2.6]) P.ellipse(W / 2 + P.j(3), wy, 14 * k, 2.2 * k * 0.8, {w: 0.35, op: 0.8 - k * 0.2, span: Math.PI * (1.4 + P.r() * 0.5)});
  caustics(P, W, wy + 18, bot);
  for (let i = 0; i < 40; i++) P.dots(1, r => [r() * W, wy + 20 + r() * 150], {r: 0.4, op: 0.5});   // drifting specks
  const L = []; for (let i = 0; i < 13; i++) rootTree(P, W / 2 + P.j(24), cy + 6, 120 + P.r() * 110, Math.PI / 2 + P.j(0.35), 3, 0.85, L);
  drawRoots(P, L);
  const sx = W * 0.2, sy = cy + 132;
  P.stroke([[sx - 14, sy], [sx + 14, sy], [sx + 14, sy + 7], [sx - 14, sy + 7], [sx - 14, sy]], {w: 0.7, over: 1, fill: "var(--paper)"});
  P.dots(36, r => [sx - 12 + r() * 24, sy + 1 + r() * 5], {r: 0.5});
  P.stroke([[sx + 14, sy + 3], [sx + 30, sy - 4], [sx + 40, sy - 40], [sx + 34, sy - 100], [sx + 50, cy - 4]], {w: 0.55, twice: 0.5});
  for (let i = 0; i < 30; i++){ const y = sy - 6 - i * (3.5 + P.r() * 3), x = sx + P.j(7 + i * 0.25) + Math.sin(i * 0.8) * 3; if (y < wy + 3) break; bubble(P, x, y, 0.8 + P.r() * 2.4 + i * 0.03); }
}
// the soil section's surface: a lumpy line, crumbs on top, a hairy fringe of fibres just under it
function surface(P, W, y){
  const pts = []; for (let x = -8; x <= W + 8; x += 6) pts.push([x, y + Math.sin(x / 23) * 2 + P.j(1.6)]);
  P.stroke(pts, {w: 0.8, jit: 0.4, over: 1, twice: 0.6});
  for (const p of pts) for (let k = 0; k < 3; k++){ const x = p[0] + P.r() * 6, a = Math.PI / 2 + P.j(1.2), l = 1.5 + P.r() * 3.5; P.line(x, p[1] + 0.5, x + Math.cos(a) * l, p[1] + 0.5 + Math.sin(a) * l, {w: 0.25, op: 0.7, over: 0, jit: 0.1}); }
  for (let i = 0; i < 22; i++){ const x = P.r() * W, s = 1.2 + P.r() * 2.6; P.ellipse(x, y - s * 0.4 + Math.sin(x / 23) * 2, s, s * 0.6, {w: 0.4, jit: 0.3, fill: "var(--paper)"}); }
  return pts;
}
function section(P, W, pts, bot){ return P.clip(`<path d="M${pts.map(p => f(p[0]) + " " + f(p[1])).join("L")}L${W + 8} ${bot}L-8 ${bot}Z"/>`); }
function stone(P, x, y, rr){
  P.ellipse(x, y, rr, rr * 0.65, {w: 0.6, fill: "var(--paper)", twice: 0.4});
  const id = P.clip(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rr)}" ry="${f(rr * 0.65)}"/>`); P.hatch([x - rr * 0.2, y, x + rr, y + rr], id, {ang: -0.6, gap: 1.5, w: 0.25, op: 0.65});
}
function soilScene(P, W, top, living){
  // a cut through the bed in the old plate manner: dark hatched earth, pale roots running through it
  const cy = top + 24, bot = top + 230;
  P.wash(blobPath(P, [[-8, cy - 2], [W + 8, cy - 2], [W + 8, bot], [-8, bot]], 2.5), "#7a4f28", 34);
  const pts = surface(P, W, cy), id = section(P, W, pts, bot);
  P.hatch([0, cy, W, bot], id, {ang: -0.75, gap: 2.3, w: 0.3, op: 0.55, cross: true});
  P.dots(1300, r => [r() * W, cy + 4 + Math.pow(r(), 0.7) * 180], {r: 0.5, op: 0.8});
  for (let i = 0; i < 40; i++){ const x = P.r() * W, y = cy + 8 + P.r() * 170; P.ellipse(x, y, 1 + P.r() * 1.6, 0.8 + P.r(), {w: 0.3, fill: "var(--paper)", jit: 0.2}); }   // grit
  for (let i = 0; i < 8; i++) stone(P, P.r() * W, cy + 30 + P.r() * 130, 3.5 + P.r() * 6);
  const L = []; for (let i = 0; i < 9; i++) rootTree(P, W * (0.1 + 0.8 * P.r()), cy + 2, 70 + P.r() * 110, Math.PI / 2 + P.j(0.5), 3, 0.8, L);
  drawRoots(P, L, {light: true});
  if (living){
    for (let i = 0; i < 18; i++){ let x = P.r() * W, y = cy + 25 + P.r() * 140, a = P.r() * 6.28; const ps = [[x, y]]; for (let k = 0; k < 10; k++){ a += P.j(0.9); x += Math.cos(a) * 6; y += Math.sin(a) * 6; ps.push([x, y]); } P.stroke(ps, {w: 0.45, op: 0.85, jit: 0.3, color: "var(--paper)"}); }
    const wx = W * 0.66, wy = cy + 96, wp = []; for (let k = 0; k <= 14; k++) wp.push([wx + k * 4, wy + Math.sin(k * 0.8) * 3.5]);
    P.stroke(wp, {w: 3.6, jit: 0.1, over: 0, color: "var(--paper)"}); P.stroke(wp.map(p => [p[0], p[1] - 1.8]), {w: 0.5, jit: 0.15, over: 0}); P.stroke(wp.map(p => [p[0], p[1] + 1.8]), {w: 0.5, jit: 0.15, over: 0});
    for (let k = 1; k < 14; k++) P.line(wx + k * 4, wy + Math.sin(k * 0.8) * 3.5 - 1.6, wx + k * 4 + 0.5, wy + Math.sin(k * 0.8) * 3.5 + 1.6, {w: 0.28, over: 0, op: 0.8});
  }
}
function cocoScene(P, W, top){
  const cy = top + 24, bot = top + 230;
  P.wash(blobPath(P, [[-8, cy - 2], [W + 8, cy - 2], [W + 8, bot], [-8, bot]], 2.5), "#9a6a3c", 28);
  const pts = surface(P, W, cy), id = section(P, W, pts, bot);
  P.hatch([0, cy, W, bot], id, {ang: -0.9, gap: 3.2, w: 0.28, op: 0.45});
  for (let i = 0; i < 420; i++){ const y = cy + 4 + Math.pow(P.r(), 0.7) * 180, x = P.r() * W, a = P.r() * 6.28, l = 4 + P.r() * 12, light = P.r() < 0.4;
    P.stroke([[x, y], [x + Math.cos(a) * l / 2 + P.j(2), y + Math.sin(a) * l / 2 + P.j(2)], [x + Math.cos(a) * l, y + Math.sin(a) * l]], {w: light ? 0.6 : 0.32, op: 0.75, over: 0.5, color: light ? "var(--paper)" : null}); }
  for (let i = 0; i < 46; i++){ const x = P.r() * W, y = cy + 8 + P.r() * 170, rr = 1.5 + P.r() * 2.4; P.ellipse(x, y, rr, rr * 0.85, {w: 0.4, fill: "var(--paper)"}); P.dots(2, r => [x + (r() - 0.5) * rr, y + (r() - 0.5) * rr], {r: 0.3}); }
  const L = []; for (let i = 0; i < 8; i++) rootTree(P, W * (0.12 + 0.76 * P.r()), cy + 2, 70 + P.r() * 100, Math.PI / 2 + P.j(0.5), 3, 0.75, L);
  drawRoots(P, L, {light: true});
}
function jarSketch(P, x, y, w, h){
  // a glass curing jar standing on the shelf: glass outline, glint, hatched lid, nugs inside
  P.stroke([[x, y], [x, y - h + 4], [x + 2, y - h + 1], [x + w - 2, y - h + 1], [x + w, y - h + 4], [x + w, y]], {w: 0.7, over: 1, twice: 0.5});
  P.line(x - 1, y, x + w + 1, y, {w: 0.7});
  P.stroke([[x + 1, y - h + 1], [x + 1, y - h - 5], [x + w - 1, y - h - 5], [x + w - 1, y - h + 1]], {w: 0.7, over: 0.5, fill: "var(--paper)"});
  for (let k = x + 2; k < x + w - 1; k += 1.8) P.line(k, y - h - 4.5, k + 1, y - h + 0.5, {w: 0.25, over: 0, jit: 0.1});
  P.line(x + 2.5, y - 3, x + 2.5, y - h + 6, {w: 0.3, op: 0.6});
  for (let i = 0; i < 7; i++){ const nx = x + 4 + P.r() * (w - 8), ny = y - 4 - P.r() * h * 0.55, s = 2.4 + P.r() * 1.6;
    P.ellipse(nx, ny, s * 0.75, s, {w: 0.4, jit: 0.4, fill: "var(--paper)"}); P.line(nx - s * 0.3, ny + s * 0.2, nx + s * 0.2, ny - s * 0.5, {w: 0.25, op: 0.7}); }
}
function shelfScene(P, W, top, phase){
  const y = top + 70;
  P.wash(blobPath(P, [[-8, y - 1], [W + 8, y - 1], [W + 8, y + 13], [-8, y + 13]], 1.5), "#8a6238", 26);
  if (phase !== "dry"){ jarSketch(P, W * 0.14, y, 24, 34); jarSketch(P, W * 0.14 + 30, y, 20, 28);
    P.stroke([[W * 0.62, y], [W * 0.62, y - 16], [W * 0.62 + 14, y - 16], [W * 0.62 + 14, y]], {w: 0.6, over: 0.5, fill: "var(--paper)"});   // a little hygrometer
    P.ellipse(W * 0.62 + 7, y - 9, 4.5, 4.5, {w: 0.45}); P.line(W * 0.62 + 7, y - 9, W * 0.62 + 9.5, y - 12, {w: 0.4}); }
  P.line(-6, y, W + 6, y + P.j(2), {w: 1, twice: 0.8}); P.line(-6, y + 12, W + 6, y + 12 + P.j(2), {w: 0.8});
  for (let i = 0; i < 9; i++){ const pts = []; const yy = y + 2 + i * 1.2, ph = P.r() * 6; for (let x = -6; x < W + 6; x += 12) pts.push([x, yy + Math.sin(x / 30 + ph) * 0.8]); if (P.r() < 0.8) P.stroke(pts.slice(Math.floor(P.r() * 8)), {w: 0.25, op: 0.6}); }
  for (const kx of [W * 0.2, W * 0.67]){ P.ellipse(kx, y + 6, 5, 2.5, {w: 0.5}); for (let k = 1; k < 4; k++) P.ellipse(kx, y + 6, 5 - k * 1.2, 2.5 - k * 0.6, {w: 0.3}); }
  P.line(W * 0.12, y + 12, W * 0.1, y + 26, {w: 0.7}); P.line(W * 0.88, y + 12, W * 0.9, y + 26, {w: 0.7});
}
function dryLine(P, W){ // drying line with clothespins across the top
  P.stroke([[-4, 6], [W * 0.5, 18], [W + 4, 6]], {w: 0.6, twice: 0.6});
  for (const cx of [W * 0.22, W * 0.5, W * 0.78]){ const yy = 6 + 12 * Math.sin(Math.PI * cx / W);
    P.stroke([[cx - 2, yy - 4], [cx - 1.5, yy + 8]], {w: 1.1}); P.stroke([[cx + 2, yy - 4], [cx + 1.5, yy + 8]], {w: 1.1}); P.ellipse(cx, yy + 2, 2.6, 1.2, {w: 0.4}); }
}

function draw(o){
  const W = o.W, H = o.H, P = new Pen(o.seed || 11);
  const top = new Pen((o.seed || 11) + 1), bot = new Pen((o.seed || 11) + 2);
  if (o.scene === "indoor") lampScene(top, W, o.warm);
  else if (o.scene === "outdoor") skyScene(top, W, o.weather || {}, o.night);
  if (o.phase === "dry") dryLine(top, W);
  const by = H - 175;
  if (["dry","cure","done"].includes(o.phase)) shelfScene(bot, W, by, o.phase);
  else if (o.medium === "hydro") hydroScene(bot, W, by);
  else if (o.medium === "coco") cocoScene(bot, W, by);
  else soilScene(bot, W, by, o.medium === "living-soil");
  const a = top.svg(), b = bot.svg();
  const wc = `<filter id="wc" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  return {defs: wc + a.defs + b.defs, top: a.body, bottom: b.body, by};
}
window.BgArt = {draw};
})();
