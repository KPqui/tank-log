/* Flowerphile: multi-plant grow log. Data in a private GitHub repo (plants.json, tasks.json, logs.json, changes.json, media/). */
(function(){
"use strict";
const APP = "Flowerphile";
const CFG_KEY = "tanklog-cfg", CACHE_KEY = "tanklog-cache", SEL_KEY = "ff-plant";
const BERLIN = {lat:52.4996, lon:13.4180};

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
  }
  if (indoor) k.push("ppfd");
  k.push("height","nodes");
  return k;
}
function labelFor(p, k, short){
  const d = F[k]; let l = short ? (d.short || d.label) : d.label;
  if (p && p.medium !== "hydro" && (k === "ph" || k === "ec")) l += " in";
  return l;
}
function actionsFor(p){
  const m = p.medium || "hydro", indoor = (p.where || "indoor") === "indoor", auto = p.system === "autopot", ph = phaseOf(p);
  if (ph === "germ") return ["Soaked","Paper towel","Tail visible","Planted","Broke surface"];
  if (ph === "dry") return ["Hung","Rotated","Bucked","Trimmed","Stems snap","Still bendy","Sensor moved"];
  if (ph === "cure") return ["Burped","Humidity pack in","Jar changed","Smell check","Long storage"];
  if (ph === "done") return [];
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
const short = s => parseYmd(s).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
const hm = iso => { const d = new Date(iso); return pad(d.getHours())+":"+pad(d.getMinutes()); };
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
function themePref(){ try { return localStorage.getItem(THEME_KEY) || "auto"; } catch(e){ return "auto"; } }
const darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
function applyTheme(){
  const pref = themePref();
  const night = pref === "night" || (pref === "auto" && darkMQ && darkMQ.matches);
  document.documentElement.dataset.theme = night ? "night" : "day";
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = night ? "#17140F" : "#F0E6CC";
  decorateSoon();
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", applyTheme);
function raw(html){ const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'+
 '<filter id="rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="2.4"/></filter>'+
 '<filter id="wash" x="-20%" y="-30%" width="140%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="8"/><feDisplacementMap in="SourceGraphic" scale="7"/><feGaussianBlur stdDeviation="0.7"/></filter>'+
 '<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="2"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.10"/></feComponentTransfer></filter>'+
 '</defs></svg>';
document.body.prepend(raw(DEFS));
function rnd(seed){ let x = Math.sin(seed) * 10000; return () => { x = Math.sin(x) * 10000; return x - Math.floor(x); }; }
function washSVG(color, op){ return '<svg aria-hidden="true" viewBox="0 0 100 40" preserveAspectRatio="none"><ellipse cx="50" cy="20" rx="47" ry="17" style="fill:'+color+';fill-opacity:'+(op||0.6)+'" filter="url(#wash)"/></svg>'; }
function washSpan(word, cls){ const col = {ok:"var(--ok)", low:"var(--low)", high:"var(--high)"}[cls]; const sp = h("span",{class:"wash"}); if (col) sp.append(raw(washSVG(col))); sp.append(h("span",null,word)); return sp; }
function frameSVG(w, hgt, o){
  const r = rnd(o.seed || 1), med = o.medium || "hydro", X = 8, Y = 8;
  const ring = `M${X+1} ${Y+1}h${w-2}v${hgt-2}h${-(w-2)}Z M${X+8} ${Y+8}h${w-16}v${hgt-16}h${-(w-16)}Z`;
  let eff = "", id = "c" + Math.floor(r()*1e9);
  if (o.soak > 0){
    const hy = Y + hgt * (1 - o.soak * 0.9);
    let tide = ""; for (let x = 0; x <= w + 16; x += 5) tide += (x ? "L" : "M") + x + " " + (hy + 3*Math.sin(x/9 + r()*2) + (r()-0.5)*2).toFixed(1);
    if (med === "hydro"){
      eff += `<path d="${tide} L${w+16} ${hgt+18} L0 ${hgt+18}Z" style="fill:var(--soak);fill-opacity:${(0.25+0.35*o.soak).toFixed(2)}" filter="url(#wash)" clip-path="url(#${id})"/>`;
      eff += `<path d="${tide}" style="stroke:var(--soakline)" stroke-width="0.8" opacity="${(0.5+0.4*o.soak).toFixed(2)}" fill="none" clip-path="url(#${id})" filter="url(#rough)"/>`;
      const n = Math.round(1 + 3*o.soak); for (let i = 0; i < n; i++){ const x = X + 10 + r()*(w-20); eff += `<path d="M${x.toFixed(0)} ${Y+hgt-1} c -2.4 4, -3 7, 0 9 c 3 -2, 2.4 -5, 0 -9 Z" style="fill:var(--soakline);fill-opacity:.75"/>`; }
    } else {
      eff += `<path d="${tide} L${w+16} ${hgt+18} L0 ${hgt+18}Z" style="fill:var(--soak);fill-opacity:${(0.25+0.35*o.soak).toFixed(2)}" filter="url(#wash)" clip-path="url(#${id})"/>`;
      const n = Math.round(70*o.soak); for (let i = 0; i < n; i++){ const x = r()*(w+16), y = Y + hgt - Math.abs((r()+r()+r()-1.5))*(hgt*o.soak*0.6) + (r()*6-1); eff += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.4+r()).toFixed(1)}" style="fill:var(--soakline)" opacity="${(0.4+r()*0.5).toFixed(2)}" clip-path="url(#${id})"/>`; }
    }
  }
  if (o.warm > 0){
    eff += `<path d="M0 ${Y-8} H${w+16} V${Y+6+8*o.warm} Q ${(w+16)/2} ${Y+2+4*o.warm} 0 ${Y+6+8*o.warm}Z" style="fill:var(--warm);fill-opacity:${(0.35+0.35*o.warm).toFixed(2)}" filter="url(#wash)" clip-path="url(#${id})"/>`;
    for (let i = 0; i < Math.round(4*o.warm); i++){ const x = X + 10 + r()*(w-20); eff += `<path d="M${x.toFixed(0)} ${Y} l ${(r()*6-3).toFixed(1)} 5 l ${(r()*6-3).toFixed(1)} 4" style="stroke:var(--ink)" stroke-width="0.45" fill="none"/>`; }
  }
  if (o.frost > 0){ for (let i = 0; i < 3 + Math.round(3*o.frost); i++){ const x = X + 8 + r()*(w-16), y = Y - 2 + r()*6, rr = 2.5 + r()*2; for (let k = 0; k < 6; k++){ const a = k*Math.PI/3; eff += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l ${(rr*Math.cos(a)).toFixed(1)} ${(rr*Math.sin(a)).toFixed(1)}" style="stroke:var(--ink)" stroke-width="0.5"/>`; } } }
  let tip = "";
  if (o.state === "ok") tip = `<path d="M${X+w-8} ${Y+3} c 4 -6, 10 -6, 12 -1 c 1 4, -3 6, -5 4" stroke-width="0.9"/><path d="M${X+w-2} ${Y-2} c 2 -4, 6 -4, 7 -2 c -1 3, -4 3, -7 2 Z" style="fill:var(--ok);fill-opacity:.85" stroke-width="0.6"/>`;
  return `<svg class="frame" aria-hidden="true" viewBox="0 0 ${w+16} ${hgt+16}"><defs><clipPath id="${id}"><path d="${ring}" clip-rule="evenodd"/></clipPath></defs>${eff}<g fill="none" style="stroke:var(--ink)" stroke-linecap="round" stroke-linejoin="round" filter="url(#rough)"><rect x="${X+3}" y="${Y+3}" width="${w-6}" height="${hgt-6}" rx="5" stroke-width="1.2"/><rect x="${X+7}" y="${Y+7}" width="${w-14}" height="${hgt-14}" rx="3" stroke-width="0.45"/>${tip}</g></svg>`;
}
function previewPlant(){ return location.hash.startsWith("#plant") && S.pf && S.pf.medium ? {medium:S.pf.medium, where:S.pf.where} : null; }
function decorate(){
  const pv = previewPlant(), p = pv || sel(); const med = p ? (p.medium || "hydro") : "hydro";
  document.documentElement.style.setProperty("--c", p ? colorOf(p) : "var(--ink)");
  document.documentElement.dataset.medium = med;
  document.querySelectorAll(".fr").forEach((el, i) => {
    const b = el.getBoundingClientRect(); if (!b.width) return;
    const key = [Math.round(b.width), Math.round(b.height), el.dataset.soak, el.dataset.warm, el.dataset.frost, el.dataset.state, med, document.documentElement.dataset.theme].join("|");
    if (el._fk === key) return; el._fk = key;
    const old = el.querySelector(":scope > svg.frame"); if (old) old.remove();
    el.prepend(raw(frameSVG(Math.round(b.width), Math.round(b.height), {soak:+el.dataset.soak||0, warm:+el.dataset.warm||0, frost:+el.dataset.frost||0, state:el.dataset.state, medium:med, seed:i+1})));
  });
  drawBackground(p);
}
let decoTimer = null;
function decorateSoon(){ clearTimeout(decoTimer); decoTimer = setTimeout(() => requestAnimationFrame(decorate), 30); }
addEventListener("resize", decorateSoon);
document.addEventListener("toggle", decorateSoon, true);
/* ---------- background: engraved plate, atmosphere on top, medium at the bottom ---------- */
function drawBackground(p){
  const bg = $("#bg"); const W = innerWidth, H = innerHeight;
  const ph = p ? phaseOf(p) : "grow", indoorGrow = p && p.where !== "outdoor" && ["germ","grow","bloom"].includes(ph);
  const outdoor = p && p.where === "outdoor" && !["dry","cure","done"].includes(ph);
  let wx = {};
  if (outdoor){ const w = S.weather[(p.lat||BERLIN.lat)+","+(p.lon||BERLIN.lon)], c = w && w.j.current || {}, d = w && w.j.daily || {};
    wx = {cloud: c.cloud_cover, rain: (d.precipitation_sum && d.precipitation_sum[0]) || 0, gust: (d.wind_gusts_10m_max && d.wind_gusts_10m_max[0]) || 0}; }
  const warm = indoorGrow && (latestSensor() || {}).temp > ((targetsOf(p).air || [0, 99])[1]);
  const key = [W, H, p && p.id, ph, p && p.medium, indoorGrow, outdoor, JSON.stringify(wx), warm, document.documentElement.dataset.theme].join("|");
  if (bg._k === key) return; bg._k = key;
  const art = window.BgArt ? BgArt.draw({W, H, scene: indoorGrow ? "indoor" : outdoor ? "outdoor" : "none", medium: p ? (p.medium || "hydro") : "hydro", phase: ph, warm, weather: wx, night: document.documentElement.dataset.theme === "night", seed: p ? seedOf(p) : 11}) : {defs:"", top:"", bottom:"", by: H - 175};
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
function api(path, init, accept){
  const c = S.cfg;
  return fetch("https://api.github.com/repos/"+encodeURIComponent(c.owner)+"/"+encodeURIComponent(c.repo)+"/contents/"+path, Object.assign({cache:"no-store"}, init, {
    headers: Object.assign({ Authorization:"Bearer "+c.token, Accept: accept || "application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28" }, (init && init.headers) || {})
  }));
}
class StoreError extends Error { constructor(code, status){ super(code); this.code = code; this.status = status; } }
async function getJSON(path){
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
const isCsv = f => /\.(csv|txt)$/i.test(f.name || "") || /csv|text\/plain/.test(f.type || "");
async function uploadFiles(list, kind){
  const out = []; let n = 0;
  for (const f of list){
    n++;
    const stamp = new Date().toISOString(), csv = isCsv(f);
    const blob = csv ? f : await shrink(f);
    const base = csv && f.name ? f.name.replace(/[^\w.-]+/g,"_").replace(/\.(csv|txt)$/i,"") : kind;
    const path = "media/" + stamp.slice(0,10) + "/" + stamp.replace(/[:.]/g,"-") + "-" + n + "-" + base + "." + (csv ? "csv" : "jpg");
    if (blob.size > 20e6) throw new StoreError("too_large");
    const r = await putB64(path, await blobToB64(blob), null, "media " + path);
    if (!r.ok) throw new StoreError("http", r.status);
    out.push(path);
  }
  return out;
}
const imgCache = new Map();
function mediaUrl(path){
  if (imgCache.has(path)) return imgCache.get(path);
  const p = api(path, null, "application/vnd.github.raw").then(r => r.ok ? r.blob() : null).then(b => b ? URL.createObjectURL(b) : null).catch(() => null);
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
function vpd(t, rh){ if (t == null || rh == null) return null; const svp = 0.6108 * Math.exp(17.27*t/(t+237.3)); return Math.round(svp*(1-rh/100)*100)/100; }

/* ---------- weather (outdoor) ---------- */
async function loadWeather(p){
  const lat = p.lat || BERLIN.lat, lon = p.lon || BERLIN.lon, key = lat+","+lon;
  const c = S.weather[key];
  if (c && Date.now() - c.at < 30*60e3) return c;
  const url = "https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+
    "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,cloud_cover"+
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&timezone=Europe%2FBerlin&forecast_days=2";
  try {
    const j = await fetch(url).then(r => r.json());
    S.weather[key] = {at:Date.now(), j}; return S.weather[key];
  } catch(e){ return null; }
}

/* ---------- sync ---------- */
function setSync(text, err){ const b = $("#sync"); b.textContent = text; b.classList.toggle("err", !!err); }
function cache(){ try { localStorage.setItem(CACHE_KEY, JSON.stringify({plants:S.plants, tasks:S.tasks, logs:S.logs, changes:S.changes, tips:S.tips||[], strains:S.strains||[]})); } catch(e){} }
function sortLogs(list){ return (list||[]).slice().sort((a,b) => (b.at||"").localeCompare(a.at||"")); }
async function loadAll(){
  if (!S.cfg || S.busy) return;
  S.busy = true; setSync("Syncing…");
  try {
    let [plants, tasks, logs, changes, tips, strainsRes] = await Promise.all(["plants.json","tasks.json","logs.json","changes.json","tips.json","strains.json"].map(p => getJSON(p).catch(() => ({data:null}))));
    S.tips = (tips && tips.data) || []; S.strains = (strainsRes && strainsRes.data) || [];
    if (!plants.data){
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
  } catch(e){
    setSync(e.code === "auth" ? "Key rejected · open Settings" : "Offline · tap to retry", true);
  } finally { S.busy = false; renderAll(); }
}
function loadCache(){
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && c.plants){ Object.assign(S, {plants:c.plants, tasks:c.tasks||[], logs:sortLogs(c.logs), changes:c.changes||[], tips:c.tips||[], strains:c.strains||[]}); setSync("Saved copy"); } } catch(e){}
}

/* ---------- routing ---------- */
const VIEWS = ["today","log","plan","history","setup","plant","strain"];
function route(){
  let v = location.hash.slice(1);
  if (v === "plant-new" || v === "plant-edit"){ openPlantForm(v === "plant-edit"); v = "plant"; }
  if (!VIEWS.includes(v)) v = "today";
  if (!S.cfg && v !== "setup") v = "setup";
  for (const x of VIEWS) document.getElementById("v-"+x).hidden = x !== v;
  $("#tabs").hidden = v === "setup" || v === "plant" || !S.plants.length;
  document.querySelectorAll("nav a").forEach(a => a.dataset.v === v ? a.setAttribute("aria-current","page") : a.removeAttribute("aria-current"));
  if (v === "setup") renderSetup();
  if (v === "strain") renderStrain();
  if (v === "log"){ if (!S.edit) lnow(); renderLogForm(); }
  window.scrollTo(0,0);
  decorateSoon();
}
addEventListener("hashchange", route);
function selectPlant(id){
  if (S.edit) endEdit();
  S.sel = id; try { localStorage.setItem(SEL_KEY, id); } catch(e){}
  renderAll(); if (!$("#v-log").hidden) renderLogForm();
}

/* ---------- derived ---------- */
function latest(k){ for (const l of mine(S.logs)){ const n = num(l[k]); if (n != null) return {v:n, at:l.at}; } return null; }
function latestSensor(){ for (const l of mine(S.logs)) if (l.sensor && (l.sensor.temp != null || l.sensor.rh != null)) return l.sensor; return null; }
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
  const el = h("div",{class:"tile fr", "data-soak": fx.soak, "data-warm": fx.warm, "data-frost": fx.frost, "data-state": st.cls === "ok" ? "ok" : null},
    h("span",{class:"k"}, k), h("span",{class:"v num"}, v));
  if (st.word) el.append(h("span",null, washSpan(st.word, st.cls)));
  if (st.txt) el.append(h("span",{class:"r"}, st.txt));
  return el;
}
function renderTabs(){
  const box = $("#tabs"); box.replaceChildren();
  const v = location.hash.slice(1); box.hidden = v === "setup" || v.startsWith("plant") || !S.plants.length;
  const order = {active:0, resting:1, done:2};
  const list = S.plants.slice().sort((a,b) => (order[a.status]||0) - (order[b.status]||0));
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
  if (spec._k === key) return; spec._k = key;
  spec.setAttribute("viewBox", Specimen.VB);
  spec.innerHTML = Specimen.draw(st);
  const words = {germ:"a seed", dry:"a plant hung to dry", cure:"buds curing in a jar", done:"a finished jar"};
  spec.setAttribute("aria-label", "Ink drawing of " + (words[st.phase] || (st.nodes ? "a plant with " + st.nodes + " leaf nodes" + (st.flowerDays ? ", " + Math.round(st.flowerDays / 7) + " weeks into bloom" : "") : "a sprout")));
}
function lampInfo(p){
  if ((p.where || "indoor") !== "indoor" || !["grow","bloom"].includes(phaseOf(p))) return null;
  const l = latest("lamp"), lamp = l ? l.v : num(p.lamp); if (lamp == null) return null;
  const ht = latest("height"); return {lamp, gap: ht ? lamp - ht.v : null};
}
function lastAction(names){ for (const l of mine(S.logs)) if ((l.actions || []).some(a => names.includes(a))) return l; return null; }
function latestSince(k, since){ for (const l of mine(S.logs)){ if (since && l.date < since) break; const n = num(l[k]); if (n != null) return {v:n, at:l.at}; } return null; }
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
    return [["Weight", w ? fmtv("weight", w.v) : "–", {cls:"none", word:"", txt: wet ? "wet " + wet + " g" : "weigh a sample"}],
      ["Lost", lost != null ? lost + "%" : "–", lost != null ? (lost >= 70 ? {cls:"ok", word:"near", txt:"jars at ~72–75%"} : {cls:"none", word:"", txt:"jars at ~72–75%"}) : {cls:"none", word:"", txt:"needs wet + now"}],
      ["Day", ds ? String(daysBetween(ds, T) + 1) : "–", snap ? (snap.actions.includes("Stems snap") ? {cls:"ok", word:"snaps", txt:"ready for jars?"} : {cls:"none", word:"", txt:"still bendy"}) : {cls:"none", word:"", txt:"usually 7–14"}]];
  }
  if (ph === "cure"){
    const cs = phaseStart(p, "cure"), j = latestSince("jar_rh", cs), w = latestSince("weight", cs), b = lastAction(["Burped"]);
    const bd = b ? daysBetween(b.date, T) : null;
    return [["Jar RH", j ? fmtv("jar_rh", j.v) : "–", statusOf("jar_rh", j && j.v)],
      ["Burped", bd == null ? "–" : bd === 0 ? "today" : bd + " d ago", bd != null && bd > 2 && cs && daysBetween(cs, T) < 14 ? {cls:"high", word:"due", txt:"daily in week 1–2"} : {cls:"none", word:"", txt: cs && daysBetween(cs, T) >= 14 ? "every few days now" : "daily in week 1–2"}],
      ["Weight", w ? fmtv("weight", w.v) : (run.dry_g ? run.dry_g + " g" : "–"), {cls:"none", word:"", txt: run.dry_g ? "jarred at " + run.dry_g + " g" : ""}]];
  }
  if (ph === "done"){
    return [["Wet", run.wet_g ? run.wet_g + " g" : "–", none], ["Dry", run.dry_g ? run.dry_g + " g" : "–", run.wet_g && run.dry_g ? {cls:"none", word:"", txt: Math.round(100 * run.dry_g / run.wet_g) + "% of wet"} : none], ["Verdict", run.verdict || "–", none]];
  }
  return null;
}

/* ---------- tip of the day: alternates sourced facts and forum lore; strain notes when the plant has them ---------- */
S.tipShift = 0;
function tipFor(p){
  const all = (S.tips || []).filter(t => !t.plant || (p && t.plant === p.id) || (p && t.strain && p.strain && t.strain.toLowerCase() === p.strain.toLowerCase()));
  if (!all.length) return null;
  const d = Math.floor(Date.now() / 864e5) + S.tipShift, want = d % 2 ? "lore" : "fact";
  const pool = all.filter(t => (t.kind === "strain" ? "fact" : t.kind) === want); const list = pool.length ? pool : all;
  return list[((d >> 1) % list.length + list.length) % list.length];
}
function renderTip(p){
  const box = $("#t-tip"); if (!box) return; box.replaceChildren(); box._fk = null;
  const t = tipFor(p); box.hidden = !t; if (!t) return;
  const label = t.kind === "lore" ? "Forum lore · unverified" : t.kind === "strain" ? "About this strain" : "Fact";
  const parts = [h("div",{class:"head",style:"align-items:baseline"}, h("h2",null,label),
    h("button",{type:"button", class:"btn ghost sm", "aria-label":"Another one", onclick:() => { S.tipShift++; renderTip(sel()); decorateSoon(); }}, "Another")),
    h("p",{class:"tiptext"}, t.text),
    t.src ? h("a",{class:"small muted", href:t.src.u, target:"_blank", rel:"noopener"}, "Source: " + t.src.t) : null,
    t.kind === "strain" && strainOf(p) ? h("a",{class:"small", href:"#strain"}, "More about " + strainOf(p).name + " →") : null];
  box.append(...parts.filter(Boolean));
}

/* ---------- strain sheet ---------- */
function strainOf(p){
  if (!p || !p.strain || !S.strains) return null;
  const n = p.strain.toLowerCase(), b = (p.breeder || "").toLowerCase();
  return S.strains.find(x => x.name.toLowerCase() === n && (!b || !x.breeder || x.breeder.toLowerCase() === b)) || S.strains.find(x => x.name.toLowerCase() === n) || null;
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
function renderStrain(){
  const p = sel(), x = strainOf(p), box = $("#st-body"); box.replaceChildren();
  if (!x){ $("#st-name").textContent = p && p.strain ? p.strain : "Strain"; $("#st-by").textContent = "";
    box.append(h("p",{class:"empty"}, p && p.strain ? "No strain sheet yet. The nightly review will research one." : "Set the strain under the gear → Edit, and a strain sheet appears here.")); decorateSoon(); return; }
  $("#st-name").textContent = x.name; $("#st-by").textContent = [x.breeder, x.country].filter(Boolean).join(" · ");
  const facts = [["Type", x.type], ["Genetics", x.genetics], ["THC", x.thc], ["CBD", x.cbd], ["Bloom", x.flowering], ["Height", x.height], ["Yield", x.yield]].filter(f => f[1]);
  box.append(h("dl",{class:"facts"}, facts.flatMap(f => [h("dt",null,f[0]), h("dd",{class:"num"},f[1])])));
  if (x.special && x.special.length) box.append(h("div",{class:"chips", style:"gap:6px"}, x.special.map(t => h("span",{class:"tag"}, t))));
  if (x.spectra && x.spectra.length){
    const sp = h("div",{class:"panel fr","data-soak":"0.12"}, h("h2",null,"Character"));
    for (const v of x.spectra) sp.append(h("div",{class:"spec-row"},
      raw('<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + (SPEC_ICONS[v.i] || "") + '</svg>'),
      h("span",{class:"sl"}, v.l),
      h("span",{class:"track", role:"img", "aria-label": v.l + " to " + v.r + ": " + Math.round(v.v * 10) + " of 10"}, h("span",{class:"dot", style:"left:calc(" + (v.v * 100) + "% - 6px)"})),
      h("span",{class:"sr"}, v.r)));
    if (x.spectraNote) sp.append(h("p",{class:"sub", style:"margin:0"}, x.spectraNote));
    box.append(sp);
  }
  if (x.lineage){
    const lp = h("div",{class:"panel fr","data-soak":"0.12"}, h("h2",null,"Lineage"), h("ul",{class:"tree"}, lineageNode(x.lineage, 0)));
    if (x.story) lp.append(h("details",null, h("summary",null,"The story"), h("p",{class:"prose"}, x.story)));
    box.append(lp);
  }
  const tp = h("div",{class:"panel fr","data-soak":"0.12"}, h("h2",null,"Terpenes, taste, effect"));
  for (const t of x.terpenes || []) tp.append(h("div",{class:"terp"}, h("b",null,t.name), h("span",null," · " + t.note), t.basis ? h("div",{class:"lnote"}, t.basis) : null));
  if (x.terpNote) tp.append(h("p",{class:"sub", style:"margin:0"}, x.terpNote));
  if (x.taste) tp.append(h("p",{style:"margin:0"}, h("span",{class:"muted"},"Taste "), x.taste.join(", ")));
  if (x.effects) tp.append(h("p",{style:"margin:0"}, h("span",{class:"muted"},"Effect "), x.effects.join(", ")));
  box.append(tp);
  if (x.growNotes && x.growNotes.length) box.append(h("div",{class:"panel fr","data-soak":"0.12"}, h("h2",null,"Growing her"), h("ul",{class:"notes"}, x.growNotes.map(t => h("li",null,t)))));
  if (x.bio && x.bio.length){
    const d = h("details",{class:"bio"}, h("summary",null, h("h2",{style:"display:inline"},"Botany lesson")));
    x.bio.forEach(t => d.append(h("p",{class:"prose"}, t)));
    box.append(h("div",{class:"panel fr","data-soak":"0.12"}, d));
  }
  if (x.sources && x.sources.length) box.append(h("details",null, h("summary",{class:"small muted"},"Sources"), h("ul",{class:"notes small"}, x.sources.map(s => h("li",null, h("a",{href:s.u, target:"_blank", rel:"noopener"}, s.t))))));
  decorateSoon();
}

function renderToday(){
  const p = sel(), T = today();
  document.documentElement.style.setProperty("--c", p ? colorOf(p) : "var(--ink)");
  $("#t-date").textContent = new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  drawSpecimen(p);
  if (!p){
    $("#t-day").textContent = APP; $("#t-stage").textContent = S.cfg ? (S.synced ? "No plants" : "–") : "Not connected"; $("#t-medium").textContent = "";
    $("#t-tasks").replaceChildren(h("p",{class:"empty"}, S.synced ? "No plants yet. Add one under Settings & plants." : "Loading your plan…"));
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
    document.createTextNode(ph === "bloom" && !(p.stageLabel || "").startsWith("Bloom") && flipOf(p) ? "Bloom · wk " + (Math.floor(daysBetween(flipOf(p), T) / 7) + 1) : growing ? (p.stageLabel || ["Seed","Sprout","Seedling","Growth","Flower","Drying"][si]) : PHASES[ph] + (psd && ph !== "done" ? " · since " + short(psd) : "")));
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
  const doneToday = mine(S.tasks).filter(t => t.status === "done" && t.doneAt && ymd(new Date(t.doneAt)) === T);
  const box = $("#t-tasks"); box.replaceChildren();
  if (!due.length && !doneToday.length) box.append(h("p",{class:"empty"},"Nothing due today."));
  for (const t of due) box.append(taskRow(t));
  if (doneToday.length){
    if (S.showDone) doneToday.forEach(t => box.append(taskRow(t)));
    box.append(h("button",{type:"button", class:"donebtn", onclick:() => { S.showDone = !S.showDone; renderToday(); }}, S.showDone ? "Hide done" : "✓ " + doneToday.length + " done today"));
  }
  $("#t-count").textContent = "";

  // Observations: three plant values + three climate/weather values
  const fields = fieldsFor(p);
  const core = fields.filter(k => k !== "ppfd" && k !== "height");
  for (const k of ["height","ppfd"]) if (core.length < 3 && fields.includes(k)) core.push(k);
  const env = envTiles(p);
  const warm = env.warm || 0, frost = env.frost || 0;
  const grid = $("#t-grid"); grid.replaceChildren();
  let newest = null;
  const ct = coreTiles(p);
  if (ct){ ct.forEach(t => grid.append(tile(t[0], t[1], t[2], {soak:0.22, warm, frost}))); const l0 = mine(S.logs)[0]; if (l0) newest = l0.at; }
  else core.slice(0,3).forEach((k, i) => {
    const l = latest(k);
    if (l && (!newest || l.at > newest)) newest = l.at;
    grid.append(tile(labelFor(p,k,true), l ? fmtv(k, l.v) : "–", statusOf(k, l && l.v), {soak:0.22, warm, frost}));
  });
  if (ph !== "done") env.tiles.forEach(t => grid.append(tile(t[0], t[1], t[2], {soak:0.55})));
  const extra = (ct ? [] : fields.filter(k => !core.slice(0,3).includes(k))).map(k => { const l = latest(k); return l ? labelFor(p,k,true) + " " + fmtv(k, l.v) : null; }).filter(Boolean);
  if (env.more) extra.push(env.more);
  $("#t-more").textContent = extra.join(" · ");
  $("#t-envage").textContent = (newest ? "entered " + hm(newest) : "no entries yet") + (env.age ? " · " + env.age : "");

  const next = openTasks().filter(t => !t.due || t.due > T).sort(sortTasks).slice(0,4);
  const nb = $("#t-next"); nb.replaceChildren();
  if (!next.length) nb.append(h("p",{class:"empty"},"Nothing scheduled yet."));
  renderTip(p);
  const sb = $("#t-summary"); sb.replaceChildren(); sb._fk = null;
  const summ = p.summary || [];
  sb.hidden = !summ.length || ph === "germ" || ph === "grow" || ph === "bloom";
  if (!sb.hidden){
    const open = S.sumOpen === p.id, lines = open ? summ : summ.slice(0, 3);
    if (p.plate){
      const img = h("img",{class:"plate", alt:"Harvest photo of " + (p.strain || p.name) + ", half photo, half ink"});
      mediaUrl(p.plate).then(u => { if (u){ img.src = u; img.onload = decorateSoon; } });
      img.addEventListener("click", async () => { const u = await mediaUrl(p.plate); if (u){ const v = h("div",{class:"viewer paper", role:"dialog", "aria-label":"Harvest plate", onclick:() => v.remove()}, h("img",{src:u, alt:""})); document.body.append(v); } });
      const hd = phaseStart(p, "dry");
      sb.append(h("figure",{class:"platefig"}, img, h("figcaption",null, (p.strain || p.name) + (hd ? " · harvested " + short(hd) : ""))));
    }
    sb.append(h("div",{class:"head",style:"align-items:baseline"}, h("h2",null,"The run"), h("a",{href:"#plan", class:"small"}, "Numbers →")),
      h("ul",{class:"notes"}, lines.map(t => h("li",null,t))),
      ...(summ.length > 3 ? [h("button",{type:"button", class:"donebtn", onclick:() => { S.sumOpen = open ? null : p.id; renderToday(); }}, open ? "Less" : "More (" + (summ.length - 3) + ")")] : []));
  }
  for (const t of next) nb.append(h("div",{class:"row"}, h("span",null,t.title), h("span",{class:"lead"}), h("span",{class:"when"}, t.due ? fmtDay(t.due) : (t.trigger || "when ready"))));
  decorateSoon();
}
function envTiles(p){
  const none = {cls:"none", word:"", txt:""}; const note = $("#t-envnote"); note.textContent = "";
  if ((p.where || "indoor") === "outdoor" && !["dry","cure","done"].includes(phaseOf(p))){
    const w = S.weather[(p.lat||BERLIN.lat)+","+(p.lon||BERLIN.lon)];
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
  if (s){
    const v = vpd(s.temp, s.rh);
    const vs = v == null ? none : v < 0.8 ? {cls:"low", word:"low", txt:"aim 0.8–1.2"} : v > 1.4 ? {cls:"high", word:"high", txt:"aim 0.8–1.2"} : {cls:"ok", word:"good", txt:"aim 0.8–1.2"};
    const old = (Date.now() - new Date(s.at)) / 864e5;
    if (old > 2) note.textContent = "Sensor data is " + ago(s.at).replace(" ago","") + " old. Upload a fresh CSV with your next log.";
    const hi = T.air ? T.air[1] : 26;
    return {
      tiles:[["Air", s.temp != null ? s.temp.toFixed(1)+"°" : "–", statusOf("air", s.temp)], ["Humidity", s.rh != null ? Math.round(s.rh)+"%" : "–", statusOf("rh", s.rh)],
        ph === "dry" || ph === "cure" ? ["RH 24 h", s.hmin != null ? Math.round(s.hmin) + "–" + Math.round(s.hmax) : "–", s.hmax != null && s.hmax - s.hmin > 8 ? {cls:"high", word:"swingy", txt:"keep it steady"} : {cls:"none", word:"", txt:"min–max %"}] : ["VPD", v != null ? v.toFixed(2) : "–", vs]],
      warm: s.temp != null ? Math.max(0, Math.min(1, (s.temp - hi) / 4)) : 0,
      more: s.tmin != null ? "Air 24 h " + s.tmin.toFixed(0) + "–" + s.tmax.toFixed(0) + "°, humidity " + Math.round(s.hmin) + "–" + Math.round(s.hmax) + "%" : "",
      age: "sensor " + ago(s.at)
    };
  }
  const ma = latest("air"), mr = latest("rh");
  if (!ma && !mr) note.textContent = "No sensor data yet. Upload a CSV export with a log.";
  return {tiles:[["Air", ma ? fmtv("air", ma.v) : "–", statusOf("air", ma && ma.v)], ["Humidity", mr ? fmtv("rh", mr.v) : "–", statusOf("rh", mr && mr.v)], [["dry","cure","done"].includes(phaseOf(p)) ? "RH 24 h" : "VPD","–",none]], age: ma || mr ? "manual " + ago((ma||mr).at) : ""};
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
  return h("div",{class:"task"+(done?" done":"")}, cb, h("div",{class:"tb"}, title,
    open ? h("span",{class:"d"}, t.detail || "", t.trigger ? (t.detail ? " · " : "") + "Trigger: " + t.trigger : "") : null));
}
async function toggleTask(t, on){
  const prev = {status:t.status, doneAt:t.doneAt};
  t.status = on ? "done" : "open"; t.doneAt = on ? new Date().toISOString() : null; renderAll();
  try {
    S.tasks = await mutate("tasks.json", list => (list||[]).map(x => x.id === t.id ? Object.assign({}, x, {status:t.status, doneAt:t.doneAt}) : x), (on ? "done: " : "reopen: ") + t.title);
    cache(); renderAll();
  } catch(e){ Object.assign(t, prev); renderAll(); setSync("Couldn't save · tap to retry", true); }
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
function renderPhase(p){
  const box = $("#p-phase"); box.replaceChildren(); box._fk = null; box.hidden = !p; if (!p) return;
  const ph = phaseOf(p), T = today();
  const rail = h("div",{class:"rail"});
  const SHORT = {germ:"Germ", grow:"Veg", bloom:"Bloom", dry:"Dry", cure:"Cure", done:"Done"};
  PHASE_ORDER.forEach(k => { const d = phaseStart(p, k); rail.append(h("span",{class:"st" + (k === ph ? " on" : "") + (PHASE_ORDER.indexOf(k) < PHASE_ORDER.indexOf(ph) ? " past" : ""), title: PHASES[k]}, h("b",null, SHORT[k]), h("small",null, d ? short(d) : "·"))); });
  box.append(h("div",{class:"head",style:"align-items:center"}, h("h2",null,"The run"), h("span",{class:"muted small"}, PHASES[ph])), rail);
  const rows = runRows(p);
  if (p.summary && p.summary.length) box.append(h("details",null, h("summary",{class:"small"},"Story of this run"), h("ul",{class:"notes", style:"margin-top:8px"}, p.summary.map(t => h("li",null,t)))));
  if (rows.length) box.append(h("div",{class:"runrows"}, rows.map(r => h("div",{class:"row"}, h("span",null,r[0]), h("span",{class:"lead"}), h("span",{class:"when num"}, r[1])))));
  const nx = NEXT[ph]; if (!nx) return;
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
  const bar = $("#p-bar"), lg = $("#p-legend"); bar.replaceChildren(); lg.replaceChildren(); $("#p-upd").textContent = "";
  if (p && p.start && !["dry","cure","done"].includes(phaseOf(p))){
    const total = daysBetween(p.start, p.endEst || T) || 1;
    const g = p.flipEst ? daysBetween(p.start, p.flipEst) : total;
    bar.append(h("div",{class:"g", style:"width:"+(100*g/total)+"%"}), h("div",{class:"b", style:"width:"+(100*(total-g)/total)+"%"}));
    const nowPct = Math.max(0, Math.min(100, 100*daysBetween(p.start, T)/total));
    bar.append(h("div",{class:"now", style:"left:calc("+nowPct+"% - 1px)", title:"Today"}));
    lg.append(...[h("span",null,"Start " + short(p.start)), h("span",null,"Growth"),
      p.flipEst ? h("span",null,"Bloom ~" + short(p.flipEst)) : null, p.endEst ? h("span",null,"End ~" + short(p.endEst)) : null].filter(Boolean));
    if (p.updated) $("#p-upd").textContent = "Updated " + fmtDay(p.updated);
  }
  const list = $("#p-list"); list.replaceChildren();
  const open = openTasks().sort(sortTasks);
  if (!open.length) list.append(h("li",null,h("span",{class:"empty"},"No open steps.")));
  for (const t of open){
    const isDue = t.due && t.due <= T;
    const open = S.openTask.has("p-" + t.id), more = t.trigger || t.detail;
    list.append(h("li",{class:"fr","data-soak":"0.12", onclick: more ? () => { S.openTask.has("p-" + t.id) ? S.openTask.delete("p-" + t.id) : S.openTask.add("p-" + t.id); renderPlan(); decorateSoon(); } : null, style: more ? "cursor:pointer" : null},
      h("div",{style:"display:flex;flex-direction:column;gap:2px;min-width:0"}, h("span",{style:"font-weight:600"},t.title, more ? h("span",{class:"chev","aria-hidden":"true"}, open ? " –" : " +") : null),
        open ? h("span",{class:"muted small"}, [t.detail, t.trigger ? "Trigger: " + t.trigger : ""].filter(Boolean).join(" · ")) : null),
      h("span",{class:"when num"+(isDue?" due":"")}, t.due ? (isDue ? fmtDay(t.due) : "~" + fmtDay(t.due)) : "open")));
  }
  const dl = $("#p-donelist"); dl.replaceChildren();
  const done = mine(S.tasks).filter(t => t.status === "done").sort((a,b) => (b.doneAt||"").localeCompare(a.doneAt||""));
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
      s ? h("div",{class:"vals"}, h("span",null,"Sensor ", h("b",{class:"num"}, (s.temp != null ? s.temp.toFixed(1)+"° " : "") + (s.rh != null ? Math.round(s.rh)+"%" : ""))), s.tmin != null ? h("span",{class:"muted"}, "24 h "+s.tmin.toFixed(0)+"–"+s.tmax.toFixed(0)+"°") : null) : null,
      (l.actions && l.actions.length) ? h("div",{class:"chips",style:"gap:6px"}, l.actions.map(a => h("span",{class:"tag"},a))) : null,
      l.note ? h("p",{style:"margin:0;font-size:14px;color:var(--muted)"}, l.note) : null,
      (l.photos && l.photos.length) ? h("div",{class:"thumbs"}, l.photos.map(thumb)) : null,
      files.length ? h("div",{class:"thumbs"}, files.map(f => /\.(jpe?g|png|webp)$/i.test(f) ? thumb(f) : h("span",{class:"tag"}, "Sensor file"))) : null,
      h("div",{style:"display:flex;gap:8px"},
        h("button",{type:"button", class:"btn ghost sm", onclick:() => startEdit(l)}, "Edit"),
        h("button",{type:"button", class:"btn ghost sm", style:S.armDel===l.id ? "color:var(--bad);border-color:var(--bad)" : null, onclick:() => delLog(l)}, S.armDel===l.id ? "Tap again to delete" : "Delete"))));
  }
}
function renderAll(){ renderTabs(); renderToday(); renderPlan(); renderHistory(); if (!$("#v-strain").hidden) renderStrain(); if (!$("#v-setup").hidden) renderSetup(); decorateSoon(); }

/* ---------- log form ---------- */
function renderLogForm(){
  const p = sel(); if (!p) return;
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
      if (a === "Light changed") renderLogForm();
    }}, a));
  }
  const indoor = (p.where || "indoor") === "indoor";
  $("#l-sensordrop").hidden = !indoor || ph === "germ" || ph === "done";
  if (!S.edit) $("#l-title").textContent = p.name;
}
const countLabel = (n, none) => n ? n + " selected" : none;
$("#f-photo").addEventListener("change", e => { $("#f-photo-n").textContent = countLabel(e.target.files.length, "camera or gallery"); });
$("#f-file").addEventListener("change", e => { $("#f-file-n").textContent = countLabel(e.target.files.length, "CSV export"); });
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
  $("#f-photo-n").textContent = "camera or gallery"; $("#f-file-n").textContent = "CSV export";
}
$("#f-cancel").addEventListener("click", () => { endEdit(); location.hash = "#history"; });
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
      const entry = Object.assign({id:"l-" + Date.now(), run:p.id, at, date:today(), source:"app", actions, note, photos:newPhotos, files:newFiles}, vals);
      if (sensor) entry.sensor = sensor;
      S.logs = sortLogs(await mutate("logs.json", list => [...(list||[]), entry], "log " + entry.date));
    }
    cache(); endEdit(); renderAll();
    st.textContent = sensor ? "Saved. Sensor data up to " + fmtTime(sensor.at) + "." : "Saved.";
    setTimeout(() => { st.textContent = ""; location.hash = wasEdit ? "#history" : "#today"; }, sensor ? 1600 : 800);
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
  $("#pl-strain").value = p && p.strain || ""; $("#pl-breeder").value = p && p.breeder || "";
  $("#pl-sensor").value = p && p.sensor || ""; $("#pl-lamp").value = p && p.lamp != null ? p.lamp : "";
  $("#pl-save").textContent = p ? "Save" : "Add plant"; $("#pl-statusmsg").textContent = "";
  renderPlantChips();
}
$("#pl-cancel").addEventListener("click", () => history.back());
$("#plantform").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#pl-name").value.trim(), st = $("#pl-statusmsg");
  if (!name){ st.textContent = "Give the plant a name."; return; }
  const fields = Object.assign({}, S.pf, {name, start:$("#pl-start").value || null, sprout:$("#pl-sprout").value || null, sensor:S.pf.where === "indoor" ? ($("#pl-sensor").value.trim() || null) : null, lamp:S.pf.where === "indoor" ? num($("#pl-lamp").value) : null, strain:$("#pl-strain").value.trim() || null, breeder:$("#pl-breeder").value.trim() || null});
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

