/* Flowerphile · bridge.js — readings from the sensor bridge (pure functions, no network, no DOM).
   The bridge writes raw 15-minute averages to a separate repo: readings/YYYY-MM-DD/HHMMSS-<device>.jsonl,
   lines {"t":"…Z","id":"41DC","temp":24.31,"rh":58.20,"bat":87,"n":412} (t = window end, UTC).
   sensors.json (in the data repo) says what each sensor is and where it sits:
     {repo?, sensors:{ID:{num, label?, corrections:[{from, rh?, temp?, note?}]}},
      placements:[{id, place, kind: air|jar|dry|dome|test|off, run?, from, to?}]}
   Corrections apply retroactively (the repo stays raw); the newest correction with from ≤ t wins.
   A plant sees a reading only while that sensor was placed with it (run = plant id). */
(function(){
  const H = 36e5;
  function parse(text){
    const out = [];
    for (const line of String(text || "").split(/\r?\n/)){
      if (!line.trim()) continue;
      try { const j = JSON.parse(line); const t = Date.parse(j.t); if (j.id && Number.isFinite(t)) out.push({t, id: String(j.id).toUpperCase(), temp: num(j.temp), rh: num(j.rh), bat: num(j.bat), n: j.n || null}); } catch(e){}
    }
    return out;
  }
  const num = v => typeof v === "number" && Number.isFinite(v) ? v : null;
  function merge(lists){                                 // de-dup by (t, id), sorted by time
    const m = new Map();
    for (const L of lists) for (const r of L || []) m.set(r.t + "|" + r.id, r);
    return [...m.values()].sort((a, b) => a.t - b.t);
  }
  function correct(r, meta){
    const s = ((meta || {}).sensors || {})[r.id]; if (!s || !s.corrections) return r;
    let c = null; for (const x of s.corrections) if (Date.parse(x.from) <= r.t && (!c || Date.parse(x.from) >= Date.parse(c.from))) c = x;
    if (!c) return r;
    return Object.assign({}, r, {temp: r.temp != null ? r.temp + (c.temp || 0) : null, rh: r.rh != null ? Math.min(100, r.rh + (c.rh || 0)) : null});
  }
  function placements(meta){ return ((meta || {}).placements || []).map(p => Object.assign({}, p, {f: Date.parse(p.from), u: p.to ? Date.parse(p.to) : Infinity})); }
  function placeAt(meta, id, t){ let hit = null; for (const p of placements(meta)) if (p.id === id && p.f <= t && t < p.u && (!hit || p.f >= hit.f)) hit = p; return hit; }
  function current(meta, id, now){ return placeAt(meta, id, now == null ? Date.now() : now); }
  // readings of the sensors that were with this plant, corrected; kinds = optional filter (e.g. ["jar"])
  function forRun(rows, meta, run, kinds){
    const out = [];
    for (const r of rows){ const p = placeAt(meta, r.id, r.t); if (!p || p.run !== run || (kinds && !kinds.includes(p.kind))) continue; out.push(Object.assign(correct(r, meta), {place: p.place, kind: p.kind})); }
    return out;
  }
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  // the CSV-import shape {at, first, n, temp, rh, tmin, tmax, hmin, hmax, tavg, havg} for the last 24 h,
  // plus per-sensor latest values; with several sensors (jars) temp/rh are the mean of their latest readings
  function summary(pts, now){
    if (!pts.length) return null;
    now = now == null ? Date.now() : now;
    const last = pts[pts.length - 1].t, day = pts.filter(p => p.t > last - 24 * H);
    const per = {};
    for (const p of pts) per[p.id] = p;                  // newest per sensor (pts are sorted)
    const fresh = Object.values(per).filter(p => p.t > last - 3 * H);   // sensors that stopped (moved away) drop out
    const ts = day.map(p => p.temp).filter(v => v != null), rs = day.map(p => p.rh).filter(v => v != null);
    const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return {src: "bridge", at: new Date(last).toISOString(), first: new Date(day[0].t).toISOString(), n: day.length,
      temp: r1(mean(fresh.map(p => p.temp).filter(v => v != null))), rh: r1(mean(fresh.map(p => p.rh).filter(v => v != null))),
      tmin: ts.length ? r1(Math.min(...ts)) : null, tmax: ts.length ? r1(Math.max(...ts)) : null,
      hmin: rs.length ? r1(Math.min(...rs)) : null, hmax: rs.length ? r1(Math.max(...rs)) : null,
      tavg: r1(mean(ts)), havg: r1(mean(rs)),
      sensors: fresh.map(p => ({id: p.id, rh: r1(p.rh), temp: r1(p.temp), at: new Date(p.t).toISOString(), place: p.place, kind: p.kind}))};
  }
  // problems worth a line: silent sensors, low batteries, two sensors in different places reading the same
  function health(rows, meta, now){
    now = now == null ? Date.now() : now;
    const S = (meta || {}).sensors || {}, out = [], lastBy = {};
    for (const r of rows) lastBy[r.id] = r;
    const label = id => "sensor " + ((S[id] || {}).num || id);
    for (const id of Object.keys(S)){
      const pl = current(meta, id, now); if (pl && (pl.kind === "off")) continue;
      const l = lastBy[id];
      if (!l || now - l.t > 3 * H) out.push({k: "silent", id, lvl: "warn", text: label(id) + (l ? " silent for " + Math.round((now - l.t) / H) + " h" : " has no readings yet")});
      else if (l.bat != null && l.bat < 20) out.push({k: "battery", id, lvl: "info", text: label(id) + " battery " + l.bat + " %"});
    }
    // twins: the same trace (±0.3 °C, ±1 % RH) for the last 3 h while listed in different places, e.g. a move that
    // wasn't logged. Only readings taken at the current placement count; two jars may legitimately read alike, so jar–jar pairs are skipped.
    const recent = rows.filter(r => r.t > now - 3 * H), by = {};
    for (const r of recent){ const cur = current(meta, r.id, now), at = placeAt(meta, r.id, r.t); if (!cur || !at || at.f !== cur.f) continue; (by[r.id] = by[r.id] || new Map()).set(r.t, correct(r, meta)); }
    const ids = Object.keys(by), twins = {};
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++){
      const a = ids[i], b = ids[j], pa = current(meta, a, now), pb = current(meta, b, now);
      if (!pa || !pb || pa.place === pb.place || (pa.kind === "jar" && pb.kind === "jar")) continue;
      let n = 0, dt = 0, dh = 0;
      for (const [t, x] of by[a]){ const y = by[b].get(t); if (!y || x.temp == null || y.temp == null) continue; n++; dt += Math.abs(x.temp - y.temp); dh += Math.abs((x.rh || 0) - (y.rh || 0)); }
      if (n >= 6 && dt / n < 0.3 && dh / n < 1.0){ (twins[a] = twins[a] || new Set()).add(b); (twins[b] = twins[b] || new Set()).add(a); }
    }
    // one line per cluster of look-alike sensors that are listed in different places
    const seen = new Set();
    for (const id of Object.keys(twins)){
      if (seen.has(id)) continue;
      const group = [], stack = [id]; while (stack.length){ const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); group.push(x); for (const y of twins[x] || []) stack.push(y); }
      group.sort((a, b) => ((S[a] || {}).num || 0) - ((S[b] || {}).num || 0));
      const places = [...new Set(group.map(g => current(meta, g, now).place))];
      out.push({k: "twins", id, ids: group, lvl: "warn", text: "Sensors " + group.map(g => (S[g] || {}).num || g).join(", ") + " read the same but are listed in " + places.length + " places (" + places.join(", ") + "). Still together somewhere?"});
    }
    return out;
  }
  window.Bridge = {parse, merge, correct, placeAt, current, forRun, summary, health, placements};
})();
