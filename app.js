/* Flowerphile: multi-plant grow log. Data in a private GitHub repo (plants.json, tasks.json, logs.json, changes.json, media/). */
(function(){
"use strict";
const APP = "Flowerphile";
const CFG_KEY = "tanklog-cfg", CACHE_KEY = "tanklog-cache", SEL_KEY = "ff-plant";
const BERLIN = {lat:52.4996, lon:13.4180};
/* where an outdoor plant stands: its own lat/lon (setup questions); without one, no weather in try mode
   (a newcomer shouldn't get Berlin weather); the GitHub setup keeps Berlin as its old default */
function placeOf(p){ if (p && p.lat != null && p.lon != null) return {lat:p.lat, lon:p.lon}; return isLocal() ? null : BERLIN; }

/* ---------- grow styles ---------- */
const MEDIA = {
  "hydro":       {label:"Hydro",       c:"var(--m-hydro)"},
  "living-soil": {label:"Living soil", c:"var(--m-living-soil)"},
  "soil":        {label:"Soil",        c:"var(--m-soil)"},
  "coco":        {label:"Coco",        c:"var(--m-coco)"}
};
const SYSTEMS = {dwc:"DWC", autopot:"Autopot", hand:"By hand", drip:"Drip"};
const SYSTEMS_FOR = {"hydro":["dwc"], "living-soil":["hand","autopot","drip"], "soil":["hand","autopot","drip"], "coco":["hand","autopot","drip"]};
const WHERE = {indoor:"Indoor", outdoor:"Outdoor"};
const STATUS = {active:"Active", resting:"Resting", done:"Finished"};
const F = {
  ph:{label:"pH", d:1}, ec:{label:"EC", d:1}, water:{label:"Water °C", short:"Water", d:1, unit:"°"},
  water_l:{label:"Watered L", short:"Watered", d:1, unit:" L"},
  runoff_ph:{label:"Runoff pH", d:1}, runoff_ec:{label:"Runoff EC", d:1},
  res_l:{label:"Refill L", short:"Refill", d:1, unit:" L"}, res_ph:{label:"Res. pH", d:1}, res_ec:{label:"Res. EC", d:1},
  ppfd:{label:"Light (PPFD)", short:"Light", d:0}, height:{label:"Height cm", short:"Height", d:0, unit:" cm"},
  air:{label:"Air °C", short:"Air", d:1, unit:"°"}, rh:{label:"Humidity %", short:"Humidity", d:0, unit:"%"},
  nodes:{label:"Nodes", d:0}, lamp:{label:"Lamp above rim cm", short:"Lamp", d:0, unit:" cm"},
  pot_kg:{label:"Pot weight kg (before watering)", short:"Pot", d:1, unit:" kg"},
  weight:{label:"Weight g", short:"Weight", d:0, unit:" g"}, jar_rh:{label:"Jar RH %", short:"Jar RH", d:0, unit:"%"},
  wet_g:{label:"Wet weight g", short:"Wet", d:0, unit:" g"}, dry_g:{label:"Dry weight g", short:"Dry", d:0, unit:" g"}, final_g:{label:"Final weight g", short:"Final", d:0, unit:" g"}
};
const ALL_KEYS = Object.keys(F);
const DEFAULT_TARGETS = {
  "hydro": {ph:[5.8,6.2], ec:[0.4,1.2], water:[18,23], air:[22,27], rh:[55,70], ppfd:[300,600]},
  "coco": {ph:[5.8,6.2], ec:[0.8,1.6], air:[22,27], rh:[55,70], ppfd:[300,600]},
  "soil": {ph:[6.2,6.8], ec:[0.8,1.6], air:[22,27], rh:[55,70], ppfd:[300,600]},
  "living-soil": {air:[22,27], rh:[55,70], ppfd:[300,600]}
};
/* ---------- phases: germinate, grow, dry, cure, done ---------- */
const PHASES = {germ:"Germination", grow:"Vegetative", bloom:"Bloom", dry:"Drying", cure:"Curing", done:"Finished"};
const PHASE_ORDER = ["germ","grow","bloom","dry","cure","done"];
const NEXT = {
  germ:{to:"grow", btn:"It sprouted", hint:"Sets the sprout date. Logging switches to growing values."},
  grow:{to:"bloom", btn:"Bloom started", hint:"Light flipped to 12/12, or first pistils on an autoflower. Sets the bloom date the plan and drawing count from."},
  bloom:{to:"dry", btn:"Harvest", w:"wet_g", wl:"Wet weight g (optional)", hint:"Cut and hung. Weigh before hanging if you can; drying values replace the growing ones."},
  dry:{to:"cure", btn:"Into jars", w:"dry_g", wl:"Dry weight g (optional)", hint:"When small stems snap and buds feel dry outside."},
  cure:{to:"done", btn:"Close the run", w:"final_g", wl:"Final weight g (optional)", hint:"Last weigh-in and a verdict. The run summary stays with this plant."}
};
const VERDICTS = ["Meh","OK","Good","Great","Best yet"];
const DRY_TARGETS = {air:[15,21], rh:[55,62]}, CURE_TARGETS = {jar_rh:[58,63]};
function phaseOf(p){
  if (!p) return "grow";
  if (p.phase && p.phase !== "grow") return p.phase;
  const f = p.flip || (p.phases && p.phases.bloom);
  if (f && today() >= f) return "bloom";
  if (p.phase) return p.phase;
  if (p.status === "done") return "done";
  if (p.start && !p.sprout) return "germ";
  return "grow";
}
function phaseStart(p, ph){ const d = p.phases || {}; if (d[ph]) return d[ph]; if (ph === "germ") return p.start || null; if (ph === "grow") return p.sprout || null; if (ph === "bloom") return p.flip || null; return null; }
function targetsOf(p){
  const ph = phaseOf(p);
  if (ph === "dry") return Object.assign({}, DRY_TARGETS, p.dryTargets);
  if (ph === "cure" || ph === "done") return Object.assign({}, DRY_TARGETS, CURE_TARGETS, p.cureTargets);
  return p.targets || {};
}
/* stage in days only (no weeks anywhere): "Veg · day 21" counted from the sprout, "Bloom · day 9" from the flip */
function stageText(p){
  const ph = phaseOf(p), T = today(), f = flipOf(p);
  if (ph === "bloom" && f) return "Bloom · day " + (daysBetween(f, T) + 1);
  if (ph === "grow" && p.sprout) return "Veg · day " + (daysBetween(p.sprout, T) + 1);
  return PHASES[ph] || "";
}
function flipOf(p){ return p.flip || (p.phases && p.phases.bloom) || (p.stage === "flower" ? p.flipEst : null); }

function fieldsFor(p){
  const ph = phaseOf(p);
  if (ph === "germ" || ph === "done") return [];
  if (ph === "dry") return ["weight"];
  if (ph === "cure") return ["jar_rh","weight"];
  const m = p.medium || "hydro", sys = p.system || "hand", indoor = (p.where || "indoor") === "indoor";
  let k;
  if (m === "hydro") k = ["ph","ec","water"];
  else {
    k = sys === "autopot" ? ["res_l"] : ["water_l"];
    if (m === "coco") k.push(...(sys === "autopot" ? ["res_ph","res_ec"] : ["ph","ec"]), "runoff_ec");
    if (m === "soil") k.push(...(sys === "autopot" ? ["res_ph","res_ec"] : ["ph","ec"]), "runoff_ph");
    if ((m === "soil" || m === "living-soil") && sys !== "autopot") k.push("pot_kg");   // optional; feel works too
  }
  if (indoor) k.push("ppfd");
  k.push("height","nodes");
  return uiFields(p, window.Branch ? Branch.fields(p, S.profile, k) : k);
}
/* per-plant screen overrides set by the grower's AI (plant.ui = {tiles:[keys], fields:{add, hide}, custom:[{key,label,short,unit,d}], chips:[…]}) */
function uiFields(p, k){
  const u = p && p.ui && p.ui.fields; if (!u) return k;
  k = k.filter(x => !(u.hide || []).includes(x));
  for (const x of u.add || []) if (F[x] && !k.includes(x)) k.push(x);
  return k;
}
function registerCustom(){
  for (const p of S.plants || []) for (const c of (p.ui && p.ui.custom) || []){
    if (!c || !c.key || (F[c.key] && !F[c.key].custom)) continue;
    F[c.key] = {label: c.label, short: c.short || c.label, d: c.d ?? 1, unit: c.unit || "", custom: true};
    if (!ALL_KEYS.includes(c.key)) ALL_KEYS.push(c.key);
  }
}
function labelFor(p, k, short){
  const d = F[k]; let l = short ? (d.short || d.label) : d.label;
  if (p && p.medium !== "hydro" && (k === "ph" || k === "ec")) l += " in";
  return l;
}
function actionsFor(p){
  const m = p.medium || "hydro", indoor = (p.where || "indoor") === "indoor", auto = p.system === "autopot", ph = phaseOf(p);
  if (ph === "germ") return ["Soaked","Paper towel","Tail visible","Planted","Broke surface"];
  if (ph === "dry") return ["Hung","Rotated","Bucked","Trimmed","Stems snap","Still bendy","Result photo","Sensor moved"];
  if (ph === "cure") return ["Burped","Humidity pack in","Jar changed","Smell check","Long storage","Result photo","Sensor moved"];
  if (ph === "done") return ["Smell check","Jar changed","Result photo","Sensor moved"];
  if (window.Branch) return [...new Set(Branch.chips(p).concat((p.ui && p.ui.chips) || []))];
  let a;
  if (m === "hydro") a = ["Fed","Topped off","Water change","pH adjusted","Trimmed","Trained"];
  else if (m === "living-soil") a = [auto ? "Reservoir refilled" : "Watered","Top-fed","Tea / amended","Trimmed","Trained","Pest check"];
  else a = [auto ? "Reservoir refilled" : "Watered","Fed","Flushed","Trimmed","Trained","Pest check"];
  if (indoor) a.push("Light changed","Sensor moved"); else a.push("Sheltered");
  return a;
}

const S = { cfg:null, plants:[], tasks:[], logs:[], changes:[], sel:null, actions:new Set(), edit:null, armDel:null, synced:null, busy:false, weather:{}, plantEdit:null, pf:{} };
const $ = s => document.querySelector(s);

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  for (const [a,v] of Object.entries(attrs||{})){
    if (v == null || v === false) continue;
    if (a === "class") el.className = v;
    else if (a.startsWith("on")) el.addEventListener(a.slice(2), v);
    else el.setAttribute(a, v === true ? "" : v);
  }
  for (const k of kids.flat()){ if (k == null || k === false) continue; el.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return el;
}
const pad = n => String(n).padStart(2,"0");
const ymd = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseYmd = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const daysBetween = (a,b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const today = () => ymd(new Date());
const addDays = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return ymd(x); };
const short = s => parseYmd(s).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
const hm = iso => { const d = new Date(iso); return pad(d.getHours())+":"+pad(d.getMinutes()); };
/* A2: durations in days only; "9–10 weeks (~67 days)" → "63–70 days (~67)" */
function daysOnly(v){
  if (typeof v !== "string") return v;
  let t = v.replace(/(\d+)\s*[–-]\s*(\d+)\s*weeks?/gi, (m, a, b) => (a * 7) + "–" + (b * 7) + " days").replace(/(\d+)\s*weeks?/gi, (m, a) => (a * 7) + " days");
  return t.replace(/ days \(~(\d+) days\)/, " days (~$1)");
}
function flowerDays(v){ if (typeof v === "number") return v; const t = daysOnly(String(v)), m = t.match(/~(\d+)/) || t.match(/(\d+)\s*[–-]\s*(\d+)/) || t.match(/(\d+)/); return m ? (m[2] ? Math.round((+m[1] + +m[2]) / 2) : +m[1]) : null; }
function fmtDay(s){
  if (!s) return "";
  const diff = daysBetween(today(), s);
  if (diff === 0) return "Today"; if (diff === 1) return "Tomorrow"; if (diff === -1) return "Yesterday";
  const str = parseYmd(s).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  return diff < 0 ? str + " (late)" : str;
}
function fmtTime(iso){ const d = new Date(iso); return d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}) + ", " + hm(iso); }
function ago(iso){
  const ms = Date.now() - new Date(iso).getTime(), hrs = ms / 36e5;
  if (hrs < 1) return "just now"; if (hrs < 24) return Math.round(hrs) + " h ago";
  const d = Math.floor(hrs / 24); return d === 1 ? "1 day ago" : d + " days ago";
}
function num(v){ if (v == null || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; }
const fmtv = (k, v) => v.toFixed(F[k] ? F[k].d : 1) + ((F[k] && F[k].unit) || "");
const plantOf = x => x.run || x.plant || "tank1";
function sel(){ return S.plants.find(p => p.id === S.sel) || S.plants[0] || null; }
const mine = list => { const p = sel(); return p ? list.filter(x => plantOf(x) === p.id) : []; };
const colorOf = p => (MEDIA[p.medium] || MEDIA.hydro).c;


/* ---------- botanical look: theme, frames, washes, background ---------- */
const GLYPHS = {"0": "<ellipse cx=\"15\" cy=\"24\" rx=\"5\" ry=\"6.5\" stroke-width=\"0.9\"/><path d=\"M15 18 v12\" stroke-width=\"0.4\"/>", "1": "<path d=\"M15 32 V18\" stroke-width=\"1\"/><path d=\"M15 19 c -5 -3, -9 -1, -9 1 c 3 2, 6 2, 9 -1 Z M15 19 c 5 -3, 9 -1, 9 1 c -3 2, -6 2, -9 -1 Z\" stroke-width=\"0.8\"/>", "2": "<path d=\"M15 32 V10\" stroke-width=\"1\"/><path d=\"M15 24 l -8 -4 M15 24 l 8 -4 M15 16 l -9 -5 M15 16 l 9 -5 M15 16 l -6 -9 M15 16 l 6 -9\" stroke-width=\"0.9\"/>", "3": "<path d=\"M15 32 V4\" stroke-width=\"1.1\"/><path d=\"M15 27 l -11 -3 M15 27 l 11 -3 M15 19 l -11 -4 M15 19 l 11 -4 M15 19 l -8 -9 M15 19 l 8 -9 M15 11 l -7 -3 M15 11 l 7 -3\" stroke-width=\"0.9\"/>", "4": "<path d=\"M15 32 V6\" stroke-width=\"1.1\"/><path d=\"M15 27 l -10 -3 M15 27 l 10 -3 M15 19 l -9 -4 M15 19 l 9 -4\" stroke-width=\"0.8\"/><circle cx=\"15\" cy=\"8\" r=\"3.5\" stroke-width=\"0.9\"/><circle cx=\"10\" cy=\"14\" r=\"2.4\" stroke-width=\"0.8\"/><circle cx=\"20\" cy=\"14\" r=\"2.4\" stroke-width=\"0.8\"/>", "5": "<path d=\"M6 6 h18\" stroke-width=\"0.9\"/><path d=\"M11 6 v18 M19 6 v14\" stroke-width=\"0.8\"/><circle cx=\"11\" cy=\"26\" r=\"3\" stroke-width=\"0.8\"/><circle cx=\"19\" cy=\"22\" r=\"3\" stroke-width=\"0.8\"/>"};
const THEME_KEY = "ff-theme";
function themePref(){ try { return localStorage.getItem(THEME_KEY) || "plant"; } catch(e){ return "auto"; } }
const darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
function applyTheme(){
  const pref = themePref();
  let night = pref === "night" || (pref === "auto" && darkMQ && darkMQ.matches);
  if (pref === "plant"){ const pn = S && S.plants ? plantNight(sel()) : null; night = pn ? pn.night : !!(darkMQ && darkMQ.matches); }
  document.documentElement.dataset.theme = night ? "night" : "day";
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = night ? "#17140F" : "#F0E6CC";
  decorateSoon();
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", applyTheme);
setInterval(() => { if (themePref() === "plant") applyTheme(); }, 60e3);
function raw(html){ const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'+
 '<filter id="rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>'+
 '<filter id="wash" x="-20%" y="-30%" width="140%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="8"/><feDisplacementMap in="SourceGraphic" scale="7"/><feGaussianBlur stdDeviation="0.7"/></filter>'+
 '<radialGradient id="dropg" cx=".42" cy=".64" r=".62" fx=".34" fy=".56"><stop offset="0" style="stop-color:var(--soak);stop-opacity:.25"/><stop offset=".62" style="stop-color:var(--soak);stop-opacity:.7"/><stop offset="1" style="stop-color:var(--soakline);stop-opacity:.95"/></radialGradient>'+
 '<linearGradient id="soakg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--soak);stop-opacity:.10"/><stop offset=".55" style="stop-color:var(--soak);stop-opacity:.2"/><stop offset="1" style="stop-color:var(--soak);stop-opacity:.36"/></linearGradient>'+
 '<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="2"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.10"/></feComponentTransfer></filter>'+
 '</defs></svg>';
document.body.prepend(raw(DEFS));
function rnd(seed){ let x = Math.sin(seed) * 10000; return () => { x = Math.sin(x) * 10000; return x - Math.floor(x); }; }
function washSVG(color, op){ return '<svg aria-hidden="true" viewBox="0 0 100 40" preserveAspectRatio="none"><ellipse cx="50" cy="20" rx="47" ry="17" style="fill:'+color+';fill-opacity:'+(op||0.6)+'" filter="url(#wash)"/></svg>'; }
function washSpan(word, cls){ const col = {ok:"var(--ok)", low:"var(--low)", high:"var(--high)"}[cls]; const sp = h("span",{class:"wash"}); if (col) sp.append(raw(washSVG(col))); sp.append(h("span",null,word)); return sp; }
/* Frames are engraved plate borders: a ruled outer line whose ends cross at the corners, a hairline inside,
   and a hatched band on the right and bottom that gives the plate depth. The medium soaks into the band only. */
const F1 = n => n.toFixed(1);
function ruled(r, x0, y0, x1, y1){             // one hand-ruled line: tiny bow, ends that overshoot or stop short
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, a = r() * 3.2 - 0.6, b = r() * 3.2 - 0.6, bow = (r() - 0.5) * Math.min(1.6, L / 120);
  const sx = x0 - ux * a, sy = y0 - uy * a, ex = x1 + ux * b, ey = y1 + uy * b, mx = (sx + ex) / 2 - uy * bow, my = (sy + ey) / 2 + ux * bow;
  return `M${F1(sx)} ${F1(sy)}Q${F1(mx)} ${F1(my)} ${F1(ex)} ${F1(ey)}`;
}
function rect4(r, x0, y0, x1, y1){ return ruled(r, x0, y0, x1, y0) + ruled(r, x1, y0, x1, y1) + ruled(r, x1, y1, x0, y1) + ruled(r, x0, y1, x0, y0); }
/* a water drop drawn properly: ink outline, tinted body, a shadowed crescent on the lower right,
   a bright window top left with a pin highlight, and a soft cast shadow. Hanging drops keep a neck to the edge. */
function dropSVG(r, x, y, s, o){
  o = o || {}; const hang = o.hang, k = s;
  const tipY = hang ? y : y - k * 1.9, belly = hang ? y + k * 2.2 : y, neck = hang ? k * 0.32 : 0;
  const d = `M${F1(x - neck)} ${F1(tipY)}C${F1(x - neck - k * 0.15)} ${F1(tipY + k * 0.6)} ${F1(x - k)} ${F1(belly - k * 0.55)} ${F1(x - k)} ${F1(belly)}` +
            `A${F1(k)} ${F1(k * 0.95)} 0 0 0 ${F1(x + k)} ${F1(belly)}C${F1(x + k)} ${F1(belly - k * 0.55)} ${F1(x + neck + k * 0.15)} ${F1(tipY + k * 0.6)} ${F1(x + neck)} ${F1(tipY)}Z`;
  let g = "";
  if (!hang) g += `<ellipse cx="${F1(x + k * 0.45)}" cy="${F1(belly + k * 0.92)}" rx="${F1(k * 1.1)}" ry="${F1(k * 0.26)}" style="fill:var(--soakline)" opacity=".22"/>`;
  g += `<path d="${d}" style="fill:url(#dropg);stroke:none"/>`;
  // engraved shading: short curved strokes following the belly on the dark side
  let hp = ""; for (let i = 0; i < 4; i++){ const rr = k * (0.58 + i * 0.1), a0 = -0.35 + i * 0.12, a1 = a0 + 1.0 - i * 0.12;
    hp += `M${F1(x + Math.cos(a0) * rr)} ${F1(belly + Math.sin(a0) * rr * 0.95)}A${F1(rr)} ${F1(rr * 0.95)} 0 0 1 ${F1(x + Math.cos(a1) * rr)} ${F1(belly + Math.sin(a1) * rr * 0.95)}`; }
  g += `<path d="${hp}" style="stroke:var(--soakline);fill:none" stroke-width="${F1(Math.max(0.2, k * 0.05))}" stroke-linecap="round" opacity=".85"/>`;
  g += `<path d="${d}" style="stroke:var(--ink);fill:none" stroke-width="${F1(Math.max(0.3, k * 0.07))}" stroke-linejoin="round"/>`;
  g += `<path d="M${F1(x + k)} ${F1(belly - k * 0.1)}A${F1(k)} ${F1(k * 0.95)} 0 0 1 ${F1(x - k * 0.2)} ${F1(belly + k * 0.94)}" style="stroke:var(--ink);fill:none" stroke-width="${F1(Math.max(0.45, k * 0.15))}" stroke-linecap="round"/>`;
  if (hang) g += `<path d="M${F1(x - neck - k * 0.5)} ${F1(tipY)}Q${F1(x - neck)} ${F1(tipY)} ${F1(x - neck - k * 0.05)} ${F1(tipY + k * 0.35)}M${F1(x + neck + k * 0.5)} ${F1(tipY)}Q${F1(x + neck)} ${F1(tipY)} ${F1(x + neck + k * 0.05)} ${F1(tipY + k * 0.35)}" style="stroke:var(--ink);fill:none" stroke-width="${F1(Math.max(0.3, k * 0.07))}"/>`;
  // window highlight upper left, a pin of light, and the bright rim light inside the lower edge
  g += `<ellipse cx="${F1(x - k * 0.42)}" cy="${F1(belly - k * 0.3)}" rx="${F1(k * 0.2)}" ry="${F1(k * 0.42)}" transform="rotate(28 ${F1(x - k * 0.42)} ${F1(belly - k * 0.3)})" style="fill:var(--paper)" opacity=".95"/>`;
  g += `<circle cx="${F1(x - k * 0.08)}" cy="${F1(belly - k * 0.66)}" r="${F1(k * 0.09)}" style="fill:var(--paper)" opacity=".9"/>`;
  g += `<path d="M${F1(x - k * 0.55)} ${F1(belly + k * 0.62)}A${F1(k * 0.8)} ${F1(k * 0.75)} 0 0 0 ${F1(x + k * 0.5)} ${F1(belly + k * 0.6)}" style="stroke:var(--paper);fill:none" stroke-width="${F1(Math.max(0.3, k * 0.1))}" opacity=".7"/>`;
  return g;
}
function frameSVG(w, hgt, o){
  const r = rnd(o.seed || 1), med = o.medium || "hydro", X = 8, Y = 8, W = w + 16, H = hgt + 16;
  const ring = `M${X+3} ${Y+3}h${w-6}v${hgt-6}h${-(w-6)}Z M${X+7} ${Y+7}h${w-14}v${hgt-14}h${-(w-14)}Z`;
  const id = "c" + Math.floor(r()*1e9), bx = id + "b";
  const ox0 = X + 3, oy0 = Y + 3, ox1 = X + w - 3, oy1 = Y + hgt - 3, ix0 = X + 7, iy0 = Y + 7, ix1 = X + w - 7, iy1 = Y + hgt - 7;
  const soak = o.soak || 0, wet = med === "hydro" && soak > 0;
  // swelling: soaked paper buckles; the bottom rule sags in two or three soft bellies and the sides bow out near the bottom
  const bumps = []; if (wet){ const n = 2 + (r() < 0.5 ? 1 : 0); for (let i = 0; i < n; i++) bumps.push({c: ox0 + (i + 0.3 + r() * 0.4) / n * (ox1 - ox0), a: (1.5 + r() * 2) * Math.min(1, 0.45 + soak), s: 9 + r() * 12}); }
  const sag = x => bumps.reduce((t, b) => t + b.a * Math.exp(-Math.pow((x - b.c) / b.s, 2)), 0);
  const bow = y => wet ? Math.max(0, (y - (oy1 - hgt * soak * 0.8)) / (hgt * soak * 0.8 + 1)) * 1.1 * soak : 0;
  const line = (pts, ov) => { let d = ""; pts.forEach((p, i) => d += (i ? "L" : "M") + F1(p[0] + (r() - 0.5) * 0.25) + " " + F1(p[1] + (r() - 0.5) * 0.25)); return d; };
  const side = (x, y0, y1, dir) => { const pts = []; for (let y = y0 - r() * 2.5; y <= y1 + r() * 2.5; y += 6) pts.push([x + dir * bow(y), y]); return line(pts); };
  const bottom = (y, k, x0, x1) => { const pts = []; for (let x = x0 - r() * 2.5; x <= x1 + r() * 2.5; x += 4) pts.push([x, y + sag(x) * k]); return line(pts); };
  const outer = ruled(r, ox0, oy0, ox1, oy0) + side(ox1, oy0, oy1, 1) + bottom(oy1, 1, ox0, ox1) + side(ox0, oy0, oy1, -1);
  const inner = ruled(r, ix0, iy0, ix1, iy0) + side(ix1, iy0, iy1, 0.6) + bottom(iy1, 0.6, ix0, ix1) + side(ix0, iy0, iy1, -0.6);
  let back = "", front = "";
  if (soak > 0){
    // an organic tide: slow swell, small ripple, and capillary fingers creeping upward
    const hy = Y + hgt * (1 - Math.min(0.4, soak * 0.82)), ph = r() * 6, ph2 = r() * 6;
    const lobes = []; for (let i = 0; i < 2 + Math.floor(r() * 3); i++) lobes.push({c: r() * W, h: 2 + r() * (wet ? 7 : 5), s: 3 + r() * 8});
    const tideAt = x => hy + 2.4 * Math.sin(x / 14 + ph) + 1.1 * Math.sin(x / 4.3 + ph2) - lobes.reduce((t, l) => t + l.h * Math.exp(-Math.pow((x - l.c) / l.s, 2)), 0);
    let tide = ""; for (let x = 0; x <= W; x += 2.5) tide += (x ? "L" : "M") + F1(x) + " " + F1(tideAt(x));
    const fillD = `${tide} L${W} ${H + 6} L0 ${H + 6}Z`;
    let cb = `M${ox0} ${oy0}H${ox1}`; for (let x = ox1; x >= ox0; x -= 3) cb += `L${F1(x + bow(oy1))} ${F1(oy1 + sag(x))}`;
    back += `<defs><clipPath id="${bx}"><path d="${cb}Z"/></clipPath></defs>`;
    back += `<g clip-path="url(#${bx})"><path d="${fillD}" style="fill:url(#soakg)" filter="url(#wash)"/>`;
    // a darker bloom where the wet edge dried, and a second fainter tidemark a little lower
    back += `<path d="${tide}" style="stroke:var(--soak);fill:none" stroke-width="2.6" opacity="${(0.25 + 0.3 * soak).toFixed(2)}" filter="url(#wash)"/>`;
    back += `<path d="${tide}" style="stroke:var(--soakline);fill:none" stroke-width=".45" opacity="${(0.25 + 0.35 * soak).toFixed(2)}" filter="url(#rough)"/>`;
    back += `<path d="${tide}" transform="translate(0 ${F1(4 + r() * 5)})" style="stroke:var(--soakline);fill:none" stroke-width=".35" opacity=".18" filter="url(#rough)"/></g>`;
    back += `<path d="${fillD}" style="fill:var(--soak);fill-opacity:${(0.18 + 0.3 * soak).toFixed(2)}" filter="url(#wash)" clip-path="url(#${id})"/>`;   // the frame band drinks more
    if (wet){
      // cockles in the swollen paper and drops forming at the low points of the sag
      let ck = ""; for (const b of bumps){ ck += `M${F1(b.c - b.s)} ${F1(oy1 - 3 - b.a)}Q${F1(b.c)} ${F1(oy1 - 6 - b.a * 2)} ${F1(b.c + b.s)} ${F1(oy1 - 3 - b.a)}`; }
      back += `<path d="${ck}" style="stroke:var(--soakline);fill:none" stroke-width=".35" opacity=".22"/>`;
      bumps.sort((a, b) => b.a - a.a);
      bumps.forEach((b, i) => { if (i > (soak > 0.4 ? 1 : 0)) return; const s = 1.6 + b.a * 0.6;
        front += dropSVG(r, b.c, oy1 + b.a - 0.6, s, {hang: true});
        if (i === 0 && soak > 0.4){ const fy = oy1 + b.a + s * 2.2 + 7 + r() * 4; front += dropSVG(r, b.c + 0.3, fy, s * 0.5);
          front += `<path d="M${F1(b.c - 0.7)} ${F1(fy - s * 1.4)}v-2M${F1(b.c + 1)} ${F1(fy - s * 1.2)}v-1.2" style="stroke:var(--soakline)" stroke-width=".3" opacity=".6"/>`; } });
    } else {
      // dirt: stipple and grit settling toward the bottom and spilling over the bottom rule
      let st = ""; const n = Math.round(320 * soak) + 40;
      for (let i = 0; i < n; i++){ const x = X + 1 + r() * (w - 2), y = oy1 + 2 - Math.pow(r(), 2.2) * (oy1 - hy); st += `M${F1(x)} ${F1(y)}h.01`; }
      back += `<path d="${st}" style="stroke:var(--soakline)" stroke-width="${med === "coco" ? 0.8 : 1.1}" stroke-linecap="round" opacity=".55" clip-path="url(#${bx})"/>`;
      // a smudged thumbprint near a lower corner on some tiles
      if (r() < 0.45){ const cx = r() < 0.5 ? ox0 + 8 + r() * 10 : ox1 - 8 - r() * 10, cy = oy1 - 6 - r() * 6; let fp = "";
        for (let k = 1; k <= 6; k++){ const a0 = r() * 6, span = 3.2 + r() * 2; fp += `M${F1(cx + Math.cos(a0) * k * 1.3)} ${F1(cy + Math.sin(a0) * k * 1.6)}A${F1(k * 1.3)} ${F1(k * 1.6)} 0 ${span > 3.14 ? 1 : 0} 1 ${F1(cx + Math.cos(a0 + span) * k * 1.3)} ${F1(cy + Math.sin(a0 + span) * k * 1.6)}`; }
        back += `<ellipse cx="${F1(cx)}" cy="${F1(cy)}" rx="9" ry="11" style="fill:var(--soak)" opacity=".22" filter="url(#wash)"/><path d="${fp}" style="stroke:var(--soakline);fill:none" stroke-width=".4" opacity=".35"/>`; }
      if (med === "coco"){                  // coir fibres caught across the bottom rule
        let fb = ""; for (let i = 0; i < 4 + Math.round(10 * soak); i++){ const x = ox0 + r() * (ox1 - ox0), y = oy1 - 2 - r() * 4, a = (r() < 0.5 ? 1 : -1) * (0.3 + r() * 0.9), L = 5 + r() * 9;
          fb += `M${F1(x)} ${F1(y)}q${F1(Math.cos(a) * L / 2 + (r() - 0.5) * 3)} ${F1(Math.abs(Math.sin(a)) * L / 2 + 1)} ${F1(Math.cos(a) * L)} ${F1(Math.abs(Math.sin(a)) * L + 1)}`; }
        front += `<path d="${fb}" style="stroke:var(--soakline);fill:none" stroke-width=".5" opacity=".85"/>`;
      }
      // crumbs resting on the bottom rule and in the lower band, each with a lit top
      for (let i = 0; i < 3 + Math.round(6 * soak); i++){ const x = ox0 + 3 + r() * (ox1 - ox0 - 6), s = 1.1 + r() * 1.7, y = (r() < 0.6 ? oy1 - s * 0.5 : oy1 - 2 - r() * 4); let cp = "";
        for (let k = 0; k < 7; k++){ const a = k / 7 * 6.283, rr = s * (0.7 + r() * 0.5); cp += (k ? "L" : "M") + F1(x + Math.cos(a) * rr) + " " + F1(y + Math.sin(a) * rr * 0.75); }
        front += `<path d="${cp}Z" style="fill:var(--soakline);stroke:var(--ink)" stroke-width=".3" opacity=".9"/><path d="M${F1(x - s * 0.5)} ${F1(y - s * 0.25)}q${F1(s * 0.4)} ${F1(-s * 0.4)} ${F1(s * 0.8)} ${F1(-s * 0.1)}" style="stroke:var(--paper);fill:none" stroke-width=".35" opacity=".8"/>`; }
      // a few flecks flicked outward
      let sp = ""; for (let i = 0; i < 6; i++){ const x = ox0 + r() * (ox1 - ox0), y = oy1 + 2 + r() * 6; sp += `M${F1(x)} ${F1(y)}h.01`; }
      front += `<path d="${sp}" style="stroke:var(--soakline)" stroke-width="${F1(0.8 + r())}" stroke-linecap="round" opacity=".6"/>`;
    }
  }
  if (o.warm > 0){
    back += `<path d="M0 ${Y-8} H${W} V${Y+6+8*o.warm} Q ${W/2} ${Y+2+4*o.warm} 0 ${Y+6+8*o.warm}Z" style="fill:var(--warm);fill-opacity:${(0.35+0.35*o.warm).toFixed(2)}" filter="url(#wash)" clip-path="url(#${id})"/>`;
    let wv = ""; for (let i = 0; i < Math.round(5*o.warm); i++){ const x = X + 10 + r()*(w-20); wv += `M${F1(x)} ${Y+1}c${F1(-2 + r())} -2 ${F1(2 + r())} -3 0 -5s-2 -3 0 -5`; }
    front += `<path d="${wv}" style="stroke:var(--ink);fill:none" stroke-width=".4" opacity=".7"/>`;
  }
  if (o.frost > 0){ let fz = ""; for (let i = 0; i < 3 + Math.round(3*o.frost); i++){ const x = X + 8 + r()*(w-16), y = Y + 1 + r()*5, rr = 2.2 + r()*1.8;
    for (let k = 0; k < 6; k++){ const a = k*Math.PI/3, ex = x + rr*Math.cos(a), ey = y + rr*Math.sin(a), mx = x + rr*0.55*Math.cos(a), my = y + rr*0.55*Math.sin(a);
      fz += `M${F1(x)} ${F1(y)}L${F1(ex)} ${F1(ey)}M${F1(mx)} ${F1(my)}l${F1(rr*0.3*Math.cos(a+0.8))} ${F1(rr*0.3*Math.sin(a+0.8))}M${F1(mx)} ${F1(my)}l${F1(rr*0.3*Math.cos(a-0.8))} ${F1(rr*0.3*Math.sin(a-0.8))}`; } }
    front += `<path d="${fz}" style="stroke:var(--ink);fill:none" stroke-width=".35"/>`; }
  let hb = ""; for (let y = iy0 + 2; y < oy1; y += 1.7) hb += `M${F1(ix1 + 0.4 + bow(y) * 0.6)} ${F1(y + 1.6)}l${F1(ox1 - ix1 - 0.8 + bow(y) * 0.4)} -1.6`;
  for (let x = ix0 + 2; x < ox1; x += 1.7) hb += `M${F1(x)} ${F1(iy1 + 0.4 + sag(x) * 0.6)}l1.6 ${F1(oy1 - iy1 - 0.8 + sag(x) * 0.4)}`;
  let tip = "";
  if (o.state === "ok") tip = `<path d="M${X+w-8} ${Y+3} c 4 -6, 10 -6, 12 -1 c 1 4, -3 6, -5 4" stroke-width="0.8"/><path d="M${X+w-2} ${Y-2} c 2 -4, 6 -4, 7 -2 c -1 3, -4 3, -7 2 Z" style="fill:var(--ok);fill-opacity:.85" stroke-width="0.55"/><path d="M${X+w-2} ${Y-2} q 3.5 -1.4 6.6 -2" stroke-width=".3"/>`;
  return `<svg class="frame" aria-hidden="true" viewBox="0 0 ${W} ${H}"><defs><clipPath id="${id}"><path d="${ring}" clip-rule="evenodd"/></clipPath></defs>${back}` +
    `<g fill="none" style="stroke:var(--ink)" stroke-linecap="round" stroke-linejoin="round"><path d="${hb}" stroke-width=".3" opacity=".55"/>` +
    `<path d="${outer}" stroke-width="1.15"/><path d="${inner}" stroke-width=".42"/>` +
    `<path d="M${ox0} ${oy0}L${ix0} ${iy0}M${ox1} ${oy0}L${ix1} ${iy0}M${ox1} ${oy1 + sag(ox1)}L${ix1} ${iy1}M${ox0} ${oy1 + sag(ox0)}L${ix0} ${iy1}" stroke-width=".35" opacity=".7"/>${tip}</g>${front}</svg>`;
}
function previewPlant(){ return location.hash.startsWith("#plant") && S.pf && S.pf.medium ? {medium:S.pf.medium, where:S.pf.where} : null; }
function decorate(){
  const pv = previewPlant(), p = pv || sel(); const med = p ? (p.medium || "hydro") : "hydro";
  document.documentElement.style.setProperty("--c", p ? colorOf(p) : "var(--ink)");
  document.documentElement.dataset.medium = med;
  document.querySelectorAll(".fr").forEach((el, i) => {
    if (FR_RO && !el._ro){ el._ro = 1; FR_RO.observe(el); }   // redraw the frame whenever the panel changes size (unhidden, content grew)
    const b = el.getBoundingClientRect(); if (!b.width) return;
    const key = [Math.round(b.width), Math.round(b.height), el.dataset.soak, el.dataset.warm, el.dataset.frost, el.dataset.state, med, document.documentElement.dataset.theme].join("|");
    if (el._fk === key) return; el._fk = key;
    const old = el.querySelector(":scope > svg.frame"); if (old) old.remove();
    el.prepend(raw(frameSVG(Math.round(b.width), Math.round(b.height), {soak:+el.dataset.soak||0, warm:+el.dataset.warm||0, frost:+el.dataset.frost||0, state:el.dataset.state, medium:med, seed:i+1})));
  });
  drawBackground(p);
}
let decoTimer = null;
const FR_RO = window.ResizeObserver ? new ResizeObserver(() => decorateSoon()) : null;
function decorateSoon(){ clearTimeout(decoTimer); decoTimer = setTimeout(() => requestAnimationFrame(decorate), 30); }
addEventListener("resize", decorateSoon);
document.addEventListener("toggle", decorateSoon, true);
/* ---------- background: engraved plate, atmosphere on top, medium at the bottom ---------- */
function drawBackground(p){
  const bg = $("#bg"); const W = innerWidth, H = innerHeight;
  const ph = p ? phaseOf(p) : "grow", indoorGrow = p && p.where !== "outdoor" && ["germ","grow","bloom"].includes(ph);
  const outdoor = p && p.where === "outdoor" && !["dry","cure","done"].includes(ph);
  let wx = {};
  if (outdoor && placeOf(p)){ const pl = placeOf(p), w = S.weather[pl.lat+","+pl.lon], c = w && w.j.current || {}, d = w && w.j.daily || {};
    wx = {cloud: c.cloud_cover, rain: (d.precipitation_sum && d.precipitation_sum[0]) || 0, gust: (d.wind_gusts_10m_max && d.wind_gusts_10m_max[0]) || 0}; }
  const warm = indoorGrow && (latestSensor() || {}).temp > ((targetsOf(p).air || [0, 99])[1]);
  const pn = indoorGrow ? plantNight(p) : null, lit = indoorGrow ? (pn ? !pn.night : document.documentElement.dataset.theme !== "night") : true;   // A1: no glow while the lamp is off
  const key = [W, H, p && p.id, ph, p && p.medium, indoorGrow, outdoor, JSON.stringify(wx), warm, lit, document.documentElement.dataset.theme].join("|");
  if (bg._k === key) return; bg._k = key;
  const art = window.BgArt ? BgArt.draw({W, H, scene: indoorGrow ? "indoor" : outdoor ? "outdoor" : "none", medium: p ? (p.medium || "hydro") : "hydro", phase: ph, warm, lit, weather: wx, night: document.documentElement.dataset.theme === "night", seed: p ? seedOf(p) : 11}) : {defs:"", top:"", bottom:"", by: H - 175};
  const by = art.by;
  bg.setAttribute("viewBox", `0 0 ${W} ${H}`); bg.setAttribute("width", W); bg.setAttribute("height", H);
  bg.innerHTML = `<defs>${art.defs}<linearGradient id="zone" x1="0" y1="0" x2="0" y2="1"><stop offset="0.6" style="stop-color:var(--tint);stop-opacity:0"/><stop offset="1" style="stop-color:var(--tint);stop-opacity:0.55"/></linearGradient>`+
    `<linearGradient id="fadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="0.75" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`+
    `<linearGradient id="fadeBot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.25" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff"/></linearGradient>`+
    `<mask id="mTop" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="240"><rect width="${W}" height="240" fill="url(#fadeTop)"/></mask>`+
    `<mask id="mBot" maskUnits="userSpaceOnUse" x="0" y="${by - 10}" width="${W}" height="${H - by + 10}"><rect y="${by - 10}" width="${W}" height="${H - by + 10}" fill="url(#fadeBot)"/></mask></defs>`+
    `<rect width="${W}" height="${H}" filter="url(#paper)"/><rect width="${W}" height="${H}" fill="url(#zone)"/>`+
    `<g fill="none" style="stroke:var(--ink)" stroke-linecap="round" stroke-linejoin="round"><g mask="url(#mTop)" opacity="0.8">${art.top}</g><g mask="url(#mBot)" opacity="0.85">${art.bottom}</g></g>`;
}
function stageIndex(p){
  if (!p) return 0; const T = today();
  if (p.status === "done") return 5;
  if (p.stage === "flower" || (p.flipEst && T >= p.flipEst && p.stage !== "growth")) return 4;
  if (!p.sprout || T < p.sprout) return p.start && T >= p.start ? 0 : 0;
  const d = daysBetween(p.sprout, T);
  return d < 7 ? 1 : d < 21 ? 2 : 3;
}

/* ---------- GitHub store ---------- */
function loadCfg(){ try { return JSON.parse(localStorage.getItem(CFG_KEY) || "null"); } catch(e){ return null; } }
function saveCfg(c){ try { c ? localStorage.setItem(CFG_KEY, JSON.stringify(c)) : localStorage.removeItem(CFG_KEY); } catch(e){} }
function b64enc(str){ const b = new TextEncoder().encode(str); let s = ""; for (let i=0;i<b.length;i+=0x8000) s += String.fromCharCode.apply(null, b.subarray(i,i+0x8000)); return btoa(s); }
function b64dec(b64){ const bin = atob(b64.replace(/\n/g,"")); const b = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); }

/* ---------- storage: GitHub repo (S.cfg {owner, repo, token}) or this phone only (S.cfg {mode:"local"}) ----------
   Try mode keeps every file in the phone's IndexedDB under the same paths the repo uses (plants.json, media/…),
   so the rest of the app doesn't care where data lives. Browsers may clear site data, so Settings offers a backup file. */
const isLocal = () => !!(S.cfg && S.cfg.mode === "local");
let idbP = null;
function idb(){ if (!idbP) idbP = new Promise((res, rej) => { const r = indexedDB.open("flowerphile-local", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); return idbP; }
async function lget(path){ const db = await idb(); return new Promise((res, rej) => { const q = db.transaction("files").objectStore("files").get(path); q.onsuccess = () => res(q.result === undefined ? null : q.result); q.onerror = () => rej(q.error); }); }
async function lput(path, v){ const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("files", "readwrite"); t.objectStore("files").put(v, path); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
async function lall(){ const db = await idb(); return new Promise((res, rej) => { const out = {}, q = db.transaction("files").objectStore("files").openCursor(); q.onsuccess = () => { const c = q.result; if (c){ out[c.key] = c.value; c.continue(); } else res(out); }; q.onerror = () => rej(q.error); }); }
async function lclear(){ const db = await idb(); return new Promise((res, rej) => { const t = db.transaction("files", "readwrite"); t.objectStore("files").clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
async function startLocal(){
  S.cfg = {mode:"local", since:new Date().toISOString()}; saveCfg(S.cfg);
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch(e){}   // ask the browser not to clear it
  await loadAll(); location.hash = S.plants.length ? "#today" : "#plant-new";
}
/* backup: every file as JSON (photos and sensor files base64), one download; restore writes them back */
async function makeBackup(withMedia){
  const files = {};
  if (isLocal()){ const all = await lall(); for (const [k, v] of Object.entries(all)){ if (v instanceof Blob){ if (withMedia) files[k] = {b64: await blobToB64(v), type: v.type}; } else files[k] = {json: v}; } }
  else { for (const f of ["plants.json","tasks.json","logs.json","changes.json","tips.json","strains.json","library.json","experiments.json","sensors.json","profile.json"]){ const d = (await getJSON(f)).data; if (d != null) files[f] = {json: d}; }
    if (withMedia) for (const l of S.logs) for (const pth of (l.photos || []).concat(l.files || [])){ const r = await api(pth, null, "application/vnd.github.raw"); if (r.ok){ const b = await r.blob(); files[pth] = {b64: await blobToB64(b), type: b.type}; } } }
  const blob = new Blob([JSON.stringify({app:"flowerphile", version:APP_V, made:new Date().toISOString(), files})], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "flowerphile-backup-" + today() + ".json"; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return Object.keys(files).length;
}
async function restoreBackup(file){
  const j = JSON.parse(await file.text()); if (!j || j.app !== "flowerphile" || !j.files) throw new Error("Not a Flowerphile backup");
  if (!isLocal()) throw new Error("Restore works in try mode (this phone only)");
  for (const [k, v] of Object.entries(j.files)){
    if (v.json !== undefined) await lput(k, v.json);
    else if (v.b64){ const bin = atob(v.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await lput(k, new Blob([u], {type: v.type || "application/octet-stream"})); }
  }
  imgCache.clear(); await loadAll(); return Object.keys(j.files).length;
}

function api(path, init, accept){
  const c = S.cfg;
  return fetch("https://api.github.com/repos/"+encodeURIComponent(c.owner)+"/"+encodeURIComponent(c.repo)+"/contents/"+path, Object.assign({cache:"no-store"}, init, {
    headers: Object.assign({ Authorization:"Bearer "+c.token, Accept: accept || "application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28" }, (init && init.headers) || {})
  }));
}
class StoreError extends Error { constructor(code, status){ super(code); this.code = code; this.status = status; } }
async function getJSON(path){
  if (isLocal()) return {data: await lget(path), sha: "local"};
  const r = await api(path);
  if (r.status === 404) return {data:null, sha:null};
  if (r.status === 401 || r.status === 403) throw new StoreError("auth", r.status);
  if (!r.ok) throw new StoreError("http", r.status);
  const j = await r.json();
  let text = j.content ? b64dec(j.content) : "";
  if (!text && j.size > 0){ const raw = await api(path, null, "application/vnd.github.raw"); text = await raw.text(); }
  return {data: text ? JSON.parse(text) : null, sha:j.sha};
}
async function putB64(path, b64, sha, message){
  const body = {message, content:b64}; if (sha) body.sha = sha;
  const r = await api(path, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  if (r.status === 401 || r.status === 403) throw new StoreError("auth", r.status);
  return r;
}
async function mutate(path, fn, message){
  if (isLocal()){ const next = fn(await lget(path)); await lput(path, JSON.parse(JSON.stringify(next))); return next; }
  for (let i = 0; i < 4; i++){
    const {data, sha} = await getJSON(path);
    const next = fn(data);
    const r = await putB64(path, b64enc(JSON.stringify(next, null, 1)), sha, message);
    if (r.ok) return next;
    if (r.status !== 409 && r.status !== 422) throw new StoreError("http", r.status);
    await new Promise(res => setTimeout(res, 400 + i*400));
  }
  throw new StoreError("conflict");
}
function blobToB64(blob){ return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); }); }
async function shrink(file){
  try {
    const bmp = await createImageBitmap(file, {imageOrientation:"from-image"});
    const max = 1600, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width*sc); c.height = Math.round(bmp.height*sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), "image/jpeg", 0.8));
  } catch(e){ return file; }
}
const isCsv = f => /\.csv$/i.test(f.name || "") || /csv/.test(f.type || "");
async function uploadFiles(list, kind){
  const out = []; let n = 0;
  for (const f of list){
    n++;
    const stamp = new Date().toISOString(), csv = isCsv(f), img = !csv && /^image\//.test(f.type || "");
    const ext = csv ? "csv" : img ? "jpg" : ((f.name || "").match(/\.([a-z0-9]{1,5})$/i) || [, "txt"])[1].toLowerCase();   // A3: other data keeps its own format
    const blob = csv || !img ? f : await shrink(f);
    const base = !img && f.name ? f.name.replace(/[^\w.-]+/g,"_").replace(/\.[a-z0-9]{1,5}$/i,"") : kind;
    const path = "media/" + stamp.slice(0,10) + "/" + stamp.replace(/[:.]/g,"-") + "-" + n + "-" + base + "." + ext;
    if (blob.size > 20e6) throw new StoreError("too_large");
    if (isLocal()){ await lput(path, blob); out.push(path); continue; }
    const r = await putB64(path, await blobToB64(blob), null, "media " + path);
    if (!r.ok) throw new StoreError("http", r.status);
    out.push(path);
  }
  return out;
}
const imgCache = new Map();
function mediaUrl(path){
  if (imgCache.has(path)) return imgCache.get(path);
  const p = (isLocal() ? lget(path) : api(path, null, "application/vnd.github.raw").then(r => r.ok ? r.blob() : null)).then(b => b instanceof Blob ? URL.createObjectURL(b) : null).catch(() => null);
  imgCache.set(path, p); return p;
}

/* ---------- sensor CSV (Govee and similar) ---------- */
function parseStamp(s){
  s = s.trim().replace(/^"|"$/g,"");
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0));
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (m){
    let a = +m[1], b = +m[2], hr = +m[4];
    if (m[7]){ if (/pm/i.test(m[7]) && hr < 12) hr += 12; if (/am/i.test(m[7]) && hr === 12) hr = 0; }
    const dotted = s.includes(".");
    const day = dotted || a > 12 ? a : b, mon = dotted || a > 12 ? b : a;
    return new Date(+m[3], mon-1, day, hr, +m[5], +(m[6]||0));
  }
  const t = Date.parse(s); return Number.isFinite(t) ? new Date(t) : null;
}
function parseSensorCsv(text){
  const rows = parseSensorRows(text); if (!rows) return null;
  const last = rows[rows.length-1], from = last.at - 864e5;
  const day = rows.filter(x => x.at >= from);
  const ts = day.map(x => x.t).filter(v => v != null), rs = day.map(x => x.r).filter(v => v != null);
  const r1 = v => v == null ? null : Math.round(v*10)/10;
  return { at:last.at.toISOString(), first:rows[0].at.toISOString(), n:rows.length,
    temp:r1(last.t), rh:r1(last.r),
    tmin: ts.length ? r1(Math.min(...ts)) : null, tmax: ts.length ? r1(Math.max(...ts)) : null,
    hmin: rs.length ? r1(Math.min(...rs)) : null, hmax: rs.length ? r1(Math.max(...rs)) : null,
    tavg: ts.length ? r1(ts.reduce((a,b)=>a+b,0)/ts.length) : null, havg: rs.length ? r1(rs.reduce((a,b)=>a+b,0)/rs.length) : null };
}
function parseSensorRows(text){
  const lines = text.replace(/^﻿/,"").split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(sep).map(x => x.toLowerCase());
  const ti = head.findIndex(x => /time|date/.test(x));
  const ci = head.findIndex(x => /temp/.test(x));
  const hi = head.findIndex(x => /humid|rh/.test(x));
  if (ti < 0 || (ci < 0 && hi < 0)) return null;
  const fahr = ci >= 0 && /fahr|°f|\(f\)/.test(head[ci]);
  const rows = [];
  for (const line of lines.slice(1)){
    const c = line.split(sep);
    const at = parseStamp(c[ti] || ""); if (!at) continue;
    let t = ci >= 0 ? num(c[ci]) : null; const r = hi >= 0 ? num(c[hi]) : null;
    if (t != null && fahr) t = (t - 32) * 5/9;
    if (t == null && r == null) continue;
    rows.push({at, t, r});
  }
  if (!rows.length) return null;
  rows.sort((a,b) => a.at - b.at);
  return rows;
}
function vpd(t, rh){ if (t == null || rh == null) return null; const svp = 0.6108 * Math.exp(17.27*t/(t+237.3)); return Math.round(svp*(1-rh/100)*100)/100; }


/* ---------- sensor bridge (bridge.js): readings straight from the sensors repo, no CSV needed ----------
   Days are fetched with one GraphQL call (all files of several days at once), falling back to the REST API.
   Finished days (before yesterday, UTC) are cached on the phone for good; today and yesterday refresh each sync.
   S.live[plantId] = the last-24 h summary in the CSV shape, from the sensors placed with that plant. */
const BRIDGE_KEY = "ff-bridge-days";
S.bdays = {}; S.live = {}; S.bhealth = [];
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
function bridgeRepo(){ return S.smeta && S.cfg ? {owner: S.smeta.owner || S.cfg.owner, repo: S.smeta.repo || "flowerphile-sensors"} : null; }
function bridgeFromCache(){
  try { const c = JSON.parse(localStorage.getItem(BRIDGE_KEY) || "{}"); for (const [d, rows] of Object.entries(c)) S.bdays[d] = rows.map(r => ({t:r[0] * 6e4, id:r[1], temp:r[2], rh:r[3], bat:r[4]})); } catch(e){}
  bridgeLive();
}
function bridgeSave(){
  try { const keep = Object.keys(S.bdays).sort().slice(-40), y = utcDay(Date.now() - 864e5), out = {};
    for (const d of keep) out[d] = S.bdays[d].map(r => [Math.round(r.t / 6e4), r.id, r.temp, r.rh, r.bat]);
    localStorage.setItem(BRIDGE_KEY, JSON.stringify(out)); } catch(e){}
}
async function fetchDaysGQL(R, days){
  const q = "query{repository(owner:" + JSON.stringify(R.owner) + ",name:" + JSON.stringify(R.repo) + "){" + days.map((d, i) => "d" + i + ":object(expression:" + JSON.stringify("HEAD:readings/" + d) + "){...on Tree{entries{name object{...on Blob{text}}}}}").join(" ") + "}}";
  const r = await fetch("https://api.github.com/graphql", {method:"POST", headers:{Authorization:"Bearer " + S.cfg.token, "Content-Type":"application/json"}, body:JSON.stringify({query:q})});
  if (!r.ok) throw new Error("gql " + r.status);
  const j = await r.json(); if (!j.data || !j.data.repository) throw new Error("gql: " + ((j.errors && j.errors[0] && j.errors[0].message) || "no repository"));
  const out = {}; days.forEach((d, i) => { const t = j.data.repository["d" + i]; out[d] = t && t.entries ? Bridge.merge(t.entries.map(e => Bridge.parse(e.object && e.object.text))) : []; });
  return out;
}
async function fetchDaysREST(R, days){
  const base = "https://api.github.com/repos/" + encodeURIComponent(R.owner) + "/" + encodeURIComponent(R.repo) + "/contents/readings/", H = {Authorization:"Bearer " + S.cfg.token, "X-GitHub-Api-Version":"2022-11-28"};
  const out = {};
  for (const d of days){
    const l = await fetch(base + d, {headers:Object.assign({Accept:"application/vnd.github+json"}, H), cache:"no-store"});
    if (l.status === 404){                                 // a missing day is normal; a missing repo means the key can't see it
      const rr = await fetch("https://api.github.com/repos/" + encodeURIComponent(R.owner) + "/" + encodeURIComponent(R.repo), {headers:Object.assign({Accept:"application/vnd.github+json"}, H), cache:"no-store"});
      if (!rr.ok) throw new StoreError("auth", rr.status);
      out[d] = []; continue; }
    if (!l.ok) throw new StoreError(l.status === 401 || l.status === 403 ? "auth" : "http", l.status);
    const files = (await l.json()).filter(f => /\.jsonl$/.test(f.name));
    const texts = await Promise.all(files.map(f => fetch(base + d + "/" + f.name, {headers:Object.assign({Accept:"application/vnd.github.raw"}, H)}).then(r => r.ok ? r.text() : "")));
    out[d] = Bridge.merge(texts.map(Bridge.parse));
  }
  return out;
}
async function loadBridge(extraDays){
  const R = bridgeRepo(); if (!R || !window.Bridge) return;
  const now = Date.now(), want = new Set([utcDay(now), utcDay(now - 864e5)].concat(extraDays || []));
  const need = [...want].filter(d => !S.bdays[d] || d >= utcDay(now - 864e5));
  if (!need.length){ bridgeLive(); return; }
  try {
    let got; try { got = await fetchDaysGQL(R, need); S.bridgeVia = "GraphQL"; } catch(e){ S.bridgeGqlErr = String(e.message || e); got = await fetchDaysREST(R, need); S.bridgeVia = "REST"; }
    Object.assign(S.bdays, got); S.bridgeErr = null; S.bridgeAt = now; bridgeSave();
  } catch(e){ S.bridgeErr = e.code === "auth" ? "The app key can't read " + R.repo + " yet." : "Sensor data couldn't load."; }
  bridgeLive();
}
function bridgeRows(from){ const out = []; for (const [d, rows] of Object.entries(S.bdays)) if (!from || d >= utcDay(from - 864e5)) out.push(rows); return Bridge.merge(out); }
function bridgeLive(){
  if (!window.Bridge || !S.smeta) return;
  const rows = bridgeRows(Date.now() - 2 * 864e5); S.live = {}; S.liveJar = {};
  // air (the space around the plant: fridge, drying space, dome) and jars are kept apart:
  // S.live feeds the Air/Humidity/VPD tiles, S.liveJar the Jar RH tile and the cure rules
  for (const p of S.plants){
    const air = Bridge.summary(Bridge.forRun(rows, S.smeta, p.id, AIR_KINDS)), jar = Bridge.summary(Bridge.forRun(rows, S.smeta, p.id, ["jar"]));
    if (air || jar) S.live[p.id] = air || jar;
    if (jar) S.liveJar[p.id] = jar;
  }
  S.bhealth = Bridge.health(rows, S.smeta);
}
function sensorNote(p){
  const box = $("#t-sensornote"); if (!box) return; box.replaceChildren();
  if (!S.smeta) return;
  const mineIds = new Set(Bridge.placements(S.smeta).filter(x => x.run === p.id && !x.to).map(x => x.id));
  const hs = S.bridgeErr ? [] : S.bhealth.filter(x => x.k === "twins" ? (x.ids || [x.id]).some(i => mineIds.has(i)) : mineIds.has(x.id));
  const items = hs.map(x => x.text);
  if (S.bridgeErr) items.unshift(S.bridgeErr);
  if (!mineIds.size && ["grow","bloom","dry","cure"].includes(phaseOf(p))) items.push("No sensor placed with this plant. Log → Sensor moved to place one.");
  if (items.length) box.append(...items.map(t => h("span",{class:"warnline"}, t)));
}
const AIR_KINDS = ["air", "dry", "dome"];
function liveJarFor(p){ const s = p && S.liveJar && S.liveJar[p.id]; return s && Date.now() - Date.parse(s.at) < 6 * 36e5 ? s : null; }
function liveFor(p){ const s = p && S.live[p.id]; return s && Date.now() - Date.parse(s.at) < 6 * 36e5 ? s : null; }
const sensorNum = id => ((S.smeta && S.smeta.sensors || {})[id] || {}).num || id;


/* ---------- "Follow plant" theme: day when the plant has light, night when it hasn't ----------
   outdoor: sunrise/sunset at the plant's place (Open-Meteo) · indoor: plant.light {on:"HH:MM", hours} if set, else the
   light schedule detected from its air sensor (the lamp warms the space; needs ~a day of readings) · drying and curing:
   always night (they happen in the dark) · finished runs and unknown schedules: follow the phone. */
const hm2min = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
const min2hm = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String(((m % 60) + 60) % 60).padStart(2, "0");
function detectLight(p){
  if (!S.smeta || !window.Bridge || !p) return null;
  const since = Date.now() - 3 * 864e5, rows = Bridge.forRun(bridgeRows(since), S.smeta, p.id, AIR_KINDS).filter(r => r.temp != null && r.t > since);
  const slot = Array.from({length: 96}, () => []);
  for (const r of rows){ const d = new Date(r.t - 7.5 * 6e4); slot[d.getHours() * 4 + Math.floor(d.getMinutes() / 15)].push(r.temp); }
  const prof = slot.map(a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null), vals = prof.filter(v => v != null);
  if (vals.length < 80) return null;                     // needs about 20 h of the day covered
  const hi = Math.max(...vals), lo = Math.min(...vals); if (hi - lo < 2) return null;
  const thr = (hi + lo) / 2, on = prof.map((v, i) => v == null ? (prof[(i + 95) % 96] != null && prof[(i + 95) % 96] > thr) : v > thr);
  if (on.every(Boolean) || !on.some(Boolean)) return null;
  let best = 0, start = 0;                               // longest run of "on" slots, around midnight too
  for (let i = 0; i < 96; i++){ if (!on[i] || on[(i + 95) % 96]) continue; let n = 0; while (n < 96 && on[(i + n) % 96]) n++; if (n > best){ best = n; start = i; } }
  const lag = 15;                                        // the air warms a little after the lamp switches
  return {on: min2hm(start * 15 - lag), hours: Math.round(best / 4 * 2) / 2, src: "sensor"};
}
function plantNight(p){
  if (!p) return null;
  const ph = phaseOf(p), now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
  if (ph === "dry" || ph === "cure") return {night: true, why: (ph === "dry" ? "Drying" : "Curing") + " happens in the dark"};
  if (ph === "done") return null;
  if (p.where === "outdoor"){
    const pl = placeOf(p); if (!pl) return null;
    const w = S.weather[pl.lat + "," + pl.lon], d = w && w.j && w.j.daily;
    if (!d || !d.sunrise){ loadWeather(p).then(() => applyTheme()); return null; }
    const rise = hm2min((d.sunrise[0] || "").slice(11, 16)), set = hm2min((d.sunset[0] || "").slice(11, 16));
    const night = mins < rise || mins >= set;
    return {night, why: night ? "Night outside (sunrise " + min2hm(rise) + ")" : "Daylight outside until " + min2hm(set)};
  }
  const L = p.light && hm2min(p.light.on) != null ? Object.assign({src: "set"}, p.light) : detectLight(p);
  if (!L) return null;
  const on = hm2min(L.on), off = on + L.hours * 60, inOn = ((mins - on + 1440) % 1440) < L.hours * 60;
  return {night: !inOn, why: (inOn ? "Lights on until " + min2hm(off) : "Lights off until " + min2hm(on)) + (L.src === "sensor" ? " (read from the sensor: " + L.hours + " h from " + L.on + ")" : ""), sched: L};
}

/* ---------- weather (outdoor) ---------- */
async function loadWeather(p){
  const pl = placeOf(p); if (!pl) return null;
  const lat = pl.lat, lon = pl.lon, key = lat+","+lon;
  const c = S.weather[key];
  if (c && Date.now() - c.at < 30*60e3) return c;
  const url = "https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+
    "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,cloud_cover"+
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,relative_humidity_2m_mean,sunrise,sunset&timezone=auto&forecast_days=3";
  try {
    const j = await fetch(url).then(r => r.json());
    S.weather[key] = {at:Date.now(), j}; return S.weather[key];
  } catch(e){ return null; }
}

/* ---------- sync ---------- */
function setSync(text, err){ const b = $("#sync"); b.textContent = text; b.classList.toggle("err", !!err); }
function cache(){ try { localStorage.setItem(CACHE_KEY, JSON.stringify({plants:S.plants, tasks:S.tasks, logs:S.logs, changes:S.changes, tips:S.tips||[], strains:S.strains||[], library:S.library||[], experiments:S.experiments||[], smeta:S.smeta||null, profile:S.profile||null})); } catch(e){} }
function sortLogs(list){ return (list||[]).slice().sort((a,b) => (b.at||"").localeCompare(a.at||"")); }
async function loadAll(){
  if (!S.cfg || S.busy) return;
  S.busy = true; setSync("Syncing…");
  try {
    let [plants, tasks, logs, changes, tips, strainsRes, libRes, expRes, senRes, profRes] = await Promise.all(["plants.json","tasks.json","logs.json","changes.json","tips.json","strains.json","library.json","experiments.json","sensors.json","profile.json"].map(p => getJSON(p).catch(() => ({data:null}))));
    S.profile = (profRes && profRes.data) || null;
    S.tips = (tips && tips.data) || []; S.experiments = (expRes && expRes.data) || []; S.smeta = (senRes && senRes.data) || null; S.strains = (strainsRes && strainsRes.data) || []; S.library = (libRes && libRes.data) || [];
    if (!plants.data && !isLocal()){
      const run = (await getJSON("run.json")).data;
      if (run){
        const p = Object.assign({}, run, {id:run.id || "tank1", medium:"hydro", system:"dwc", where:"indoor", status:"active", sensor:"Grow Fridge 3000"});
        plants.data = await mutate("plants.json", d => d && d.length ? d : [p], "plants: migrate run");
      }
    }
    S.plants = plants.data || [];
    S.tasks = tasks.data || []; S.logs = sortLogs(logs.data); S.changes = (changes.data || []).slice().sort((a,b) => (b.date||"").localeCompare(a.date||""));
    if (!S.plants.find(p => p.id === S.sel)) S.sel = (S.plants.find(p => p.status !== "done") || S.plants[0] || {}).id || null;
    S.synced = new Date(); cache();
    setSync("↻ " + hm(S.synced.toISOString()));
    if (SHARED){ const t = SHARED; SHARED = null; setTimeout(() => takeAnswer(t), 50); }
    loadKnowledge().then(() => renderAll());
    loadBridge().then(() => { renderAll(); keepPlans(); });
  } catch(e){
    setSync(e.code === "auth" ? "Key rejected · open Settings" : "Offline · tap to retry", true);
  } finally { S.busy = false; renderAll(); }
}
function loadCache(){
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && c.plants){ Object.assign(S, {plants:c.plants, tasks:c.tasks||[], logs:sortLogs(c.logs), changes:c.changes||[], tips:c.tips||[], strains:c.strains||[], library:c.library||[], experiments:c.experiments||[], smeta:c.smeta||null, profile:c.profile||null}); setSync("Saved copy"); try { bridgeFromCache(); } catch(e){} } } catch(e){}
}

/* ---------- routing ---------- */
const VIEWS = ["today","log","plan","setup","plant","quiz","strain","library"];
const APP_V = "v58";
/* Android: Share → Flowerphile lands here as ?title=…&text=… (manifest share_target); taken once the data is loaded */
let SHARED = (() => { try { const q = new URLSearchParams(location.search); if (!["share","text","title","url"].some(k => q.has(k))) return null;
  const t = [q.get("title"), q.get("text"), q.get("url")].filter(Boolean).join("\n").trim(); history.replaceState(null, "", location.pathname + "#today"); return t || null; } catch(e){ return null; } })();
const GEAR_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';
function route(){
  let v = location.hash.slice(1);
  if (v === "history"){ S.planSeg = "book"; v = "plan"; }   // the log book now lives inside Plan
  if (v === "plant-new" || v === "plant-setup"){ if (!S.qz || S.qz.mode !== (v === "plant-new" ? "new" : "edit") || (S.qz.mode === "edit" && S.qz.pid !== S.sel)) openQuiz(v === "plant-new" ? "new" : "edit"); v = "quiz"; }
  if (v === "plant-full" || v === "plant-edit"){ openPlantForm(v === "plant-edit"); v = "plant"; }
  if (!VIEWS.includes(v)) v = "today";
  if (!S.cfg && v !== "setup") v = "setup";
  for (const x of VIEWS) document.getElementById("v-"+x).hidden = x !== v;
  // the gear opens settings; in settings (and the plant forms reached from there) the same corner closes them again
  const away = v === "setup" || v === "plant" || v === "quiz";
  if (!away) S.back = v;
  const gear = $("#gear");
  gear.setAttribute("href", away ? "#" + (S.back || "today") : "#setup");
  gear.setAttribute("aria-label", away ? "Close" : "Settings and plants");
  gear.innerHTML = away ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' : GEAR_SVG;
  $("#tabs").hidden = v === "setup" || v === "plant" || v === "quiz" || v === "library" || !S.plants.length;
  document.querySelectorAll("nav a").forEach(a => a.dataset.v === v ? a.setAttribute("aria-current","page") : a.removeAttribute("aria-current"));
  if (v === "setup") renderSetup();
  if (v === "quiz") renderQuiz();
  if (v === "strain") renderStrain();
  if (v === "library") renderLibrary();
  if (v === "plan") planSeg();
  if (v === "log"){ if (!S.edit) lnow(); renderLogForm(); S.logDirty = false; }
  window.scrollTo(0,0);
  decorateSoon();
}
addEventListener("hashchange", route);
addEventListener("scroll", () => { const t = document.querySelector(".top"); if (t) t.classList.toggle("scrolled", scrollY > 8); }, {passive:true});
function selectPlant(id){
  if (S.edit) endEdit();
  S.sel = id; S.dayPick = null; try { localStorage.setItem(SEL_KEY, id); } catch(e){}   // v54: a picked day never follows you to another plant
  renderAll(); if (!$("#v-log").hidden) renderLogForm();
}

/* ---------- swipe between plants ----------
   A horizontal swipe on the page switches to the next/previous plant (same order as the tabs) and keeps the
   current section. Ignored near the screen edges (Android back gesture), on inputs and scrollable rows, and
   in the plant form, settings and the log form while editing. */
function plantOrder(){ const order = {active:0, resting:1, done:2}; return S.plants.slice().sort((a,b) => (order[a.status]||0) - (order[b.status]||0)); }
function swipePlant(dir){
  const list = plantOrder(); if (list.length < 2) return;
  const i = Math.max(0, list.findIndex(p => p.id === S.sel)), sec = document.querySelector("main > section:not([hidden])");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (i + dir < 0 || i + dir >= list.length){            // hard stop at the first and last plant: a small bump, no wrap
    if (sec && !calm) sec.animate([{transform:"none"}, {transform:`translateX(${-dir * 14}px)`}, {transform:"none"}], {duration:260, easing:"ease-out"});
    return;
  }
  const next = list[i + dir];
  S.viewSheet = null; selectPlant(next.id); decorateSoon();
  if (sec && !calm)
    sec.animate([{transform:`translateX(${dir * 48}px)`, opacity:0.2}, {transform:"none", opacity:1}], {duration:220, easing:"cubic-bezier(.2,.7,.3,1)"});
}
(() => {
  let x0 = 0, y0 = 0, t0 = 0, ok = false;
  addEventListener("touchstart", e => {
    const t = e.touches[0], v = location.hash.slice(1) || "today";
    ok = e.touches.length === 1 && t.clientX > 25 && t.clientX < innerWidth - 25 && !["setup","plant","plant-new","plant-edit","plant-full","plant-setup","library"].includes(v) && !S.edit && !(v === "log" && S.logDirty) &&
      !e.target.closest('input,select,textarea,[contenteditable],.tabs,.rail,.viewer,[data-noswipe]');
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, {passive:true});
  addEventListener("input", e => { if (e.target.closest && e.target.closest("#v-log")) S.logDirty = true; }, true);
  addEventListener("touchend", e => {
    if (!ok) return; ok = false;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.8 * Math.abs(dy) && Date.now() - t0 < 700) swipePlant(dx < 0 ? 1 : -1);
  }, {passive:true});
})();

/* ---------- strain library ----------
   library.json: the seeds you own plus strains you asked about. Light entries come from the seed list (to be
   verified); full sourced sheets live in strains.json and are linked by `sheet`. Opened from the Plant tab only. */
const norm = s => (s || "").toLowerCase().replace(/\bauto(flower)?\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const LIB_EFFECTS = ["relaxing", "sedating", "body", "uplifting", "energetic", "creative", "euphoric", "giggly", "cerebral"];
const LIB_TERPS = ["Myrcene", "Limonene", "Caryophyllene", "Pinene", "Linalool", "Terpinolene"];
S.libF = {q:"", scope:"stash", kind:null, eff:new Set(), terp:new Set(), fast:null, sort:"name", dir:1, like:null};
S.libOpen = null; S.viewSheet = null;
function sheetById(id){ return allStrains().find(x => x.id === id) || null; }
/* the public starter catalogue (knowledge/catalogue.json: names, breeders, type) fills Explore and the suggestions;
   the grower's own library wins on the same name. Researching a catalogue strain adds it to the library. */
function libBase(){
  const own = S.library || [], seen = new Set(own.map(e => norm(e.name)));
  const cat = (S.kn.catalogue || []).filter(c => c.name && !seen.has(norm(c.name)) && (seen.add(norm(c.name)), true))
    .map(c => ({id: "cat-" + norm(c.name).replace(/ /g, "-"), name: c.name, breeder: c.breeder, kind: c.kind, genetics: c.genetics, inStash: false, cat: true, src: "Starter catalogue · to be verified"}));
  return own.concat(cat);
}
function libEntries(){
  return libBase().map(e => {
    const sh = e.sheet ? sheetById(e.sheet) : (S.kn.strains || []).find(x => norm(x.name) === norm(e.name) && x.status !== "rejected") || null;   // research-run sheets match by name
    const grown = S.plants.filter(p => p.strain && norm(p.strain) === norm(e.name));
    return Object.assign({}, e, {
      terps: e.terps || (sh && sh.terpenes ? sh.terpenes.map(t => t.name.split(/[ (]/)[0]) : []),
      effects: e.effects || (sh && sh.effects) || [],
      taste: e.taste || (sh && sh.taste) || [],
      thcMax: e.thcMax || (sh && sh.thc && +(String(sh.thc).match(/\d+(\.\d+)?/) || [])[0]) || null,
      flower: e.flower || (sh && sh.flowering && flowerDays(sh.flowering)) || null,
      grown, sh});
  });
}
const effHas = (e, k) => e.effects.some(x => x.toLowerCase().includes(k === "relaxing" ? "relax" : k === "body" ? "body" : k));
function similarity(a, b){
  if (a.id === b.id) return -1;
  const ta = new Set(a.terps), tb = new Set(b.terps), ti = [...ta].filter(x => tb.has(x)).length;
  const ea = new Set(LIB_EFFECTS.filter(k => effHas(a, k))), eb = new Set(LIB_EFFECTS.filter(k => effHas(b, k))), ei = [...ea].filter(x => eb.has(x)).length;
  let s = ti * 1.2 + ei * 1.5 - Math.abs(ea.size - eb.size) * 0.3;
  if (a.kind && a.kind === b.kind) s += 0.5;
  if (a.flower && b.flower) s -= Math.abs(a.flower - b.flower) / 20;
  return s;
}
function entryFor(p){ if (!p || !p.strain) return null; return libEntries().find(e => norm(e.name) === norm(p.strain)) || null; }
function libFiltered(){
  const F = S.libF, q = norm(F.q);
  let L = libEntries().filter(e =>
    (!q || norm(e.name + " " + e.breeder).includes(q)) &&
    (F.scope === "all" ? (F.like || !(e.inStash && e.seeds !== 0) && !e.grown.length) : F.scope === "stash" ? e.inStash && e.seeds !== 0 : F.scope === "grown" ? e.grown.length : e.request) &&
    (!F.kind || e.kind === F.kind) &&
    [...F.eff].every(k => effHas(e, k)) && [...F.terp].every(t => e.terps.includes(t)) &&
    (!F.fast || (e.flower && e.flower <= F.fast)));
  if (F.like){ const ref = libEntries().find(e => e.id === F.like); if (ref) L = L.filter(e => e.id !== ref.id).map(e => [similarity(ref, e), e]).sort((a, b) => b[0] - a[0]).map(x => x[1]); }
  else L.sort((a, b) => a.name.localeCompare(b.name));
  return L;
}
function libChip(label, on, fn){ return h("button",{type:"button", class:"chip", style:"min-height:34px;font-size:15px", "aria-pressed": on ? "true" : "false", onclick:() => { fn(); renderLibrary(); }}, label); }
function renderLibrary(){
  const box = $("#lib-body"); if (!box) return; box.replaceChildren();
  const F = S.libF, p = sel(), mine_ = entryFor(p);
  if (S.libSheet && sheetById(S.libSheet)){
    const back = h("a",{class:"small", href:"#library", onclick:ev => { ev.preventDefault(); S.libSheet = null; renderLibrary(); window.scrollTo(0, 0); }}, "← All strains"), sub = h("div",{style:"display:flex;flex-direction:column;gap:16px"});
    box.append(back, sub); renderStrain({sheet: sheetById(S.libSheet), box: sub, name: $("#lib-title"), by: $("#lib-kicker")}); return;
  }
  $("#lib-title").textContent = "Strains"; $("#lib-kicker").textContent = "Your seeds, and any strain you want to know about";
  box.append(h("div",{class:"chips seg", role:"tablist", style:"gap:6px"}, [["stash","My seeds"],["grown","Grown"],["all","Explore"]].map(([k, l]) =>
    h("button",{type:"button", class:"chip", role:"tab", "aria-selected": F.scope === k ? "true" : "false", "aria-pressed": F.scope === k ? "true" : "false", onclick:() => { F.scope = k; renderLibrary(); }}, l))));
  const search = h("input",{type:"search", id:"lib-q", placeholder: F.scope === "all" ? "Look up any strain" : "Search name or breeder", value:F.q, "aria-label":"Search strains", oninput:e => { F.q = e.target.value; renderLibList(); }});
  box.append(h("label",{class:"f"}, search));
  const presets = h("div",{class:"chips", style:"gap:6px"});
  if (mine_) presets.append(libChip("Like " + mine_.name, F.like === mine_.id, () => { F.like = F.like === mine_.id ? null : mine_.id; }));
  presets.append(libChip("Faster (≤ 63 d)", F.fast === 63, () => { F.fast = F.fast === 63 ? null : 63; }));
  presets.append(libChip("More uplifting", F.eff.has("uplifting"), () => { F.eff.has("uplifting") ? F.eff.delete("uplifting") : F.eff.add("uplifting"); }));
  presets.append(libChip("More relaxing", F.eff.has("relaxing"), () => { F.eff.has("relaxing") ? F.eff.delete("relaxing") : F.eff.add("relaxing"); }));
  box.append(presets);
  const more = h("details",{class:"panel fr","data-soak":"0.12", open: S.libMore ? "" : null, ontoggle:e => { S.libMore = e.target.open; }}, h("summary",null,"Filters"),
    h("div",{class:"sub", style:"margin:8px 0 4px"},"Type"), h("div",{class:"chips", style:"gap:6px"}, [["auto","Autoflower"],["photo","Photoperiod"]].map(([k, l]) => libChip(l, F.kind === k, () => { F.kind = F.kind === k ? null : k; }))),
    h("div",{class:"sub", style:"margin:10px 0 4px"},"Effect"), h("div",{class:"chips", style:"gap:6px"}, LIB_EFFECTS.map(k => libChip(k, F.eff.has(k), () => { F.eff.has(k) ? F.eff.delete(k) : F.eff.add(k); }))),
    h("div",{class:"sub", style:"margin:10px 0 4px"},"Terpene"), h("div",{class:"chips", style:"gap:6px"}, LIB_TERPS.map(k => libChip(k, F.terp.has(k), () => { F.terp.has(k) ? F.terp.delete(k) : F.terp.add(k); }))));
  box.append(more);
  box.append(h("div",{id:"lib-list", style:"display:flex;flex-direction:column;gap:10px"}));
  renderLibList(); decorateSoon();
}
/* how calm or lifting a strain reads: the sheet's own spectrum if there is one, else a rough read of the effect words */
function feelOf(e){
  if (e.sh && e.sh.spectra && e.sh.spectra[0]) return e.sh.spectra[0].v;
  const w = e.effects.join(" ").toLowerCase(); if (!w) return null;
  const up = (w.match(/energ|uplift|creativ|cerebral|giggl|function|clear|happy|focus/g) || []).length;
  const down = (w.match(/relax|sedat|couch|body|calm|heavy|sleep|insomnia|warming/g) || []).length;
  return 0.5 + 0.5 * Math.tanh((up - down) / 2);
}
function feelBar(v){
  if (v == null) return h("span",{class:"muted"},"–");
  return h("span",{class:"mini", role:"img", "aria-label": v < 0.4 ? "calming" : v > 0.6 ? "lifting" : "balanced"}, h("span",{class:"dot", style:"left:calc(" + Math.round(v * 100) + "% - 4px)"}));
}
S.libGroup = "none"; S.libGrpOpen = new Set(); S.libPick = null; S.libCompare = false;
function runsText(e){ return e.grown.map(p => p.name + (p.run && p.run.dry_g ? " · " + p.run.dry_g + " g dry" : "") + (p.run && p.run.verdict ? " · " + p.run.verdict : "")).join("; "); }
function renderLibList(){
  const list = $("#lib-list"); if (!list) return; list.replaceChildren();
  const F = S.libF;
  if (S.libCompare && S.libPick && S.libPick.size >= 2){ renderCompare(list); return; }
  let L = libFiltered();
  if (!F.like){
    const key = {flower: e => e.flower || 999, thc: e => -(e.thcMax || 0), feel: e => feelOf(e) == null ? 9 : feelOf(e), seeds: e => -(e.seeds || 0)}[F.sort];
    if (key){ L = L.slice().sort((a, b) => key(a) - key(b)); if (F.dir < 0) L.reverse(); }
    else if (F.dir < 0) L = L.slice().reverse();
  }
  if (F.scope === "all" && !L.length){
    list.append(h("div",{class:"panel fr","data-soak":"0.12"}, h("h2",null,"Look something up"),
      h("p",{style:"margin:0"}, "Explore is for strains you don't have yet: something a friend recommended, a pharmacy option, or a candidate for the next run. Type a name above; anything not here yet gets a sourced sheet researched for you."),
      h("p",{class:"sub", style:"margin:8px 0 0"}, "Strains you looked up or asked about collect here.")));
  }
  if (L.length){
    // tools: grouping and compare
    const picking = !!S.libPick;
    list.append(h("div",{style:"display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"},
      h("div",{class:"chips", style:"gap:6px;align-items:center"}, h("span",{class:"sub"},"Group"),
        [["none","None"],["breeder","Breeder"],["kind","Type"]].map(([k, l]) => h("button",{type:"button", class:"chip", style:"min-height:32px;font-size:15px;padding:0 10px", "aria-pressed": S.libGroup === k ? "true" : "false", onclick:() => { S.libGroup = k; renderLibList(); }}, l))),
      h("button",{type:"button", class:"btn ghost sm", "aria-pressed": picking ? "true" : "false", onclick:() => { S.libPick = picking ? null : new Set(); S.libOpen = null; renderLibList(); }}, picking ? "Cancel" : "Compare")));
    if (picking) list.append(h("p",{class:"sub", style:"margin:0"}, "Tap up to 3 strains to compare."));
    else list.append(h("p",{class:"sub", style:"margin:0"}, L.length + (L.length === 1 ? " strain" : " strains") + (F.like ? " · most similar first" : "")));
    const th = (k, label, cls) => h("th",{class:cls || "", scope:"col"}, k ? h("button",{type:"button", class:"sortb" + (F.sort === k && !F.like ? " on" : ""), onclick:() => { if (F.sort === k){ F.dir = -(F.dir || 1); } else { F.sort = k; F.dir = 1; } F.like = null; renderLibList(); }}, label, F.sort === k && !F.like ? (F.dir < 0 ? " ↑" : " ↓") : "") : label);
    const tbl = h("table",{class:"lib"}, h("thead",null, h("tr",null, th("name","Strain"), th("flower","Bloom","n"), th("thc","THC","n"), th("feel","Feel","c"), F.scope === "stash" ? th("seeds","#","n") : th(null,"","n"))));
    // groups keep the current sort inside them
    const gk = e => S.libGroup === "breeder" ? (e.breeder || "Unknown breeder") : S.libGroup === "kind" ? (e.kind === "auto" ? "Autoflower" : e.kind === "photo" ? "Photoperiod" : "Type unknown") : "";
    const groups = [];
    for (const e of L){ const k = gk(e); let g = groups.find(x => x.k === k); if (!g) groups.push(g = {k, items: []}); g.items.push(e); }
    if (S.libGroup !== "none") groups.sort((a, b) => a.k.localeCompare(b.k));
    for (const g of groups){
      const tb = h("tbody");
      const shut = S.libGroup !== "none" && !S.libF.q.trim() && !S.libGrpOpen.has(S.libGroup + ":" + g.k);   // groups start collapsed; a search opens them
      if (S.libGroup !== "none"){
        const seeds = g.items.reduce((t, e) => t + (e.seeds || 0), 0);
        tb.append(h("tr",{class:"lgrp", tabindex:"0", "aria-expanded": shut ? "false" : "true", onclick:() => { const id = S.libGroup + ":" + g.k; S.libGrpOpen.has(id) ? S.libGrpOpen.delete(id) : S.libGrpOpen.add(id); renderLibList(); }},
          h("td",{colspan:"5"}, h("span",{class:"chev", "aria-hidden":"true"}, shut ? "+ " : "– "), h("b",null, g.k), h("span",{class:"muted"}, " · " + g.items.length + (g.items.length === 1 ? " strain" : " strains") + (F.scope === "stash" && seeds ? " · " + seeds + (seeds === 1 ? " seed" : " seeds") : "")))));
      }
      if (!shut) for (const e of g.items) libRow(tb, e, F);
      tbl.append(tb);
    }
    list.append(h("div",{class:"panel fr","data-soak":"0.12", style:"padding:10px 10px 6px"}, tbl));
    if (picking && S.libPick.size >= 2) list.append(h("button",{type:"button", class:"btn", style:"position:sticky;bottom:96px;align-self:center;z-index:3", onclick:() => { S.libCompare = true; renderLibList(); window.scrollTo(0, 0); }}, "Compare " + S.libPick.size + " →"));
  }
  if (F.q.trim() && !libEntries().some(e => norm(e.name) === norm(F.q)))
    list.append(h("div",{class:"panel fr","data-soak":"0.12"}, h("p",{style:"margin:0"}, "“" + F.q.trim() + "” isn't in your library yet."),
      h("button",{type:"button", class:"btn sm", style:"margin-top:8px", onclick:() => addToLibrary(F.q.trim())}, "Research it")));
  decorateSoon();
}
function libRow(tb, e, F){
  const picking = !!S.libPick, picked = picking && S.libPick.has(e.id), open = !picking && S.libOpen === e.id, fv = feelOf(e);
  const tag = e.grown.length && F.scope !== "grown" ? " ✓" : e.request ? " ?" : "";
  const act = () => { if (picking){ picked ? S.libPick.delete(e.id) : S.libPick.size < 3 && S.libPick.add(e.id); } else S.libOpen = open ? null : e.id; renderLibList(); };
  tb.append(h("tr",{class:"lrow" + (open ? " open" : "") + (picked ? " picked" : ""), tabindex:"0", "aria-expanded": picking ? null : open ? "true" : "false", "aria-pressed": picking ? (picked ? "true" : "false") : null, onclick:act,
      onkeydown:ev => { if (ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); act(); } }},
    h("td",null, picking ? h("span",{class:"pick", "aria-hidden":"true"}, picked ? "●" : "○") : null, h("b",null, e.name), tag ? h("span",{class:"muted", title: tag.includes("✓") ? "grown before" : "research requested"}, tag) : null,
      h("div",{class:"by"}, [S.libGroup === "breeder" ? null : e.breeder, S.libGroup === "kind" ? null : e.kind === "auto" ? "auto" : e.kind === "photo" ? "photo" : null].filter(Boolean).join(" · "))),
    h("td",{class:"n"}, e.flower ? e.flower + "d" : "–"),
    h("td",{class:"n"}, e.thcMax ? Math.round(e.thcMax) + "%" : "–"),
    h("td",{class:"c"}, feelBar(fv)),
    h("td",{class:"n"}, F.scope === "stash" ? String(e.seeds || "–") : "")));
  if (open){
    const d = h("div",{class:"libdet"});
    if (e.sh){ const fx = [["Bloom", daysOnly(e.sh.flowering)], ["THC", e.sh.thc], ["Height", e.sh.height], ["Yield", e.sh.yield], ["Climate", e.sh.climate]].filter(f => f[1]);
      if (fx.length) d.append(h("dl",{class:"facts", style:"margin:0 0 6px"}, fx.flatMap(f => [h("dt",null,f[0]), h("dd",{class:"num"},f[1])])));
      if (e.sh.spectra && e.sh.spectra.length) d.append(h("div",{style:"display:flex;flex-direction:column;gap:4px;margin:4px 0 8px"}, ...specRows(e.sh.spectra)));
      if (e.sh.story) d.append(h("p",{class:"prose", style:"margin:0 0 6px"}, e.sh.story.split(/(?<=\.)\s/)[0])); }
    else d.append(h("p",{class:"sub", style:"margin:0 0 6px"}, "No researched sheet yet: the weekly strain run fills these in (or tap Research now)."));
    if (e.effects.length) d.append(h("p",null, h("span",{class:"muted"},"Effect "), e.effects.join(", ")));
    if (e.taste.length) d.append(h("p",null, h("span",{class:"muted"},"Taste "), e.taste.join(", ")));
    if (e.terps.length) d.append(h("p",null, h("span",{class:"muted"},"Terpenes "), e.terps.join(", ")));
    if (e.genetics || e.thc) d.append(h("p",null, h("span",{class:"muted"},"Genetics "), [e.genetics, e.thc ? "THC " + e.thc : null].filter(Boolean).join(" · ")));
    if (e.grown.length) d.append(h("p",{class:"sub"}, "Your runs: " + runsText(e)));
    const acts = h("div",{class:"chips", style:"gap:6px"});
    if (e.sh) acts.append(h("button",{type:"button", class:"btn sm", onclick:ev => { ev.stopPropagation(); S.libSheet = e.sh.id; renderLibrary(); window.scrollTo(0, 0); }}, "Open full sheet"));
    else { acts.append(h("button",{type:"button", class:"btn sm", onclick:ev => { ev.stopPropagation(); researchNow(e); }}, "Research now"));
      acts.append(h("button",{type:"button", class:"btn ghost sm", disabled: e.request ? "" : null, onclick:ev => { ev.stopPropagation(); requestResearch(e); }}, e.request ? "In tonight's review" : "Add to tonight's review")); }
    acts.append(h("button",{type:"button", class:"btn ghost sm", onclick:ev => { ev.stopPropagation(); F.like = e.id; F.scope = "all"; S.libOpen = null; renderLibrary(); window.scrollTo(0, 0); }}, "Find similar"));
    d.append(acts, h("p",{class:"sub", style:"font-size:13px"}, e.sh ? "Sourced sheet" : "From " + (e.src || "your list") + "."));
    tb.append(h("tr",{class:"ldet"}, h("td",{colspan:"5"}, d)));
  }
}
/* side by side: one column per strain, one row per property */
function renderCompare(list){
  const E = libEntries().filter(e => S.libPick.has(e.id));
  const rows = [["Breeder", e => e.breeder], ["Type", e => e.kind === "auto" ? "Autoflower" : e.kind === "photo" ? "Photoperiod" : null], ["Genetics", e => e.genetics],
    ["Bloom", e => e.flower ? e.flower + " days" : null], ["THC", e => e.thc || (e.thcMax ? e.thcMax + " %" : null)], ["Feel", e => feelBar(feelOf(e))],
    ["Terpenes", e => e.terps.join(", ")], ["Taste", e => e.taste.join(", ")], ["Effect", e => e.effects.join(", ")], ["Seeds", e => e.seeds != null ? String(e.seeds) : null], ["Your runs", e => runsText(e)]];
  list.append(h("div",{style:"display:flex;justify-content:space-between;align-items:center"}, h("h2",{style:"margin:0"}, "Compare"),
    h("button",{type:"button", class:"btn ghost sm", onclick:() => { S.libCompare = false; renderLibList(); }}, "← Back to the list")));
  const tbl = h("table",{class:"lib cmp"}, h("thead",null, h("tr",null, h("th",{scope:"col"},""), E.map(e => h("th",{scope:"col"}, h("b",{style:"font:700 16px var(--serif);color:var(--ink);font-variant:normal;letter-spacing:0;white-space:normal"}, e.name))))));
  const tb = h("tbody");
  for (const [label, fn] of rows){ const vals = E.map(fn); if (vals.every(v => v == null || v === "")) continue;
    tb.append(h("tr",null, h("th",{scope:"row"}, label), vals.map(v => h("td",null, v == null || v === "" ? h("span",{class:"muted"},"–") : v)))); }
  tbl.append(tb);
  list.append(h("div",{class:"panel fr","data-soak":"0.12", style:"padding:10px 10px 6px"}, tbl));
  decorateSoon();
}
/* research right away with the user's own AI: copy a complete brief, open the chat that can write to the data store.
   The nightly review stays the fallback (library entry with `request`). */
function researchBrief(e){
  const sh = (S.strains || [])[0];
  return ["Flowerphile strain research: " + e.name + (e.breeder ? " (" + e.breeder + ")" : ""),
    "Research this strain from sourced material: the breeder's page, lab results where they exist, and broad user reports. Write in your own words, list the sources, mark claims that only the breeder makes.",
    isLocal() || !S.cfg ? "Give me the result as a short sheet: type, genetics, flowering days, height, THC, main terpenes, taste, effects, a few grow notes, sources."
      : "Then add a sheet to strains.json in " + S.cfg.owner + "/" + S.cfg.repo + " in the same shape as the existing sheets" + (sh ? " (keys: " + Object.keys(sh).join(", ") + ")" : "") + ", link it from the library.json entry id \"" + e.id + "\" via `sheet`, fill kind/flower (days)/thc/terps/effects on that entry and remove `request`.",
    "Days, not weeks. Commit and push. Reply with two lines: what stands out, and how it compares to what I grow now."].join("\n");
}
async function researchNow(e){
  const url = (S.plants.find(p => p.chat && p.status === "active") || S.plants.find(p => p.chat) || {}).chat || "https://claude.ai/new";
  try { await navigator.clipboard.writeText(researchBrief(e)); setSync("Research brief copied · paste it in the chat"); } catch(err){ setSync("Couldn't copy · long-press to paste manually", true); }
  if (!e.request) requestResearch(e);                    // stays queued for the nightly review if the chat doesn't get to it
  window.open(url, "_blank", "noopener");
}
async function requestResearch(e){
  try { S.library = await mutate("library.json", list => e.cat ? (list || []).concat([{id: e.id.slice(4) + "-" + Date.now().toString(36).slice(-4), name: e.name, breeder: e.breeder, kind: e.kind, genetics: e.genetics, inStash: false, request: today(), src: "starter catalogue"}])
      : (list || []).map(x => x.id === e.id ? Object.assign({}, x, {request: today()}) : x), "library: research request");
    cache(); renderLibList(); setSync("Requested · the nightly review researches it"); } catch(err){ setSync("Couldn't save · tap to retry", true); }
}
async function addToLibrary(name){
  const id = norm(name).replace(/ /g, "-") + "-" + Date.now().toString(36).slice(-4);
  try { S.library = await mutate("library.json", list => (list || []).concat([{id, name, inStash:false, request: today(), src:"your request"}]), "library: add " + id);
    S.libF.q = ""; S.libOpen = id; cache(); renderLibrary(); setSync("Added · the nightly review researches it"); } catch(err){ setSync("Couldn't save · tap to retry", true); }
}
/* bottom of a plant's strain sheet: a few close relatives from the library, and the way in */
function similarPanel(p){
  const me = entryFor(p), lib = libEntries();
  const panel = h("div",{class:"panel fr","data-soak":"0.12"}, h("h2",null,"Similar strains"));
  if (me && lib.length > 1){
    const top = lib.filter(e => e.id !== me.id).map(e => [similarity(me, e), e]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]);
    panel.append( h("ul",{class:"notes"}, top.map(e => h("li",null, h("b",null,e.name), " · " + [e.breeder, e.flower ? e.flower + " d" : null].filter(Boolean).join(" · ")))));
  }
  panel.append(h("a",{class:"btn ghost sm", href:"#library", style:"align-self:flex-start;margin-top:6px", onclick:() => { S.libSheet = null; if (me){ S.libF.scope = "all"; S.libF.like = me.id; } }}, "Find similar strains →"));
  return panel;
}

/* Plan has two halves: what's ahead (tasks, run rail, why things moved) and the log book (every entry, newest first) */
S.planSeg = "ahead";
function planSeg(){
  const seg = S.planSeg === "book" ? "book" : "ahead";
  $("#p-ahead").hidden = seg !== "ahead"; $("#p-book").hidden = seg !== "book";
  document.querySelectorAll("#p-seg .chip").forEach(c => { const on = c.dataset.seg === seg; c.setAttribute("aria-pressed", on ? "true" : "false"); c.setAttribute("aria-selected", on ? "true" : "false"); });
}
document.addEventListener("click", e => { const c = e.target.closest && e.target.closest("#p-seg .chip"); if (!c) return; S.planSeg = c.dataset.seg; planSeg(); decorateSoon(); });

/* ---------- quick questions about finished buds ----------
   For plants curing or in storage: one multiple-choice question at a time on Today. Answers are saved as small
   log entries (actions ["Review"], note "Question: answer"), so they show in the Log book and travel with the data.
   `again` = days before a question may come back (taste and strength change during the cure); 0 = ask once. */
const ASK = [
  {id:"jar",    q:"How strong is the jar smell?", o:["Faint","Medium","Loud","Room-filling"], again:14},
  {id:"aroma",  q:"Which smells come through?", o:["Sweet","Fruity","Citrus","Berry","Earthy","Pine","Gas","Skunk","Spice","Herbal","Cheese","Floral","Creamy"], multi:true, again:21},
  {id:"dry",    q:"How do the buds feel?", o:["Too moist","Just right","A bit dry","Crispy"], again:10},
  {id:"taste",  q:"How does it taste?", o:["Sweet","Fruity","Citrus","Berry","Earthy","Pine","Gas","Skunk","Spice","Herbal","Hashy","Bland"], multi:true, again:21},
  {id:"smooth", q:"How smooth is it?", o:["Harsh","Okay","Smooth","Very smooth"], again:14},
  {id:"vape",   q:"How long does a session keep its flavour?", o:["A drag or two","A few minutes","Long and tasty","I don't vape it"], again:21},
  {id:"ash",    q:"What colour is the ash?", o:["White","Grey","Dark","I don't smoke it"], again:30},
  {id:"strong", q:"How strong is it?", o:["Mild","Medium","Strong","Very strong"], again:14},
  {id:"onset",  q:"How fast does it kick in?", o:["Right away","After a few minutes","Slow creeper"], again:0},
  {id:"length", q:"How long does it last?", o:["Under 1 h","1–2 h","2–3 h","Longer"], again:0},
  {id:"where",  q:"Where do you feel it most?", o:["Mostly head","Both","Mostly body"], again:21},
  {id:"mood",   q:"How does it leave you?", o:["Relaxed","Happy","Creative","Focused","Giggly","Dreamy","Sleepy","Hungry","Anxious","Foggy"], multi:true, again:21},
  {id:"music",  q:"Good for getting lost in music or a film?", o:["Not really","A bit","Yes","Perfect"], again:0},
  {id:"helps",  q:"Did it help with anything for you?", o:["Aches or pain","Sleep","Appetite","Stress","Nausea","Muscle tension","Nothing noticeable"], multi:true, again:30, note:"Your own experience, kept private."},
  {id:"again",  q:"Would you grow it again?", o:["No","Maybe","Yes","Definitely"], again:0},
  {id:"best",   q:"Compared to your best homegrown?", o:["Weaker","About the same","Better","New favourite"], again:0}
];
S.askPick = {}; S.askSel = null;
function askAnswers(p){ return S.logs.filter(l => l.run === p.id && l.ask).sort((a, b) => (b.at || "").localeCompare(a.at || "")); }
function askNext(p){
  const key = p.id + ":" + (S.askSkip || 0);
  if (S.askPick[key] !== undefined) return S.askPick[key];
  const ans = askAnswers(p), T = today();
  const due = ASK.filter(q => { const last = ans.find(l => l.ask === q.id); if (!last) return true; if (!q.again) return false; return daysBetween(last.date || last.at.slice(0, 10), T) >= q.again; });
  const fresh = due.filter(q => !ans.some(l => l.ask === q.id));        // never-answered ones first
  const pool = fresh.length ? fresh : due;
  return S.askPick[key] = pool.length ? pool[((S.tipOpen || 0) + (S.askSkip || 0)) % pool.length] : null;
}
async function askSave(p, q, picks){
  const now = new Date(), entry = {id:"l-" + Date.now(), run:p.id, at:now.toISOString(), date:today(), source:"app", actions:["Review"], ask:q.id, answer:picks, note:q.q.replace(/\?$/, "") + ": " + picks.join(", ")};
  const cs = phaseStart(p, "cure"); if (cs) entry.cureDay = daysBetween(cs, today());
  try { S.logs = sortLogs(await mutate("logs.json", list => [...(list || []), entry], "review " + p.id)); cache(); S.askSel = null; S.askDone = q.id; S.askPick = {}; renderToday(); }
  catch(err){ setSync("Couldn't save · tap to retry", true); }
}
function askCard(p){
  const ph = phaseOf(p); if (ph !== "cure" && ph !== "done") return null;
  const q = askNext(p), ans = askAnswers(p);
  const box = h("div",{class:"panel fr","data-soak":"0.12", id:"t-ask"});
  if (S.askDone && (!q || q.id !== S.askDone)){ box.append(h("p",{class:"sub", style:"margin:0 0 6px"}, "Saved, thanks.")); }
  if (!q){ box.append(h("h2",null,"Your verdict"), h("p",{class:"empty"},"All questions answered for now. Some come back as the cure goes on.")); }
  else {
    box.append(h("div",{class:"head", style:"align-items:baseline"}, h("h2",null,"A quick one"), h("button",{type:"button", class:"donebtn", onclick:() => { S.askSkip = (S.askSkip || 0) + 1; S.askSel = null; S.askDone = null; renderToday(); }}, "Skip")),
      h("p",{style:"margin:0 0 8px;font-size:19px"}, q.q));
    const sel_ = S.askSel && S.askSel.q === q.id ? S.askSel.v : new Set();
    const chips = h("div",{class:"chips", style:"gap:6px"}, q.o.map(o => h("button",{type:"button", class:"chip", "aria-pressed": sel_.has(o) ? "true" : "false", onclick:() => {
      if (!q.multi){ askSave(p, q, [o]); return; }
      const v = new Set(sel_); v.has(o) ? v.delete(o) : v.add(o); S.askSel = {q:q.id, v}; renderToday(); }}, o)));
    box.append(chips);
    if (q.multi) box.append(h("button",{type:"button", class:"btn sm", style:"margin-top:10px;align-self:flex-start", disabled: sel_.size ? null : "", onclick:() => askSave(p, q, [...sel_])}, "Save"));
    if (q.note) box.append(h("p",{class:"sub", style:"margin:8px 0 0;font-size:13px"}, q.note));
  }
  // what's been said so far: the latest answer per question
  const latest = []; for (const l of ans) if (!latest.some(x => x.ask === l.ask)) latest.push(l);
  if (latest.length) box.append(h("details",{style:"margin-top:10px"}, h("summary",{class:"small muted"}, "Your notes so far (" + latest.length + ")"),
    h("ul",{class:"notes small"}, latest.map(l => { const q2 = ASK.find(x => x.id === l.ask); return h("li",null, (q2 ? q2.q.replace(/\?$/, "") : l.ask) + ": ", h("b",null, (l.answer || []).join(", ")), l.cureDay != null ? h("span",{class:"muted"}, " · cure day " + l.cureDay) : null); }))));
  return box;
}

/* ---------- the app's own plan keeping (rules.js) ---------- */
function ruleCtx(p){ const ph = phaseOf(p), ls = latestSensor(), ta = (targetsOf(p).air || [0, 99])[1];
  const dose = window.Feed ? (from, to) => { const r = Feed.suggest(p, S.logs, {from, to}); return r ? r.text : null; } : null;
  return {dose, phaseAt: d => phaseOn(p, d), hot: !!(ls && ls.temp != null && ls.temp > ta), today: today(), phase: ph, phaseStart: phaseStart(p, ph === "done" ? "cure" : ph), tasks: S.tasks, logs: S.logs, profile: S.profile, check: window.Branch ? Branch.check(p, S.profile) : null, jar: liveJarFor(p)}; }
async function applyRules(byPlant, label){
  const add = [], mv = [], ch = [], T = today();
  const cl = [];
  for (const [pid, r] of byPlant){ const moves = r.moves || [], closes = r.close || []; if (!r.tasks.length && !moves.length && !closes.length) continue;
    add.push(...r.tasks); mv.push(...moves); cl.push(...closes);
    const cid = () => "c-" + T.replace(/-/g, "") + "-a" + Math.random().toString(36).slice(2, 6);
    if (r.tasks.length) ch.push({id:cid(), run:pid, date:T, src:"app",
      text: r.kind === "sensor" ? "Added from the sensor readings (" + r.why.join("; ") + ")."
          : r.kind === "upkeep" ? "Added by the app: " + groupSteps(r.tasks) + "."
          : r.kind === "weather" ? "Added from the weather forecast: " + groupSteps(r.tasks) + "."
          : (r.kind || label) === "plan" ? "Plan kept going by the app: " + groupSteps(r.tasks) + "."
                             : "Added right after your log (" + r.why.join("; ") + ")."});
    for (const m of moves) ch.push({id:cid(), run:pid, date:T, src:"app", text:m.why});
    for (const c of closes) ch.push({id:cid(), run:pid, date:T, src:"app", text:c.why}); }
  if (!add.length && !mv.length && !cl.length) return 0;
  S.tasks = await mutate("tasks.json", list => { const L = (list || []).map(t => { const m = mv.find(x => x.id === t.id); const c = cl.find(x => x.id === t.id);
      if (c && t.status !== "done") return Object.assign({}, t, {status:"done", doneAt:c.at || new Date().toISOString(), auto: c.skipped ? "skipped" : "log"});
      return m && t.status !== "done" ? Object.assign({}, t, {due:m.due, moved:T, was: t.was || t.due, whyMoved: shortWhy(m.why)}) : t; });
    const ids = new Set(L.map(t => t.id)), gens = new Set(L.filter(t => t.gen).map(t => t.run + "|" + t.gen));
    return L.concat(add.filter(t => !ids.has(t.id) && !gens.has(t.run + "|" + t.gen))); }, label === "plan" ? "app: keep plans going" : "app: react to log");
  try { S.changes = (await mutate("changes.json", list => (list || []).concat(ch), "app: why things moved")).slice().sort((a,b) => (b.date||"").localeCompare(a.date||"")); } catch(e){}
  cache(); return add.length + mv.length + cl.length;
}
/* B3: one short reason line for a moved date ("was 5 Dec → now 6 Dec · topping was a day late") */
function shortWhy(w){ if (!w) return ""; let t = String(w).replace(/^"[^"]*"\s*/, "").replace(/^Your AI:\s*/, "").split(/(?<=[.;])\s/)[0].replace(/[.;]$/, ""); return t.length > 90 ? t.slice(0, 88) + "…" : t; }
function shiftTint(was, now){ if (!was || !now || was === now) return ""; const d = daysBetween(was, now); return d < 0 ? " sh-early" : d <= 2 ? " sh-late" : " sh-later"; }
function groupSteps(tasks){
  const g = new Map(); for (const t of tasks.slice().sort((a, b) => a.due.localeCompare(b.due))){ const k = t.title; if (!g.has(k)) g.set(k, []); g.get(k).push(t.due); }
  return [...g].map(([k, ds]) => k.toLowerCase() + " " + (ds.length > 1 ? short(ds[0]) + "–" + short(ds[ds.length - 1]) + " (" + ds.length + "×)" : short(ds[0]))).join(", ");
}
S.planRan = null;
const REACTED_KEY = "ff-reacted";
async function keepPlans(){
  if (!window.Rules || !S.plants.length || (S.planRan && Date.now() - S.planRan < 6e5)) return;
  S.planRan = Date.now();
  const by = []; for (const p of S.plants){ const tasks = Rules.plan(p, ruleCtx(p)).concat(window.Branch && p.status === "active" ? Branch.plan(p, ruleCtx(p), S.profile) : []); if (tasks.length) by.push([p.id, {tasks, why: []}]); }
  // outdoor plants: the forecast turns into steps (frost, wind, heat, rain and damp in bloom)
  if (window.Branch) for (const p of S.plants.filter(x => x.status === "active" && x.where === "outdoor")){
    const w = await loadWeather(p); if (!w) continue; const tasks = Branch.weather(p, w.j, ruleCtx(p));
    if (tasks.length) by.push([p.id, {tasks, why: ["from the weather forecast"], kind: "weather"}]); }
  // upkeep the nightly review used to do: checks done by logs, overdue big tasks, one stressor a day, EC ramp
  for (const p of S.plants.filter(x => x.status === "active")){ const m = Rules.maintain(p, ruleCtx(p)); if (m.tasks.length || m.moves.length || m.close.length) by.push([p.id, Object.assign(m, {why: [], kind: "upkeep"})]); }
  // sensor readings react like a log would, once per plant per day (gen keys keep it from repeating)
  // (finished runs too when a jar sensor watches the storage jars)
  for (const p of S.plants.filter(x => x.status === "active" || liveJarFor(x))){ const lv = liveFor(p), lj = liveJarFor(p); if (!lv && !lj) continue;
    const pseudo = {id:"bridge-" + today(), run:p.id, at:(lj || lv).at, date:today()}; if (lv && lv !== lj) pseudo.sensor = lv;
    if (lj && lj.rh != null && ["cure","done"].includes(phaseOf(p))) pseudo.jar_rh = lj.rh;
    const r = Rules.afterLog(p, pseudo, ruleCtx(p)); if (r.tasks.length) by.push([p.id, Object.assign(r, {kind: "sensor"})]); }
  // the newest log of each plant also gets the instant reaction once (catches logs saved before an update or on another phone)
  let seen = []; try { seen = JSON.parse(localStorage.getItem(REACTED_KEY) || "[]"); } catch(e){}
  for (const p of S.plants.filter(x => x.status === "active")){
    const l = S.logs.find(x => plantOf(x) === p.id); if (!l || seen.includes(l.id) || l.date < addDays(today(), -1)) continue;
    const r = Rules.afterLog(p, l, ruleCtx(p)); seen.push(l.id);
    if (r.tasks.length || (r.moves || []).length) by.push([p.id, Object.assign(r, {kind: "log"})]);
  }
  try { localStorage.setItem(REACTED_KEY, JSON.stringify(seen.slice(-50))); } catch(e){}
  try { const n = await applyRules(by, "plan"); if (n){ renderAll(); setSync("Plan updated · " + n + " change" + (n === 1 ? "" : "s")); } } catch(e){ S.planRan = null; }
}
async function reactToLog(p, entry, pre){
  if (!window.Rules) return;
  const r = pre || Rules.afterLog(p, entry, ruleCtx(p)); try { const seen = JSON.parse(localStorage.getItem(REACTED_KEY) || "[]"); localStorage.setItem(REACTED_KEY, JSON.stringify(seen.concat(entry.id).slice(-50))); } catch(e){}
  if (!r.tasks.length && !(r.moves || []).length && !(r.close || []).length) return;
  try { await applyRules([[p.id, r]], "log"); renderAll(); setSync(r.tasks.some(t => t.urgent) ? "Needs a look · check-in added" : "Plan updated after your log"); } catch(e){}
}

/* ---------- derived ---------- */
function latest(k){ for (const l of mine(S.logs)){ const n = num(l[k]); if (n != null) return {v:n, at:l.at}; } return null; }
function latestSensor(){
  let s = null; for (const l of mine(S.logs)) if (l.sensor && (l.sensor.temp != null || l.sensor.rh != null)){ s = l.sensor; break; }
  const lv = sel() && S.live[sel().id]; if (lv && (!s || lv.at > s.at)) return lv;
  return s;
}
function statusOf(k, v){
  const p = sel(), t = p && targetsOf(p)[k];
  if (!t || v == null) return {cls:"none", word:"", txt:""};
  const [lo, hi] = t, range = "aim " + lo + "–" + hi;
  if (v < lo) return {cls:"low", word:"low", txt:range};
  if (v > hi) return {cls:"high", word:"high", txt:range};
  return {cls:"ok", word:"good", txt:range};
}
const openTasks = () => mine(S.tasks).filter(t => t.status !== "done");
function sortTasks(a,b){
  if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : (a.order||0)-(b.order||0);
  if (a.due) return -1; if (b.due) return 1; return (a.order||0)-(b.order||0);
}
const dueCount = p => S.tasks.filter(t => plantOf(t) === p.id && t.status !== "done" && t.due && t.due <= today()).length;

/* ---------- render ---------- */
function tile(k, v, st, fx){
  fx = fx || {};
  const el = h("div",{class:"tile fr" + (fx.key ? " tap" : ""), "data-soak": fx.soak, "data-warm": fx.warm, "data-frost": fx.frost, "data-state": st.cls === "ok" ? "ok" : null,
    role: fx.key ? "button" : null, tabindex: fx.key ? "0" : null, "aria-label": fx.key ? k + " " + v + ", show the chart" : null,
    onclick: fx.key ? () => openChart(fx.key, k) : null, onkeydown: fx.key ? e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); openChart(fx.key, k); } } : null},
    h("span",{class:"k"}, k), h("span",{class:"v num"}, v));
  if (st.word) el.append(h("span",null, washSpan(st.word, st.cls)));
  if (st.txt) el.append(h("span",{class:"r"}, st.txt));
  return el;
}
function renderTabs(){
  const box = $("#tabs"); box.replaceChildren();
  const v = location.hash.slice(1); box.hidden = v === "setup" || v === "library" || v.startsWith("plant") || !S.plants.length;
  const list = plantOrder();
  for (const p of list){
    const n = dueCount(p);
    box.append(h("button",{type:"button", class:"ptab"+(p.status !== "active" ? " rest" : ""), role:"tab", style:"--c:"+colorOf(p),
      "aria-current": p.id === S.sel ? "true" : "false", "aria-label": p.name + " · " + (MEDIA[p.medium]||MEDIA.hydro).label + (n ? " · " + n + " due" : ""),
      onclick:() => selectPlant(p.id)}, p.id === S.sel ? raw('<svg aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" viewBox="0 0 100 40" preserveAspectRatio="none"><ellipse cx="50" cy="20" rx="49" ry="18" style="fill:var(--c);fill-opacity:.6" filter="url(#wash)"/></svg>') : h("span",{class:"dot"}), h("span",{style:"position:relative"}, p.strain || p.name), n ? h("span",{class:"badge",style:"position:relative"}, n) : null));
  }
  box.append(h("a",{class:"ptab add", href:"#plant-new", "aria-label":"Add plant"}, "+ specimen"));
  const cur = box.querySelector('[aria-current="true"]'); if (cur) cur.scrollIntoView({inline:"nearest", block:"nearest"});
}
/* ---------- specimen ---------- */
function seedOf(p){ return [...(p.id || "x")].reduce((a, c) => a * 31 + c.charCodeAt(0) & 0xffff, 7) + 1; }
function nodesEstimate(p, ref){ const sd = p.sprout ? daysBetween(p.sprout, ref) : 0; return Math.max(0, Math.floor((sd - 3) / 3.3)); }
function specState(p){
  const ph = phaseOf(p), T = today();
  const st = {phase: ph === "bloom" ? "grow" : ph, seed: seedOf(p), roots: (p.medium || "hydro") === "hydro"};
  if (ph === "germ"){
    const acts = new Set(mine(S.logs).flatMap(l => l.actions || []));
    st.germ = {soaked: acts.has("Soaked") || acts.has("Paper towel"), tail: acts.has("Tail visible"), planted: acts.has("Planted") || acts.has("Broke surface")};
    return st;
  }
  if (ph === "cure" || ph === "done") return st;
  const ref = ph === "dry" ? (phaseStart(p, "dry") || T) : T, flip = flipOf(p);
  st.sproutDays = p.sprout ? daysBetween(p.sprout, ref) : 0;
  const logged = mine(S.logs).filter(l => num(l.nodes) != null && l.date <= ref);
  const fromLog = logged.length ? num(logged[0].nodes) + Math.floor(daysBetween(logged[0].date, ref) / 4) : null;
  if (flip && ref >= flip){
    st.flowerDays = daysBetween(flip, ref);
    const before = logged.find(l => l.date <= flip);
    const atFlip = before ? num(before.nodes) : nodesEstimate(p, flip);
    st.flipNode = atFlip + 1;
    st.nodes = Math.max(logged.length ? num(logged[0].nodes) : 0, atFlip + Math.min(5, Math.round(st.flowerDays / 4)));
    st.ripe = st.flowerDays > 49 ? Math.min(1, (st.flowerDays - 49) / 14) : 0;
  } else st.nodes = fromLog != null ? fromLog : nodesEstimate(p, ref);
  if (ph === "dry") st.dryDays = daysBetween(ref, T);
  return st;
}
function drawSpecimen(p){
  const spec = $("#t-spec");
  if (!window.Specimen){ return; }
  const st = p ? specState(p) : {phase:"germ", seed:7};
  const key = JSON.stringify(st) + document.documentElement.dataset.theme;
  if (spec._k === key){ heroPhoto(p); return; } spec._k = key;
  spec.setAttribute("viewBox", Specimen.VB);
  spec.innerHTML = Specimen.draw(st);
  const words = {germ:"a seed", dry:"a plant hung to dry", cure:"buds curing in a jar", done:"a finished jar"};
  heroPhoto(p);
  spec.setAttribute("aria-label", "Ink drawing of " + (words[st.phase] || (st.nodes ? "a plant with " + st.nodes + " leaf nodes" + (st.flowerDays ? ", bloom day " + (st.flowerDays + 1) : "") : "a sprout")));
}
/* tap the drawing to see the plant as it really is: the newest photo, cut out on the phone and turned into a
   half photo, half ink specimen (stylize.js); the result is kept per plant so it's instant next time */
