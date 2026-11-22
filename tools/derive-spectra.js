// Fills the Character sliders (spectra), notes and a confidence label on public strain sheets that lack them.
// Run after adding sheets: node tools/derive-spectra.js   (edits knowledge/strains.json in place; never touches a sheet that has spectra)
// Positions come only from what the sheet already says (indica/sativa share, effects, taste, THC claim); a slider with no basis is left out.
const fs = require("fs"), path = require("path");
const file = path.join(__dirname, "..", "knowledge", "strains.json");
const list = JSON.parse(fs.readFileSync(file, "utf8"));
const clamp = v => Math.round(Math.max(0.05, Math.min(0.95, v)) * 100) / 100;
const words = x => [].concat(x || []).join(" ").toLowerCase();
function lean(g){                                   // 0 = indica, 1 = sativa, null = unknown
  const s = String(g || "").toLowerCase(), m = s.match(/(\d{2})\s*%\s*(sativa|indica)/);
  if (m) return m[2] === "sativa" ? +m[1] / 100 : 1 - +m[1] / 100;
  if (/pure sativa|sativa \(/.test(s) && !/dominant|leaning/.test(s)) return 0.85;
  if (/sativa-(dominant|leaning)|sativa dominant|mostly sativa/.test(s)) return 0.68;
  if (/indica-(dominant|leaning)|indica dominant|mostly indica/.test(s)) return 0.32;
  if (/^indica|indica \(/.test(s)) return 0.18;
  if (/hybrid|balanced/.test(s)) return 0.5;
  return null;
}
function thcNum(t){ const m = String(t || "").match(/(\d{1,2}(?:\.\d)?)\s*(?:[–-]\s*(\d{1,2}(?:\.\d)?))?\s*%/); return m ? (m[2] ? (+m[1] + +m[2]) / 2 : +m[1]) : null; }
let n = 0;
for (const x of list){
  if (x.spectra && x.spectra.length) continue;
  const L = lean(x.genetics), eff = words(x.effects), taste = words(x.taste), sp = [];
  const up = (eff.match(/energ|uplift|euphor|creativ|focus|cerebral|head|active/g) || []).length, down = (eff.match(/relax|calm|sleep|sedat|heavy|sooth|physical|body/g) || []).length;
  if (L != null || up || down){ let v = L != null ? L : 0.5; v += (up - down) * 0.08; sp.push({l: "Calm", r: "Energetic", v: clamp(v), i: "moon"}); }
  if (L != null || up || down){ let v = L != null ? 0.15 + L * 0.7 : 0.5; v += (/cerebral|head|creativ|focus/.test(eff) ? 0.08 : 0) - (/body|physical|heavy/.test(eff) ? 0.08 : 0); sp.push({l: "Body", r: "Head", v: clamp(v), i: "body"}); }
  const fr = (taste.match(/fruit|berry|citrus|lemon|orange|tangerine|grape|sweet|vanilla|cream|candy|caramel|mango|apple/g) || []).length, gs = (taste.match(/diesel|fuel|gas|skunk|cheese|earthy|pine|pepper|spicy|woody|hash|mint/g) || []).length;
  if (fr + gs) sp.push({l: "Fruity", r: "Gassy", v: clamp(0.5 + (gs - fr) / (fr + gs) * 0.4), i: "drop"});
  const t = thcNum(x.thc); if (t != null) sp.push({l: "Gentle", r: "Potent", v: clamp(t < 15 ? 0.35 : t < 20 ? 0.55 : t < 25 ? 0.72 : 0.86), i: "spark"});
  if (sp.length){ x.spectra = sp; x.spectraNote = x.spectraNote || "Placed from breeder and vendor listings (indica/sativa share, listed effects, taste, THC claim), not lab data or your own grow."; }
  if (!x.terpNote) x.terpNote = (x.terpenes || []).length ? "Terpenes as listed by vendors; no lab profile, so treat them as expectations." : "No published terpene profile found yet.";
  if (!x.confidence){ const src = (x.sources || []).length, breeder = (x.sources || []).some(s => (s.t + s.u).toLowerCase().includes(String(x.breeder || "").toLowerCase().split(" ")[0])); x.confidence = src >= 2 && breeder ? "medium" : src >= 2 ? "low–medium" : "low"; }
  n++;
}
fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
console.log("filled", n, "of", list.length);