/* ---------- setup ---------- */
function renderSetup(){
  const c = S.cfg;
  const tb = $("#s-theme"); tb.replaceChildren(); for (const [v,l] of [["auto","Follow phone"],["day","Day"],["night","Night"]]) tb.append(h("button",{type:"button",class:"chip","aria-pressed": themePref()===v ? "true":"false", onclick:() => { try { localStorage.setItem(THEME_KEY, v); } catch(e){} applyTheme(); renderSetup(); }}, l));
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#setupform")) return;
  $("#s-owner").value = c ? c.owner : ""; $("#s-repo").value = c ? c.repo : "tank-log-data"; $("#s-token").value = "";
  $("#s-token").placeholder = c ? "saved · paste a new one to replace" : "github_pat_…";
  $("#s-connected").hidden = !c; if (c) $("#s-where").textContent = c.owner + "/" + c.repo;
  $("#s-save").textContent = c ? "Save" : "Connect";
  $("#s-plants").hidden = !c;
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
$("#s-out").addEventListener("click", () => {
  saveCfg(null); S.cfg = null; try { localStorage.removeItem(CACHE_KEY); } catch(e){}
  Object.assign(S, {plants:[], tasks:[], logs:[], changes:[]}); renderAll(); renderSetup(); setSync("–");
});

/* ---------- start ---------- */
$("#sync").addEventListener("click", loadAll);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && (!S.synced || Date.now() - S.synced > 60000)) loadAll(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
applyTheme();
S.cfg = loadCfg();
try { S.sel = localStorage.getItem(SEL_KEY); } catch(e){}
if (S.cfg) loadCache();
if (!S.plants.find(p => p.id === S.sel)) S.sel = (S.plants[0] || {}).id || null;
lnow(); renderAll(); route();
if (S.cfg) loadAll();
})();