S.photoOn = {}; S.styl = {};
function latestPhoto(p){
  // v54: side shots only (log.view "top"/"close" or a photo marked in log.notSide are skipped); the newest one wins
  const card = resultPic(p), ok = (x, ph) => !(card && x.photos.includes(card.path)) && !x.view && !(x.notSide || []).includes(ph);
  for (const x of mine(S.logs)){ if (!x.photos || !x.photos.length) continue;
    for (let i = x.photos.length - 1; i >= 0; i--) if (ok(x, x.photos[i])) return {path: x.photos[i], at: x.at, log: x.id}; }
  return p && p.plate && !card ? {path: p.plate, at: phaseStart(p, "dry"), plate: true} : null;
}
/* the run's result picture (shown once, in the run card on Today): the harvest plate, else the newest "Result photo" log */
function resultPic(p){
  if (!p || ["germ","grow","bloom"].includes(phaseOf(p))) return null;
  if (p.plate) return {path: p.plate, plate: true, at: phaseStart(p, "dry")};
  const l = S.logs.find(x => x.run === p.id && (x.actions || []).includes("Result photo") && (x.photos || []).length);
  return l ? {path: l.photos[0], at: l.at, all: l.photos} : null;
}
async function stylized(p, ph){
  if (ph.plate) return mediaUrl(ph.path);                     // harvest plates are already made
  const key = "flowerphile-styl3-" + p.id;   // v53: new mask check, old cut-outs are redrawn
  if (S.styl[ph.path]) return S.styl[ph.path];
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && c.path === ph.path) return S.styl[ph.path] = c.url; } catch(e){}
  const u = await mediaUrl(ph.path); if (!u) return null;
  const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = u; });
  let out = null;
  try { const cv = im && window.Stylize ? Stylize.plant(im, {photo: 0.75}) : null; out = cv ? cv.toDataURL("image/webp", 0.85) : null; } catch(e){ out = null; }
  if (!out) return S.styl[ph.path] = u;                       // no plant found: show the plain photo
  try { localStorage.setItem(key, JSON.stringify({path: ph.path, url: out})); } catch(e){}
  return S.styl[ph.path] = out;
}
function heroPhoto(p){
  const btn = $("#t-specbtn"), img = $("#t-photo"), spec = $("#t-spec"), hint = $("#t-spechint");
  const ph = p ? latestPhoto(p) : null, on = !!(ph && S.photoOn[p.id]);
  btn.disabled = !ph;
  btn.setAttribute("aria-label", !ph ? "Drawing of the plant" : on ? "Show the drawing" : "Show the plant from the latest photo");
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  spec.toggleAttribute("hidden", on); img.hidden = !on;
  hint.textContent = !ph ? "" : on ? (ph.plate ? "harvest" : "photo") + (ph.at ? " · " + short(ph.at.slice(0, 10)) : "") : "tap for the real one";
  const ns = $("#t-notside"); if (ns) ns.remove();
  if (on && ph && ph.log) btn.after(h("button",{type:"button", id:"t-notside", class:"btn ghost sm", style:"display:block;margin:4px 0 0 auto;font-size:12px;padding:2px 8px;min-height:32px", onclick:e => { e.stopPropagation(); notSide(p, ph); }}, "Not a side shot"));
  if (on && img._p !== ph.path){ img._p = ph.path; img.removeAttribute("src"); img.alt = "The plant from its latest photo, half photo, half ink";
    hint.textContent = "drawing it…";
    stylized(p, ph).then(u => { if (img._p === ph.path && u){ img.src = u; hint.textContent = (ph.plate ? "harvest" : "photo") + (ph.at ? " · " + short(ph.at.slice(0, 10)) : ""); } }); }
}
async function notSide(p, ph){
  if (!ph || !ph.log) return;
  try { S.logs = sortLogs(await mutate("logs.json", list => (list || []).map(x => x.id === ph.log ? Object.assign({}, x, {notSide: [...new Set([...(x.notSide || []), ph.path])]}) : x), "photo not a side shot"));
    cache(); heroPhoto(p); } catch(e){ setSync("Couldn't save · tap to retry", true); }
}
$("#t-specbtn").addEventListener("click", () => { const p = sel(); if (!p || !latestPhoto(p)) return; S.photoOn[p.id] = !S.photoOn[p.id]; heroPhoto(p); });
function lampInfo(p){
  if ((p.where || "indoor") !== "indoor" || !["grow","bloom"].includes(phaseOf(p))) return null;
  const l = latest("lamp"), lamp = l ? l.v : num(p.lamp); if (lamp == null) return null;
  const ht = latest("height"); return {lamp, gap: ht ? lamp - ht.v : null};
}
function lastAction(names){ for (const l of mine(S.logs)) if ((l.actions || []).some(a => names.includes(a))) return l; return null; }
function latestSince(k, since){ for (const l of mine(S.logs)){ if (since && l.date < since) break; const n = num(l[k]); if (n != null) return {v:n, at:l.at}; } return null; }
/* the AI's tile choice for a growing plant: up to 3 keys; "watered"/"fed" = days since, anything else = latest logged value */
function uiTiles(p){
  const ks = p.ui && p.ui.tiles, ph = phaseOf(p);
  if (!ks || !ks.length || !(ph === "grow" || ph === "bloom")) return null;
  const T = today(), dtxt = n => n == null ? "–" : n === 0 ? "today" : n + " d ago", out = [];
  for (const k of ks.slice(0, 3)){
    if (k === "watered" || k === "fed"){
      const l = lastAction(k === "watered" ? (window.Branch ? Branch.WATERED : ["Watered"]) : (window.Branch ? Branch.FED : ["Fed"])), n = l ? daysBetween(l.date, T) : null;
      out.push([k === "watered" ? "Watered" : p.medium === "living-soil" ? "Top-dressed" : "Fed", dtxt(n), k === "watered" && n != null && n >= (p.where === "outdoor" ? 3 : 5) ? {cls:"high", word:"lift it", txt:"pot light? water"} : {cls:"none", word:"", txt: l && l.water_l && k === "watered" ? l.water_l + " L" : ""}]);
    } else if (F[k]){ const l = latest(k); out.push([labelFor(p, k, true), l ? fmtv(k, l.v) : "–", l ? statusOf(k, l.v) : {cls:"none", word:"", txt:"log it to see it here"}, k]); }
  }
  return out.length ? out : null;
}
function coreTiles(p){
  const ph = phaseOf(p), T = today(), none = {cls:"none", word:"", txt:""}, run = p.run || {};
  if (ph === "germ"){
    const la = lastAction(["Soaked","Paper towel","Tail visible","Planted","Broke surface"]);
    const step = la ? la.actions.filter(a => ["Soaked","Paper towel","Tail visible","Planted","Broke surface"].includes(a)).pop() : "–";
    return [["Days", p.start ? String(daysBetween(p.start, T)) : "–", {cls:"none", word:"", txt: p.start ? "since " + short(p.start) : ""}], ["Last step", step, {cls:"none", word:"", txt: la ? ago(la.at) : "tap a step when you log"}], ["Expect", "2–7 d", {cls:"none", word:"", txt:"to break surface"}]];
  }
  if (ph === "dry"){
    const ds = phaseStart(p, "dry"), w = latestSince("weight", ds), wet = num(run.wet_g);
    const lost = w && wet ? Math.round(100 * (1 - w.v / wet)) : null;
    const snap = lastAction(["Stems snap","Still bendy"]);
    return [["Weight", w ? fmtv("weight", w.v) : "–", {cls:"none", word:"", txt: wet ? "wet " + wet + " g" : "weigh a sample"}, "weight"],
      ["Lost", lost != null ? lost + "%" : "–", lost != null ? (lost >= 70 ? {cls:"ok", word:"near", txt:"jars at ~72–75%"} : {cls:"none", word:"", txt:"jars at ~72–75%"}) : {cls:"none", word:"", txt:"needs wet + now"}, wet ? "lost" : null],
      ["Day", ds ? String(daysBetween(ds, T) + 1) : "–", snap ? (snap.actions.includes("Stems snap") ? {cls:"ok", word:"snaps", txt:"ready for jars?"} : {cls:"none", word:"", txt:"still bendy"}) : {cls:"none", word:"", txt:"usually 7–14"}]];
  }
  if (ph === "cure"){
    const cs = phaseStart(p, "cure"), lv = liveJarFor(p), j0 = latestSince("jar_rh", cs), w = latestSince("weight", cs), b = lastAction(["Burped"]);
    const j = lv && lv.rh != null && (!j0 || lv.at > j0.at) ? {v: lv.rh, at: lv.at, jars: (lv.sensors || []).filter(x => x.kind === "jar")} : j0;
    const bd = b ? daysBetween(b.date, T) : null;
    const jst = statusOf("jar_rh", j && j.v); if (j && j.jars && j.jars.length > 1) jst.txt = "jars " + j.jars.map(x => sensorNum(x.id) + ": " + Math.round(x.rh)).join(" · ");
    return [["Jar RH", j ? fmtv("jar_rh", j.v) : "–", jst, "jar_rh"],
      ["Burped", bd == null ? "–" : bd === 0 ? "today" : bd + " d ago", bd != null && bd > 2 && cs && daysBetween(cs, T) < 14 ? {cls:"high", word:"due", txt:"daily, days 1–14"} : {cls:"none", word:"", txt: cs && daysBetween(cs, T) >= 14 ? "every 7 days now" : "daily, days 1–14"}],
      ["Weight", w ? fmtv("weight", w.v) : (run.dry_g ? run.dry_g + " g" : "–"), {cls:"none", word:"", txt: run.dry_g ? "jarred at " + run.dry_g + " g" : ""}, "weight"]];
  }
  if ((ph === "grow" || ph === "bloom") && window.Branch && Branch.dayTiles(p, S.profile)){
    const since = l => l ? daysBetween(l.date, T) : null, dtxt = n => n == null ? "–" : n === 0 ? "today" : n + " d ago";
    const w = lastAction(Branch.WATERED), fd = lastAction(Branch.FED), ht = latest("height"), wn = since(w), fn = since(fd);
    const vol = (p.setup || {}).volume, ls = p.medium === "living-soil";
    return [["Watered", dtxt(wn), wn != null && wn >= ((p.where === "outdoor") ? 3 : 5) ? {cls:"high", word:"lift it", txt:"pot light? water"} : {cls:"none", word:"", txt: w && w.water_l ? w.water_l + " L" : "lift the pot"}],
      [ls ? "Top-dressed" : "Fed", dtxt(fn), {cls:"none", word:"", txt: ls ? "every ~21–28 days" : vol ? "¼–½ bottle dose" : "with a watering"}],
      ["Height", ht ? fmtv("height", ht.v) : "–", {cls:"none", word:"", txt: ht ? ago(ht.at) : "log it now and then"}, "height"]];
  }
  if (ph === "done"){
    const lj = liveJarFor(p);
    if (lj) return [["Jar RH", fmtv("jar_rh", lj.rh), Object.assign(statusOf("jar_rh", lj.rh), (lj.sensors || []).length > 1 ? {txt: "jars " + lj.sensors.map(x => sensorNum(x.id) + ": " + Math.round(x.rh)).join(" · ")} : {}), "jar_rh"],
      ["Dry", run.dry_g ? run.dry_g + " g" : "–", none], ["Verdict", run.verdict || "–", none]];
    return [["Wet", run.wet_g ? run.wet_g + " g" : "–", none], ["Dry", run.dry_g ? run.dry_g + " g" : "–", run.wet_g && run.dry_g ? {cls:"none", word:"", txt: Math.round(100 * run.dry_g / run.wet_g) + "% of wet"} : none], ["Verdict", run.verdict || "–", none]];
  }
  return null;
}


