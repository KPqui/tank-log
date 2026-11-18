/* Flowerphile · chart.js — small ink-style line charts for the Today tiles (no library, works offline).
   Chart.svg(series, opts) returns an SVG string.
     series: [{pts:[{t:ms, v:number}], dots:bool, label?}]   (first series is the main one)
     opts:   {from:ms, to:ms, band:[lo,hi]?, unit:"", digits:1, events:[{t:ms, k:"F"}]}
   Drawn in the plate style: ruled axes, target range as a watercolour wash, the line slightly roughened. */
(function(){
  const W = 340, H = 226, L = 36, R = 20, TOP = 26, B = 28;   // TOP leaves a row above the plot for event letters
  const f1 = n => Math.round(n * 10) / 10;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function niceStep(span){ const raw = span / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
  // average into buckets so a 10-minute sensor log over 30 days stays light
  function thin(pts, max){
    if (pts.length <= max) return pts;
    const t0 = pts[0].t, span = pts[pts.length - 1].t - t0 || 1, out = [];
    let b = -1, sum = 0, n = 0, ts = 0;
    for (const p of pts){ const k = Math.floor((p.t - t0) / span * (max - 1));
      if (k !== b && n){ out.push({t: ts / n, v: sum / n}); sum = 0; n = 0; ts = 0; }
      b = k; sum += p.v; ts += p.t; n++; }
    if (n) out.push({t: ts / n, v: sum / n});
    return out;
  }
  function svg(series, o){
    const all = series.flatMap(s => s.pts).filter(p => p.t >= o.from && p.t <= o.to);
    if (!all.length) return null;
    let lo = Math.min(...all.map(p => p.v)), hi = Math.max(...all.map(p => p.v));
    if (o.band){ lo = Math.min(lo, o.band[0]); hi = Math.max(hi, o.band[1]); }
    if (hi - lo < (o.minSpan || 0.2)){ const m = (hi + lo) / 2, s = (o.minSpan || 0.2) / 2; lo = m - s; hi = m + s; }
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
    const step = niceStep(hi - lo), y0 = Math.ceil(lo / step) * step;
    const X = t => L + (t - o.from) / (o.to - o.from) * (W - L - R), Y = v => TOP + (hi - v) / (hi - lo) * (H - TOP - B);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title || "Chart") + '">';
    s += '<g font-family="Old Standard TT, Georgia, serif" font-size="11" fill="currentColor">';
    if (o.band) s += '<rect x="' + L + '" y="' + f1(Y(o.band[1])) + '" width="' + (W - L - R) + '" height="' + f1(Y(o.band[0]) - Y(o.band[1])) + '" style="fill:var(--ok);fill-opacity:.35" filter="url(#wash)"/>';
    for (let v = y0; v <= hi + 1e-9; v += step){
      const y = f1(Y(v));
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="currentColor" stroke-width=".4" stroke-dasharray="1 3" opacity=".6"/>';
      s += '<text x="' + (L - 5) + '" y="' + (y + 4) + '" text-anchor="end">' + (+v.toFixed(o.digits != null ? o.digits : 1)) + '</text>';
    }
    // x: day labels, at most 5
    const days = (o.to - o.from) / 864e5, every = days <= 4 ? 1 : days <= 8 ? 2 : days <= 16 ? 4 : Math.ceil(days / 5);
    const d0 = new Date(o.from); d0.setHours(0, 0, 0, 0);
    for (let d = new Date(d0), i = 0; d <= o.to; d.setDate(d.getDate() + 1), i++){
      if (d < o.from || i % every) continue;
      const x = f1(X(+d));
      s += '<line x1="' + x + '" x2="' + x + '" y1="' + (H - B) + '" y2="' + (H - B + 4) + '" stroke="currentColor" stroke-width=".8"/>';
      s += '<text x="' + x + '" y="' + (H - B + 16) + '" text-anchor="middle">' + d.toLocaleDateString("en-GB", {day: "numeric", month: "short"}) + '</text>';
    }
    s += '<path d="M' + L + ' ' + TOP + ' V' + (H - B) + ' H' + (W - R) + '" fill="none" stroke="currentColor" stroke-width="1.1" filter="url(#rough)"/>';
    // events: a faint line in the plot, letters in their own row above it; marks closer than 12 px merge into one label
    const ev = (o.events || []).filter(e => e.t >= o.from && e.t <= o.to).map(e => ({x: X(e.t), k: e.k})).sort((a, b) => a.x - b.x), groups = [];
    for (const e of ev){ const g = groups[groups.length - 1]; if (g && e.x - g.x1 < 12){ g.x1 = e.x; if (!g.ks.includes(e.k)) g.ks.push(e.k); } else groups.push({x0: e.x, x1: e.x, ks: [e.k]}); }
    const rowEnd = [-1e9, -1e9];                         // two rows of letters; a label goes to the first row with room
    for (const g of groups){ const x = f1((g.x0 + g.x1) / 2), w = g.ks.join("·").length * 5.5 + 4;
      const row = x - w / 2 > rowEnd[0] ? 0 : x - w / 2 > rowEnd[1] ? 1 : 0; rowEnd[row] = x + w / 2;
      for (const e of ev) if (e.x >= g.x0 && e.x <= g.x1) s += '<line x1="' + f1(e.x) + '" x2="' + f1(e.x) + '" y1="' + TOP + '" y2="' + (H - B) + '" stroke="currentColor" stroke-width=".5" stroke-dasharray="1.5 2.5" opacity=".4"/>';
      s += '<text x="' + x + '" y="' + (row ? TOP - 4 : TOP - 15) + '" text-anchor="middle" font-size="10" font-style="italic">' + esc(g.ks.join("·")) + '</text>'; }
    series.forEach((sr, i) => {
      const pts = thin(sr.pts.filter(p => p.t >= o.from && p.t <= o.to), 360);
      if (!pts.length) return;
      const gap = sr.dots ? Infinity : 3 * 36e5;          // sensor lines break where data is missing (moved, offline)
      const d = pts.map((p, j) => (j && p.t - pts[j - 1].t <= gap ? "L" : "M") + f1(X(p.t)) + " " + f1(Y(p.v))).join(" ");
      s += '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (i ? 0.8 : 1.5) + '"' + (i ? ' stroke-dasharray="3 2" opacity=".7"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>';
      if (sr.dots) for (const p of pts) s += '<circle cx="' + f1(X(p.t)) + '" cy="' + f1(Y(p.v)) + '" r="2.8" style="fill:var(--paper)" stroke="currentColor" stroke-width="1.2"/>';
    });
    s += '</g></svg>';
    return s;
  }
  function stats(pts){ if (!pts.length) return null; const v = pts.map(p => p.v); return {min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length, last: v[v.length - 1], n: v.length}; }
  window.Chart = {svg, stats, thin};
})();
