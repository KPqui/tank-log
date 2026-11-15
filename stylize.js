/* Flowerphile · stylize.js
   Turns a photo of the plant into a small "half photo, half ink" specimen, entirely on the phone:
   1. find the plant by its green (excess-green + hue), clean the mask, keep the main plant
   2. even out brightness, so every photo reads alike
   3. ink lines from a difference-of-Gaussians (XDoG), as in the harvest plates
   4. mix photo and engraving tone 50/50, draw the lines on top, feather the edges, fade the bottom
   Limits: needs a green plant on a non-green background. Purple leaves, buds late in bloom, or coloured
   (blurple) light will cut out poorly; then the function returns null and the app keeps the drawing. */
(function(){
  const PAPER = [240, 230, 204], INK = [28, 23, 17];

  function blur(src, w, h, r){                      // three box blurs ≈ gaussian
    let a = Float32Array.from(src), b = new Float32Array(a.length);
    const rad = Math.max(1, Math.round(r));
    for (let pass = 0; pass < 3; pass++){
      for (let y = 0; y < h; y++){                  // horizontal
        let acc = 0, o = y * w;
        for (let x = -rad; x <= rad; x++) acc += a[o + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++){
          b[o + x] = acc / (2 * rad + 1);
          acc += a[o + Math.min(w - 1, x + rad + 1)] - a[o + Math.max(0, x - rad)];
        }
      }
      for (let x = 0; x < w; x++){                  // vertical
        let acc = 0;
        for (let y = -rad; y <= rad; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++){
          a[y * w + x] = acc / (2 * rad + 1);
          acc += b[Math.min(h - 1, y + rad + 1) * w + x] - b[Math.max(0, y - rad) * w + x];
        }
      }
    }
    return a;
  }
  function morph(m, w, h, r, grow){                 // dilate (grow) or erode with a square
    const out = new Uint8Array(m.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      let v = grow ? 0 : 1;
      for (let dy = -r; dy <= r && (grow ? !v : v); dy++){
        const yy = y + dy; if (yy < 0 || yy >= h){ if (!grow) v = 0; continue; }
        for (let dx = -r; dx <= r; dx++){
          const xx = x + dx; if (xx < 0 || xx >= w){ if (!grow){ v = 0; break; } continue; }
          const s = m[yy * w + xx];
          if (grow && s){ v = 1; break; } if (!grow && !s){ v = 0; break; }
        }
      }
      out[y * w + x] = v;
    }
    return out;
  }
  function components(m, w, h){                     // label 4-connected regions, return labels and sizes
    const lab = new Int32Array(m.length), sizes = [0], stack = [];
    let n = 0;
    for (let i = 0; i < m.length; i++){
      if (!m[i] || lab[i]) continue;
      n++; let size = 0; stack.push(i); lab[i] = n;
      while (stack.length){
        const j = stack.pop(); size++; const x = j % w, y = (j / w) | 0;
        const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1];
        for (const k of nb) if (k >= 0 && m[k] && !lab[k]){ lab[k] = n; stack.push(k); }
      }
      sizes.push(size);
    }
    return {lab, sizes};
  }

  function stylize(img, opts){
    opts = opts || {};
    const mix = opts.photo == null ? 0.5 : opts.photo;            // share of the real photo
    const max = opts.max || 1200;
    const k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.round((img.naturalWidth || img.width) * k), h = Math.round((img.naturalHeight || img.height) * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", {willReadFrequently: true}); g.drawImage(img, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data, N = w * h;

    // 1. plant mask, with hysteresis: clearly green pixels seed it, faintly green ones (the pale stem under the
    //    lamp, leaf edges in glare) join only where they touch the seeded plant
    const strong = new Uint8Array(N), weak = new Uint8Array(N);
    for (let i = 0; i < N; i++){
      const r = px[i * 4] / 255, gg = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), s = mx ? (mx - mn) / mx : 0;
      let hue = 0;
      if (mx !== mn){ if (mx === r) hue = 60 * (((gg - b) / (mx - mn)) % 6); else if (mx === gg) hue = 60 * ((b - r) / (mx - mn) + 2); else hue = 60 * ((r - gg) / (mx - mn) + 4); }
      if (hue < 0) hue += 360;
      const exg = 2 * gg - r - b;
      strong[i] = (exg > 0.07 && hue > 55 && hue < 170 && s > 0.16 && mx > 0.1) ? 1 : 0;
      weak[i] = strong[i] || (exg > 0.025 && hue > 45 && hue < 180 && s > 0.07 && mx > 0.08) ? 1 : 0;
    }
    let m = morph(morph(strong, w, h, 3, true), w, h, 3, false);           // close small gaps
    // main plant from the strong pixels alone
    let cc0 = components(m, w, h), big0 = 0;
    for (let i = 1; i < cc0.sizes.length; i++) if (cc0.sizes[i] > cc0.sizes[big0]) big0 = i;
    if (!big0 || cc0.sizes[big0] < N * 0.004) return null;                // no plant found
    let sx0 = w, sy0 = h, sx1 = 0, sy1 = 0;
    for (let i = 0; i < N; i++) if (cc0.lab[i] === big0){ const x = i % w, y = (i / w) | 0; if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
    // find the stem: the column under the leaves with the most faintly-green pixels
    const yA = Math.round(sy1 - (sy1 - sy0) * 0.15), yB = Math.min(h - 1, Math.round(sy1 + (sy1 - sy0) * 0.6));
    const colc = new Float32Array(w);
    for (let x = Math.round(sx0 + (sx1 - sx0) * 0.2); x <= sx1 - (sx1 - sx0) * 0.2; x++){ let c = 0; for (let y = yA; y <= yB; y++) c += weak[y * w + x]; colc[x] = c; }
    let cx = (sx0 + sx1) / 2, bestc = -1;
    for (let x = 2; x < w - 2; x++){ const c = colc[x - 2] + colc[x - 1] + colc[x] + colc[x + 1] + colc[x + 2]; if (c > bestc){ bestc = c; cx = x; } }
    const half = Math.max(5, (sx1 - sx0) * 0.03), yEnd = Math.min(h - 1, sy1 + (sy1 - sy0) * 0.8);
    // faint pixels join only next to the plant (leaf edges) or inside a narrow corridor under it (the stem)
    const near = morph(m, w, h, 3, true);
    for (let i = 0; i < N; i++){
      if (!weak[i] || m[i]) continue;
      const x = i % w, y = (i / w) | 0;
      if (near[i] || (Math.abs(x - cx) <= half && y >= (sy0 + sy1) / 2 && y <= yEnd)) m[i] = 1;
    }
    // bridge the stem where glare or the pebbles broke it: per row, the centre and width of the faint-green
    // pixels in the corridor; gaps up to ~4 % of the image height are filled by interpolation
    { const rows = []; let lastY = -1;
      for (let y = Math.round((sy0 + sy1) / 2); y <= yEnd; y++){
        let a0 = -1, a1 = -1; for (let x = Math.round(cx - half); x <= cx + half; x++){ if (x < 0 || x >= w) continue; if (weak[y * w + x]){ if (a0 < 0) a0 = x; a1 = x; } }
        if (a0 >= 0){ if (lastY >= 0 && y - lastY > h * 0.04) break; rows.push([y, (a0 + a1) / 2, a1 - a0 + 1]); lastY = y; }
      }
      if (rows.length > 6){
        const ws = rows.map(r => r[2]).sort((a, b) => a - b), sw = Math.max(2, ws[ws.length >> 1] / 2);
        for (let k = 1; k < rows.length; k++){
          const [ya, xa] = rows[k - 1], [yb, xb] = rows[k];
          for (let y = ya; y <= yb; y++){ const xc = xa + (xb - xa) * (y - ya) / Math.max(1, yb - ya);
            for (let x = Math.round(xc - sw); x <= xc + sw; x++) if (x >= 0 && x < w) m[y * w + x] = 1; }
        }
      }
    }
    m = morph(morph(m, w, h, 1, true), w, h, 1, false);
    const {lab, sizes} = components(m, w, h);
    let big = 0; for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[big]) big = i;
    const keep = new Uint8Array(sizes.length); keep[big] = 1;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[big] * 0.04) keep[i] = 1;
    // stem pieces broken by glare: keep corridor fragments too
    for (let i = 0; i < N; i++) if (m[i] && !keep[lab[i]]){ const x = i % w, y = (i / w) | 0; if (Math.abs(x - cx) <= half && y > sy1 - 2 && y <= yEnd) keep[lab[i]] = 1; }
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let i = 0; i < N; i++){ m[i] = keep[lab[i]]; if (m[i]){ const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    // only the main cluster: drop kept pieces far from the biggest one's box
    // fill enclosed holes (gaps between leaves the light shines through stay open if large)
    { const inv = new Uint8Array(N); for (let i = 0; i < N; i++) inv[i] = m[i] ? 0 : 1;
      const cc = components(inv, w, h), edge = new Set();
      for (let x = 0; x < w; x++){ edge.add(cc.lab[x]); edge.add(cc.lab[(h - 1) * w + x]); }
      for (let y = 0; y < h; y++){ edge.add(cc.lab[y * w]); edge.add(cc.lab[y * w + w - 1]); }
      for (let i = 0; i < N; i++) if (inv[i] && !edge.has(cc.lab[i]) && cc.sizes[cc.lab[i]] < sizes[big] * 0.05) m[i] = 1; }

    // 2. tone: grey levels of the plant pulled to a fixed mean/contrast
    const gray = new Float32Array(N); let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < N; i++){ const v = (0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2]) / 255; gray[i] = v; if (m[i]){ sum += v; sum2 += v * v; n++; } }
    const mu = sum / n, sd = Math.sqrt(Math.max(1e-6, sum2 / n - mu * mu));
    const tone = v => Math.min(1, Math.max(0, (v - mu) / sd * 0.14 + 0.62));

    // 3. ink lines (XDoG)
    const g1 = blur(gray, w, h, 1), g2 = blur(gray, w, h, 3);

    // 4. alpha: feathered mask, faded toward the bottom of the plant like the plates
    const mf = blur(Float32Array.from(m), w, h, 2);
    const H = Math.max(1, y1 - y0);

    const pad = 24, cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad), cx1 = Math.min(w - 1, x1 + pad), cy1 = Math.min(h - 1, y1 + pad);
    const ow = cx1 - cx0 + 1, oh = cy1 - cy0 + 1;
    const out = document.createElement("canvas"); out.width = ow; out.height = oh;
    const og = out.getContext("2d"), od = og.createImageData(ow, oh), o = od.data;
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++){
      const i = y * w + x, j = ((y - cy0) * ow + (x - cx0)) * 4;
      const fade = Math.min(1, Math.max(0, (y1 - y) / (0.05 * H)));
      const a = Math.min(1, mf[i]) * fade;
      if (a <= 0.01){ o[j + 3] = 0; continue; }
      const t = tone(gray[i]), sat = 0.78;
      // photo, calmed and warmed a little
      let r = px[i * 4] / 255, gg = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      const l = 0.3 * r + 0.59 * gg + 0.11 * b, lt = t;
      r = (l + (r - l) * sat) * (lt / Math.max(0.05, l)); gg = (l + (gg - l) * sat) * (lt / Math.max(0.05, l)); b = (l + (b - l) * sat) * (lt / Math.max(0.05, l)) * 0.95;
      // engraving tone: paper to ink by brightness
      const wr = (PAPER[0] * (0.35 + 0.65 * t) + INK[0] * (1 - t) * 0.25) / 255, wg = (PAPER[1] * (0.35 + 0.65 * t) + INK[1] * (1 - t) * 0.25) / 255, wb = (PAPER[2] * (0.35 + 0.65 * t) + INK[2] * (1 - t) * 0.25) / 255;
      let R = mix * r + (1 - mix) * wr, G = mix * gg + (1 - mix) * wg, B = mix * b + (1 - mix) * wb;
      // band-pass: a line only where the fine blur is darker than its surroundings (an edge or a vein)
      const dd = (g1[i] - g2[i]) / sd;
      const line = Math.min(1, Math.max(0, (-dd - 0.12) * 2.2));
      const ia = line * (0.35 + 0.65 * (1 - mix)) * Math.min(1, mf[i] * 1.2);
      R = R * (1 - ia) + INK[0] / 255 * ia; G = G * (1 - ia) + INK[1] / 255 * ia; B = B * (1 - ia) + INK[2] / 255 * ia;
      o[j] = Math.min(255, R * 255); o[j + 1] = Math.min(255, G * 255); o[j + 2] = Math.min(255, B * 255);
      o[j + 3] = Math.min(255, Math.max(a, ia * fade) * 255);
    }
    og.putImageData(od, 0, 0);
    return out;
  }
  window.Stylize = {plant: stylize};
})();