/* ---------- charts: tap a tile → its values over a chosen time frame ----------
   Logged values (pH, EC, water, height, weight, jar RH …) come from the logs; air, humidity and VPD from the
   sensor CSVs attached to logs (fetched once, merged, cached), falling back to the 24 h summaries. */
const RANGES = [["1 d", 1], ["3 d", 3], ["7 d", 7], ["14 d", 14], ["30 d", 30], ["Run", 0]];
const EVENT_MARK = {"Fed":"F", "Water change":"W", "Topped off":"T", "pH adjusted":"pH", "Light changed":"L", "Trained":"Tr", "Trimmed":"Tm", "Burped":"B", "Humidity pack in":"HP", "Sensor moved":"S"};
const EVENTS_FOR = {ph:["Fed","Water change","Topped off","pH adjusted"], ec:["Fed","Water change","Topped off"], water:["Water change","Topped off"], height:["Trained","Trimmed","Light changed"],
  air:["Light changed","Sensor moved"], rh:["Sensor moved","Humidity pack in"], vpd:["Light changed","Sensor moved"], jar_rh:["Burped","Humidity pack in"], weight:[], lost:[]};
const textCache = new Map();
function fetchText(path){ if (!textCache.has(path)) textCache.set(path, isLocal() ? lget(path).then(b => b instanceof Blob ? b.text() : null).catch(() => null) : api(path, null, "application/vnd.github.raw").then(r => r.ok ? r.text() : null).catch(() => null)); return textCache.get(path); }
S.chartRange = (() => { try { return +(localStorage.getItem("ff-chart-range") ?? 7); } catch(e){ return 7; } })();
async function sensorPoints(p, from, kinds){
  const rows = new Map();
  if (S.smeta && window.Bridge){                          // bridge readings first (fetch older days on demand)
    const days = []; for (let t = Math.max(from, Date.parse("2026-11-16T00:00:00Z")); t <= Date.now(); t += 864e5) days.push(utcDay(t));
    await loadBridge(days.filter(d => !S.bdays[d]));
    for (const x of Bridge.forRun(bridgeRows(from), S.smeta, p.id, kinds)) rows.set(x.t + "|" + x.id, {at:new Date(x.t), t:x.temp, r:x.rh, id:x.id});
  }
  const logs = mine(S.logs).filter(l => (l.files || []).some(f => /\.(csv|txt)$/i.test(f)));
  const bridgeFrom = rows.size ? Math.min(...[...rows.values()].map(x => +x.at)) : Infinity;
  for (const l of logs){                                  // CSVs fill the time before the bridge; newest first, stop once far enough back
    if (Date.parse(l.at) > bridgeFrom + 864e5) continue;
    for (const f of l.files.filter(f => /\.(csv|txt)$/i.test(f))){ const t = await fetchText(f); const r = t && parseSensorRows(t); if (r) for (const x of r) if (+x.at < bridgeFrom) rows.set(+x.at, x); }
    const first = Math.min(...[...rows.values()].map(x => +x.at)); if (rows.size && first <= from) break;
  }
  if (!rows.size){                                        // no files: the 24 h summaries stored on the logs
    for (const l of mine(S.logs)) if (l.sensor && l.sensor.at) rows.set(Date.parse(l.sensor.at), {at:new Date(l.sensor.at), t:l.sensor.tavg ?? l.sensor.temp, r:l.sensor.havg ?? l.sensor.rh});
  }
  // several sensors (jars): average per 15-min slot so the line stays one line
  const slot = new Map(); for (const x of rows.values()){ const k = Math.round(+x.at / 9e5); const a = slot.get(k) || {at:new Date(k * 9e5), ts:[], rs:[]}; if (x.t != null) a.ts.push(x.t); if (x.r != null) a.rs.push(x.r); slot.set(k, a); }
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return [...slot.values()].map(a => ({at:a.at, t:avg(a.ts), r:avg(a.rs)})).sort((a, b) => a.at - b.at);
}
async function chartData(p, key, from){
  if (key === "jar_rh" && S.smeta){ const rows = await sensorPoints(p, from, ["jar"]); const pts = rows.map(x => ({t:+x.at, v:x.r})).filter(x => x.v != null);
    const logged = mine(S.logs).map(l => ({t:Date.parse(l.at), v:num(l.jar_rh)})).filter(x => x.v != null).reverse();
    if (pts.length) return {pts: pts.concat(logged.filter(x => x.t < pts[0].t)).sort((a, b) => a.t - b.t), dots:false, src:"sensor"}; }
  if (key === "air" || key === "rh" || key === "vpd"){
    const rows = await sensorPoints(p, from, S.smeta ? AIR_KINDS : undefined);
    const ph = phaseOf(p), rows2 = !rows.length && S.smeta && (ph === "cure" || ph === "done") ? await sensorPoints(p, from, ["jar"]) : rows;
    const pts = rows2.map(x => ({t:+x.at, v: key === "air" ? x.t : key === "rh" ? x.r : vpd(x.t, x.r)})).filter(x => x.v != null);
    if (pts.length) return {pts, dots: pts.length < 30, src: "sensor"};
    const k2 = key === "vpd" ? null : key;                // manual entries
    return {pts: k2 ? mine(S.logs).map(l => ({t:Date.parse(l.at), v:num(l[k2])})).filter(x => x.v != null).reverse() : [], dots:true, src:"log"};
  }
  if (key === "lost"){ const wet = num((p.run || {}).wet_g);
    return {pts: mine(S.logs).map(l => ({t:Date.parse(l.at), v: num(l.weight) != null && wet ? 100 * (1 - num(l.weight) / wet) : null})).filter(x => x.v != null).reverse(), dots:true, src:"log"}; }
  return {pts: mine(S.logs).map(l => ({t:Date.parse(l.at), v:num(l[key])})).filter(x => x.v != null).reverse(), dots:true, src:"log"};
}
async function openChart(key, label){
  const p = sel(); if (!p || !window.Chart) return;
  const old = $("#chartview"); if (old) old.remove();
  const box = h("div",{class:"chartbox"}), close = () => { v.remove(); removeEventListener("keydown", esc); };
  const esc = e => { if (e.key === "Escape") close(); };
  const v = h("div",{class:"viewer paper", id:"chartview", role:"dialog", "aria-modal":"true", "aria-label": label + " chart", "data-noswipe":""}, box);
  document.body.append(v); addEventListener("keydown", esc);
  const unit = {air:" °C", water:" °C", rh:" %", jar_rh:" %", lost:" %", weight:" g", height:" cm", vpd:" kPa"}[key] || "";
  const digits = {vpd:2, ph:1, ec:1, air:1, water:1}[key] ?? 0;
  const band = key === "vpd" ? [0.8, 1.2] : key === "lost" ? [72, 75] : (targetsOf(p)[key] || null);
  async function draw(){
    const now = Date.now(), runStart = Date.parse((p.start || phaseStart(p, phaseOf(p)) || today()) + "T00:00:00");
    const from = S.chartRange ? now - S.chartRange * 864e5 : runStart;
    box.replaceChildren(
      h("div",{class:"head", style:"align-items:center"}, h("h2",null, label), h("button",{type:"button", class:"gear", "aria-label":"Close chart", onclick:close}, raw('<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'))),
      h("p",{class:"kicker", style:"margin:-6px 0 0"}, (p.strain || p.name)),
      h("div",{class:"chips", role:"tablist", style:"gap:6px"}, RANGES.map(([l, d]) => h("button",{type:"button", class:"chip", role:"tab", style:"min-height:36px;font-size:15px;padding:0 12px", "aria-pressed": S.chartRange === d ? "true" : "false",
        onclick:() => { S.chartRange = d; try { localStorage.setItem("ff-chart-range", d); } catch(e){} draw(); }}, l))),
      h("p",{class:"sub"}, "Loading…"));
    const data = await chartData(p, key, from);
    if (!v.isConnected) return;
    const evs = mine(S.logs).flatMap(l => (l.actions || []).filter(a => (EVENTS_FOR[key] || []).includes(a)).map(a => ({t:Date.parse(l.at), k:EVENT_MARK[a], a})));
    const to = now, f2 = data.pts.length && !S.chartRange ? Math.min(from, data.pts[0].t) : from;
    const svg = Chart.svg([{pts:data.pts, dots:data.dots}], {from:f2, to, band, digits, events:evs, title:label, minSpan: {ph:0.4, ec:0.3, vpd:0.3}[key] || 2});
    box.lastChild.remove();
    if (!svg){ box.append(h("p",{class:"empty"}, data.pts.length ? "Nothing in this time frame. Try a longer one." : key === "vpd" || key === "air" || key === "rh" ? "No sensor data yet. Add a CSV export with a log." : "Nothing logged yet.")); return; }
    const inR = data.pts.filter(x => x.t >= f2 && x.t <= to), st = Chart.stats(inR), fx = n => (+n).toFixed(digits) + unit;
    const used = [...new Set(evs.filter(e => e.t >= f2).map(e => e.k + " " + e.a.toLowerCase()))];
    box.append(raw(svg),
      h("p",{class:"sub", style:"margin:0"}, "Low " + fx(st.min) + " · high " + fx(st.max) + " · average " + fx(st.avg) + (band ? " · target " + band[0] + "–" + band[1] + unit : "")),
      h("p",{class:"sub", style:"margin:0"}, (data.src === "sensor" ? (S.smeta ? "From your sensors (corrected)" : "From your sensor files") : st.n + (st.n === 1 ? " entry" : " entries") + " from your logs") + (used.length ? " · " + used.join(", ") : "")));
  }
  draw();
}

/* ---------- tip: a new one each time the app opens ----------
   Pool = general facts and lore, plus trivia for THIS plant's strain only (so swiping plants swaps it).
   Kinds rotate fact → lore → strain; tips already seen on this device are skipped until the pool runs out. */
const SEEN_KEY = "flowerphile-seen-tips";
S.tipShift = 0;
S.tipOpen = (() => { try { const n = +(localStorage.getItem("flowerphile-opens") || 0) + 1; localStorage.setItem("flowerphile-opens", n); return n; } catch(e){ return Math.floor(Date.now() / 864e5); } })();
function seenTips(){ try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch(e){ return []; } }
S.tipPick = {};
function tipFor(p){
  const key = (p ? p.id : "-") + ":" + S.tipShift;
  if (S.tipPick[key] !== undefined) return S.tipPick[key];
  return S.tipPick[key] = pickTip(p);
}
function pickTip(p){
  const ps = p && p.strain ? p.strain.toLowerCase() : null;
  // tips can be tagged for a stage (phase: ["grow","bloom"]) and/or a medium (medium: ["hydro"]); untagged ones fit everyone
  const ph = p ? phaseOf(p) : null, fits = t => (!t.phase || (ph && [].concat(t.phase).includes(ph))) && (!t.medium || (p && [].concat(t.medium).includes(p.medium)));
  // A6: Today = one short, mixed "good to know"; strain lessons live on the Info tab (no duplicates)
  const all = allTips().filter(t => !t.strain && t.kind !== "strain" && String(t.text || "").length <= 240 && (!t.plant || (p && t.plant === p.id)) && fits(t));
  if (!all.length) return null;
  // any tip not seen yet on this phone; tips tagged for the plant's stage get extra weight so the pool feels current,
  // and each kind (fact, lore, strain) is drawn in proportion to how many fresh ones it has, so small pools don't repeat
  const seen = seenTips();
  let fresh = all.filter(t => !seen.includes(t.id));
  if (!fresh.length){ try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen.filter(id => !all.some(t => t.id === id)))); } catch(e){} fresh = all; }
  const r = rnd(S.tipOpen * 97 + S.tipShift * 13 + 7);
  const w = fresh.map(t => (t.phase && ph && [].concat(t.phase).includes(ph) ? 2.5 : 1) * (t.kind === "lore" ? 0.6 : 1));
  let x = r() * w.reduce((a, b) => a + b, 0), i = 0; while (i < fresh.length - 1 && (x -= w[i]) > 0) i++;
  const t = fresh[i];
  try { if (!seen.includes(t.id)) localStorage.setItem(SEEN_KEY, JSON.stringify(seen.concat(t.id).slice(-500))); } catch(e){}
  return t;
}
function renderTip(p){
  const box = $("#t-tip"); if (!box) return; box.replaceChildren(); box._fk = null;
  const t = tipFor(p); box.hidden = !t; if (!t) return;
  const parts = [h("div",{class:"head",style:"align-items:baseline"}, h("h2",null,"Good to know", h("span",{class:"sub", style:"margin-left:6px;font-weight:400"}, t.kind === "lore" ? "forum lore · unverified" : (t.topic && t.topic !== "Good to know" ? t.topic.toLowerCase() : ""))),
    h("button",{type:"button", class:"btn ghost sm", "aria-label":"Another one", onclick:() => { S.tipShift++; renderTip(sel()); decorateSoon(); }}, "Another")),
    h("p",{class:"tiptext"}, t.text),
    t.src ? h("a",{class:"small muted", href:t.src.u, target:"_blank", rel:"noopener"}, "Source: " + t.src.t) : null,
    null];
  box.append(...parts.filter(Boolean));
}

/* ---------- strain sheet ---------- */
function strainOf(p){
  if (!p || !p.strain || !allStrains().length) return null;
  const n = p.strain.toLowerCase(), b = (p.breeder || "").toLowerCase();
  const L = allStrains(); return L.find(x => x.name.toLowerCase() === n && (!b || !x.breeder || x.breeder.toLowerCase() === b)) || L.find(x => x.name.toLowerCase() === n) || null;
}
const SPEC_ICONS = {
  moon:'<path d="M14 4a7 7 0 1 0 6 10A6 6 0 0 1 14 4z"/>',
  body:'<circle cx="12" cy="5" r="2.2"/><path d="M12 8v7M8 10l4 2 4-2M9.5 21l2.5-6 2.5 6"/>',
  drop:'<path d="M12 3c3 4.5 5 7.5 5 10a5 5 0 0 1-10 0c0-2.5 2-5.5 5-10z"/>',
  spark:'<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/>'
};
function lineageNode(n, depth){
  const kids = (n.parents || []).map(c => lineageNode(c, depth + 1));
  return h("li",{class:"ln"}, h("span",{class:"lname"}, n.name), n.by ? h("span",{class:"lby"}, " · " + n.by) : null,
    n.note ? h("div",{class:"lnote"}, n.note) : null, kids.length ? h("ul",null, kids) : null);
}
/* a strain sheet; by default the selected plant's, on the Plant tab. The Strains tab passes another sheet and its own box. */
/* the Character sliders as rows (Info tab and the Strains tab) */
function specRows(sp){ return (sp || []).map(v => h("div",{class:"spec-row"},
  raw('<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + (SPEC_ICONS[v.i] || "") + '</svg>'),
  h("span",{class:"sl"}, v.l),
  h("span",{class:"track", role:"img", "aria-label": v.l + " to " + v.r + ": " + Math.round(v.v * 10) + " of 10"}, h("span",{class:"dot", style:"left:calc(" + (v.v * 100) + "% - 6px)"})),
  h("span",{class:"sr"}, v.r))); }
/* v54b: "Your plant" = what is true for this plant and your earlier runs of the strain; the strain's own sections
   (facts, Character, terpenes…) stay general. Earlier-run lines live in the private sheet's `mine` field. */
function minePanel(p, x){
  const ph = phaseOf(p), T = today(), L = [], fd = x && flowerDays(x.flowering);
  const sp = phaseStart(p, "grow") || p.sprout, fl = flipOf(p), dry = phaseStart(p, "dry");
  if (["grow","bloom"].includes(ph)){
    L.push("Day " + (sp ? daysBetween(sp, T) + 1 : "?") + (ph === "bloom" && fl ? " · bloom day " + (daysBetween(fl, T) + 1) : ""));
    if (p.kind !== "auto" && (p.flipEst || p.endEst)) L.push("Your plan: " + [!fl || fl > T ? (p.flipEst ? "flip ~" + short(p.flipEst) : null) : null, p.endEst ? "harvest ~" + short(p.endEst) : null].filter(Boolean).join(", ") + (fd ? " (sheet: ~" + fd + " days of bloom)" : ""));
  } else if (fl && dry){
    const bd = daysBetween(fl, dry); L.push((p.kind === "auto" ? "Seed to harvest " + (sp ? daysBetween(sp, dry) : "?") : "Bloom " + bd) + " days" + (fd && p.kind !== "auto" ? " (sheet ~" + fd + ")" : ""));
  }
  const r = p.run || {}; if (r.dry_g || r.final_g) L.push([r.dry_g ? r.dry_g + " g dry" : null, r.final_g ? r.final_g + " g final" : null].filter(Boolean).join(" · ") + (r.verdict ? " · " + r.verdict : ""));
  const own = !["grow","bloom","germ"].includes(ph) && p.start ? p.start.slice(0, 4) + " run" : null;   // this plant's own run is already summed up above
  for (const m of (x && x.mine) || []) if (!own || !m.startsWith(own)) L.push(m);
  for (const l of (p.learnings || []).slice(-3)) L.push(l.text);
  if (!L.length) return null;
  return h("div",{class:"panel fr","data-soak":"0.15"}, h("h2",null,"Your plant"), h("ul",{class:"notes"}, L.map(t => h("li",null, t))));
}
function renderStrain(T){
  T = T || {};
  const p = sel(), other = T.sheet || null, x = other || strainOf(p), box = T.box || $("#st-body"), nameEl = T.name || $("#st-name"), byEl = T.by || $("#st-by"); box.replaceChildren();
  if (!x){ nameEl.textContent = p && p.strain ? p.strain : "Strain"; byEl.textContent = "";
    box.append(h("p",{class:"empty"}, p && p.strain ? "No strain sheet yet. The nightly review will research one." : "Set the strain under the gear → Edit, and a strain sheet appears here."), similarPanel(p)); if (!T.box) renderGuides(); decorateSoon(); return; }
  nameEl.textContent = x.name; byEl.textContent = [x.breeder, x.country].filter(Boolean).join(" · ");
  const facts = [["Type", x.type], ["Genetics", x.genetics], ["THC", x.thc], ["CBD", x.cbd], ["Bloom", daysOnly(x.flowering)], ["Height", x.height], ["Yield", x.yield], ["Climate", x.climate], ["How sure", x.confidence ? x.confidence + (x.status === "unreviewed" ? " · not reviewed" : "") : null]].filter(f => f[1]);
  box.append(h("dl",{class:"facts"}, facts.flatMap(f => [h("dt",null,f[0]), h("dd",{class:"num"},f[1])])));
  if (!other && p){ const mp = minePanel(p, x); if (mp) box.append(mp); }
  // A5 order: Character (open) → terpenes, taste and how sure we are → lineage, story, growing, lessons (collapsed)
  const fold = (title, kids, open) => h("div",{class:"panel fr","data-soak":"0.12"}, h("details",{class:"fold", open: open ? "" : null}, h("summary",null, h("h2",{style:"display:inline"}, title)), ...kids));
  const ch = [];
  if (x.special && x.special.length) ch.push(h("div",{class:"chips", style:"gap:6px"}, x.special.map(t => h("span",{class:"tag"}, t))));
  ch.push(...specRows(x.spectra));
  if (x.spectraNote) ch.push(h("p",{class:"note-line"}, x.spectraNote));
  if (ch.length) box.append(h("div",{class:"panel fr","data-soak":"0.12"}, h("h2",null,"Character"), ...ch));
  const tp = h("div",{class:"panel fr","data-soak":"0.12"}, h("h2",null,"Terpenes, taste, effect"));
  if (x.terpNote) tp.append(h("p",{class:"note-line"}, x.terpNote));
  for (const t of x.terpenes || []) tp.append(h("div",{class:"terp"}, h("b",null,t.name), t.note ? h("span",null," · " + t.note) : null, t.basis ? h("div",{class:"lnote"}, t.basis) : null));
  if (x.taste && x.taste.length) tp.append(h("p",{style:"margin:0"}, h("span",{class:"muted"},"Taste "), x.taste.join(", ")));
  if (x.effects && x.effects.length) tp.append(h("p",{style:"margin:0"}, h("span",{class:"muted"},"Effect "), x.effects.join(", ")));
  box.append(tp);
  if (x.lineage) box.append(fold("Lineage", [h("ul",{class:"tree"}, lineageNode(x.lineage, 0))]));
  if (x.story) box.append(fold("Story", [h("p",{class:"prose"}, x.story)]));
  if (x.growNotes && x.growNotes.length) box.append(fold("Growing her", [h("ul",{class:"notes"}, x.growNotes.map(t => h("li",null, daysOnly(t))))]));
  // A6: the longer, plant-specific lessons live here (collapsed); Today keeps one short mixed "good to know"
  const triv = (S.tips || []).filter(t => t.strain && t.strain.toLowerCase() === x.name.toLowerCase());
  const les = [...(x.bio || []).map(t => h("p",{class:"prose"}, t)),
    ...(triv.length ? [h("ul",{class:"notes"}, triv.map(t => h("li",null, t.text, t.src ? h("a",{class:"small muted", href:t.src.u, target:"_blank", rel:"noopener", style:"display:block"}, "Source: " + t.src.t) : null)))] : [])];
  if (les.length) box.append(fold("Lessons", les));
  if (x.sources && x.sources.length) box.append(h("details",null, h("summary",{class:"small muted"},"Sources"), h("ul",{class:"notes small"}, x.sources.map(s => h("li",null, h("a",{href:s.u, target:"_blank", rel:"noopener"}, s.t))))));
  if (!other) box.append(similarPanel(p));
  if (!other) renderGuides();
  decorateSoon();
}

function renderToday(){
  const p = sel(), T = today();
  document.documentElement.style.setProperty("--c", p ? colorOf(p) : "var(--ink)");
  $("#t-date").textContent = new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  drawSpecimen(p);
  if (!p){
    $("#t-day").textContent = APP; $("#t-stage").textContent = S.cfg ? (S.synced ? "No plants" : "–") : "Not connected"; $("#t-medium").textContent = "";
    $("#t-tasks").replaceChildren(S.synced || isLocal() ? h("div",{style:"display:flex;flex-direction:column;gap:10px"}, h("p",{class:"empty", style:"margin:0"}, S.qz && S.qz.mode === "new" ? "Your plant isn't saved yet." : "No plants yet."),
      h("a",{class:"btn primary", href:"#plant-new"}, S.qz && S.qz.mode === "new" ? "Continue the questions" : "Add your first plant")) : h("p",{class:"empty"}, "Loading your plan…"));
    $("#t-grid").replaceChildren(); $("#t-next").replaceChildren(); $("#t-more").textContent = ""; decorateSoon(); return;
  }
  $("#t-date").textContent += " · " + p.name;
  const ph = phaseOf(p), psd = phaseStart(p, ph);
  $("#t-day").textContent = ph === "done" ? "Finished"
    : ph === "dry" && psd ? "Dry day " + (daysBetween(psd, T) + 1) : ph === "cure" && psd ? "Cure day " + (daysBetween(psd, T) + 1)
    : p.status === "resting" ? "Resting" : (p.start ? "Day " + daysBetween(p.start, T) : p.name);
  const growing = ph === "grow" || ph === "bloom";
  const si = ph === "germ" ? 0 : ph === "bloom" ? 4 : ph === "grow" ? Math.min(3, stageIndex(p)) : 5;
  const st = $("#t-stage"); st.replaceChildren(
    raw('<svg aria-hidden="true" width="22" height="25" viewBox="0 0 30 34"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + GLYPHS[si] + '</g></svg>'),
    document.createTextNode(growing ? stageText(p) : PHASES[ph] + (psd && ph !== "done" ? " · since " + short(psd) : "")));
  const li = lampInfo(p);
  $("#t-medium").textContent = (MEDIA[p.medium]||MEDIA.hydro).label + " · " + (SYSTEMS[p.system] || "") + " · " + (WHERE[p.where] || "");
  const sx = strainOf(p); $("#t-strain").replaceChildren(sx ? h("a",{href:"#strain"}, "About " + sx.name + " →") : document.createTextNode(""));
  $("#t-lamp").textContent = li ? "Lamp " + Math.round(li.lamp) + " cm above rim" + (li.gap != null ? " · " + Math.round(li.gap) + " cm to canopy" : "") : "";

  const todays = mine(S.logs).filter(l => l.date === T);
  const lg = $("#t-logged");
  lg.className = "logged " + (todays.length ? "yes" : "no");
  lg.querySelector(".box").innerHTML = '<g fill="none" style="stroke:var(--ink)" stroke-linecap="round" filter="url(#rough)"><rect x="2" y="2" width="16" height="16" rx="2" stroke-width="1.2"/>' + (todays.length ? '<path d="M5 10 l3.5 3.5 L15 6" stroke-width="2"/>' : '') + '</g>';
  $("#t-logged-txt").textContent = todays.length ? "Logged " + hm(todays[0].at) + (todays.length > 1 ? " · " + todays.length + "×" : "") : "Not logged yet";
  $("#t-logbtn").textContent = todays.length ? "Log again" : ph === "germ" ? "Log a step" : "Log values";

  const due = openTasks().filter(t => t.due && t.due <= T).sort(sortTasks);
  const doneToday = mine(S.tasks).filter(t => t.status === "done" && t.doneAt && ymd(new Date(t.doneAt)) === T && t.auto !== "skipped" && !t.dropped);   // the app's own skips are not "done" (they show under Why things moved)
  const box = $("#t-tasks"); box.replaceChildren();
  if (!due.length && !doneToday.length) box.append(h("p",{class:"empty"},"Nothing due today."));
  for (const t of due) box.append(taskRow(t));
  if (doneToday.length){
    if (S.showDone) doneToday.forEach(t => box.append(taskRow(t)));
    box.append(h("button",{type:"button", class:"donebtn", onclick:() => { S.showDone = !S.showDone; renderToday(); }}, S.showDone ? "Hide done" : "✓ " + doneToday.length + " done today"));
  }
  $("#t-count").textContent = "";
  const lastLog = mine(S.logs)[0], ackEl = $("#t-ack");
  ackEl.textContent = lastLog && lastLog.ack && lastLog.date === T ? lastLog.ack.replace(/^Noted/, "Noted " + hm(lastLog.at)) : ""; ackEl.hidden = !ackEl.textContent;
  const askEl = $("#t-stepask"); if (askEl){ askEl.replaceChildren(); const can = !ackEl.hidden && askable(lastLog) && !(lastLog.replies || []).length;
    askEl.hidden = !can; if (can) askEl.append(h("button",{type:"button", class:"btn ghost sm", onclick:() => { S.planSeg = "book"; location.hash = "#plan"; askStep(p, lastLog); }}, lastLog.asks ? "Ask your AI this question" : "Ask your AI about this step")); }

  // Observations: three plant values + three climate/weather values
  const fields = fieldsFor(p);
  const core = fields.filter(k => k !== "ppfd" && k !== "height");
  for (const k of ["height","ppfd"]) if (core.length < 3 && fields.includes(k)) core.push(k);
  const env = envTiles(p);
  const warm = env.warm || 0, frost = env.frost || 0;
  const grid = $("#t-grid"); grid.replaceChildren();
  let newest = null;
  const ct = uiTiles(p) || coreTiles(p);
  if (ct){ ct.forEach(t => grid.append(tile(t[0], t[1], t[2], {soak:0.22, warm, frost, key:t[3]}))); const l0 = mine(S.logs)[0]; if (l0) newest = l0.at; }
  else core.slice(0,3).forEach((k, i) => {
    const l = latest(k);
    if (l && (!newest || l.at > newest)) newest = l.at;
    grid.append(tile(labelFor(p,k,true), l ? fmtv(k, l.v) : "–", statusOf(k, l && l.v), {soak:0.22, warm, frost, key:k}));
  });
  if (ph !== "done") env.tiles.forEach(t => grid.append(tile(t[0], t[1], t[2], {soak:0.55, key:t[3]})));
  const extra = (ct ? [] : fields.filter(k => !core.slice(0,3).includes(k))).map(k => { const l = latest(k); return l ? labelFor(p,k,true) + " " + fmtv(k, l.v) : null; }).filter(Boolean);
  if (env.more) extra.push(env.more);
  $("#t-more").textContent = extra.join(" · ");
  $("#t-envage").textContent = (newest ? "entered " + hm(newest) : "no entries yet") + (env.age ? " · " + env.age : "");

  const next = openTasks().filter(t => !t.due || t.due > T).sort(sortTasks).slice(0,4);
  const nb = $("#t-next"); nb.replaceChildren();
  const nextHead = $("#t-nexthead"); nextHead.hidden = ph === "done";
  if (ph === "done"){ nb.append(learningsPanel(p, true)); next.length = 0; }
  else if (!next.length) nb.append(h("p",{class:"empty"},"Nothing scheduled yet."));
  renderTip(p);
  const sb = $("#t-summary"); sb.replaceChildren(); sb._fk = null;
  const summ = p.summary || [], pic = resultPic(p), late = ["dry","cure","done"].includes(ph);
  sb.hidden = !late;
  if (!sb.hidden){
    const open = S.sumOpen === p.id, lines = open ? summ : summ.slice(0, 3);
    if (pic){
      const img = h("img",{class:"plate", alt:"Result photo of " + (p.strain || p.name) + (pic.plate ? ", half photo, half ink" : "")});
      (pic.plate ? mediaUrl(pic.path) : stylized({id: p.id + "-result"}, pic).catch(() => null).then(u => u || mediaUrl(pic.path))).then(u => { if (u){ img.src = u; img.onload = decorateSoon; } });
      img.addEventListener("click", async () => { const u = await mediaUrl(pic.path); if (u){ const v = h("div",{class:"viewer paper", role:"dialog", "aria-label":"Result photo", onclick:() => v.remove()}, h("img",{src:u, alt:""})); document.body.append(v); } });
      const hd = phaseStart(p, "dry");
      sb.append(h("figure",{class:"platefig"}, img, h("figcaption",null, (p.strain || p.name) + (hd ? " · harvested " + short(hd) : ""))));
    } else sb.append(h("div",{class:"howto", style:"margin:0 0 6px"},
      h("p",{class:"what", style:"margin:0"}, "The run's result picture: a photo of the whole plant on harvest day, a close-up of one bud and a handful of buds. Log them with the \u201cResult photo\u201d chip; the first one shows here."),
      h("button",{type:"button", class:"btn ghost sm", style:"align-self:flex-start", onclick:() => { S.preAct = "Result photo"; location.hash = "#log"; }}, "Add result photos")));
    if (summ.length) sb.append(h("div",{class:"head",style:"align-items:baseline"}, h("h2",null,"The run"), h("a",{href:"#plan", class:"small"}, "Numbers →")),
      h("ul",{class:"notes"}, lines.map(t => h("li",null,t))),
      ...(summ.length > 3 ? [h("button",{type:"button", class:"donebtn", onclick:() => { S.sumOpen = open ? null : p.id; renderToday(); }}, open ? "Less" : "More (" + (summ.length - 3) + ")")] : []));
  }
  for (const t of next) nb.append(h("div",{class:"row"}, h("span",null,t.title), h("span",{class:"lead"}), h("span",{class:"when"}, t.due ? fmtDay(t.due) : (t.trigger || "when ready"))));
  const old = $("#t-ask"); if (old) old.remove();
  const oa = $("#p-ai"); if (oa) oa.remove();
  const apn = aiPanel(p); if (apn) $("#t-tasks").closest(".panel").after(apn);
  const ask = askCard(p); if (ask) sb.after(ask);
  decorateSoon();
}
function envTiles(p){
  const none = {cls:"none", word:"", txt:""}; const note = $("#t-envnote"); note.textContent = "";
  if ((p.where || "indoor") === "outdoor" && !["dry","cure","done"].includes(phaseOf(p))){
    const pl = placeOf(p), w = pl && S.weather[pl.lat+","+pl.lon];
    if (!w){ loadWeather(p).then(x => { if (x && sel() === p) renderToday(); }); return {tiles:[["Now","–",none],["Rain mm","–",none],["Gusts km/h","–",none]], age:"loading weather"}; }
    const c = w.j.current || {}, d = w.j.daily || {};
    const t0 = c.temperature_2m, mn = d.temperature_2m_min ? d.temperature_2m_min[0] : null, rain = d.precipitation_sum ? d.precipitation_sum[0] : null, gust = d.wind_gusts_10m_max ? d.wind_gusts_10m_max[0] : null;
    return {
      tiles:[["Now", t0 != null ? t0.toFixed(1)+"°" : "–", t0 != null && t0 < 5 ? {cls:"low", word:"cold", txt: mn != null && mn < 2 ? "frost tonight" : "today " + Math.round(mn) + "–" + Math.round(d.temperature_2m_max[0]) + "°"} : {cls:"none", word:"", txt: mn != null ? "today " + Math.round(mn) + "–" + Math.round(d.temperature_2m_max[0]) + "°" : ""}],
             ["Rain mm", rain != null ? rain.toFixed(1) : "–", {cls:"none", word:"", txt:"today"}],
             ["Gusts km/h", gust != null ? String(Math.round(gust)) : "–", gust > 40 ? {cls:"high", word:"high", txt:"stake & tie"} : {cls:"none", word:"", txt:"max today"}]],
      frost: mn != null && mn < 2 ? 0.8 : 0, more: c.relative_humidity_2m != null ? "Humidity " + Math.round(c.relative_humidity_2m) + "%" : "",
      age: "weather " + hm(new Date(w.at).toISOString())
    };
  }
  const s = latestSensor();
  const T = targetsOf(p), ph = phaseOf(p);
  sensorNote(p);
  if (s){
    const v = vpd(s.temp, s.rh);
    const vs = v == null ? none : v < 0.8 ? {cls:"low", word:"low", txt:"aim 0.8–1.2"} : v > 1.4 ? {cls:"high", word:"high", txt:"aim 0.8–1.2"} : {cls:"ok", word:"good", txt:"aim 0.8–1.2"};
    const old = (Date.now() - new Date(s.at)) / 864e5;
    if (old > 2) note.textContent = "Sensor data is " + ago(s.at).replace(" ago","") + " old. " + (S.smeta ? "Is the sensor placed with this plant? (Log → Sensor moved)" : "Upload a fresh CSV with your next log.");
    const hi = T.air ? T.air[1] : 26;
    return {
      tiles:[["Air", s.temp != null ? s.temp.toFixed(1)+"°" : "–", statusOf("air", s.temp), "air"], ["Humidity", s.rh != null ? Math.round(s.rh)+"%" : "–", statusOf("rh", s.rh), "rh"],
        ph === "dry" || ph === "cure" ? ["RH 24 h", s.hmin != null ? Math.round(s.hmin) + "–" + Math.round(s.hmax) : "–", s.hmax != null && s.hmax - s.hmin > 8 ? {cls:"high", word:"swingy", txt:"keep it steady"} : {cls:"none", word:"", txt:"min–max %"}, "rh"] : ["VPD", v != null ? v.toFixed(2) : "–", vs, "vpd"]],
      warm: s.temp != null ? Math.max(0, Math.min(1, (s.temp - hi) / 4)) : 0,
      more: s.tmin != null ? "Air 24 h " + s.tmin.toFixed(0) + "–" + s.tmax.toFixed(0) + "°, humidity " + Math.round(s.hmin) + "–" + Math.round(s.hmax) + "%" : "",
      age: "sensor " + ago(s.at)
    };
  }
  const ma = latest("air"), mr = latest("rh");
  if (!ma && !mr) note.textContent = "No sensor data yet. Upload a CSV export with a log.";
  return {tiles:[["Air", ma ? fmtv("air", ma.v) : "–", statusOf("air", ma && ma.v), "air"], ["Humidity", mr ? fmtv("rh", mr.v) : "–", statusOf("rh", mr && mr.v), "rh"], [["dry","cure","done"].includes(phaseOf(p)) ? "RH 24 h" : "VPD","–",none]], age: ma || mr ? "manual " + ago((ma||mr).at) : ""};
}


/* ---------- knowledge base (public, knowledge/*.json next to the app; built weekly by the research run) ----------
   Served by GitHub Pages with the app, so it needs no key and the service worker keeps it for offline use.
   Pages show under Plan → Guides; tips join the tip pool; generic strain sheets fill gaps in the library. */
const KN_KEY = "ff-knowledge";
S.kn = (() => { try { return JSON.parse(localStorage.getItem(KN_KEY) || "null") || {pages:[], tips:[], strains:[]}; } catch(e){ return {pages:[], tips:[], strains:[]}; } })();
async function loadKnowledge(){
  try {
    const get = f => fetch("knowledge/" + f, {cache:"no-cache"}).then(r => r.ok ? r.json() : null).catch(() => null);
    const [pages, tips, strains, catalogue] = await Promise.all([get("pages.json"), get("tips.json"), get("strains.json"), get("catalogue.json")]);
    if (pages || tips || strains || catalogue){ S.kn = {pages: pages || S.kn.pages, tips: tips || S.kn.tips, strains: strains || S.kn.strains, catalogue: catalogue || S.kn.catalogue || []}; try { localStorage.setItem(KN_KEY, JSON.stringify(S.kn)); } catch(e){} }
  } catch(e){}
}
const allTips = () => { const own = S.tips || [], ids = new Set(own.map(t => t.id));   // own tips first; public starter tips fill in (same ids skipped)
  return own.concat((S.kn.tips || []).filter(t => t.status !== "rejected" && !ids.has(t.id))); };
function allStrains(){ const own = S.strains || [], seen = new Set(own.map(x => norm(x.name)));
  return own.concat((S.kn.strains || []).filter(x => !seen.has(norm(x.name)) && x.status !== "rejected")); }
const AREA = {technique:"Techniques", problem:"Problems", environment:"Environment", nutrition:"Nutrition", botany:"Botany", chemistry:"Chemistry", harvest:"Harvest & drying", cure:"Curing", history:"History"};
function pageCard(pg){
  const hw = pg.howto && window.HowTo ? HowTo.byId(pg.howto) : null;
  return h("div",{class:"howto", onclick:e => e.stopPropagation()},
    h("p",{class:"what"}, pg.summary),
    ...(pg.sections || []).map(x => h("div",null, h("h2",null, x.h), h("p",{style:"margin:2px 0 0"}, x.text))),
    hw ? h("button",{type:"button", class:"btn ghost sm howbtn", onclick:() => { S.openHow.add("g-" + hw.id); renderGuides(); decorateSoon(); }}, "How to: " + hw.title.toLowerCase()) : null,
    h("p",{class:"sub", style:"margin:0"}, h("b",{style:"font-style:normal"}, "Sources: "), (pg.sources || []).map((x, i) => h("span",null, i ? " · " : "", h("a",{href:x.u, target:"_blank", rel:"noopener"}, x.t)))),
    h("p",{class:"sub", style:"margin:0"}, (pg.status === "reviewed" ? "Reviewed" : "Not reviewed yet") + " · updated " + short(pg.updated)));
}

/* ---------- how-tos (howto.js): small illustrated guides next to the steps that need them ----------
   A task shows "How to" when it names one (task.howto = id) or its title matches one. Plan → Guides lists all. */
S.openHow = new Set();
function howtoFor(t){ if (!window.HowTo || !t) return null; return (t.howto && HowTo.byId(t.howto)) || HowTo.find(t.title); }
function howtoCard(hw){
  return h("div",{class:"howto", onclick:e => e.stopPropagation()},
    h("p",{class:"what"}, hw.what),
    h("ol",{class:"hsteps"}, hw.steps.map((st, i) => h("li",null, raw(HowTo.fig(st.fig)), h("div",null, h("b",null, (i + 1) + ". "), st.text)))),
    hw.watch && hw.watch.length ? h("div",null, h("h2",null,"Watch out"), h("ul",{class:"notes"}, hw.watch.map(w => h("li",null,w)))) : null,
    hw.vs ? h("p",{class:"sub", style:"margin:0"}, h("b",{style:"font-style:normal"}, "Not the same as: "), hw.vs) : null,
    ...(S.kn.pages || []).filter(pg => pg.howto === hw.id).map(pg => h("button",{type:"button", class:"btn ghost sm howbtn", onclick:e => { e.stopPropagation(); S.openHow.add("k-" + pg.id); location.hash = "#strain"; setTimeout(() => { const g = $("#p-guides"); if (g){ g.open = true; renderGuides(); g.scrollIntoView({block:"start"}); } }, 60); }}, "Read more: " + pg.title)));
}
function howtoToggle(key, hw, rerender){
  const open = S.openHow.has(key);
  return h("button",{type:"button", class:"btn ghost sm howbtn", "aria-expanded": open ? "true" : "false", onclick:e => { e.stopPropagation(); open ? S.openHow.delete(key) : S.openHow.add(key); rerender(); decorateSoon(); }}, (open ? "Hide how-to: " : "How to: ") + hw.title.toLowerCase());
}
function renderGuides(){
  const box = $("#p-guides"); if (!box || !window.HowTo) return; const list = $("#p-guidelist"); list.replaceChildren();
  const p = sel(), ph = p ? phaseOf(p) : null;
  const pages = (S.kn.pages || []).filter(x => x.status !== "rejected").slice().sort((a, b) => ((b.phase || []).includes(ph) - (a.phase || []).includes(ph)) || a.title.localeCompare(b.title));
  if (pages.length){ list.append(h("p",{class:"kicker", style:"margin:4px 0 0"}, "Knowledge"));
    for (const pg of pages){ const k = "k-" + pg.id, open = S.openHow.has(k);
      list.append(h("div",{class:"guide"}, h("button",{type:"button", class:"tt", "aria-expanded": open ? "true" : "false", onclick:() => { open ? S.openHow.delete(k) : S.openHow.add(k); renderGuides(); decorateSoon(); }},
        h("span",null, h("b",null, pg.title), h("span",{class:"sub"}, " · " + (AREA[pg.area] || pg.area))), h("span",{class:"chev","aria-hidden":"true"}, open ? " –" : " +")), open ? pageCard(pg) : null)); }
    list.append(h("p",{class:"kicker", style:"margin:8px 0 0"}, "How-tos")); }
  for (const hw of HowTo.all){ const k = "g-" + hw.id, open = S.openHow.has(k);
    list.append(h("div",{class:"guide"}, h("button",{type:"button", class:"tt", "aria-expanded": open ? "true" : "false", onclick:() => { open ? S.openHow.delete(k) : S.openHow.add(k); renderGuides(); decorateSoon(); }}, h("b",null, hw.title), h("span",{class:"chev","aria-hidden":"true"}, open ? " –" : " +")), open ? howtoCard(hw) : null)); }
}
S.openTask = new Set();
function taskRow(t){
  const id = "task-" + t.id, done = t.status === "done", more = t.detail || t.trigger;
  const cb = h("input",{type:"checkbox", id, checked:done, "aria-label": (done ? "Reopen: " : "Done: ") + t.title, onchange:e => toggleTask(t, e.target.checked)});
  const open = !done && S.openTask.has(t.id);
  const title = more && !done
    ? h("button",{type:"button", class:"tt", "aria-expanded": open ? "true" : "false", onclick:() => { S.openTask.has(t.id) ? S.openTask.delete(t.id) : S.openTask.add(t.id); renderToday(); }},
        h("b",null,t.title), h("span",{class:"chev", "aria-hidden":"true"}, open ? "–" : "+"))
    : h("label",{for:id, class:"tt"}, h("b",null,t.title));
  const ask = !done && /check in with claude/i.test(t.title);
  return h("div",{class:"task"+(done?" done":"")+(t.urgent && !done ? " urgent" : "")}, cb, h("div",{class:"tb"}, title,
    !done && doseFor(t, sel()) ? h("span",{class:"dose"}, doseFor(t, sel())) : null,
    open ? h("span",{class:"d"}, detailOf(t, sel()), t.trigger ? (t.detail ? " · " : "") + "Trigger: " + t.trigger : "") : null,
    open && howtoFor(t) ? howtoToggle("t-" + t.id, howtoFor(t), renderToday) : null,
    open && howtoFor(t) && S.openHow.has("t-" + t.id) ? howtoCard(howtoFor(t)) : null,
    ask ? h("button",{type:"button", class:"btn ghost sm", style:"align-self:flex-start;margin-top:4px", onclick:() => openCheckin(t)}, "Copy check-in & open chat") : null));
}
/* check-in: copy a short summary of the plant to the clipboard, then open the plant's Claude chat (link set in the plant form) */
function checkinText(t){
  const p = sel(); if (!p) return "";
  const v = k => { const x = latest(k); return x ? x.v : null; };
  const vals = [["pH", v("ph")], ["EC", v("ec")], ["water", v("water"), " °C"], ["height", v("height"), " cm"], ["nodes", v("nodes")], ["PPFD", v("ppfd")]]
    .filter(x => x[1] != null).map(x => x[0] + " " + x[1] + (x[2] || "")).join(", ");
  const sn = latestSensor();
  const lines = ["Check-in for " + (p.strain || p.name) + " (" + (stageText(p) || "") + ", " + today() + ")"];
  if (t && t.detail) lines.push("Why: " + t.detail);
  if (vals) lines.push("Latest: " + vals);
  if (p.lamp) lines.push("Lamp " + p.lamp + " cm above the rim");
  if (sn) lines.push("Air last 24 h: " + [sn.tmin != null ? sn.tmin + "–" + sn.tmax + " °C" : sn.temp + " °C", sn.hmin != null ? "RH " + sn.hmin + "–" + sn.hmax + " %" : sn.rh != null ? "RH " + sn.rh + " %" : null].filter(Boolean).join(", "));
  const notes = mine(S.logs).filter(l => l.note || (l.actions && l.actions.length)).slice(0, 4);
  if (notes.length){ lines.push("Recent:"); for (const l of notes) lines.push("- " + (l.at || "").slice(5, 16).replace("T", " ") + " " + [(l.actions || []).join(", "), l.note].filter(Boolean).join(": ")); }
  const soon = openTasks().filter(x => x.id !== (t && t.id) && x.due && x.due <= addDays(today(), 3)).sort(sortTasks);
  if (soon.length) lines.push("Coming up: " + soon.map(x => x.title + " (" + x.due.slice(5) + ")").join("; "));
  return lines.join("\n");
}
async function openCheckin(t){
  const p = sel(), url = (p && p.chat) || "https://claude.ai/new";
  try { await navigator.clipboard.writeText(checkinText(t)); setSync("Check-in copied · paste it in the chat"); } catch(e){}
  window.open(url, "_blank", "noopener");
}
async function toggleTask(t, on){
  const prev = {status:t.status, doneAt:t.doneAt};
  t.status = on ? "done" : "open"; t.doneAt = on ? new Date().toISOString() : null; renderAll();
  try {
    S.tasks = await mutate("tasks.json", list => (list||[]).map(x => x.id === t.id ? Object.assign({}, x, {status:t.status, doneAt:t.doneAt}) : x), (on ? "done: " : "reopen: ") + t.title);
    if (on && t.aim && t.aim.length === 2){                 // a ramp feed step moves the EC target with it
      const T = today(), was = ((S.plants.find(x => x.id === t.run) || {}).targets || {}).ec;
      S.plants = await mutate("plants.json", list => (list || []).map(x => x.id === t.run ? Object.assign({}, x, {targets: Object.assign({}, x.targets, {ec: t.aim})}) : x), "target EC");
      try { S.changes = (await mutate("changes.json", list => (list || []).concat({id:"c-" + T.replace(/-/g, "") + "-t" + Math.random().toString(36).slice(2, 6), run:t.run, date:T, src:"app", text:"EC target " + (was ? was.join("–") + " → " : "") + t.aim.join("–") + " after the feed step."}), "app: target")).slice().sort((a,b) => (b.date||"").localeCompare(a.date||"")); } catch(e){}
    }
    cache(); renderAll();
  } catch(e){ Object.assign(t, prev); renderAll(); setSync("Couldn't save · tap to retry", true); }
}

/* ---------- key learnings: what a finished run teaches the next one ----------
   plant.learnings = [{text, at, src?}]. Shown where "Next: …" sits on an open run, and on Today instead of "To come".
   The setup questions of a new plant surface the learnings of earlier runs with the same medium or place. */
function learningsPanel(p, compact){
  const L = p.learnings || [], wrap = h("div",{style:"display:flex;flex-direction:column;gap:8px"});
  wrap.append(h("div",{class:"head",style:"align-items:baseline"}, h("h2",null,"Key learnings"), compact ? h("a",{href:"#plan", class:"small"}, "The run →") : null));
  if (L.length) wrap.append(h("ul",{class:"notes"}, L.map(x => h("li",null, typeof x === "string" ? x : x.text))));
  else wrap.append(h("p",{class:"empty"}, "Nothing written down yet. What would you do differently next time?"));
  if (compact) return wrap;
  const inp = h("input",{type:"text", autocomplete:"off", placeholder:"Add a learning"}), msg = h("p",{class:"status", role:"status"});
  wrap.append(h("form",{style:"flex-direction:row;gap:8px;align-items:flex-end", onsubmit: async e => { e.preventDefault(); const t = inp.value.trim(); if (!t) return; msg.textContent = "Saving…";
    try { S.plants = await mutate("plants.json", list => (list || []).map(x => x.id === p.id ? Object.assign({}, x, {learnings: (x.learnings || []).concat({text:t, at:today(), src:"app"})}) : x), "learning");
      cache(); msg.textContent = ""; renderAll(); } catch(err){ msg.textContent = "Couldn't save. Try again."; } }}, inp, h("button",{class:"btn sm", type:"submit"}, "Add")), msg);
  return wrap;
}
function pastLearnings(medium, where, notId){
  return S.plants.filter(x => x.id !== notId && (x.learnings || []).length && (x.medium === medium || x.where === where))
    .flatMap(x => x.learnings.map(l => ({from: x.strain || x.name, text: typeof l === "string" ? l : l.text})));
}


/* ---------- setup questions (quiz.js): one question per screen, a tap answers and moves on ----------
   #plant-new asks the basics first and creates the plant at the end; #plant-setup re-runs it for the shown plant.
   Answers land in plant.setup, flags in plant.flags, first plan steps in tasks.json (src "setup"). */
function quizCtx(draft){
  const p = draft || {}, entry = p.strain ? libEntries().find(e => norm(e.name) === norm(p.strain)) || null : null;
  const sheet = entry && entry.sh ? entry.sh : (p.strain ? allStrains().find(x => norm(x.name) === norm(p.strain)) || null : null);
  const grown = !!p.strain && S.plants.some(x => x.id !== p.id && norm(x.strain) === norm(p.strain) && ["dry","cure","done"].includes(phaseOf(x)));
  return {plant: p, entry, sheet, grown, past: pastLearnings((p.setup || {}).medium || p.medium || "hydro", p.where || "indoor", p.id), today: today(), defaults: DEFAULT_TARGETS, tasks: S.tasks, profile: S.profile};
}
function openQuiz(mode){
  const p = mode === "edit" ? sel() : null;
  S.qz = {mode, pid: p ? p.id : null, step: 0, ans: {}, draft: p ? Object.assign({}, p) : {start: today()}};
  const Q = Quiz.questions(quizCtx(S.qz.draft));
  for (const q of Q) if (q.def){ const d = q.def(S.qz.ans); if (d != null) S.qz.ans[q.id] = d; }
}
function quizSteps(){ const a = S.qz.ans; return Quiz.questions(quizCtx(S.qz.draft)).filter(q => !q.show || q.show(a)); }
const qv = (x, a) => typeof x === "function" ? x(a) : x;
function renderQuiz(){
  const box = $("#qz-body"); if (!box || !S.qz) return; box.replaceChildren();
  const steps = quizSteps(), a = S.qz.ans, n = steps.length, i = Math.min(S.qz.step, n);
  const prog = h("div",{class:"prog", "aria-hidden":"true"}, steps.map((_, k) => h("i",{class: k <= i ? "on" : ""})));
  const back = h("button",{type:"button", class:"donebtn", onclick:() => { if (S.qz.step > 0){ S.qz.step--; renderQuiz(); } else location.hash = "#" + (S.back || "today"); }}, "← Back");
  const go = () => { S.qz.step = i + 1; renderQuiz(); window.scrollTo(0, 0); };
  if (i >= n) return renderQuizSummary(box, steps, prog, back);
  const q = steps[i];
  box.append(prog, h("div",{style:"display:flex;justify-content:space-between;align-items:baseline"}, back, h("span",{class:"sub"}, (i + 1) + " of " + n)),
    h("h1",null, qv(q.title, a)), qv(q.why, a) ? h("p",{class:"muted", style:"margin:0"}, qv(q.why, a)) : null);
  if (q.type === "form"){
    const d = S.qz.draft, dl = h("datalist",{id:"qz-strains"}, libEntries().map(e => h("option",{value:e.name})));
    const strain = h("input",{type:"text", list:"qz-strains", autocomplete:"off", value:d.strain || "", placeholder:"Strain"});
    const name = h("input",{type:"text", autocomplete:"off", value:d.name || "", placeholder:"e.g. Tank 2, Balcony A"});
    const start = h("input",{type:"date", value:d.start || today()});
    const msg = h("p",{class:"status", role:"status"});
    box.append(dl, h("label",{class:"f"}, "Strain", strain), h("label",{class:"f"}, "Name (optional)", name), h("label",{class:"f"}, "Started (seed soaked or planted)", start),
      h("button",{type:"button", class:"btn primary", onclick:() => {
        if (!strain.value.trim() && !name.value.trim()){ msg.textContent = "Give it a strain or a name."; return; }
        d.strain = strain.value.trim() || null; d.name = name.value.trim() || d.strain; d.start = start.value || today();
        const e = d.strain ? libEntries().find(x => norm(x.name) === norm(d.strain)) : null; if (e && e.breeder) d.breeder = e.breeder;
        for (const qq of Quiz.questions(quizCtx(d))) if (qq.def && a[qq.id] == null){ const v = qq.def(a); if (v != null) a[qq.id] = v; }
        go(); }}, "Next"), msg, h("a",{href:"#plant-full", class:"small"}, "All fields instead"));
    return;
  }
  if (q.type === "geo"){
    const msg = h("p",{class:"sub", style:"margin:0"}, a[q.id] ? "Saved: " + a[q.id].lat + ", " + a[q.id].lon : "");
    box.append(h("button",{type:"button", class:"btn primary", onclick:() => { msg.textContent = "Asking the phone…";
      if (!navigator.geolocation){ msg.textContent = "This browser can't share a location. Skip for now."; return; }
      navigator.geolocation.getCurrentPosition(pos => { a[q.id] = {lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100}; go(); },
        () => { msg.textContent = "No location shared. You can skip; weather just stays off."; }, {timeout: 10000, maximumAge: 3600e3}); }}, "Use my location"), msg,
      h("button",{type:"button", class:"donebtn", onclick:go}, a[q.id] ? "Keep this" : "Skip"));
    return;
  }
  if (q.type === "same"){
    const items = q.items(a), lab = (qq, v) => { const o = qq.opts ? qv(qq.opts, a).find(x => x[0] === v) : null; return o ? o[1] : v && v.lat != null ? "your location" : String(v) + (qq.num && typeof v === "number" ? " " + qq.num : ""); };
    box.append(h("div",{class:"runrows"}, items.map(([qq, v]) => h("div",{class:"row"}, h("span",null, qv(qq.title, a).replace(/\?$/, "")), h("span",{class:"lead"}), h("span",{class:"when"}, lab(qq, v))))),
      h("button",{type:"button", class:"btn primary", onclick:go}, "Same as last time"),
      h("button",{type:"button", class:"btn ghost", onclick:() => { a._change = true; go(); }}, "Change these"));
    return;
  }
  if (q.type === "text"){
    const inp = h("input",{type:"text", autocomplete:"off", value:a[q.id] || "", placeholder:q.placeholder || ""});
    box.append(inp, h("button",{type:"button", class:"btn primary", onclick:() => { a[q.id] = inp.value.trim() || null; go(); }}, inp.value ? "Next" : "Next (or skip)"));
    return;
  }
  const opts = h("div",{class:"opts", role:"radiogroup"});
  for (const [v, l, sub] of qv(q.opts, a)){
    const on = a[q.id] === v;
    opts.append(h("button",{type:"button", class:"chip", role:"radio", "aria-checked": on ? "true" : "false", "aria-pressed": on ? "true" : "false",
      onclick:() => { a[q.id] = v; if (q.date && v === q.date){ renderQuiz(); return; } renderQuiz(); setTimeout(go, 160); }}, h("span",null, l, sub ? h("small",null, sub) : null)));
  }
  box.append(opts);
  if (q.num){
    const other = h("input",{type:"text", inputmode:"decimal", autocomplete:"off", placeholder:"Other (" + q.num + ")", value: a[q.id] != null && !qv(q.opts, a).some(o => o[0] === a[q.id]) ? a[q.id] : ""});
    box.append(h("div",{style:"display:flex;gap:8px;align-items:flex-end"}, other, h("button",{type:"button", class:"btn ghost sm", onclick:() => { const x = num(other.value); if (x != null){ a[q.id] = x; go(); } }}, "Use")));
  }
  if (q.date && a[q.id] === q.date){
    const dt = h("input",{type:"date", value:a.by || ""});
    box.append(h("label",{class:"f"}, "Done by", dt), h("button",{type:"button", class:"btn primary", onclick:() => { a.by = dt.value || null; go(); }}, "Next"));
  }
  if (a[q.id] != null && !(q.date && a[q.id] === q.date)) box.append(h("button",{type:"button", class:"btn ghost", onclick:go}, "Keep this and go on"));
  else if (a[q.id] == null) box.append(h("button",{type:"button", class:"donebtn", onclick:go}, "Skip"));
  decorateSoon();
}
function renderQuizSummary(box, steps, prog, back){
  const a = S.qz.ans, d = S.qz.draft, ctx = quizCtx(Object.assign({}, d, {id: d.id || "new"}));
  const r = Quiz.derive(a, ctx), label = (q, v) => { const o = q.opts ? qv(q.opts, a).find(x => x[0] === v) : null; return o ? o[1] : v == null || v === "" ? "–" : v.lat != null ? v.lat + ", " + v.lon : String(v) + (q.num && typeof v === "number" ? " " + q.num : ""); };
  box.append(prog, back, h("h1",null, S.qz.mode === "new" ? (d.strain || d.name) : "Setup of " + (d.strain || d.name)));
  const list = h("div",{class:"runrows"});
  steps.forEach((q, k) => { if (q.type === "form") return;
    list.append(h("div",{class:"row", style:"cursor:pointer", onclick:() => { S.qz.step = k; renderQuiz(); }}, h("span",null, qv(q.title, a).replace(/\?$/, "")), h("span",{class:"lead"}), h("span",{class:"when"}, label(q, a[q.id]) + (q.id === "timing" && a.by ? " " + short(a.by) : "")))); });
  box.append(h("div",{class:"panel fr", "data-soak":"0.1"}, h("h2",null,"Your answers"), list, h("p",{class:"sub", style:"margin:0"}, "Tap a line to change it.")));
  if (r.flags.length) box.append(h("div",{class:"panel fr", "data-soak":"0.15"}, h("h2",null,"Watch out for"), h("ul",{class:"flags"}, r.flags.map(f => h("li",{class:f.lvl}, f.text)))));
  if (r.tasks.length) box.append(h("div",{class:"panel fr", "data-soak":"0.12"}, h("h2",null,"First steps for the plan"), h("ul",{class:"notes"}, r.tasks.map(t => h("li",null, h("b",null,t.title), " · " + (t.due ? fmtDay(t.due) : t.trigger))))));
  const msg = h("p",{class:"status", role:"status"});
  box.append(h("button",{type:"button", class:"btn primary", onclick: async e => { e.currentTarget.disabled = true; msg.textContent = "Saving…"; try { await saveQuiz(); } catch(err){ msg.textContent = err.code === "auth" ? "The access key was rejected." : "Couldn't save. Check your connection and try again."; e.target.disabled = false; } }},
    S.qz.mode === "new" ? "Add plant" : "Save setup"), msg);
  decorateSoon();
}
async function saveQuiz(){
  const a = S.qz.ans, d = S.qz.draft, isNew = S.qz.mode === "new", id = isNew ? "p-" + Date.now() : S.qz.pid, T = today();
  const r = Quiz.derive(a, quizCtx(Object.assign({}, d, {id})));
  S.plants = await mutate("plants.json", list => {
    list = list || []; const i = list.findIndex(x => x.id === id);
    if (i < 0) list.push(Object.assign({id, name:d.name || d.strain, strain:d.strain || null, breeder:d.breeder || null, start:d.start || T, status:"active", created:T, offDays:[], targets:r.targets}, r.fields, {setup:r.setup, flags:r.flags}, r.flipAt ? {} : {}, r.end && !d.endEst ? {endEst:r.end} : {}));
    else { const y = Object.assign({}, list[i], r.fields, {setup:r.setup, flags:r.flags, updated:new Date().toISOString()}); y.targets = Object.assign({}, r.targets, list[i].targets || {}); if (r.end && !y.endEst) y.endEst = r.end; list[i] = y; }
    return list;
  }, (isNew ? "add plant via setup questions" : "setup questions"));
  const tasks = r.tasks.map(t => Object.assign({}, t, {id: t.id.replace(/-(new|undefined)$/, "-" + id), run: id}));
  if (tasks.length) S.tasks = await mutate("tasks.json", list => { const L = list || [], ids = new Set(L.map(t => t.id)); return L.concat(tasks.filter(t => !ids.has(t.id))); }, "setup: first steps");
  if (r.profile){ try { S.profile = Object.assign({at:T}, S.profile || {}, r.profile); await mutate("profile.json", () => S.profile, "profile: remembered answers"); } catch(e){} }
  const warn = r.flags.filter(f => f.lvl === "warn").length;
  try { S.changes = (await mutate("changes.json", list => (list || []).concat({id:"c-" + T.replace(/-/g, "") + "-q" + Math.random().toString(36).slice(2, 6), run:id, date:T, src:"app",
    text:"Setup questions answered" + (tasks.length ? "; added " + tasks.map(t => t.title.toLowerCase()).join(", ") : "") + (warn ? "; " + warn + " warning" + (warn > 1 ? "s" : "") + " to watch" : "") + "."}), "setup: why")).slice().sort((x, y) => (y.date||"").localeCompare(x.date||"")); } catch(e){}
  cache(); S.sel = id; try { localStorage.setItem(SEL_KEY, id); } catch(e){}
  S.qz = null; renderAll(); location.hash = isNew ? "#today" : "#plan";
  S.planRan = null; keepPlans();                          // a new plant gets its first days planned right away
}
function setupPanel(p){
  if (!p || p.status !== "active" || !["germ","grow","bloom"].includes(phaseOf(p))) return null;
  const box = h("div",{class:"panel fr", "data-soak":"0.15", id:"p-setup"});
  if (!p.setup){ box.append(h("h2",null,"Confirm the setup"), h("p",{style:"margin:0"}, "About 8 taps: seed, where and in what, pot, light or spot, water, goal. Sets targets, first steps and early warnings."), h("a",{class:"btn primary", href:"#plant-setup"}, "Answer the setup questions")); return box; }
  // B4: the setup's base watch-outs were shown once in the setup questions; here they stay folded.
  // Only plant-specific ones (from an observation, a review or your AI) stand out.
  const fl = p.flags || [], own = fl.filter(f => f.src && f.src !== "setup" || /^ai-|^obs-|^rev-/.test(f.k || "")), base = fl.filter(f => !own.includes(f));
  if (own.length) box.append(h("h2",null,"Watch out for"), h("ul",{class:"flags"}, own.map(f => h("li",{class:f.lvl}, f.text))));
  box.append(h("details",{class:"fold"}, h("summary",null, h("span",null, own.length ? "From the setup (" + base.length + ")" : "Watch out for · from the setup (" + base.length + ")")),
    base.length ? h("ul",{class:"flags"}, base.map(f => h("li",{class:f.lvl}, f.text))) : h("p",{class:"empty"}, "Nothing flagged for this setup."),
    h("a",{href:"#plant-setup", class:"small"}, "Setup questions")));
  return box;
}

/* B5: day notes. Tap a day this week, write a short note ("away Saturday"); the app moves steps off a day marked away
   or busy (rules.js maintain), and the note travels to the nightly review and your AI. plant.dayNotes = {date: text}. */
function renderDays(p){
  const box = $("#p-days"); if (!box) return; box.replaceChildren(); const old = $("#p-daynote"); if (old) old.remove();
  if (!p || !["germ","grow","bloom","dry","cure"].includes(phaseOf(p))){ box.hidden = true; return; } box.hidden = false;
  const T = today(), notes = p.dayNotes || {}, open = openTasks();
  for (let i = 0; i < 7; i++){ const d = addDays(T, i), dd = new Date(d + "T12:00:00"), n = open.filter(t => t.due === d).length;
    box.append(h("button",{type:"button", class: d === T ? "today" : "", "aria-pressed": S.dayPick === d ? "true" : "false", "aria-label": fmtDay(d) + (notes[d] ? ", note: " + notes[d] : "") + (n ? ", " + n + " step" + (n > 1 ? "s" : "") : ""),
      onclick:() => { S.dayPick = S.dayPick === d ? null : d; renderDays(p); decorateSoon(); }},
      dd.toLocaleDateString("en-GB",{weekday:"short"}), h("b",null, String(dd.getDate())), notes[d] ? h("span",{class:"dot","aria-hidden":"true"}) : null, n ? h("span",{class:"nt","aria-hidden":"true"}, n + "×") : null)); }
  const d = S.dayPick; if (!d || d < T || d > addDays(T, 6)) return;
  const inp = h("input",{type:"text", maxlength:"120", autocomplete:"off", placeholder:"e.g. away, move the water change", value: notes[d] || ""}), msg = h("span",{class:"sub"});
  const save = async txt => { msg.textContent = "Saving…";
    try { S.plants = await mutate("plants.json", list => (list || []).map(x => { if (x.id !== p.id) return x; const dn = Object.assign({}, x.dayNotes || {});
        for (const k of Object.keys(dn)) if (k < addDays(T, -14)) delete dn[k];
        if (txt) dn[d] = txt; else delete dn[d]; return Object.assign({}, x, {dayNotes: Object.keys(dn).length ? dn : undefined}); }), "day note " + d);
      cache(); const q = S.plants.find(x => x.id === p.id), m = window.Rules ? Rules.maintain(q, ruleCtx(q)) : null;
      if (m && (m.moves.length || m.tasks.length || m.close.length)) await applyRules([[q.id, Object.assign(m, {why: [], kind: "upkeep"})]], "plan");
      S.dayPick = null; renderAll(); } catch(e){ msg.textContent = "Couldn't save."; } };
  box.after(h("form",{class:"daynote", id:"p-daynote", onsubmit:e => { e.preventDefault(); save(inp.value.trim()); }}, h("span",{class:"small"}, fmtDay(d)), inp,
    h("button",{class:"btn sm", type:"submit"}, "Save"), notes[d] ? h("button",{class:"btn ghost sm", type:"button", onclick:() => save("")}, "Clear") : null, msg));
  // v54: no autofocus: the page keeps its place; the keyboard opens only when the field is tapped
}

/* ---------- weekly focus and open questions ----------
   Each ISO week one part of the process gets questioned (rules.js focus(): water → feed → light → climate → training).
   experiments.json = [{id, q, why, status open|answered, answer?, run?, area?, src?, date}]: open questions and
   small experiments, with what each answer would tell us. The nightly review adds and answers them. */
function focusPanel(p){
  if (!window.Rules || !["germ","grow","bloom"].includes(phaseOf(p))) return null;
  const f = Rules.focus(today()), ex = (S.experiments || []).filter(x => (!x.run || x.run === p.id));
  const open = ex.filter(x => x.status !== "answered"), done = ex.filter(x => x.status === "answered");
  const box = h("div",{class:"panel fr", "data-soak":"0.12", id:"p-focus"});
  box.append(h("div",{class:"head",style:"align-items:baseline"}, h("h2",null,"This week: " + f.t), h("span",{class:"sub"}, "week " + f.week)), h("p",{style:"margin:0"}, f.q), h("p",{class:"sub", style:"margin:0"}, "The nightly review questions this part of the process this week, then moves on: water, feed, light, climate, training."));
  const row = x => h("li",null, h("b",null, x.q), x.why ? h("span",{class:"muted"}, " · would tell us: " + x.why) : null, x.answer ? h("div",{class:"sub"}, "So far: " + x.answer) : null);
  const inArea = open.filter(x => x.area === f.k), rest = open.filter(x => x.area !== f.k);
  if (open.length) box.append(h("h2",{style:"margin-top:4px"}, "Open questions"), h("ul",{class:"notes"}, inArea.concat(rest).map(row)));
  if (done.length) box.append(h("details",null, h("summary",{class:"small"}, "Answered (" + done.length + ")"), h("ul",{class:"notes", style:"margin-top:8px"}, done.map(row))));
  return box;
}

function runRows(p){
  const T = today(), ps = k => phaseStart(p, k), flip = flipOf(p), run = p.run || {};
  const dur = (a, b) => a && b && b >= a ? daysBetween(a, b) + " d" : null;
  const rows = [
    ["Germination", dur(ps("germ"), ps("grow"))],
    ["Vegetative", dur(ps("grow"), flip && flip <= T ? flip : (phaseOf(p) === "grow" ? T : null))],
    ["Bloom", flip && flip <= T ? dur(flip, ps("dry") || T) : null],
    ["Drying", dur(ps("dry"), ps("cure") || (phaseOf(p) === "dry" ? T : null))],
    ["Curing", dur(ps("cure"), ps("done") || (phaseOf(p) === "cure" ? T : null))],
    ["Seed to jar", dur(ps("germ") || ps("grow"), ps("cure"))]
  ].filter(r => r[1]);
  if (run.wet_g) rows.push(["Wet weight", run.wet_g + " g"]);
  if (run.dry_g) rows.push(["Dry weight", run.dry_g + " g" + (run.wet_g ? " · " + Math.round(100 * run.dry_g / run.wet_g) + "% of wet" : "")]);
  if (run.final_g) rows.push(["Final weight", run.final_g + " g"]);
  if (run.verdict) rows.push(["Verdict", run.verdict]);
  return rows;
}
/* B2: one timeline. Solid = done, dashed = expected; the line = today; "~" dates are predictions in the muted colour,
   a struck-through date = the first estimate this phone saw (or plant.est0 from a review) when it has moved since. */
function est0(p){
  if (p.est0) return p.est0;
  let m = {}; try { m = JSON.parse(localStorage.getItem("ff-est0") || "{}"); } catch(e){}
  if (!m[p.id] && (p.flipEst || p.endEst)){ m[p.id] = {flip: p.flipEst || null, end: p.endEst || null}; try { localStorage.setItem("ff-est0", JSON.stringify(m)); } catch(e){} }
  return m[p.id] || {};
}
function timeline(p){
  const T = today(), ph = phaseOf(p), ps = k => phaseStart(p, k), o = est0(p);
  const germ = ps("germ") || p.start, grow = ps("grow") || p.sprout, flip = flipOf(p), dry = ps("dry"), cure = ps("cure"), done = ps("done");
  const pts = [  // [key, label, actual, expected, original]
    ["germ", "Germ", germ, null, null],
    ["grow", "Veg", grow, germ ? addDays(germ, 5) : null, null],
    ["bloom", "Bloom", flip && flip <= T ? flip : null, p.flipEst || (p.kind === "auto" && grow ? addDays(grow, 28) : null), o.flip],
    ["dry", "Dry", dry, p.endEst || null, o.end],
    ["cure", "Cure", cure, (dry || p.endEst) ? addDays(dry || p.endEst, 10) : null, null]];
  const dt = x => x[2] || x[3];
  const a0 = dt(pts[0]) || T, endD = done || (cure ? addDays(cure, 30) : dt(pts[4]) ? addDays(dt(pts[4]), 30) : addDays(T, 60));
  const span = Math.max(1, daysBetween(a0, endD)), pc = d => Math.max(0, Math.min(100, 100 * daysBetween(a0, d) / span));
  const bar = h("div",{class:"tl", role:"img", "aria-label":"Run timeline, today in " + PHASES[ph]});
  pts.forEach((x, i) => { const s0 = dt(x); if (!s0) return; const nx = pts.slice(i + 1).find(dt), e0 = nx ? dt(nx) : endD;
    const L = pc(s0), W = Math.max(0.5, pc(e0) - L), started = !!x[2] && x[2] <= T, over = nx && nx[2] && nx[2] <= T;
    const cls = over || (ph === "done") ? "past" : started ? "cur" : "fut";
    const k = cls === "cur" ? Math.max(0, Math.min(100, 100 * (pc(T) - L) / W)) : 0;
    bar.append(h("div",{class:"seg " + cls + " ph-" + x[0], style:"left:" + L + "%;width:" + W + "%" + (cls === "cur" ? ";--k:" + k + "%" : "")})); });
  pts.forEach(x => { if (x[4] && x[3] && x[4] !== x[3] && !x[2]) bar.append(h("div",{class:"ghost", style:"left:" + pc(x[4]) + "%", title:"First estimate " + short(x[4])})); });
  if (ph !== "done") bar.append(h("div",{class:"now", style:"left:calc(" + pc(T) + "% - 1px)", title:"Today"}));
  // v54: a finished run shows how long each phase really took, next to what was expected (muted)
  const sh = strainOf(p), expD = {bloom: sh && flowerDays(sh.flowering) && p.kind !== "auto" ? flowerDays(sh.flowering) : null, dry: 12, cure: 28};
  const lenOf = i => { const a = pts[i][2], nx = pts.slice(i + 1).find(y => y[2]); const b = nx ? nx[2] : done; return a && b ? daysBetween(a, b) : null; };
  const lab = h("div",{class:"tlab"}, pts.map((x, i) => { const act = x[2] && x[2] <= T, d = act ? x[2] : x[3], moved = !act && x[4] && x[3] && x[4] !== x[3];
    const len = ph === "done" ? lenOf(i) : null, ex = len != null ? expD[x[0]] : null;
    return h("span",{class: x[0] === ph ? "on" : ""}, h("b",null, x[1]),
      len != null ? h("small",{class: ex ? shiftTint(addDays(T, ex), addDays(T, len)).trim() : null}, len + " d") : null,
      ex ? h("small",{class:"est"}, "exp " + ex) : null,
      len != null ? null : d ? h("small",{class: (act ? "" : "est") + (moved ? shiftTint(x[4], x[3]) : "")}, (act ? "" : "~") + short(d)) : h("small",{class:"est"}, "·"),
      moved ? h("small",{class:"was", title:"First estimate"}, short(x[4])) : null); }));
  return h("div",null, bar, lab);
}
function renderPhase(p){
  const box = $("#p-phase"); box.replaceChildren(); box._fk = null; box.hidden = !p; if (!p) return;
  const ph = phaseOf(p), T = today();
  box.append(h("div",{class:"head",style:"align-items:center"}, h("h2",null,"The run"), h("span",{class:"muted small"}, PHASES[ph])), timeline(p));
  const rows = runRows(p);
  if (p.summary && p.summary.length) box.append(h("details",null, h("summary",{class:"small"},"Story of this run"), h("ul",{class:"notes", style:"margin-top:8px"}, p.summary.map(t => h("li",null,t)))));
  if (rows.length) box.append(h("div",{class:"runrows"}, rows.map(r => h("div",{class:"row"}, h("span",null,r[0]), h("span",{class:"lead"}), h("span",{class:"when num"}, r[1])))));
  const nx = NEXT[ph]; if (!nx){ if (ph === "done") box.append(learningsPanel(p)); return; }
  const form = h("form",{class:"phaseform", hidden: true});
  const date = h("input",{type:"date", value:T, max:T});
  const wt = nx.w ? h("input",{type:"text", inputmode:"decimal", autocomplete:"off", placeholder:"–"}) : null;
  let verdict = null; const vbox = h("div",{class:"chips"});
  if (ph === "cure") VERDICTS.forEach(v => vbox.append(h("button",{type:"button", class:"chip", "aria-pressed":"false", onclick:e => { verdict = v; vbox.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", c === e.currentTarget ? "true" : "false")); }}, v)));
  const note = h("input",{type:"text", autocomplete:"off", placeholder:"Optional note"});
  const msg = h("p",{class:"status", role:"status"});
  form.append(...[h("p",{class:"muted small", style:"margin:0"}, nx.hint), h("div",{class:"fields"}, h("label",{class:"f"}, "Date", date), wt ? h("label",{class:"f"}, nx.wl, wt) : null),
    ph === "cure" ? h("fieldset",null, h("legend",null,"How did it turn out?"), vbox) : null, h("label",{class:"f"}, "Note", note),
    h("button",{class:"btn primary", type:"submit"}, "Confirm: " + nx.btn), msg].filter(Boolean));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const d = date.value || T, w = wt ? num(wt.value) : null, nt = note.value.trim();
    msg.textContent = "Saving…";
    try {
      S.plants = await mutate("plants.json", list => (list || []).map(x => {
        if (x.id !== p.id) return x;
        const y = Object.assign({}, x); y.phase = nx.to; y.phases = Object.assign({}, x.phases || {});
        if (!y.phases.germ && x.start && nx.to !== "grow") y.phases.germ = x.start;
        if (!y.phases.grow && x.sprout) y.phases.grow = x.sprout;
        y.phases[nx.to] = d;
        if (nx.to === "grow" && !x.sprout) y.sprout = d;
        if (nx.to === "bloom"){ y.flip = d; y.stage = "flower"; }
        y.run = Object.assign({}, x.run || {}); if (w != null) y.run[nx.w] = w; if (verdict) y.run.verdict = verdict;
        if (nx.to === "done") y.status = "done";
        return y;
      }), "phase " + nx.to);
      const entry = {id:"l-" + Date.now(), run:p.id, at:new Date().toISOString(), date:d, source:"app", actions:[nx.btn], note:nt, photos:[], files:[]};
      if (w != null) entry[nx.w] = w;
      S.logs = sortLogs(await mutate("logs.json", list => [...(list || []), entry], "log " + d));
      cache(); renderAll(); location.hash = "#today";
    } catch(err){ msg.textContent = err.code === "auth" ? "The access key was rejected." : "Couldn't save. Check your connection and try again."; }
  });
  box.append(h("button",{type:"button", class:"btn ghost", onclick:e => { form.hidden = !form.hidden; e.currentTarget.textContent = form.hidden ? "Next: " + nx.btn : "Not yet"; }}, "Next: " + nx.btn), form);
}
function renderPlan(){
  const p = sel(), T = today();
  renderPhase(p);
  for (const x of ["#p-focus", "#p-setup"]){ const o = $(x); if (o) o.remove(); }
  // B1: run tile → this week / coming up → the rest
  const fp = p && focusPanel(p); if (fp) $("#p-steps").after(fp);
  const sp = setupPanel(p); if (sp) $("#p-steps").after(sp);
  $("#p-upd").textContent = p && p.updated ? "updated " + short(ymd(new Date(p.updated))) : "";
  renderDays(p);
  const list = $("#p-list"), list2 = $("#p-list2"); list.replaceChildren(); list2.replaceChildren();
  const open = openTasks().sort(sortTasks), wk = addDays(T, 6);
  const soon = open.filter(t => !t.due || t.due <= wk), later = open.filter(t => t.due && t.due > wk);
  if (!soon.length) list.append(h("li",null,h("span",{class:"empty"}, open.length ? "Nothing in the next 7 days." : "No open steps.")));
  $("#p-latehead").hidden = !later.length;
  const row = t => {
    const isDue = t.due && t.due <= T, note = p && p.dayNotes && t.due && p.dayNotes[t.due];
    const open = S.openTask.has("p-" + t.id), more = t.trigger || t.detail || howtoFor(t), moved = t.was && t.due && t.was !== t.due;
    return h("li",{class:"fr","data-soak":"0.12", onclick: more ? e => { if (e.target.closest("a,button")) return; S.openTask.has("p-" + t.id) ? S.openTask.delete("p-" + t.id) : S.openTask.add("p-" + t.id); renderPlan(); decorateSoon(); } : null, style: more ? "cursor:pointer" : null},
      h("div",{style:"display:flex;flex-direction:column;gap:2px;min-width:0"}, h("span",{style:"font-weight:600"},t.title, more ? h("span",{class:"chev","aria-hidden":"true"}, open ? " –" : " +") : null),
        moved && t.whyMoved ? h("span",{class:"why-moved"}, t.whyMoved) : null,
        note ? h("span",{class:"why-moved"}, "Your note: " + note) : null,
        doseFor(t, p) ? h("span",{class:"dose"}, doseFor(t, p)) : null,
        open ? h("span",{class:"muted small"}, [detailOf(t, p), t.trigger ? "Trigger: " + t.trigger : ""].filter(Boolean).join(" · ")) : null,
        open && howtoFor(t) ? howtoToggle("p-" + t.id, howtoFor(t), renderPlan) : null),
      h("span",{class:"when num"+(isDue?" due":"")}, moved ? h("span",{class:"was"}, "was " + short(t.was)) : null,
        h("span",{class: moved ? shiftTint(t.was, t.due).trim() : null}, t.due ? (isDue ? fmtDay(t.due) : "~" + fmtDay(t.due)) : "open")),
      open && howtoFor(t) && S.openHow.has("p-" + t.id) ? howtoCard(howtoFor(t)) : null);
  };
  soon.forEach(t => list.append(row(t))); later.forEach(t => list2.append(row(t)));
  const dl = $("#p-donelist"); dl.replaceChildren();
  const done = mine(S.tasks).filter(t => t.status === "done" && t.auto !== "skipped" && !t.dropped).sort((a,b) => (b.doneAt||"").localeCompare(a.doneAt||""));
  $("#p-done").hidden = !done.length;
  for (const t of done) dl.append(h("li",null, h("span",{class:"muted"},t.title), h("span",{class:"when"}, t.doneAt ? fmtDay(ymd(new Date(t.doneAt))) : "done")));
  const ch = $("#p-changes"); ch.replaceChildren();
  const mc = mine(S.changes);
  if (!mc.length) ch.append(h("p",{class:"empty"},"No changes yet. When a review moves a date, the reason shows here."));
  for (const c of mc.slice(0,20)) ch.append(h("p",{class:"change"}, h("b",null, short(c.date)), " · " + c.text));
}
function thumb(path){
  const img = h("img",{alt:"Photo from this log", loading:"lazy"});
  mediaUrl(path).then(u => { if (u) img.src = u; });
  img.addEventListener("click", async () => {
    const u = await mediaUrl(path); if (!u) return;
    const v = h("div",{class:"viewer", role:"dialog", "aria-label":"Photo", onclick:() => v.remove()}, h("img",{src:u, alt:"Photo"}));
    document.body.append(v);
  });
  return img;
}
function renderHistory(){
  const p = sel(), box = $("#h-list"); box.replaceChildren();
  const logs = mine(S.logs);
  if (!logs.length){ box.append(h("p",{class:"empty"},"Your logs will show up here, newest first.")); return; }
  for (const l of logs){
    const vals = ALL_KEYS.filter(k => num(l[k]) != null).map(k => h("span",null, labelFor(p,k,true) + " ", h("b",{class:"num"}, fmtv(k, num(l[k])))));
    const s = l.sensor;
    const files = l.files || [];
    box.append(h("article",{class:"log fr","data-soak":"0.12"},
      h("div",{class:"head",style:"align-items:center"}, h("span",{style:"font-weight:600"}, fmtTime(l.at)), l.source ? h("span",{class:"tag"}, l.source) : null),
      vals.length ? h("div",{class:"vals"}, vals) : null,
      s ? h("div",{class:"vals"}, h("span",null, s.src === "bridge" ? "Sensors " : "Sensor ", h("b",{class:"num"}, (s.temp != null ? s.temp.toFixed(1)+"° " : "") + (s.rh != null ? Math.round(s.rh)+"%" : ""))), s.tmin != null ? h("span",{class:"muted"}, "24 h "+s.tmin.toFixed(0)+"–"+s.tmax.toFixed(0)+"°") : null) : null,
      (l.actions && l.actions.length) ? h("div",{class:"chips",style:"gap:6px"}, l.actions.map(a => h("span",{class:"tag"},a))) : null,
      l.note ? h("p",{style:"margin:0;font-size:14px;color:var(--muted)"}, l.note) : null,
      l.moved ? h("p",{class:"sub", style:"margin:0"}, "Moved: " + l.moved.map(m => "sensor " + m.num + " → " + m.place).join(", ")) : null,
      l.ack ? h("p",{class:"sub", style:"margin:0"}, l.ack) : null,
      (l.photos && l.photos.length) ? h("div",{class:"thumbs"}, l.photos.map(thumb)) : null,
      (l.replies || []).length ? h("div",{class:"thread"}, l.replies.map(r => h("div",{class:"reply"}, h("span",{class:"kicker"}, (r.src === "ai" ? "Your AI" : "You") + " · " + short(r.at.slice(0, 10))), h("p",{style:"margin:2px 0 0;white-space:pre-wrap"}, r.text)))) : null,
      askBox(p, l),
      files.length ? h("div",{class:"thumbs"}, files.map(f => /\.(jpe?g|png|webp)$/i.test(f) ? thumb(f) : h("span",{class:"tag"}, /\.csv$/i.test(f) ? "Sensor file" : "File"))) : null,
      h("div",{style:"display:flex;gap:8px"},
        h("button",{type:"button", class:"btn ghost sm", onclick:() => startEdit(l)}, "Edit"),
        h("button",{type:"button", class:"btn ghost sm", style:S.armDel===l.id ? "color:var(--bad);border-color:var(--bad)" : null, onclick:() => delLog(l)}, S.armDel===l.id ? "Tap again to delete" : "Delete"))));
  }
}
function renderAll(){ registerCustom(); if (themePref() === "plant") applyTheme(); renderTabs(); renderToday(); renderPlan(); renderHistory(); if (!$("#v-strain").hidden) renderStrain(); if (!$("#v-library").hidden) renderLibrary(); if (!$("#v-setup").hidden) renderSetup(); decorateSoon(); }

/* ---------- log form ---------- */
function renderLogForm(){
  const p = sel(); if (!p) return;
  if (S.preAct){ S.actions.add(S.preAct); S.preAct = null; }
  const keep = {}; document.querySelectorAll("#l-fields input").forEach(i => keep[i.dataset.k] = i.value);
  const box = $("#l-fields"); box.replaceChildren();
  const ph = phaseOf(p), fl = fieldsFor(p).slice();
  if ((ph === "grow" || ph === "bloom") && S.actions.has("Light changed")) fl.push("lamp");
  $("#l-hint").textContent = ph === "germ" ? "Tap the steps you did. A photo is plenty." : ph === "dry" ? "Weigh the same sample each time. Upload the drying sensor's CSV." : ph === "cure" ? "Jar RH from the hygrometer inside the jar." : ph === "done" ? "This run is closed. You can still add notes and photos." : "Fill what you measured, skip the rest. Grey numbers are your last values.";
  for (const k of fl){
    const l = latest(k), ph0 = k === "lamp" && !l && p.lamp != null ? {v: p.lamp} : l;
    box.append(h("label",{class:"f"}, labelFor(p,k), h("input",{type:"text", inputmode:"decimal", autocomplete:"off", "data-k":k, placeholder: ph0 ? String(ph0.v) : "–", value: keep[k] || null})));
  }
  const chips = $("#chips"); chips.replaceChildren();
  for (const a of actionsFor(p)){
    chips.append(h("button",{type:"button", class:"chip", "aria-pressed": S.actions.has(a) ? "true" : "false", onclick:e => {
      const on = !S.actions.has(a); on ? S.actions.add(a) : S.actions.delete(a);
      e.currentTarget.setAttribute("aria-pressed", on ? "true" : "false");
      if (a === "Light changed" || a === "Sensor moved") renderLogForm(); else renderFeedBox(p);
    }}, a));
  }
  // a sensor file fits any phase: outdoor plants still dry and cure indoors, and jars get sensors too
  $("#l-sensordrop").hidden = false;   // A3: generic "Other data" for everyone (sensor CSV, notes, text…)
  renderMoveBox(p); renderFeedBox(p); renderViewBox(p);
  if (!S.edit) $("#l-title").textContent = p.name;
}

/* v54: what went in. Water change / Fed / Topped off open a small box: litres now, ml per product, EC before (optional),
   litres topped off. Saved as log.feed {vol, ml, ecBefore} and log.top_l; feed.js learns the dose and the drinking from them. */
function feedProducts(p){
  const f = S.logs.filter(l => l.run === p.id && l.feed && l.feed.ml).sort((a, b) => a.at < b.at ? 1 : -1)[0];
  if (f) return Object.keys(f.feed.ml);
  if (p.feed && p.feed.products) return p.feed.products;
  return p.doseRef && p.doseRef.parts ? String(p.doseRef.parts).split(/,| and /).map(x => x.trim()).filter(Boolean) : ["CalMag", "Part A", "Part B"];
}
function renderFeedBox(p){
  const old = $("#l-feed"), keep = {}; if (old){ old.querySelectorAll("input").forEach(i => keep[i.dataset.k] = i.value); old.remove(); }
  const fed = S.actions.has("Fed") || S.actions.has("Water change") || S.actions.has("Top-dressed"), top = S.actions.has("Topped off"), phx = S.actions.has("pH adjusted");
  if (!fed && !top && !phx || !["grow","bloom"].includes(phaseOf(p))) return;
  const inp = (k, label, ph) => h("label",{class:"f"}, label, h("input",{type:"text", inputmode:"decimal", autocomplete:"off", "data-k":k, placeholder: ph || "–", value: keep[k] || null}));
  const box = h("fieldset",{id:"l-feed", class:"panel fr", "data-soak":"0.1"}, h("legend",null, fed || phx ? "What went in" : "Top-off"));
  const grid = h("div",{class:"fields"});
  if (top){ const ex = window.Feed ? Feed.expectTop(S.logs, p, d => phaseOn(p, d), phaseOf(p), new Date().toISOString()) : null;
    grid.append(inp("top_l", "Topped off L", ex ? String(ex.l) : null)); if (ex) box.append(h("p",{class:"sub", style:"margin:0"}, ex.text)); }
  if (fed){ const vol = (S.logs.filter(l => l.run === p.id && l.feed && l.feed.vol).sort((a, b) => a.at < b.at ? 1 : -1)[0] || {feed:{}}).feed.vol || (p.setup && p.setup.volume);
    grid.append(inp("vol", "Litres now", vol ? String(vol) : null), inp("ecBefore", "EC before", S.actions.has("Water change") ? String((p.setup && p.setup.waterEc) || 0) : null));
    for (const n of feedProducts(p)) grid.append(inp("ml:" + n, n + " ml"));
    box.append(grid, h("p",{class:"sub", style:"margin:0"}, "Measure the EC ~15–30 min after mixing (in this log or the next one): the app learns how much your nutrients move it."));
    const add = h("input",{type:"text", autocomplete:"off", placeholder:"another product", "aria-label":"Add a product"});
    box.append(h("div",{class:"daynote"}, add, h("button",{type:"button", class:"btn ghost sm", onclick:() => { const n = add.value.trim(); if (!n) return; S.extraProducts = (S.extraProducts || []).concat(n); renderFeedBox(p); }}, "Add")));
    for (const n of S.extraProducts || []) if (!feedProducts(p).includes(n)) grid.append(inp("ml:" + n, n + " ml"));
  } else box.append(grid);
  if (phx){   // v56: pH Up/Down amounts, so the app learns how much moves your pH
    const lp = mine(S.logs).find(l => l.ph != null), g2 = h("div",{class:"fields"});
    if (!fed){ const v = (S.logs.filter(l => l.run === p.id && l.feed && l.feed.vol).sort((a, b) => a.at < b.at ? 1 : -1)[0] || {feed:{}}).feed.vol || (p.setup && p.setup.volume); g2.append(inp("vol", "Litres now", v ? String(v) : null)); }
    g2.append(inp("phBefore", "pH before", lp ? String(lp.ph) : null), inp("phUp", "pH Up ml"), inp("phDown", "pH Down ml"));
    box.append(g2, h("p",{class:"sub", style:"margin:0"}, "Log the pH again 10–15 min later (here or in the next log)."));
  }
  $("#chips").closest("fieldset").after(box); decorateSoon();
}
function readFeedBox(){
  const b = $("#l-feed"); if (!b) return {};
  const v = {}; b.querySelectorAll("input[data-k]").forEach(i => { const n = num(i.value); if (n != null) v[i.dataset.k] = n; });
  const ml = {}; for (const k of Object.keys(v)) if (k.startsWith("ml:")) ml[k.slice(3)] = v[k];
  const out = {}; if (v.top_l != null) out.top_l = v.top_l;
  if (v.phUp != null || v.phDown != null) out.phfix = Object.assign({vol: v.vol || null, phBefore: v.phBefore != null ? v.phBefore : null}, v.phUp != null ? {up: v.phUp} : {}, v.phDown != null ? {down: v.phDown} : {});
  delete v.phUp; delete v.phDown; delete v.phBefore;
  if (Object.keys(ml).length || v.vol != null) out.feed = Object.assign({ml}, v.vol != null ? {vol: v.vol} : {}, v.ecBefore != null ? {ecBefore: v.ecBefore} : {});
  return out;
}
/* v54: photos are Side (default), Top or Close-up; only side shots become the "real one" behind the drawing */
function renderViewBox(p){
  const old = $("#l-view"); if (old) old.remove();
  if (!["germ","grow","bloom"].includes(phaseOf(p))) return;
  S.view = S.view || "side";
  const box = h("div",{id:"l-view", class:"chips", role:"group", "aria-label":"The photos show"}, h("span",{class:"sub", style:"align-self:center"}, "Photos:"),
    ...[["side","Side"],["top","Top-down"],["close","Close-up"]].map(([k, l]) => h("button",{type:"button", class:"chip", "aria-pressed": S.view === k ? "true" : "false", onclick:() => { S.view = k; renderViewBox(p); }}, l)));
  $(".drops").after(box);
}

/* "Sensor moved": pick the sensor(s) by the number on the case, then where they are now. Saved with the log as
   new placements in sensors.json (the old placement of that sensor ends at the log time). */
S.move = {ids:new Set(), where:null};
function kindFor(p){ const ph = phaseOf(p); return ph === "germ" ? "dome" : ph === "dry" ? "dry" : ph === "cure" || ph === "done" ? "jar" : "air"; }
function placeName(p, kind, id){ const n = p.strain || p.name; return kind === "jar" ? n + " jar " + sensorNum(id) : kind === "dry" ? n + " drying" : kind === "dome" ? n + " dome" : n + " air"; }
function renderMoveBox(p){
  const old = $("#l-move"); if (old) old.remove();
  if (!S.actions.has("Sensor moved") || !S.smeta || !S.smeta.sensors) return;
  const ids = Object.keys(S.smeta.sensors).sort((a, b) => sensorNum(a) - sensorNum(b)), kind = kindFor(p);
  const box = h("fieldset",{id:"l-move", class:"panel fr", "data-soak":"0.1"}, h("legend",null,"Which sensor?"));
  const chips = h("div",{class:"chips"});
  for (const id of ids){ const cur = Bridge.current(S.smeta, id), on = S.move.ids.has(id);
    chips.append(h("button",{type:"button", class:"chip", "aria-pressed": on ? "true" : "false", onclick:() => { on ? S.move.ids.delete(id) : S.move.ids.add(id); renderMoveBox(p); }},
      h("b",null, String(sensorNum(id))), h("small",{class:"muted", style:"font-style:italic"}, cur ? cur.place : "not placed"))); }
  const wopts = [["here", kind === "jar" ? "In a jar of " + (p.strain || p.name) : kind === "dry" ? "Drying space of " + (p.strain || p.name) : kind === "dome" ? "Under the dome of " + (p.strain || p.name) : "Air at " + (p.strain || p.name)], ["off", "Not in use"]];
  const where = h("div",{class:"chips"}, wopts.map(([v, l]) => h("button",{type:"button", class:"chip", "aria-pressed": S.move.where === v ? "true" : "false", onclick:() => { S.move.where = v; renderMoveBox(p); }}, l)));
  box.append(chips, h("legend",{style:"margin-top:6px"},"Where now?"), where, h("p",{class:"sub", style:"margin:0"}, "Saved with this log. The sensor's old place ends now."));
  $("#chips").closest("fieldset").after(box); decorateSoon();
}
async function saveMoves(p, at){
  if (!S.actions.has("Sensor moved") || !S.move.ids.size || !S.move.where) return [];
  const kind = S.move.where === "off" ? "off" : kindFor(p), ids = [...S.move.ids];
  const moved = ids.map(id => ({id, num: sensorNum(id), place: kind === "off" ? "Not in use" : placeName(p, kind, id)}));
  S.smeta = await mutate("sensors.json", m => { m = m || {sensors:{}, placements:[]}; m.placements = m.placements || [];
    for (const x of moved){ for (const pl of m.placements) if (pl.id === x.id && !pl.to && pl.from < at) pl.to = at;
      m.placements.push(Object.assign({id:x.id, place:x.place, kind, from:at}, kind === "off" ? {} : {run:p.id})); }
    return m; }, "sensor moved");
  S.move = {ids:new Set(), where:null}; bridgeLive(); return moved;
}
const countLabel = (n, none) => n ? n + " selected" : none;
$("#f-photo").addEventListener("change", e => { $("#f-photo-n").textContent = countLabel(e.target.files.length, "camera or gallery"); });
$("#f-file").addEventListener("change", e => { $("#f-file-n").textContent = countLabel(e.target.files.length, "file"); });
function lnow(){ const d = new Date(); $("#l-now").textContent = d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}) + ", " + hm(d.toISOString()); }
function startEdit(l){
  S.edit = l; S.armDel = null; S.actions = new Set(l.actions || []);
  location.hash = "#log"; renderLogForm();
  document.querySelectorAll("#l-fields input").forEach(i => { const v = num(l[i.dataset.k]); i.value = v != null ? String(v) : ""; });
  $("#f-note").value = l.note || "";
  $("#l-title").textContent = "Edit log"; $("#l-now").textContent = fmtTime(l.at);
  $("#f-save").textContent = "Save changes"; $("#f-cancel").hidden = false;
}
function endEdit(){
  S.edit = null; $("#logform").reset(); S.actions.clear();
  document.querySelectorAll("#l-fields input").forEach(i => i.value = "");
  document.querySelectorAll("#chips .chip").forEach(c => c.setAttribute("aria-pressed","false"));
  const p = sel(); $("#l-title").textContent = p ? p.name : "Quick log"; lnow();
  $("#f-save").textContent = "Save"; $("#f-cancel").hidden = true;
  $("#f-photo-n").textContent = "camera or gallery"; $("#f-file-n").textContent = "sensor CSV, notes, text…";
}
$("#f-cancel").addEventListener("click", () => { endEdit(); S.planSeg = "book"; location.hash = "#plan"; });
async function delLog(l){
  if (S.armDel !== l.id){ S.armDel = l.id; renderHistory(); setTimeout(() => { if (S.armDel === l.id){ S.armDel = null; renderHistory(); } }, 4000); return; }
  S.armDel = null;
  try { S.logs = sortLogs(await mutate("logs.json", list => (list||[]).filter(x => x.id !== l.id), "delete log " + l.id)); cache(); renderAll(); }
  catch(e){ setSync("Couldn't delete · tap to retry", true); }
}
$("#logform").addEventListener("submit", async e => {
  e.preventDefault();
  const p = sel(); if (!p) return;
  const st = $("#f-status"), btn = $("#f-save");
  const at = new Date().toISOString();
  const vals = {}; let any = false;
  document.querySelectorAll("#l-fields input").forEach(i => { const v = num(i.value); if (v != null){ vals[i.dataset.k] = v; any = true; } });
  const actions = [...S.actions], note = $("#f-note").value.trim();
  const photos = [...$("#f-photo").files], files = [...$("#f-file").files];
  if (!S.edit && !any && !actions.length && !note && !photos.length && !files.length){ st.textContent = "Nothing to save yet. Enter a value, tap an action, or add a file."; return; }
  btn.disabled = true; st.textContent = (photos.length || files.length) ? "Uploading…" : "Saving…";
  try {
    let sensor = null;
    for (const f of files) if (isCsv(f)){ const s = parseSensorCsv(await f.text()); if (s && (!sensor || s.at > sensor.at)) sensor = s; }
    if (files.some(isCsv) && !sensor) st.textContent = "Uploading… (couldn't read values from the CSV, saving it anyway)";
    // a sensor in the jar: its 24 h average becomes the jar RH unless one was typed
    if (sensor && sensor.havg != null && phaseOf(p) === "cure" && vals.jar_rh == null && !sensor.src) vals.jar_rh = Math.round(sensor.havg * 10) / 10;
    if (actions.includes("Sensor moved") && S.smeta && (!S.move.ids.size || !S.move.where)){ st.textContent = "Pick the sensor and where it is now (under Sensor moved)."; btn.disabled = false; return; }
    const moved = S.edit ? [] : await saveMoves(p, at);
    // no CSV: the bridge's last 24 h for this plant ride along with the log
    if (!sensor && !S.edit){ const lv = liveFor(p); if (lv) sensor = Object.assign({}, lv); }
    const ljar = !S.edit && liveJarFor(p);
    const newPhotos = photos.length ? await uploadFiles(photos, "photo") : [];
    const newFiles = files.length ? await uploadFiles(files, "sensor") : [];
    const wasEdit = !!S.edit;
    if (S.edit){
      const id = S.edit.id, shown = [...document.querySelectorAll("#l-fields input")].map(i => i.dataset.k);
      S.logs = sortLogs(await mutate("logs.json", list => (list||[]).map(x => {
        if (x.id !== id) return x;
        const y = Object.assign({}, x, {actions, note, edited:at, photos:[...(x.photos||[]), ...newPhotos], files:[...(x.files||[]), ...newFiles]});
        if (sensor) y.sensor = sensor;
        for (const k of shown){ if (k in vals) y[k] = vals[k]; else delete y[k]; }
        return y;
      }), "edit log " + id));
    } else {
      const fb = readFeedBox();
      const entry = Object.assign({id:"l-" + Date.now(), run:p.id, at, date:today(), source:"app", actions, note, photos:newPhotos, files:newFiles}, vals, fb);
      if (newPhotos.length && S.view && S.view !== "side") entry.view = S.view;
      const dr = window.Feed ? (Feed.odd(S.logs, p, entry, d => phaseOn(p, d)) || Feed.oddWater(S.logs, p, entry, d => phaseOn(p, d), phaseOf(p))) : null;
      if (sensor) entry.sensor = sensor;
      if (moved.length) entry.moved = moved;
      if (ljar && ljar.rh != null && ["cure","done"].includes(phaseOf(p)) && entry.jar_rh == null) entry.jar_rh = ljar.rh;
      // tier 0: the app reacts and says so, quietly (the line is stored with the log)
      let r = {tasks:[], moves:[], why:[]};
      const hit = window.Steps ? Steps.detect(entry, openTasks()) : null;
      if (window.Rules){ const ctx = Object.assign(ruleCtx(p), {targets: targetsOf(p)}); r = Rules.afterLog(p, entry, ctx);
        if (hit && hit.task) ctx.tasks = ctx.tasks.filter(t => t.id !== hit.task.id);
        entry.ack = Rules.ack(p, entry, ctx, r); }
      // tier 0 step feedback: the line answers the step itself, adds a follow-up check and closes the step it names
      if (window.Steps){
        if (hit){ const s = hit.step, f = Steps.follow(s, p, entry, today()); entry.step = {id: s.id, name: s.name};
          r.close = (r.close || []).concat(hit.task ? [{id: hit.task.id, at: entry.at, why: "\"" + hit.task.title + "\" done by your log (" + entry.date.slice(5) + ")."}] : []);
          if (f && !openTasks().some(t => t.gen === f.gen)){ r.tasks = r.tasks.concat(f); r.why = (r.why || []).concat(s.name.toLowerCase() + " follow-up"); }
          entry.ack = [Steps.ack(s, entry) + (f ? " · + " + f.title.toLowerCase() + " " + wdShort(f.due) : ""), (entry.ack || "").replace(/^Noted · /, "").replace(/ · plan unchanged( · next: .*)?$|^plan unchanged( · next: .*)?$/, "")].filter(Boolean).join(" · "); }
        if (Steps.question(entry.note)){ entry.asks = true; entry.ack = (entry.ack || "Noted") + " · question noted: ask your AI on this log"; } }
      if (dr) entry.ack = (entry.ack || "Noted") + " · " + dr;
      S.logs = sortLogs(await mutate("logs.json", list => [...(list||[]), entry], "log " + entry.date));
      S.extraProducts = []; S.view = "side";
      S.lastAck = {id: entry.id, text: entry.ack};
      reactToLog(p, entry, r);
    }
    cache(); endEdit(); renderAll();
    st.textContent = !wasEdit && S.lastAck && S.lastAck.text ? S.lastAck.text : sensor && !sensor.src ? "Saved. Sensor data up to " + fmtTime(sensor.at) + "." : "Saved.";
    setTimeout(() => { st.textContent = ""; if (wasEdit) S.planSeg = "book"; location.hash = wasEdit ? "#plan" : "#today"; }, wasEdit ? 800 : 1800);
  } catch(err){
    st.textContent = err.code === "auth" ? "The access key was rejected. Open Settings and paste a new one."
      : err.code === "too_large" ? "A file is too big. Pick a smaller one and save again."
      : err.code === "conflict" ? "Something else saved at the same moment. Tap Save again."
      : "Couldn't save. Check your connection and tap Save again. Your entries are still here.";
  } finally { btn.disabled = false; }
});

/* ---------- plant form ---------- */
function chipGroup(boxSel, options, key, colorFn){
  const box = $(boxSel); box.replaceChildren();
  for (const [v, label] of Object.entries(options)){
    box.append(h("button",{type:"button", class:"chip", style: colorFn ? "--c:"+colorFn(v) : null, "aria-pressed": S.pf[key] === v ? "true" : "false",
      onclick:() => { S.pf[key] = v; if (key === "medium" && !SYSTEMS_FOR[v].includes(S.pf.system)) S.pf.system = SYSTEMS_FOR[v][0]; renderPlantChips(); }},
      colorFn ? h("span",{class:"dot"}) : null, label));
  }
}
function renderPlantChips(){
  chipGroup("#pl-medium", Object.fromEntries(Object.entries(MEDIA).map(([k,v]) => [k, v.label])), "medium", k => MEDIA[k].c);
  chipGroup("#pl-system", Object.fromEntries(SYSTEMS_FOR[S.pf.medium].map(k => [k, SYSTEMS[k]])), "system");
  chipGroup("#pl-where", WHERE, "where");
  chipGroup("#pl-status", STATUS, "status");
  $("#pl-sensorwrap").hidden = S.pf.where !== "indoor"; $("#pl-lampwrap").hidden = S.pf.where !== "indoor";
  decorateSoon();
}
function openPlantForm(editing){
  const p = editing ? sel() : null;
  S.plantEdit = p ? p.id : null;
  S.pf = p ? {medium:p.medium||"hydro", system:p.system||"dwc", where:p.where||"indoor", status:p.status||"active"} : {medium:"living-soil", system:"hand", where:"indoor", status:"active"};
  $("#pl-title").textContent = p ? "Edit " + p.name : "New plant";
  $("#pl-name").value = p ? p.name : ""; $("#pl-start").value = p && p.start || ""; $("#pl-sprout").value = p && p.sprout || "";
  $("#pl-strain").value = p && p.strain || ""; $("#pl-breeder").value = p && p.breeder || ""; $("#pl-chat").value = p && p.chat || "";
  $("#pl-sensor").value = p && p.sensor || ""; $("#pl-lamp").value = p && p.lamp != null ? p.lamp : "";
  $("#pl-save").textContent = p ? "Save" : "Add plant"; $("#pl-statusmsg").textContent = "";
  renderPlantChips();
}
$("#pl-cancel").addEventListener("click", () => history.back());
$("#plantform").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#pl-name").value.trim(), st = $("#pl-statusmsg");
  if (!name){ st.textContent = "Give the plant a name."; return; }
  const fields = Object.assign({}, S.pf, {name, start:$("#pl-start").value || null, sprout:$("#pl-sprout").value || null, sensor:S.pf.where === "indoor" ? ($("#pl-sensor").value.trim() || null) : null, lamp:S.pf.where === "indoor" ? num($("#pl-lamp").value) : null, strain:$("#pl-strain").value.trim() || null, breeder:$("#pl-breeder").value.trim() || null, chat:/^https:\/\/claude\.ai\//.test($("#pl-chat").value.trim()) ? $("#pl-chat").value.trim() : null});
  $("#pl-save").disabled = true; st.textContent = "Saving…";
  try {
    const id = S.plantEdit || "p-" + Date.now();
    S.plants = await mutate("plants.json", list => {
      list = list || [];
      const i = list.findIndex(x => x.id === id);
      if (i >= 0){ const y = Object.assign({}, list[i], fields); y.targets = Object.assign({}, DEFAULT_TARGETS[y.medium], list[i].targets || {}); list[i] = y; }
      else list.push(Object.assign({id, targets:Object.assign({}, DEFAULT_TARGETS[fields.medium]), offDays:[], created:today()}, fields));
      return list;
    }, (S.plantEdit ? "edit plant " : "add plant ") + name);
    cache(); S.sel = id; try { localStorage.setItem(SEL_KEY, id); } catch(e){}
    st.textContent = ""; renderAll(); location.hash = "#today";
  } catch(err){ st.textContent = err.code === "auth" ? "The access key was rejected." : "Couldn't save. Check your connection and try again."; }
  finally { $("#pl-save").disabled = false; }
});

/* under Look: what "Follow plant" is doing right now, and the light times for an indoor plant */
function renderThemeNote(){
  const box = $("#s-themenote"); if (!box) return; box.replaceChildren(); if (themePref() !== "plant") return;
  const p = sel(); if (!p) return;
  const pn = plantNight(p), name = p.strain || p.name;
  box.append(h("p",{class:"sub", style:"margin:0"}, name + ": " + (pn ? pn.why + " → " + (pn.night ? "night" : "day") : phaseOf(p) === "done" ? "finished run, follows the phone" : "light times unknown yet, follows the phone")));
  if (p.where === "outdoor" || !["germ","grow","bloom"].includes(phaseOf(p))) return;
  const L = p.light || (pn && pn.sched) || {};
  const on = h("input",{type:"time", value: L.on || ""}), hrs = h("input",{type:"number", min:"1", max:"24", step:"0.5", inputmode:"decimal", value: L.hours || "", style:"max-width:5em"}), msg = h("span",{class:"sub"});
  box.append(h("form",{style:"flex-direction:row;gap:8px;align-items:flex-end;flex-wrap:wrap", onsubmit: async e => { e.preventDefault();
      const v = on.value ? {on: on.value, hours: +hrs.value || 18} : null; msg.textContent = "Saving…";
      try { S.plants = await mutate("plants.json", list => (list || []).map(x => x.id === p.id ? Object.assign({}, x, {light: v || undefined}) : x), "light times"); cache(); msg.textContent = ""; applyTheme(); renderSetup(); } catch(err){ msg.textContent = "Couldn't save."; } }},
    h("label",{class:"f", style:"flex:0 0 auto"}, "Lights on", on), h("label",{class:"f", style:"flex:0 0 auto"}, "Hours", hrs), h("button",{class:"btn sm", type:"submit"}, p.light ? "Save" : "Set by hand"), msg));
  if (!p.light) box.append(h("p",{class:"sub", style:"margin:0"}, "Leave it empty to let the sensor work it out (needs about a day of readings)."));
}

/* settings → sensors: number, place, latest corrected values, battery, age */
function renderSensorList(){
  const box = $("#s-sensors"); if (!box) return; box.hidden = !S.smeta; const list = $("#s-sensorlist"); list.replaceChildren(); if (!S.smeta) return;
  const rows = bridgeRows(Date.now() - 864e5), last = {}; for (const r of rows) last[r.id] = r;
  const ids = Object.keys(S.smeta.sensors || {}).sort((a, b) => sensorNum(a) - sensorNum(b));
  for (const id of ids){ const pl = Bridge.current(S.smeta, id), r = last[id] && Bridge.correct(last[id], S.smeta);
    list.append(h("div",{class:"row"}, h("span",null, h("b",null, sensorNum(id) + " "), pl ? pl.place : "not placed"), h("span",{class:"lead"}),
      h("span",{class:"when num"}, r ? (r.temp != null ? r.temp.toFixed(1) + "° " : "") + (r.rh != null ? r.rh.toFixed(1) + "% · " : "") + ago(new Date(r.t).toISOString()) + (r.bat != null && r.bat < 25 ? " · bat " + r.bat + "%" : "") : "no data"))); }
  const hs = S.bridgeErr ? [] : (S.bhealth || []);       // when the repo can't be read, "no readings" per sensor is just noise
  if (S.bridgeErr) list.append(h("p",{class:"warnline", style:"margin:0"}, S.bridgeErr + " GitHub → Settings → Developer settings → Fine-grained tokens → the app's token → Repository access: add flowerphile-sensors (Contents: read)."));
  list.append(...hs.map(x => h("p",{class:"warnline", style:"margin:0"}, x.text)));
  list.append(h("p",{class:"sub", style:"margin:0"}, "Values are corrected (calibration in sensors.json). To move a sensor: log on the plant → Sensor moved."));
  const out = h("pre",{class:"diag", hidden:""});
  list.append(h("button",{type:"button", class:"btn ghost sm", onclick: async () => { out.hidden = false; out.textContent = "Checking…"; out.textContent = await sensorDiag(); }}, "Check the sensor connection"), out);
  decorateSoon();
}
/* step-by-step check of the sensor path, in plain words, for when readings don't show */
async function sensorDiag(){
  const L = ["App " + APP_V + " · data sensors.json: " + (S.smeta ? Object.keys(S.smeta.sensors || {}).length + " sensors, " + (S.smeta.placements || []).filter(x => !x.to).length + " placed" : "MISSING")];
  const R = bridgeRepo(); if (!R){ L.push("No sensors repo configured."); return L.join("\n"); }
  const H = {Authorization:"Bearer " + S.cfg.token, Accept:"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28"};
  try { const r = await fetch("https://api.github.com/repos/" + R.owner + "/" + R.repo, {headers:H, cache:"no-store"});
    L.push("Key can see " + R.owner + "/" + R.repo + ": " + (r.ok ? "yes" : "NO (HTTP " + r.status + ") → add the repo to the app key, Contents: read")); if (!r.ok) return L.join("\n"); } catch(e){ L.push("Network error: " + e.message); return L.join("\n"); }
  const d = utcDay(Date.now());
  try { const g = await fetchDaysGQL(R, [d]); L.push("GraphQL: ok, " + g[d].length + " readings today"); } catch(e){ L.push("GraphQL: failed (" + (e.message || e) + "), REST fallback used"); }
  try { const g = await fetchDaysREST(R, [d]); L.push("REST: ok, " + g[d].length + " readings today"); } catch(e){ L.push("REST: failed (" + (e.code || e.message) + " " + (e.status || "") + ")"); }
  L.push("Last load: " + (S.bridgeAt ? fmtTime(new Date(S.bridgeAt).toISOString()) + " via " + (S.bridgeVia || "?") : "never") + (S.bridgeErr ? " · error: " + S.bridgeErr : ""));
  for (const p of S.plants.filter(x => x.status === "active")){ const lv = S.live[p.id], lj = S.liveJar && S.liveJar[p.id];
    L.push((p.strain || p.name) + ": " + (lv ? "air " + lv.temp + "° " + lv.rh + "% at " + fmtTime(lv.at) : "no air data") + (lj ? " · jars " + lj.rh + "%" : "")); }
  return L.join("\n");
}

/* ---------- setup ---------- */
/* v57: tester feedback. A plain-text summary a tester shares with the developer: app version, device type, grower profile,
   each plant's branch and stage, counts, what their AI changed on the screen (plant.ui), and the newest AI changes.
   Never photos, log notes, keys or the store name. */
function feedbackText(note){
  const T = today(), pr = S.profile || {}, ua = navigator.userAgent, dev = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "other";
  const L = ["Flowerphile feedback · " + APP_V + " · " + T, "", note ? "Note: " + note : "Note: (none)", "",
    "Device: " + dev + ", " + innerWidth + "×" + innerHeight + (matchMedia("(display-mode: standalone)").matches ? ", home screen app" : ", in the browser") + " · storage: " + (isLocal() ? "this phone" : "own GitHub"),
    "Grower: " + ["exp " + (pr.exp || "?"), "germ " + (pr.germ || "?"), "meters " + (pr.meters || "?")].join(", ")];
  for (const p of S.plants.filter(p => p.status !== "done")){
    const lg = S.logs.filter(l => l.run === p.id), ai = S.changes.filter(c => c.run === p.id && c.src === "ai");
    L.push("", "Plant: " + [p.medium, p.system, p.where, p.kind, phaseOf(p)].filter(Boolean).join(" · ") + " · started " + (p.start || "?"),
      "Logs: " + lg.length + " (last " + (lg[0] ? lg[0].date : "–") + ") · check-ins: " + (p.aiAt ? "last " + p.aiAt.slice(0, 10) : "none") + " · step answers: " + lg.filter(l => (l.replies || []).length).length);
    if (p.ui) L.push("Screen changed by the AI: " + JSON.stringify(p.ui).slice(0, 600));
    const used = {}; for (const l of lg) for (const a of l.actions || []) used[a] = (used[a] || 0) + 1;
    L.push("Buttons used: " + (Object.entries(used).map(([k, v]) => k + " ×" + v).join(", ") || "none"));
    const keys = {}; for (const l of lg) for (const k of Object.keys(l)) if (F[k] || (p.ui && (p.ui.custom || []).some(c => c.key === k))) keys[k] = (keys[k] || 0) + 1;
    L.push("Fields filled: " + (Object.entries(keys).map(([k, v]) => k + " ×" + v).join(", ") || "none"));
    if (ai.length) L.push("Newest AI changes: " + ai.slice(0, 5).map(c => String(c.text || "").slice(0, 120)).join(" | "));
  }
  return L.join("\n");
}
function renderFeedback(){
  const b = $("#s-feedback"); if (!b) return; b.hidden = !S.cfg;
  const st = $("#s-fb-status"), go = async how => { const t = feedbackText($("#s-fb-note").value.trim());
    try { if (how === "send" && navigator.share){ await navigator.share({title: "Flowerphile feedback", text: t}); st.textContent = "Thanks, sent."; $("#s-fb-note").value = ""; return; }
      await navigator.clipboard.writeText(t); st.textContent = "Copied: paste it into a message to the developer."; } catch(e){ if (e && e.name !== "AbortError") st.textContent = "Couldn't share. Try Copy."; } };
  $("#s-fb-send").onclick = () => go("send"); $("#s-fb-copy").onclick = () => go("copy");
}
/* v58: the developer's feedback inbox. Shown to a GitHub-connected phone that opted in (Settings link "?dev" once, or the
   owner KPqui). Each paste becomes feedback/inbox/<time>.txt in the private store; the weekly feedback round (a scheduled
   Claude task) summarises it into the project doc and deletes the raw files. No new platform. */
function devPhone(){ try { if (/[?&]dev\b/.test(location.search)) localStorage.setItem("ff-dev", "1"); } catch(e){} return !isLocal() && S.cfg && (S.cfg.owner === "KPqui" || localStorage.getItem("ff-dev") === "1"); }
function renderInbox(){
  const b = $("#s-inbox"); if (!b) return; b.hidden = !devPhone(); if (b.hidden) return;
  const ta = $("#s-in-text"), st = $("#s-in-status");
  $("#s-in-paste").onclick = async () => { try { ta.value = await navigator.clipboard.readText(); } catch(e){ st.textContent = "Couldn't read the clipboard: long-press and paste."; } };
  $("#s-in-save").onclick = async () => { const t = ta.value.trim(); if (!t){ st.textContent = "Nothing to save."; return; }
    st.textContent = "Saving…"; const at = new Date().toISOString(), path = "feedback/inbox/" + at.replace(/[:.]/g, "-") + ".txt";
    try { const r = await putB64(path, b64enc(t + "\n"), null, "feedback inbox"); if (!r || r.ok === false) throw new Error("put"); ta.value = ""; st.textContent = "Saved. The next weekly round picks it up."; }
    catch(e){ st.textContent = "Couldn't save. Check the connection and try again."; } };
}
function renderSetup(){
  const c = S.cfg; renderFeedback(); renderInbox();
  const tb = $("#s-theme"); tb.replaceChildren(); for (const [v,l] of [["auto","Follow phone"],["day","Day"],["night","Night"],["plant","Follow the lamp"]]) tb.append(h("button",{type:"button",class:"chip","aria-pressed": themePref()===v ? "true":"false", onclick:() => { try { localStorage.setItem(THEME_KEY, v); } catch(e){} applyTheme(); renderSetup(); }}, l));
  renderThemeNote();
  // first visit: a welcome with two ways in; the GitHub form only shows when asked for
  const local = isLocal(), fresh = !c;
  $("#s-welcome").hidden = !fresh; $("#setupform").hidden = (fresh && !S.showConnect) || local;
  $("#s-local").hidden = !local; $("#s-backup").hidden = !c;
  if (local) $("#s-localsince").textContent = "Since " + fmtDay(c.since.slice(0, 10)) + ". Nothing leaves this phone. Browsers can clear site data, so save a backup now and then.";
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#setupform")) return;
  renderYou();
  if (local){ $("#s-plants").hidden = false; $("#s-connected").hidden = true; renderSensorList(); renderPlantList(); return; }
  $("#s-owner").value = c ? c.owner : ""; $("#s-repo").value = c ? c.repo : "tank-log-data"; $("#s-token").value = "";
  $("#s-token").placeholder = c ? "saved · paste a new one to replace" : "github_pat_…";
  $("#s-connected").hidden = !c; if (c) $("#s-where").textContent = c.owner + "/" + c.repo;
  $("#s-save").textContent = c ? "Save" : "Connect";
  $("#s-plants").hidden = !c;
  renderSensorList(); renderPlantList();
}
/* Settings → About you: the grower profile (profile.json) that sets hand-holding and which fields show */
function renderYou(){
  const box = $("#s-you"); if (!box) return; box.hidden = !S.cfg; box.replaceChildren(h("h2",null,"About you"));
  const pr = S.profile || {}, set = async (k, v) => { S.profile = Object.assign({at:today()}, S.profile || {}, {[k]: v}); cache(); renderAll(); try { await mutate("profile.json", () => S.profile, "profile: " + k); } catch(e){} };
  const row = (k, label, opts) => h("div",null, h("p",{class:"kicker", style:"margin:6px 0 2px"}, label), h("div",{class:"opts"}, opts.map(([v, l]) => h("button",{type:"button", class:"chip", "aria-pressed": pr[k] === v ? "true" : "false", onclick:() => set(k, v)}, l))));
  box.append(row("exp", "Experience", [["new","New · explain"],["some","Some"],["pro","Experienced · all numbers"]]),
    row("meters", "Can measure", [["none","Nothing"],["ph","pH"],["phec","pH + EC"],["sensors","+ sensors"]]),
    h("p",{class:"sub", style:"margin:4px 0 0"}, S.profile ? "Sets how much the app explains and which log fields show. Answers from your last plant are offered again for the next one." : "Not set: all fields show. Answered with your first new plant."));
}
function renderPlantList(){
  const pl = $("#s-plantlist"); pl.replaceChildren();
  if (!S.plants.length) pl.append(h("p",{class:"empty"},"No plants yet."));
  for (const p of S.plants){
    pl.append(h("div",{class:"row", style:"align-items:center"},
      h("span",{style:"display:flex;align-items:center;gap:8px"}, h("span",{class:"dot", style:"width:10px;height:10px;border-radius:50%;background:"+colorOf(p)}),
        p.name + " · " + (MEDIA[p.medium]||MEDIA.hydro).label + ", " + (SYSTEMS[p.system]||"") + ", " + (WHERE[p.where]||"") + (p.status !== "active" ? " · " + STATUS[p.status] : "")),
      h("button",{type:"button", class:"btn ghost sm", onclick:() => { S.sel = p.id; location.hash = "#plant-edit"; }}, "Edit")));
  }
}
$("#setupform").addEventListener("submit", async e => {
  e.preventDefault();
  const owner = $("#s-owner").value.trim(), repo = $("#s-repo").value.trim() || "tank-log-data";
  const token = $("#s-token").value.trim() || (S.cfg && S.cfg.token);
  const st = $("#s-status");
  if (!owner || !token){ st.textContent = "Fill in the account name and the access key."; return; }
  st.textContent = "Checking…"; $("#s-save").disabled = true;
  const old = S.cfg; S.cfg = {owner, repo, token};
  try {
    const r = await api("");
    if (r.status === 401 || r.status === 403) throw new StoreError("auth", r.status);
    if (!r.ok) throw new StoreError("http", r.status);
    saveCfg(S.cfg); st.textContent = "Connected."; document.activeElement.blur(); await loadAll();
    setTimeout(() => { st.textContent = ""; location.hash = "#today"; }, 700);
  } catch(err){
    S.cfg = old;
    st.textContent = err.code === "auth" ? "The key was rejected. Check that it has read and write access to this store."
      : err.code === "http" && err.status === 404 ? "Store not found. Check the account and store names."
      : "Couldn't reach the store. Check your connection.";
  } finally { $("#s-save").disabled = false; }
});
$("#s-try").addEventListener("click", () => startLocal());
$("#s-showconnect").addEventListener("click", () => { S.showConnect = true; renderSetup(); $("#s-owner").focus(); });
$("#s-bk-save").addEventListener("click", async () => { const st = $("#s-bk-status"); st.textContent = "Packing…";
  try { const n = await makeBackup($("#s-bk-media").checked); st.textContent = "Saved " + n + " files. Keep the file somewhere safe (cloud drive, e-mail to yourself)."; } catch(e){ st.textContent = "Couldn't make the backup: " + (e.message || e); } });
$("#s-bk-file").addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; const st = $("#s-bk-status"); st.textContent = "Restoring…";
  try { const n = await restoreBackup(f); st.textContent = "Restored " + n + " files."; } catch(err){ st.textContent = err.message || "Couldn't restore."; } e.target.value = ""; });
$("#s-local-erase").addEventListener("click", async () => {
  if (!confirmTwice($("#s-local-erase"), "Tap again to erase everything on this phone")) return;
  await lclear(); saveCfg(null); S.cfg = null; try { localStorage.removeItem(CACHE_KEY); } catch(e){}
  Object.assign(S, {plants:[], tasks:[], logs:[], changes:[], library:[], strains:[], tips:[], experiments:[]}); imgCache.clear(); renderAll(); renderSetup(); setSync("–");
});
/* a destructive button asks twice (no browser dialogs): first tap arms it for 4 s */
function confirmTwice(btn, text){ if (btn._armed){ btn._armed = false; btn.textContent = btn._orig; return true; } btn._orig = btn.textContent; btn._armed = true; btn.textContent = text; setTimeout(() => { if (btn._armed){ btn._armed = false; btn.textContent = btn._orig; } }, 4000); return false; }
$("#s-out").addEventListener("click", () => {
  saveCfg(null); S.cfg = null; try { localStorage.removeItem(CACHE_KEY); } catch(e){}
  Object.assign(S, {plants:[], tasks:[], logs:[], changes:[]}); renderAll(); renderSetup(); setSync("–");
});

/* ---------- start ---------- */
$("#sync").addEventListener("click", loadAll);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && (!S.synced || Date.now() - S.synced > 60000)) loadAll(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
applyTheme();
/* round 3 (v53): moving to the new address. On the new host, a link from the old one carries this phone's connection
   (access key and repo) in the #fragment, which browsers never send to a server; it is saved once and the fragment
   cleared at once. On the old host, moved.json {url} shows a banner with that link. Try-mode data moves via Backup. */
try { const m = location.hash.match(/^#move=([A-Za-z0-9+/=_-]+)$/);
  if (m){ const c = JSON.parse(b64dec(m[1].replace(/-/g, "+").replace(/_/g, "/"))); if (c && typeof c === "object" && !loadCfg()) saveCfg(c); history.replaceState(null, "", location.pathname + "#today"); } } catch(e){ history.replaceState(null, "", location.pathname + "#today"); }
if (/\.github\.io$/.test(location.hostname)) fetch("moved.json", {cache: "no-store"}).then(r => r.ok ? r.json() : null).then(j => {
  if (!j || !/^https:\/\//.test(j.url || "")) return; const c = loadCfg();
  const href = j.url.replace(/\/?$/, "/") + (c && !isLocal() ? "#move=" + b64enc(JSON.stringify(c)).replace(/\+/g, "-").replace(/\//g, "_") : "");
  document.body.append(h("div",{class:"pastebar paper", id:"moved", style:"flex-wrap:wrap"}, h("a",{class:"btn primary", href}, "Flowerphile has moved: open the new address"),
    h("span",{class:"sub", style:"flex-basis:100%"}, isLocal() ? "Try mode: Settings → Backup here, then Restore there." : "Your connection comes along. Then add the new one to your home screen and remove this one.")));
}).catch(() => {});
S.cfg = loadCfg();
try { S.sel = localStorage.getItem(SEL_KEY); } catch(e){}
if (S.cfg) loadCache();
if (!S.plants.find(p => p.id === S.sel)) S.sel = (S.plants[0] || {}).id || null;
lnow(); renderAll(); route();
if (S.cfg) loadAll();
/* ---------- "Ask your AI" (tier 1 check-in, ai.js) ----------
   Plan → Ask your AI: the app builds a check-in packet (manual, grower, setup, logs and photos since the last check-in,
   open steps, flags, 2–3 matching knowledge pages) and hands it to the share sheet or the clipboard. The AI answers
   with a ```flowerphile-update``` block; pasted back, it is checked (ai.js), every change is listed with its reason,
   and only the ticked ones are applied (tasks, targets, flags, plant.ui, tips, learnings; each with a changes entry). */
function aiData(p){
  const T = today(), ph = phaseOf(p), since = lastCheck(p);
  const logs = mine(S.logs).filter(l => !since || (l.at || "") > since);
  const pages = (S.kn.pages || []).filter(pg => !pg.phase || [].concat(pg.phase).includes(ph)).slice(0, 3);
  const tl = uiTiles(p) || coreTiles(p);
  const tiles = tl ? tl.map(t => t[3] || t[0].toLowerCase()) : fieldsFor(p).filter(k => k !== "ppfd" && k !== "height").slice(0, 3);
  return {plant: p, profile: S.profile, stage: ["grow","bloom"].includes(ph) ? stageText(p) : PHASES[ph], phase: ph, today: T, since, first: !since,
    logs, tasks: openTasks().sort(sortTasks), flags: p.flags || [], targets: targetsOf(p), fields: fieldsFor(p), tiles, chips: actionsFor(p), keys: ALL_KEYS.slice(),
    learnings: S.plants.filter(x => x.id !== p.id).flatMap(x => (x.learnings || []).map(l => (x.strain || x.name) + ": " + l.text)).slice(0, 8),
    knowledge: pages, howtos: window.HowTo ? HowTo.all.map(x => ({id: x.id, title: x.title})) : [], app: APP_V,
    history: p.aiHistory || "", historyAt: p.aiHistoryAt || null, replies: stepReplies(p)};
}
/* A4: a check-in = the newest of: applied AI check-in, the nightly review, a step answer */
function phaseOn(p, d){ let cur = null; for (const k of ["germ","grow","bloom","dry","cure","done"]){ const st = phaseStart(p, k); if (st && st <= d) cur = k; } return cur || phaseOf(p); }
/* v54: the dose line under a water change / feed / top-off step: refill to X L, feed to the target EC, about N ml each
   (learned from the grower's own measured feeds, else the dose note), or the expected top-off from past top-offs. */
function doseFor(t, p){
  if (!p || !window.Feed || !["grow","bloom"].includes(phaseOf(p)) || !["hydro","coco"].includes(p.medium || "hydro") && !/feed/i.test(t.title)) return null;
  const lf = S.logs.filter(l => l.run === p.id && l.feed && l.feed.vol).sort((a, b) => a.at < b.at ? 1 : -1)[0];
  const tg = t.aim || targetsOf(p).ec, vol = (lf && lf.feed.vol) || (p.setup && p.setup.volume) || (p.doseRef && p.doseRef.l);
  if (/^(check|look|measure)\b|\bafter\b/i.test(t.title)) return null;   // follow-up checks get no recipe
  if (/water change|fresh (mix|water)|new (mix|res)/i.test(t.title) && tg){
    const aim = Math.round((tg[0] + tg[1]) / 2 * 100) / 100, r = Feed.suggest(p, S.logs, {from: +((p.setup && p.setup.waterEc) || 0), to: aim, vol, water: true});
    return (vol ? "Refill to " + vol + " L, then feed to EC " + tg[0] + "–" + tg[1] + ". " : "") + (r ? r.text : ""); }
  const last = k => (mine(S.logs).find(l => l.run === p.id && l[k] != null) || {})[k];
  if (/adjust ph/i.test(t.title)){ const ph = last("ph"), tp = targetsOf(p).ph; if (ph == null || !tp) return null;
    const r = Feed.phSuggest(p, S.logs, {from: +ph, to: Math.round((tp[0] + tp[1]) / 2 * 10) / 10, vol}); return r ? r.text : null; }
  if (/feed step|top up nutrients/i.test(t.title)){ const ec = last("ec"), a = t.aim || (t.title.match(/(\d\.\d+)\s*[–-]\s*(\d\.\d+)/) || []).slice(1).map(Number); if (ec == null || !a || a.length < 2) return null;
    const to = Math.round((a[0] + a[1]) / 2 * 100) / 100;
    if (/feed step/i.test(t.title) && t.due && t.due > today() && +ec < to - 0.2){   // soft steps: the top-up comes first, this step then adds ~0.15
      const r = Feed.suggest(p, S.logs, {from: Math.round((to - 0.15) * 100) / 100, to, vol});
      return "EC is " + ec + " now: the top-up into the upper half of the current range comes first. This step then adds ~0.15" + (r ? ": " + r.text.replace(/ → EC ≈[^(]*/, " ") : "."); }
    const r = Feed.suggest(p, S.logs, {from: +ec, to, vol}); return r ? "Now EC " + ec + " → aim ~" + to + ". " + r.text : null; }
  if (/top.?off/i.test(t.title)){ const ex = Feed.expectTop(S.logs, p, d => phaseOn(p, d), phaseOf(p), new Date().toISOString()); return ex ? ex.text : null; }
  return null;
}
/* a step's own text without its old dose sentence when the live (learned) dose line is shown above it */
function detailOf(t, p){ const d = t.detail || ""; return doseFor(t, p) ? d.replace(/\s*(Add|About) about [^.]*\.|\s*About [\d.]+ ml[^.]*\.(\s*Add half[^.]*\.)?|\s*Add about [^.]*\.(\s*\([^)]*\))?/g, "").replace(/\s*\(≈[^)]*\)/g, "").trim() : d; }
function lastCheck(p){ const r = S.logs.filter(l => l.run === p.id).flatMap(l => (l.replies || []).map(x => x.at || "")); return [p.aiAt, p.lastReview, ...r].filter(Boolean).sort().pop() || null; }
function stepReplies(p){ return S.logs.filter(l => l.run === p.id && (l.replies || []).length).flatMap(l => l.replies.filter(r => r.src === "ai").map(r => ({date: l.date, step: (l.step && l.step.name) || "log", text: r.text}))).slice(0, 3); }
async function aiPhotoFiles(paths){
  const out = [];
  for (const [i, path] of paths.entries()){ try { const u = await mediaUrl(path); if (!u) continue; const b = await (await fetch(u)).blob(); out.push(new File([b], "photo-" + (i + 1) + ".jpg", {type: b.type || "image/jpeg"})); } catch(e){} }
  return out;
}
/* built ahead (when the panel shows), so the share sheet opens straight from the tap (iPhones are strict about that) */
function aiPrepare(p){
  const key = p.id + "|" + (p.aiAt || "") + "|" + mine(S.logs).length + "|" + openTasks().length;
  if (S.aiPrep && S.aiPrep.key === key) return S.aiPrep.promise;
  const pk = AI.packet(aiData(p)), prep = {key, pk, files: null};
  prep.promise = aiPhotoFiles(pk.photos.slice(0, 6)).then(f => { prep.files = f; return prep; });
  S.aiPrep = prep; return prep.promise;
}
async function aiSend(p, how){
  if (!window.AI) return;
  const st = S.ai || (S.ai = {});
  aiPrepare(p); const prep = S.aiPrep.files ? S.aiPrep : await S.aiPrep.promise;
  const pk = prep.pk, photos = how === "copy" ? [] : prep.files;
  const title = "Flowerphile check-in · " + (p.name || p.id);
  try {
    if (how !== "copy" && navigator.share){
      const data = how === "file"
        ? {title, text: "Flowerphile check-in for " + (p.name || p.id) + ". Read the attached file and answer in its reply format.", files: [new File([pk.text], "flowerphile-checkin-" + today() + ".txt", {type: "text/plain"}), ...photos]}
        : Object.assign({title, text: pk.text}, photos.length ? {files: photos} : {});
      if (!data.files || (navigator.canShare && navigator.canShare(data))){ await navigator.share(data); st.msg = "Sent. When your AI answers, paste its whole answer below."; st.sent = true; renderAiPanel(); return; }
      if (data.files && navigator.canShare && navigator.canShare({title, text: pk.text})){ await navigator.share({title, text: pk.text}); st.msg = "Sent the text (this phone can't share photos that way). Attach the photos below in your AI app."; st.photos = pk.photos.slice(0, 6); st.sent = true; renderAiPanel(); return; }
    }
    await navigator.clipboard.writeText(pk.text);
    st.msg = "Copied. Paste it into your AI app" + (pk.photos.length ? " and attach the photos below." : ".") + " Then paste its answer here.";
    st.photos = pk.photos.slice(0, 6); st.sent = true;
  } catch(e){ st.msg = e && e.name === "AbortError" ? "" : "Couldn't share or copy here. Try Copy, or another browser."; }
  renderAiPanel();
}
function aiCheck(p, text){
  const st = S.ai || (S.ai = {});
  try { const u = AI.extract(text); registerCustom();
    const res = AI.check(u, {plant: p, tasks: mine(S.tasks), keys: ALL_KEYS.slice(), today: today(), label: k => k === "watered" ? "Watered" : k === "fed" ? "Fed" : F[k] ? labelFor(p, k) : k});
    st.res = res; st.step = null; st.pick = new Set(res.items.map((x, i) => x.ok ? i : -1).filter(i => i >= 0)); st.err = "";
  } catch(e){ st.res = null; st.err = e.message; }
  renderAiPanel();
}
async function aiApply(p){
  const st = S.ai, res = st && st.res; if (!res) return;
  const T = today(), now = new Date().toISOString(), rid = () => Math.random().toString(36).slice(2, 6);
  const its = res.items.filter((x, i) => st.pick.has(i)), of = t => its.filter(x => x.type === t);
  st.busy = true; renderAiPanel();
  try {
    if (its.some(x => x.type.startsWith("task-"))) S.tasks = await mutate("tasks.json", list => {
      list = list || [];
      for (const x of of("task-add")) list.push(Object.assign({id: "ai-" + T.replace(/-/g, "") + "-" + rid(), run: p.id, title: x.data.title, detail: x.data.detail || "", trigger: "From your AI: " + x.why, due: x.data.due, status: "open", src: "ai"}, x.data.big ? {size: "big"} : {}, x.data.howto ? {howto: x.data.howto} : {}));
      for (const x of its) if (["task-move","task-done","task-drop"].includes(x.type)){ const t = list.find(y => y.id === x.data.id); if (!t) continue;
        if (x.type === "task-move"){ t.was = t.was || t.due; t.due = x.data.due; t.moved = T; t.whyMoved = shortWhy(x.why); } else { t.status = "done"; t.doneAt = now; t.auto = "ai"; if (x.type === "task-drop") t.dropped = true; } }
      return list; }, "ai: check-in steps");
    S.plants = await mutate("plants.json", list => (list || []).map(x => {
      if (x.id !== p.id) return x;
      const y = Object.assign({}, x, st.step ? {updated: now} : {aiAt: now, aiNote: res.note || "", updated: now});
      if (res.history){ y.aiHistory = res.history; y.aiHistoryAt = now; }
      if (of("target").length){ y.targets = Object.assign({}, x.targets); for (const t of of("target")) y.targets[t.data.key] = t.data.range; }
      if (of("flag-add").length || of("flag-remove").length){ const rm = of("flag-remove").map(f => f.data.k);
        y.flags = (x.flags || []).filter(f => !rm.includes(f.k)).concat(of("flag-add").map(f => ({lvl: f.data.lvl, k: "ai-" + rid(), text: f.data.text, src: "ai"}))); }
      const ui = JSON.parse(JSON.stringify(x.ui || {}));
      for (const c of of("custom")){ ui.custom = (ui.custom || []).filter(z => z.key !== c.data.key).concat(c.data); }
      for (const t of of("tiles")) ui.tiles = t.data.keys;
      for (const f of of("fields")){ const cur = ui.fields || {add: [], hide: []};
        ui.fields = {add: [...new Set((cur.add || []).filter(k => !f.data.hide.includes(k)).concat(f.data.add))], hide: [...new Set((cur.hide || []).filter(k => !f.data.add.includes(k)).concat(f.data.hide))]}; }
      for (const c of of("chips")) ui.chips = [...new Set((ui.chips || []).concat(c.data.add))];
      if (Object.keys(ui).length) y.ui = ui;
      if (of("learning").length) y.learnings = (x.learnings || []).concat(of("learning").map(l => ({text: l.data.text, at: T, src: "ai"})));
      return y; }), "ai: check-in");
    if (of("tip").length){ const add = of("tip").map(t => Object.assign({id: "ai-" + T.replace(/-/g, "") + "-" + rid(), kind: t.data.kind, text: t.data.text, plant: p.id}, t.data.topic ? {topic: t.data.topic} : {}, t.data.src ? {src: t.data.src} : {}));
      S.tips = await mutate("tips.json", list => (list || []).concat(add), "ai: tips"); }
    const ch = its.map(x => ({id: "c-" + T.replace(/-/g, "") + "-a" + rid(), run: p.id, date: T, src: "ai", text: "Your AI: " + x.label + (x.why ? " · " + x.why : "")}));
    if (!ch.length) ch.push({id: "c-" + T.replace(/-/g, "") + "-a" + rid(), run: p.id, date: T, src: "ai", text: "Your AI checked in: no changes."});
    S.changes = (await mutate("changes.json", list => (list || []).concat(ch), "ai: why things moved")).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    askClear(); S.ai = {msg: its.length ? "Applied " + its.length + " change" + (its.length > 1 ? "s" : "") + " from your AI." : "Saved the check-in. Nothing changed."};
    registerCustom(); cache(); renderAll();
  } catch(e){ st.busy = false; st.err = "Couldn't save all changes (" + (e.code || e.message) + "). Nothing is lost: try Apply again."; renderAiPanel(); }
}
function renderAiPanel(){ const o = $("#p-ai"), p = sel(); if (!o || !p) return; const n = aiPanel(p); if (n){ o.replaceWith(n); decorateSoon(); } }
function aiPanel(p){
  if (!p || !window.AI || phaseOf(p) === "done") return null;
  try { aiPrepare(p); } catch(e){}
  const st = S.ai || {}, first = !lastCheck(p), box = h("div",{class:"panel fr", "data-soak":"0.15", id:"p-ai"});
  const lc = lastCheck(p), doneToday = lc && ymd(new Date(lc)) === today();
  if (doneToday && !st.res && !st.draft && !st.msg && !st.err && !S.aiOpen){
    box.append(h("div",{class:"aidone"}, h("span",null, h("b",null,"Check-in with your AI"), h("span",{class:"sub"}, " · done today ✓")),
      h("button",{type:"button", class:"btn ghost sm", onclick:() => { S.aiOpen = true; renderAiPanel(); }}, "Send another")));
    return box; }
  box.append(h("h2",null,"Check-in with your AI"),
    h("p",{style:"margin:0"}, first ? "Your AI (Claude, ChatGPT, Gemini…) can tailor this plan to how you grow. Send it a check-in, then paste its answer here. You see every change before anything happens."
      : "Last check-in " + short(lastCheck(p).slice(0, 10)) + (p.aiAt && p.aiNote ? ": " + p.aiNote : ".") + " Send what happened since."));
  box.append(h("div",{class:"chips", style:"gap:8px"},
    h("button",{type:"button", class:"btn primary", onclick:() => aiSend(p, "share")}, first ? "Send the first check-in" : "Send a check-in"),
    h("button",{type:"button", class:"btn ghost sm", onclick:() => aiSend(p, "copy")}, "Copy"),
    h("button",{type:"button", class:"btn ghost sm", onclick:() => aiSend(p, "file")}, "As a file")));
  if (st.msg) box.append(h("p",{class:"sub", style:"margin:0"}, st.msg));
  if (st.photos && st.photos.length){ const row = h("div",{class:"chips", style:"gap:6px"});
    st.photos.forEach((path, i) => { const a = h("a",{class:"btn ghost sm", download:"photo-" + (i + 1) + ".jpg", href:"#"}, "Photo " + (i + 1)); mediaUrl(path).then(u => { if (u) a.href = u; }); row.append(a); });
    box.append(row); }
  if (!st.res && !(st.sent || st.draft || st.paste || st.err)) box.append(h("button",{type:"button", class:"btn ghost sm", style:"align-self:flex-start", onclick:() => { (S.ai || (S.ai = {})).paste = true; renderAiPanel(); }}, "Paste an answer"));   // Today stays short until a check-in is under way
  else if (!st.res){
    const ta = h("textarea",{rows:"4", placeholder:"Paste your AI's whole answer", "aria-label":"Your AI's answer", oninput:e => { (S.ai || (S.ai = {})).draft = e.target.value; }});
    if (st.draft) ta.value = st.draft;
    box.append(ta, h("button",{type:"button", class:"btn ghost", onclick:() => { if (ta.value.trim()) aiCheck(p, ta.value); }}, "Check the answer"));
  } else {
    const r = st.res, list = h("ul",{class:"flags", style:"list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px"});
    const n = st.pick.size, cnt = {};
    r.items.forEach(x => { const t = x.type.replace(/-.*/, ""); cnt[t] = (cnt[t] || 0) + 1; });
    const sumTxt = Object.entries(cnt).map(([t, c]) => c + " " + ({task:"step change", target:"target", flag:"flag", custom:"new field", tiles:"tile layout", fields:"field change", chips:"chip set", tip:"tip", learning:"learning"}[t] || t) + (c > 1 ? "s" : "")).join(", ");
    box.append(h("p",{style:"margin:0;font-weight:600"}, r.items.length ? "Your AI suggests " + sumTxt + "." : "Your AI suggests no changes."));
    if (r.note) box.append(h("p",{style:"margin:0;font-style:italic"}, "“" + r.note + "”"));
    r.items.forEach((x, i) => { const on = st.pick.has(i);
      list.append(h("li",{style:"display:flex;gap:10px;align-items:flex-start;cursor:pointer", onclick:() => { on ? st.pick.delete(i) : st.pick.add(i); renderAiPanel(); }},
        h("span",{"aria-hidden":"true", style:"font-size:20px;line-height:1"}, on ? "☑" : "☐"),
        h("span",{style:"display:flex;flex-direction:column;gap:2px;min-width:0"}, h("span",{style:"font-weight:600"}, x.label), h("span",{class:"muted small"}, x.why || "No reason given, so left unticked.")))); });
    box.append(list);
    if (r.errors.length) box.append(h("p",{class:"muted small", style:"margin:0"}, r.errors.join(" ")));
    box.append(h("div",{class:"chips", style:"gap:8px"},
      h("button",{type:"button", class:"btn primary", disabled: st.busy ? "" : null, onclick:() => aiApply(p)}, st.busy ? "Saving…" : n ? "Apply " + n + " change" + (n > 1 ? "s" : "") : "Save the check-in"),
      h("button",{type:"button", class:"btn ghost sm", onclick:() => { S.ai = {}; renderAiPanel(); }}, "Cancel")));
  }
  if (st.err) box.append(h("p",{class:"sub", style:"margin:0;color:var(--warn, #9a3b1b)"}, st.err));
  return box;
}


/* ---------- step feedback with your AI (round 2b) ----------
   A log with a step, a question or photos gets "Ask your AI about this": a small packet (the step, its how-to, photos,
   note, what to look for, the plant's story so far) goes to the grower's AI; its answer is pasted (or shared) back and
   shows under the log as a reply thread. A plan block in it goes through the normal preview in Plan → Ask your AI.
   The AI's running story of the plant (`history`) is kept as plant.aiHistory and sent with every packet. */
function wdShort(s){ const n = Math.round((new Date(s + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5);
  return n === 0 ? "today" : n === 1 ? "tomorrow" : new Date(s + "T12:00:00").toLocaleDateString("en-GB", n > 1 && n < 7 ? {weekday:"short"} : {day:"numeric", month:"short"}); }
function askable(l){ return !!(l && window.AI && (l.step || l.asks || (l.photos || []).length)); }
function askPending(){ try { const a = JSON.parse(localStorage.getItem("ff-ask") || "null"); return a && Date.now() - a.t < 2 * 864e5 ? a : null; } catch(e){ return null; } }
function askClear(){ S.ask = null; try { localStorage.removeItem("ff-ask"); } catch(e){} pasteBar(); }
function stepData(p, l){
  const s = (l.step && Steps.byId(l.step.id)) || ((window.Steps && Steps.detect(l, [])) || {}).step || null;
  const hw = s && s.howto && window.HowTo ? HowTo.byId(s.howto) : null, ph = phaseOf(p);
  return {plant: p, profile: S.profile, stage: ["grow","bloom"].includes(ph) ? stageText(p) : PHASES[ph], today: today(), log: l, step: s,
    howto: hw ? {title: hw.title, steps: hw.steps.map(x => x.text)} : null, history: p.aiHistory || "", historyAt: p.aiHistoryAt || null,
    replies: stepReplies(p), tasks: openTasks().sort(sortTasks), keys: ALL_KEYS.slice(), app: APP_V};
}
async function askStep(p, l, how){
  if (!window.AI || !l) return;
  S.ask = {log: l.id, plant: p.id, msg: "Getting the photos ready…"}; try { localStorage.setItem("ff-ask", JSON.stringify({log: l.id, plant: p.id, t: Date.now()})); } catch(e){}
  renderHistory();
  const pk = AI.stepPacket(stepData(p, l)), title = "Flowerphile step check-in · " + (p.name || p.id);
  const sp = S.stepPrep || (S.stepPrep = {}), prep = sp[l.id] || (sp[l.id] = {files: await aiPhotoFiles(pk.photos)});
  try {
    if (how !== "copy" && navigator.share){
      const data = Object.assign({title, text: pk.text}, prep.files.length ? {files: prep.files} : {});
      if (!data.files || !navigator.canShare || navigator.canShare(data)){ await navigator.share(data); S.ask.msg = "Sent. When your AI answers, share its answer to Flowerphile or paste it here."; S.ask.sent = true; renderHistory(); pasteBar(); return; }
    }
    await navigator.clipboard.writeText(pk.text);
    S.ask.msg = "Copied. Paste it into your AI app" + (pk.photos.length ? " and attach the photos of this log." : ".") + " Then paste its answer here."; S.ask.sent = true;
  } catch(e){ S.ask.msg = e && e.name === "AbortError" ? "" : e && e.name === "NotAllowedError" ? "Ready now: tap Send again." : "Couldn't share or copy here. Try Copy."; }
  renderHistory(); pasteBar();
}
function askBox(p, l){
  if (!askable(l)) return null;
  const a = S.ask && S.ask.log === l.id ? S.ask : null;
  if (!a) return h("button",{type:"button", class:"btn ghost sm", style:"align-self:flex-start", onclick:() => askStep(p, l)}, (l.replies || []).length ? "Ask your AI again" : l.asks ? "Ask your AI this question" : "Ask your AI about this");
  const ta = h("textarea",{rows:"3", placeholder:"Paste your AI's whole answer", "aria-label":"Your AI's answer on this log"});
  if (a.draft) ta.value = a.draft;
  return h("div",{class:"howto", style:"gap:6px"},
    a.msg ? h("p",{class:"sub", style:"margin:0"}, a.msg) : null,
    h("div",{class:"chips", style:"gap:8px"},
      h("button",{type:"button", class:"btn ghost sm", onclick:() => askStep(p, l, "share")}, "Send again"),
      h("button",{type:"button", class:"btn ghost sm", onclick:() => askStep(p, l, "copy")}, "Copy")),
    ta, h("div",{class:"chips", style:"gap:8px"},
      h("button",{type:"button", class:"btn primary sm", onclick:() => { if (ta.value.trim()) stepAnswer(p, l, ta.value); }}, "Add the answer"),
      h("button",{type:"button", class:"btn ghost sm", onclick:() => { askClear(); renderHistory(); }}, "Cancel")),
    a.err ? h("p",{class:"sub", style:"margin:0;color:var(--warn, #9a3b1b)"}, a.err) : null);
}
async function stepAnswer(p, l, text){
  const now = new Date().toISOString(); let u = null, res = null;
  try { u = AI.extract(text); } catch(e){}
  const rep = AI.reply(text) || (u && u.note) || "";
  if (!rep && !u){ if (S.ask) S.ask.err = "That looks empty. Paste the whole answer."; renderHistory(); return; }
  try {
    S.logs = sortLogs(await mutate("logs.json", list => (list || []).map(x => x.id === l.id ? Object.assign({}, x, {replies: (x.replies || []).concat({at: now, src: "ai", text: rep || "(plan changes only)"})}) : x), "log reply " + l.id));
    if (u){ registerCustom(); res = AI.check(u, {plant: p, tasks: S.tasks.filter(t => t.run === p.id), keys: ALL_KEYS.slice(), today: today(), label: k => k === "watered" ? "Watered" : k === "fed" ? "Fed" : F[k] ? labelFor(p, k) : k});
      if (res.history) S.plants = await mutate("plants.json", list => (list || []).map(x => x.id === p.id ? Object.assign({}, x, {aiHistory: res.history, aiHistoryAt: now, updated: now}) : x), "ai: story so far"); }
    askClear(); cache();
    if (res && res.items.length){ res.history = ""; S.ai = {res, step: l.id, pick: new Set(res.items.map((x, i) => x.ok ? i : -1).filter(i => i >= 0)), msg: "Your AI's answer on the " + short(l.date) + " log also suggests plan changes:"};
      location.hash = "#today"; renderAll(); setTimeout(() => { const o = $("#p-ai"); if (o) o.scrollIntoView({block:"start"}); }, 80); }
    else { renderAll(); setSync("Answer added under the log"); }
  } catch(e){ console.error("stepAnswer", e); if (S.ask) S.ask.err = "Couldn't save (" + (e.code || e.message) + "). Tap Add again."; renderHistory(); }
}
/* an answer that arrives from outside: the Android share sheet (share_target in the manifest) or the paste bar */
function takeAnswer(text){
  text = String(text || "").trim(); if (!text) return;
  const a = askPending(), lg = a && S.logs.find(l => l.id === a.log), p = lg && S.plants.find(x => x.id === a.plant);
  if (lg && p){ S.sel = p.id; S.planSeg = "book"; location.hash = "#plan"; stepAnswer(p, lg, text); return; }
  const q = sel(); if (!q) return;
  S.ai = Object.assign(S.ai || {}, {draft: text}); location.hash = "#today"; renderAll(); aiCheck(q, text);
  setTimeout(() => { const o = $("#p-ai"); if (o) o.scrollIntoView({block:"start"}); }, 80);
}
/* coming back from the AI app: one big "Paste your AI's answer" button (iPhones can't share into a home-screen web app) */
function pasteBar(){
  let bar = $("#ai-paste"); const want = !!(askPending() || (S.ai && S.ai.sent && !S.ai.res));
  if (!want){ if (bar) bar.remove(); return; }
  if (!bar){ bar = h("div",{id:"ai-paste", class:"pastebar paper"},
      h("button",{type:"button", class:"btn primary", onclick:async () => {
        try { const t = await navigator.clipboard.readText(); if (t && t.trim()){ bar.remove(); takeAnswer(t); return; } } catch(e){}
        const a = askPending(); if (a){ S.planSeg = "book"; location.hash = "#plan"; } else location.hash = "#today"; renderAll();
        setTimeout(() => { const ta = document.querySelector(a ? "#h-list textarea" : "#p-ai textarea"); if (ta){ ta.scrollIntoView({block:"center"}); ta.focus(); } }, 120); }}, "Paste your AI's answer"),
      h("button",{type:"button", class:"btn ghost sm", "aria-label":"Not now", onclick:() => { askClear(); if (S.ai) S.ai.sent = false; }}, "✕"));
    document.body.append(bar); }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pasteBar(); });

})();
