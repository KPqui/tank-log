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
  air:{label:"Air °C", short:"Air", d:1, unit:"°"}, rh:{label:"Humidity %", short:"Humidity", d:0, unit:"%"}
};
const ALL_KEYS = Object.keys(F);
const DEFAULT_TARGETS = {
  "hydro": {ph:[5.8,6.2], ec:[0.4,1.2], water:[18,23], air:[22,27], rh:[55,70], ppfd:[300,600]},
  "coco": {ph:[5.8,6.2], ec:[0.8,1.6], air:[22,27], rh:[55,70], ppfd:[300,600]},
  "soil": {ph:[6.2,6.8], ec:[0.8,1.6], air:[22,27], rh:[55,70], ppfd:[300,600]},
  "living-soil": {air:[22,27], rh:[55,70], ppfd:[300,600]}
};
function fieldsFor(p){
  const m = p.medium || "hydro", sys = p.system || "hand", indoor = (p.where || "indoor") === "indoor";
  let k;
  if (m === "hydro") k = ["ph","ec","water"];
  else {
    k = sys === "autopot" ? ["res_l"] : ["water_l"];
    if (m === "coco") k.push(...(sys === "autopot" ? ["res_ph","res_ec"] : ["ph","ec"]), "runoff_ec");
    if (m === "soil") k.push(...(sys === "autopot" ? ["res_ph","res_ec"] : ["ph","ec"]), "runoff_ph");
  }
  if (indoor) k.push("ppfd");
  k.push("height");
  return k;
}
function labelFor(p, k, short){
  const d = F[k]; let l = short ? (d.short || d.label) : d.label;
  if (p && p.medium !== "hydro" && (k === "ph" || k === "ec")) l += " in";
  return l;
}
function actionsFor(p){
  const m = p.medium || "hydro", indoor = (p.where || "indoor") === "indoor", auto = p.system === "autopot";
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
const SPECIMEN = "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M70 250 C 67 205, 75 160, 70 112 S 73 60, 72 40\" stroke-width=\"2.1\"/><path d=\"M72.5 246 C 70 205, 77.5 160, 72.5 112\" stroke-width=\"0.5\" opacity=\"0.7\"/><path d=\"M70.0 228.0 L68.7 229.1 L67.6 229.9 L66.1 232.0 L65.4 230.9 L64.0 232.4 L63.4 231.1 L62.2 232.0 L61.6 230.5 L60.5 230.9 L59.9 229.4 L58.9 229.3 L58.4 227.8 L57.5 227.4 L56.9 225.9 L56.1 225.3 L55.4 224.3 L54.4 224.1 L53.5 223.8 L53.5 223.8 L54.5 223.9 L55.4 224.3 L56.5 223.7 L57.5 223.5 L58.7 222.5 L59.7 222.6 L60.9 221.5 L61.8 222.0 L63.1 220.9 L63.8 221.7 L65.0 220.7 L65.6 222.1 L66.8 221.3 L67.3 223.3 L68.5 222.6 L68.8 225.2 L69.4 226.4 L70.0 228.0Z\" stroke-width=\"0.7\"/><path d=\"M70.0 228.0 L70.6 226.4 L71.2 225.2 L71.5 222.6 L72.7 223.3 L73.2 221.3 L74.4 222.1 L75.0 220.7 L76.2 221.7 L76.9 220.9 L78.2 222.0 L79.1 221.5 L80.3 222.6 L81.3 222.5 L82.5 223.5 L83.5 223.7 L84.6 224.3 L85.5 223.9 L86.5 223.8 L86.5 223.8 L85.6 224.1 L84.6 224.3 L83.9 225.3 L83.1 225.9 L82.5 227.4 L81.6 227.8 L81.1 229.3 L80.1 229.4 L79.5 230.9 L78.4 230.5 L77.8 232.0 L76.6 231.1 L76.0 232.4 L74.6 230.9 L73.9 232.0 L72.4 229.9 L71.3 229.1 L70.0 228.0Z\" stroke-width=\"0.7\"/><path d=\"M70.0 200.0 Q 65.5 193.6 54.9 193.3\" stroke-width=\"0.9\"/><path d=\"M54.9 193.3 L53.0 193.5 L51.2 193.6 L48.9 194.6 L47.6 193.2 L45.6 193.8 L44.4 192.3 L42.5 192.5 L41.4 190.9 L39.6 190.7 L38.5 189.1 L37.0 188.5 L35.9 186.9 L34.4 186.1 L33.2 184.6 L31.8 183.7 L30.6 182.4 L29.0 181.8 L27.5 181.0 L27.5 181.0 L29.1 181.6 L30.6 182.4 L32.4 182.5 L34.0 182.9 L35.9 182.7 L37.5 183.3 L39.4 183.0 L40.9 183.9 L42.8 183.6 L44.1 184.7 L46.1 184.5 L47.2 186.0 L49.1 185.9 L50.0 187.9 L51.9 187.9 L52.6 190.3 L53.8 191.7 L54.9 193.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M54.9 193.3 L53.0 193.5 L51.2 193.6 L48.9 194.6 L47.6 193.2 L45.6 193.8 L44.4 192.3 L42.5 192.5 L41.4 190.9 L39.6 190.7 L38.5 189.1 L37.0 188.5 L35.9 186.9 L34.4 186.1 L33.2 184.6 L31.8 183.7 L30.6 182.4 L29.0 181.8 L27.5 181.0 L27.5 181.0 L29.1 181.6 L30.6 182.4 L32.4 182.5 L34.0 182.9 L35.9 182.7 L37.5 183.3 L39.4 183.0 L40.9 183.9 L42.8 183.6 L44.1 184.7 L46.1 184.5 L47.2 186.0 L49.1 185.9 L50.0 187.9 L51.9 187.9 L52.6 190.3 L53.8 191.7 L54.9 193.3Z\" stroke-width=\"0.75\"/><path d=\"M54.9 193.3 L28.6 181.5\" stroke-width=\"0.45\"/><path d=\"M71.0 200.0 Q 81.5 193.6 86.1 193.3\" stroke-width=\"0.9\"/><path d=\"M86.1 193.3 L87.2 191.7 L88.4 190.3 L89.1 187.9 L91.0 187.9 L91.9 185.9 L93.8 186.0 L94.9 184.5 L96.9 184.7 L98.2 183.6 L100.1 183.9 L101.6 183.0 L103.5 183.3 L105.1 182.7 L107.0 182.9 L108.6 182.5 L110.4 182.4 L111.9 181.6 L113.5 181.0 L113.5 181.0 L112.0 181.8 L110.4 182.4 L109.2 183.7 L107.8 184.6 L106.6 186.1 L105.1 186.9 L104.0 188.5 L102.5 189.1 L101.4 190.7 L99.6 190.9 L98.5 192.5 L96.6 192.3 L95.4 193.8 L93.4 193.2 L92.1 194.6 L89.8 193.6 L88.0 193.5 L86.1 193.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M86.1 193.3 L87.2 191.7 L88.4 190.3 L89.1 187.9 L91.0 187.9 L91.9 185.9 L93.8 186.0 L94.9 184.5 L96.9 184.7 L98.2 183.6 L100.1 183.9 L101.6 183.0 L103.5 183.3 L105.1 182.7 L107.0 182.9 L108.6 182.5 L110.4 182.4 L111.9 181.6 L113.5 181.0 L113.5 181.0 L112.0 181.8 L110.4 182.4 L109.2 183.7 L107.8 184.6 L106.6 186.1 L105.1 186.9 L104.0 188.5 L102.5 189.1 L101.4 190.7 L99.6 190.9 L98.5 192.5 L96.6 192.3 L95.4 193.8 L93.4 193.2 L92.1 194.6 L89.8 193.6 L88.0 193.5 L86.1 193.3Z\" stroke-width=\"0.75\"/><path d=\"M86.1 193.3 L112.4 181.5\" stroke-width=\"0.45\"/><path d=\"M70.0 156.0 Q 62.0 148.1 47.9 146.1\" stroke-width=\"0.9\"/><path d=\"M47.9 146.1 L47.2 147.6 L46.4 148.8 L46.0 150.9 L44.5 151.0 L44.0 152.7 L42.4 152.8 L41.7 154.1 L40.1 154.1 L39.2 155.1 L37.5 155.0 L36.5 155.8 L34.8 155.8 L33.6 156.4 L32.1 156.3 L30.8 156.8 L29.3 157.0 L28.2 157.7 L27.0 158.4 L27.0 158.4 L28.1 157.6 L29.3 157.0 L30.2 155.9 L31.3 155.0 L32.0 153.6 L33.1 152.8 L33.8 151.4 L35.1 150.8 L35.8 149.4 L37.1 149.1 L37.9 147.7 L39.4 147.7 L40.2 146.3 L42.0 146.7 L42.8 145.5 L44.8 146.1 L46.3 146.1 L47.9 146.1Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M47.9 146.1 L47.2 147.6 L46.4 148.8 L46.0 150.9 L44.5 151.0 L44.0 152.7 L42.4 152.8 L41.7 154.1 L40.1 154.1 L39.2 155.1 L37.5 155.0 L36.5 155.8 L34.8 155.8 L33.6 156.4 L32.1 156.3 L30.8 156.8 L29.3 157.0 L28.2 157.7 L27.0 158.4 L27.0 158.4 L28.1 157.6 L29.3 157.0 L30.2 155.9 L31.3 155.0 L32.0 153.6 L33.1 152.8 L33.8 151.4 L35.1 150.8 L35.8 149.4 L37.1 149.1 L37.9 147.7 L39.4 147.7 L40.2 146.3 L42.0 146.7 L42.8 145.5 L44.8 146.1 L46.3 146.1 L47.9 146.1Z\" stroke-width=\"0.75\"/><path d=\"M47.9 146.1 L27.9 157.9\" stroke-width=\"0.45\"/><path d=\"M47.9 146.1 L45.1 146.4 L42.4 146.4 L39.2 147.6 L37.4 145.7 L34.4 146.4 L32.6 144.4 L29.9 144.5 L28.2 142.3 L25.7 141.9 L24.0 139.7 L21.7 138.9 L20.0 136.6 L17.9 135.5 L16.1 133.3 L14.1 132.0 L12.2 130.2 L9.9 129.3 L7.7 128.2 L7.7 128.2 L10.0 129.1 L12.2 130.2 L14.8 130.4 L17.2 131.0 L19.9 130.9 L22.2 131.7 L25.0 131.5 L27.1 132.7 L30.0 132.4 L31.9 134.0 L34.7 133.8 L36.4 135.9 L39.1 135.9 L40.6 138.5 L43.2 138.7 L44.4 141.9 L46.2 143.9 L47.9 146.1Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M47.9 146.1 L45.1 146.4 L42.4 146.4 L39.2 147.6 L37.4 145.7 L34.4 146.4 L32.6 144.4 L29.9 144.5 L28.2 142.3 L25.7 141.9 L24.0 139.7 L21.7 138.9 L20.0 136.6 L17.9 135.5 L16.1 133.3 L14.1 132.0 L12.2 130.2 L9.9 129.3 L7.7 128.2 L7.7 128.2 L10.0 129.1 L12.2 130.2 L14.8 130.4 L17.2 131.0 L19.9 130.9 L22.2 131.7 L25.0 131.5 L27.1 132.7 L30.0 132.4 L31.9 134.0 L34.7 133.8 L36.4 135.9 L39.1 135.9 L40.6 138.5 L43.2 138.7 L44.4 141.9 L46.2 143.9 L47.9 146.1Z\" stroke-width=\"0.75\"/><path d=\"M47.9 146.1 L9.3 128.9\" stroke-width=\"0.45\"/><path d=\"M47.9 146.1 L46.8 145.0 L45.8 143.8 L44.0 142.8 L44.4 141.4 L42.9 140.3 L43.4 138.8 L42.3 137.7 L42.9 136.2 L42.2 134.9 L42.8 133.4 L42.4 132.2 L43.0 130.7 L42.8 129.3 L43.4 127.8 L43.4 126.5 L43.6 125.1 L43.3 123.7 L43.1 122.4 L43.1 122.4 L43.4 123.7 L43.6 125.1 L44.4 126.3 L44.9 127.5 L46.0 128.7 L46.4 130.0 L47.5 131.1 L47.6 132.5 L48.8 133.6 L48.6 135.0 L49.7 136.2 L49.2 137.6 L50.2 138.8 L49.3 140.4 L50.2 141.6 L48.9 143.2 L48.5 144.6 L47.9 146.1Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M47.9 146.1 L46.8 145.0 L45.8 143.8 L44.0 142.8 L44.4 141.4 L42.9 140.3 L43.4 138.8 L42.3 137.7 L42.9 136.2 L42.2 134.9 L42.8 133.4 L42.4 132.2 L43.0 130.7 L42.8 129.3 L43.4 127.8 L43.4 126.5 L43.6 125.1 L43.3 123.7 L43.1 122.4 L43.1 122.4 L43.4 123.7 L43.6 125.1 L44.4 126.3 L44.9 127.5 L46.0 128.7 L46.4 130.0 L47.5 131.1 L47.6 132.5 L48.8 133.6 L48.6 135.0 L49.7 136.2 L49.2 137.6 L50.2 138.8 L49.3 140.4 L50.2 141.6 L48.9 143.2 L48.5 144.6 L47.9 146.1Z\" stroke-width=\"0.75\"/><path d=\"M47.9 146.1 L43.3 123.4\" stroke-width=\"0.45\"/><path d=\"M71.0 156.0 Q 85.0 148.1 93.1 146.1\" stroke-width=\"0.9\"/><path d=\"M93.1 146.1 L92.5 144.6 L92.1 143.2 L90.8 141.6 L91.7 140.4 L90.8 138.8 L91.8 137.6 L91.3 136.2 L92.4 135.0 L92.2 133.6 L93.4 132.5 L93.5 131.1 L94.6 130.0 L95.0 128.7 L96.1 127.5 L96.6 126.3 L97.4 125.1 L97.6 123.7 L97.9 122.4 L97.9 122.4 L97.7 123.7 L97.4 125.1 L97.6 126.5 L97.6 127.8 L98.2 129.3 L98.0 130.7 L98.6 132.2 L98.2 133.4 L98.8 134.9 L98.1 136.2 L98.7 137.7 L97.6 138.8 L98.1 140.3 L96.6 141.4 L97.0 142.8 L95.2 143.8 L94.2 145.0 L93.1 146.1Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M93.1 146.1 L92.5 144.6 L92.1 143.2 L90.8 141.6 L91.7 140.4 L90.8 138.8 L91.8 137.6 L91.3 136.2 L92.4 135.0 L92.2 133.6 L93.4 132.5 L93.5 131.1 L94.6 130.0 L95.0 128.7 L96.1 127.5 L96.6 126.3 L97.4 125.1 L97.6 123.7 L97.9 122.4 L97.9 122.4 L97.7 123.7 L97.4 125.1 L97.6 126.5 L97.6 127.8 L98.2 129.3 L98.0 130.7 L98.6 132.2 L98.2 133.4 L98.8 134.9 L98.1 136.2 L98.7 137.7 L97.6 138.8 L98.1 140.3 L96.6 141.4 L97.0 142.8 L95.2 143.8 L94.2 145.0 L93.1 146.1Z\" stroke-width=\"0.75\"/><path d=\"M93.1 146.1 L97.7 123.4\" stroke-width=\"0.45\"/><path d=\"M93.1 146.1 L94.8 143.9 L96.6 141.9 L97.8 138.7 L100.4 138.5 L101.9 135.9 L104.6 135.9 L106.3 133.8 L109.1 134.0 L111.0 132.4 L113.9 132.7 L116.0 131.5 L118.8 131.7 L121.1 130.9 L123.8 131.0 L126.2 130.4 L128.8 130.2 L131.0 129.1 L133.3 128.2 L133.3 128.2 L131.1 129.3 L128.8 130.2 L126.9 132.0 L124.9 133.3 L123.1 135.5 L121.0 136.6 L119.3 138.9 L117.0 139.7 L115.3 141.9 L112.8 142.3 L111.1 144.5 L108.4 144.4 L106.6 146.4 L103.6 145.7 L101.8 147.6 L98.6 146.4 L95.9 146.4 L93.1 146.1Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M93.1 146.1 L94.8 143.9 L96.6 141.9 L97.8 138.7 L100.4 138.5 L101.9 135.9 L104.6 135.9 L106.3 133.8 L109.1 134.0 L111.0 132.4 L113.9 132.7 L116.0 131.5 L118.8 131.7 L121.1 130.9 L123.8 131.0 L126.2 130.4 L128.8 130.2 L131.0 129.1 L133.3 128.2 L133.3 128.2 L131.1 129.3 L128.8 130.2 L126.9 132.0 L124.9 133.3 L123.1 135.5 L121.0 136.6 L119.3 138.9 L117.0 139.7 L115.3 141.9 L112.8 142.3 L111.1 144.5 L108.4 144.4 L106.6 146.4 L103.6 145.7 L101.8 147.6 L98.6 146.4 L95.9 146.4 L93.1 146.1Z\" stroke-width=\"0.75\"/><path d=\"M93.1 146.1 L131.7 128.9\" stroke-width=\"0.45\"/><path d=\"M93.1 146.1 L94.7 146.1 L96.2 146.1 L98.2 145.5 L99.0 146.7 L100.8 146.3 L101.6 147.7 L103.1 147.7 L103.9 149.1 L105.2 149.4 L105.9 150.8 L107.2 151.4 L107.9 152.8 L109.0 153.6 L109.7 155.0 L110.8 155.9 L111.7 157.0 L112.9 157.6 L114.0 158.4 L114.0 158.4 L112.8 157.7 L111.7 157.0 L110.2 156.8 L108.9 156.3 L107.4 156.4 L106.2 155.8 L104.5 155.8 L103.5 155.0 L101.8 155.1 L100.9 154.1 L99.3 154.1 L98.6 152.8 L97.0 152.7 L96.5 151.0 L95.0 150.9 L94.6 148.8 L93.8 147.6 L93.1 146.1Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M93.1 146.1 L94.7 146.1 L96.2 146.1 L98.2 145.5 L99.0 146.7 L100.8 146.3 L101.6 147.7 L103.1 147.7 L103.9 149.1 L105.2 149.4 L105.9 150.8 L107.2 151.4 L107.9 152.8 L109.0 153.6 L109.7 155.0 L110.8 155.9 L111.7 157.0 L112.9 157.6 L114.0 158.4 L114.0 158.4 L112.8 157.7 L111.7 157.0 L110.2 156.8 L108.9 156.3 L107.4 156.4 L106.2 155.8 L104.5 155.8 L103.5 155.0 L101.8 155.1 L100.9 154.1 L99.3 154.1 L98.6 152.8 L97.0 152.7 L96.5 151.0 L95.0 150.9 L94.6 148.8 L93.8 147.6 L93.1 146.1Z\" stroke-width=\"0.75\"/><path d=\"M93.1 146.1 L113.1 157.9\" stroke-width=\"0.45\"/><path d=\"M70.0 108.0 Q 59.9 99.2 43.9 96.3\" stroke-width=\"0.9\"/><path d=\"M43.9 96.3 L43.0 98.0 L42.0 99.5 L41.6 101.8 L39.8 102.0 L39.1 103.9 L37.3 104.0 L36.4 105.6 L34.6 105.6 L33.5 106.8 L31.6 106.8 L30.3 107.7 L28.4 107.6 L27.0 108.3 L25.2 108.4 L23.6 108.9 L22.0 109.2 L20.6 110.1 L19.2 110.8 L19.2 110.8 L20.5 109.9 L22.0 109.2 L23.0 107.9 L24.2 106.8 L25.1 105.2 L26.5 104.3 L27.3 102.7 L28.8 102.0 L29.6 100.3 L31.3 99.9 L32.2 98.3 L34.0 98.3 L34.9 96.8 L37.0 97.1 L38.0 95.7 L40.3 96.4 L42.0 96.3 L43.9 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M43.9 96.3 L43.0 98.0 L42.0 99.5 L41.6 101.8 L39.8 102.0 L39.1 103.9 L37.3 104.0 L36.4 105.6 L34.6 105.6 L33.5 106.8 L31.6 106.8 L30.3 107.7 L28.4 107.6 L27.0 108.3 L25.2 108.4 L23.6 108.9 L22.0 109.2 L20.6 110.1 L19.2 110.8 L19.2 110.8 L20.5 109.9 L22.0 109.2 L23.0 107.9 L24.2 106.8 L25.1 105.2 L26.5 104.3 L27.3 102.7 L28.8 102.0 L29.6 100.3 L31.3 99.9 L32.2 98.3 L34.0 98.3 L34.9 96.8 L37.0 97.1 L38.0 95.7 L40.3 96.4 L42.0 96.3 L43.9 96.3Z\" stroke-width=\"0.75\"/><path d=\"M43.9 96.3 L20.2 110.2\" stroke-width=\"0.45\"/><path d=\"M43.9 96.3 L41.7 97.7 L39.5 98.9 L37.4 101.3 L35.1 100.5 L33.0 102.3 L30.7 101.4 L28.5 102.7 L26.2 101.6 L24.0 102.3 L21.7 101.1 L19.5 101.5 L17.2 100.3 L15.0 100.3 L12.7 99.2 L10.4 99.0 L8.1 98.3 L5.9 98.5 L3.6 98.6 L3.6 98.6 L5.9 98.3 L8.1 98.3 L10.3 97.4 L12.5 96.9 L14.7 95.6 L16.9 95.3 L19.1 93.9 L21.3 94.0 L23.5 92.6 L25.8 93.1 L27.9 91.7 L30.2 92.8 L32.4 91.6 L34.7 93.2 L36.9 92.1 L39.3 94.3 L41.6 95.2 L43.9 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M43.9 96.3 L41.7 97.7 L39.5 98.9 L37.4 101.3 L35.1 100.5 L33.0 102.3 L30.7 101.4 L28.5 102.7 L26.2 101.6 L24.0 102.3 L21.7 101.1 L19.5 101.5 L17.2 100.3 L15.0 100.3 L12.7 99.2 L10.4 99.0 L8.1 98.3 L5.9 98.5 L3.6 98.6 L3.6 98.6 L5.9 98.3 L8.1 98.3 L10.3 97.4 L12.5 96.9 L14.7 95.6 L16.9 95.3 L19.1 93.9 L21.3 94.0 L23.5 92.6 L25.8 93.1 L27.9 91.7 L30.2 92.8 L32.4 91.6 L34.7 93.2 L36.9 92.1 L39.3 94.3 L41.6 95.2 L43.9 96.3Z\" stroke-width=\"0.75\"/><path d=\"M43.9 96.3 L5.3 98.5\" stroke-width=\"0.45\"/><path d=\"M43.9 96.3 L40.6 96.6 L37.5 96.5 L33.7 97.9 L31.5 95.7 L28.0 96.5 L25.9 94.1 L22.7 94.2 L20.7 91.7 L17.7 91.2 L15.7 88.6 L13.0 87.6 L11.0 85.0 L8.4 83.7 L6.4 81.2 L3.9 79.6 L1.7 77.5 L-1.0 76.4 L-3.6 75.1 L-3.6 75.1 L-0.9 76.2 L1.7 77.5 L4.7 77.8 L7.5 78.5 L10.8 78.4 L13.5 79.4 L16.8 79.1 L19.3 80.5 L22.6 80.3 L24.9 82.1 L28.2 82.0 L30.2 84.4 L33.4 84.4 L35.2 87.5 L38.3 87.7 L39.7 91.4 L41.9 93.7 L43.9 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M43.9 96.3 L40.6 96.6 L37.5 96.5 L33.7 97.9 L31.5 95.7 L28.0 96.5 L25.9 94.1 L22.7 94.2 L20.7 91.7 L17.7 91.2 L15.7 88.6 L13.0 87.6 L11.0 85.0 L8.4 83.7 L6.4 81.2 L3.9 79.6 L1.7 77.5 L-1.0 76.4 L-3.6 75.1 L-3.6 75.1 L-0.9 76.2 L1.7 77.5 L4.7 77.8 L7.5 78.5 L10.8 78.4 L13.5 79.4 L16.8 79.1 L19.3 80.5 L22.6 80.3 L24.9 82.1 L28.2 82.0 L30.2 84.4 L33.4 84.4 L35.2 87.5 L38.3 87.7 L39.7 91.4 L41.9 93.7 L43.9 96.3Z\" stroke-width=\"0.75\"/><path d=\"M43.9 96.3 L-1.7 76.0\" stroke-width=\"0.45\"/><path d=\"M43.9 96.3 L41.5 95.4 L39.3 94.3 L36.1 94.0 L35.4 91.7 L32.7 91.0 L32.1 88.6 L29.8 87.5 L29.4 85.0 L27.5 83.7 L27.1 81.1 L25.5 79.5 L25.1 76.9 L23.8 75.1 L23.4 72.6 L22.3 70.6 L21.5 68.4 L20.0 66.7 L18.7 64.9 L18.7 64.9 L20.2 66.6 L21.5 68.4 L23.5 69.6 L25.2 71.1 L27.5 72.2 L29.0 73.8 L31.4 74.8 L32.7 76.6 L35.1 77.6 L36.0 79.7 L38.4 80.7 L38.9 83.2 L41.1 84.2 L41.2 87.1 L43.2 88.2 L42.9 91.4 L43.5 93.8 L43.9 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M43.9 96.3 L41.5 95.4 L39.3 94.3 L36.1 94.0 L35.4 91.7 L32.7 91.0 L32.1 88.6 L29.8 87.5 L29.4 85.0 L27.5 83.7 L27.1 81.1 L25.5 79.5 L25.1 76.9 L23.8 75.1 L23.4 72.6 L22.3 70.6 L21.5 68.4 L20.0 66.7 L18.7 64.9 L18.7 64.9 L20.2 66.6 L21.5 68.4 L23.5 69.6 L25.2 71.1 L27.5 72.2 L29.0 73.8 L31.4 74.8 L32.7 76.6 L35.1 77.6 L36.0 79.7 L38.4 80.7 L38.9 83.2 L41.1 84.2 L41.2 87.1 L43.2 88.2 L42.9 91.4 L43.5 93.8 L43.9 96.3Z\" stroke-width=\"0.75\"/><path d=\"M43.9 96.3 L19.7 66.2\" stroke-width=\"0.45\"/><path d=\"M43.9 96.3 L42.6 95.0 L41.5 93.6 L39.5 92.4 L39.8 90.7 L38.2 89.4 L38.7 87.7 L37.5 86.3 L38.1 84.5 L37.3 83.1 L38.0 81.3 L37.5 79.8 L38.2 78.0 L38.0 76.5 L38.6 74.7 L38.5 73.1 L38.8 71.4 L38.4 69.9 L38.2 68.3 L38.2 68.3 L38.6 69.9 L38.8 71.4 L39.7 72.9 L40.3 74.4 L41.5 75.7 L42.0 77.3 L43.3 78.6 L43.4 80.2 L44.7 81.6 L44.6 83.2 L45.8 84.6 L45.3 86.3 L46.4 87.7 L45.4 89.5 L46.4 91.0 L45.0 92.9 L44.5 94.6 L43.9 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M43.9 96.3 L42.6 95.0 L41.5 93.6 L39.5 92.4 L39.8 90.7 L38.2 89.4 L38.7 87.7 L37.5 86.3 L38.1 84.5 L37.3 83.1 L38.0 81.3 L37.5 79.8 L38.2 78.0 L38.0 76.5 L38.6 74.7 L38.5 73.1 L38.8 71.4 L38.4 69.9 L38.2 68.3 L38.2 68.3 L38.6 69.9 L38.8 71.4 L39.7 72.9 L40.3 74.4 L41.5 75.7 L42.0 77.3 L43.3 78.6 L43.4 80.2 L44.7 81.6 L44.6 83.2 L45.8 84.6 L45.3 86.3 L46.4 87.7 L45.4 89.5 L46.4 91.0 L45.0 92.9 L44.5 94.6 L43.9 96.3Z\" stroke-width=\"0.75\"/><path d=\"M43.9 96.3 L38.4 69.4\" stroke-width=\"0.45\"/><path d=\"M71.0 108.0 Q 87.1 99.2 97.1 96.3\" stroke-width=\"0.9\"/><path d=\"M97.1 96.3 L96.5 94.6 L96.0 92.9 L94.6 91.0 L95.6 89.5 L94.6 87.7 L95.7 86.3 L95.2 84.6 L96.4 83.2 L96.3 81.6 L97.6 80.2 L97.7 78.6 L99.0 77.3 L99.5 75.7 L100.7 74.4 L101.3 72.9 L102.2 71.4 L102.4 69.9 L102.8 68.3 L102.8 68.3 L102.6 69.9 L102.2 71.4 L102.5 73.1 L102.4 74.7 L103.0 76.5 L102.8 78.0 L103.5 79.8 L103.0 81.3 L103.7 83.1 L102.9 84.5 L103.5 86.3 L102.3 87.7 L102.8 89.4 L101.2 90.7 L101.5 92.4 L99.5 93.6 L98.4 95.0 L97.1 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M97.1 96.3 L96.5 94.6 L96.0 92.9 L94.6 91.0 L95.6 89.5 L94.6 87.7 L95.7 86.3 L95.2 84.6 L96.4 83.2 L96.3 81.6 L97.6 80.2 L97.7 78.6 L99.0 77.3 L99.5 75.7 L100.7 74.4 L101.3 72.9 L102.2 71.4 L102.4 69.9 L102.8 68.3 L102.8 68.3 L102.6 69.9 L102.2 71.4 L102.5 73.1 L102.4 74.7 L103.0 76.5 L102.8 78.0 L103.5 79.8 L103.0 81.3 L103.7 83.1 L102.9 84.5 L103.5 86.3 L102.3 87.7 L102.8 89.4 L101.2 90.7 L101.5 92.4 L99.5 93.6 L98.4 95.0 L97.1 96.3Z\" stroke-width=\"0.75\"/><path d=\"M97.1 96.3 L102.6 69.4\" stroke-width=\"0.45\"/><path d=\"M97.1 96.3 L97.5 93.8 L98.1 91.4 L97.8 88.2 L99.8 87.1 L99.9 84.2 L102.1 83.2 L102.6 80.7 L105.0 79.7 L105.9 77.6 L108.3 76.6 L109.6 74.8 L112.0 73.8 L113.5 72.2 L115.8 71.1 L117.5 69.6 L119.5 68.4 L120.8 66.6 L122.3 64.9 L122.3 64.9 L121.0 66.7 L119.5 68.4 L118.7 70.6 L117.6 72.6 L117.2 75.1 L115.9 76.9 L115.5 79.5 L113.9 81.1 L113.5 83.7 L111.6 85.0 L111.2 87.5 L108.9 88.6 L108.3 91.0 L105.6 91.7 L104.9 94.0 L101.7 94.3 L99.5 95.4 L97.1 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M97.1 96.3 L97.5 93.8 L98.1 91.4 L97.8 88.2 L99.8 87.1 L99.9 84.2 L102.1 83.2 L102.6 80.7 L105.0 79.7 L105.9 77.6 L108.3 76.6 L109.6 74.8 L112.0 73.8 L113.5 72.2 L115.8 71.1 L117.5 69.6 L119.5 68.4 L120.8 66.6 L122.3 64.9 L122.3 64.9 L121.0 66.7 L119.5 68.4 L118.7 70.6 L117.6 72.6 L117.2 75.1 L115.9 76.9 L115.5 79.5 L113.9 81.1 L113.5 83.7 L111.6 85.0 L111.2 87.5 L108.9 88.6 L108.3 91.0 L105.6 91.7 L104.9 94.0 L101.7 94.3 L99.5 95.4 L97.1 96.3Z\" stroke-width=\"0.75\"/><path d=\"M97.1 96.3 L121.3 66.2\" stroke-width=\"0.45\"/><path d=\"M97.1 96.3 L99.1 93.7 L101.3 91.4 L102.7 87.7 L105.8 87.5 L107.6 84.4 L110.8 84.4 L112.8 82.0 L116.1 82.1 L118.4 80.3 L121.7 80.5 L124.2 79.1 L127.5 79.4 L130.2 78.4 L133.5 78.5 L136.3 77.8 L139.3 77.5 L141.9 76.2 L144.6 75.1 L144.6 75.1 L142.0 76.4 L139.3 77.5 L137.1 79.6 L134.6 81.2 L132.6 83.7 L130.0 85.0 L128.0 87.6 L125.3 88.6 L123.3 91.2 L120.3 91.7 L118.3 94.2 L115.1 94.1 L113.0 96.5 L109.5 95.7 L107.3 97.9 L103.5 96.5 L100.4 96.6 L97.1 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M97.1 96.3 L99.1 93.7 L101.3 91.4 L102.7 87.7 L105.8 87.5 L107.6 84.4 L110.8 84.4 L112.8 82.0 L116.1 82.1 L118.4 80.3 L121.7 80.5 L124.2 79.1 L127.5 79.4 L130.2 78.4 L133.5 78.5 L136.3 77.8 L139.3 77.5 L141.9 76.2 L144.6 75.1 L144.6 75.1 L142.0 76.4 L139.3 77.5 L137.1 79.6 L134.6 81.2 L132.6 83.7 L130.0 85.0 L128.0 87.6 L125.3 88.6 L123.3 91.2 L120.3 91.7 L118.3 94.2 L115.1 94.1 L113.0 96.5 L109.5 95.7 L107.3 97.9 L103.5 96.5 L100.4 96.6 L97.1 96.3Z\" stroke-width=\"0.75\"/><path d=\"M97.1 96.3 L142.7 76.0\" stroke-width=\"0.45\"/><path d=\"M97.1 96.3 L99.4 95.2 L101.7 94.3 L104.1 92.1 L106.3 93.2 L108.6 91.6 L110.8 92.8 L113.1 91.7 L115.2 93.1 L117.5 92.6 L119.7 94.0 L121.9 93.9 L124.1 95.3 L126.3 95.6 L128.5 96.9 L130.7 97.4 L132.9 98.3 L135.1 98.3 L137.4 98.6 L137.4 98.6 L135.1 98.5 L132.9 98.3 L130.6 99.0 L128.3 99.2 L126.0 100.3 L123.8 100.3 L121.5 101.5 L119.3 101.1 L117.0 102.3 L114.8 101.6 L112.5 102.7 L110.3 101.4 L108.0 102.3 L105.9 100.5 L103.6 101.3 L101.5 98.9 L99.3 97.7 L97.1 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M97.1 96.3 L99.4 95.2 L101.7 94.3 L104.1 92.1 L106.3 93.2 L108.6 91.6 L110.8 92.8 L113.1 91.7 L115.2 93.1 L117.5 92.6 L119.7 94.0 L121.9 93.9 L124.1 95.3 L126.3 95.6 L128.5 96.9 L130.7 97.4 L132.9 98.3 L135.1 98.3 L137.4 98.6 L137.4 98.6 L135.1 98.5 L132.9 98.3 L130.6 99.0 L128.3 99.2 L126.0 100.3 L123.8 100.3 L121.5 101.5 L119.3 101.1 L117.0 102.3 L114.8 101.6 L112.5 102.7 L110.3 101.4 L108.0 102.3 L105.9 100.5 L103.6 101.3 L101.5 98.9 L99.3 97.7 L97.1 96.3Z\" stroke-width=\"0.75\"/><path d=\"M97.1 96.3 L135.7 98.5\" stroke-width=\"0.45\"/><path d=\"M97.1 96.3 L99.0 96.3 L100.7 96.4 L103.0 95.7 L104.0 97.1 L106.1 96.8 L107.0 98.3 L108.8 98.3 L109.7 99.9 L111.4 100.3 L112.2 102.0 L113.7 102.7 L114.5 104.3 L115.9 105.2 L116.8 106.8 L118.0 107.9 L119.0 109.2 L120.5 109.9 L121.8 110.8 L121.8 110.8 L120.4 110.1 L119.0 109.2 L117.4 108.9 L115.8 108.4 L114.0 108.3 L112.6 107.6 L110.7 107.7 L109.4 106.8 L107.5 106.8 L106.4 105.6 L104.6 105.6 L103.7 104.0 L101.9 103.9 L101.2 102.0 L99.4 101.8 L99.0 99.5 L98.0 98.0 L97.1 96.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M97.1 96.3 L99.0 96.3 L100.7 96.4 L103.0 95.7 L104.0 97.1 L106.1 96.8 L107.0 98.3 L108.8 98.3 L109.7 99.9 L111.4 100.3 L112.2 102.0 L113.7 102.7 L114.5 104.3 L115.9 105.2 L116.8 106.8 L118.0 107.9 L119.0 109.2 L120.5 109.9 L121.8 110.8 L121.8 110.8 L120.4 110.1 L119.0 109.2 L117.4 108.9 L115.8 108.4 L114.0 108.3 L112.6 107.6 L110.7 107.7 L109.4 106.8 L107.5 106.8 L106.4 105.6 L104.6 105.6 L103.7 104.0 L101.9 103.9 L101.2 102.0 L99.4 101.8 L99.0 99.5 L98.0 98.0 L97.1 96.3Z\" stroke-width=\"0.75\"/><path d=\"M97.1 96.3 L120.8 110.2\" stroke-width=\"0.45\"/><path d=\"M72.0 46.0 Q 72.9 39.1 67.8 38.3\" stroke-width=\"0.9\"/><path d=\"M67.8 38.3 L67.2 38.7 L66.7 39.0 L66.1 39.8 L65.7 39.4 L65.1 40.0 L64.7 39.6 L64.1 40.0 L63.7 39.4 L63.2 39.6 L62.8 39.1 L62.3 39.1 L61.8 38.5 L61.4 38.4 L60.9 37.9 L60.5 37.7 L60.0 37.3 L59.5 37.3 L59.0 37.2 L59.0 37.2 L59.5 37.2 L60.0 37.3 L60.5 37.1 L61.0 37.0 L61.6 36.6 L62.1 36.6 L62.6 36.2 L63.1 36.3 L63.6 35.9 L64.1 36.2 L64.6 35.8 L65.1 36.3 L65.6 35.9 L66.0 36.6 L66.5 36.4 L66.9 37.3 L67.4 37.7 L67.8 38.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M67.8 38.3 L67.2 38.7 L66.7 39.0 L66.1 39.8 L65.7 39.4 L65.1 40.0 L64.7 39.6 L64.1 40.0 L63.7 39.4 L63.2 39.6 L62.8 39.1 L62.3 39.1 L61.8 38.5 L61.4 38.4 L60.9 37.9 L60.5 37.7 L60.0 37.3 L59.5 37.3 L59.0 37.2 L59.0 37.2 L59.5 37.2 L60.0 37.3 L60.5 37.1 L61.0 37.0 L61.6 36.6 L62.1 36.6 L62.6 36.2 L63.1 36.3 L63.6 35.9 L64.1 36.2 L64.6 35.8 L65.1 36.3 L65.6 35.9 L66.0 36.6 L66.5 36.4 L66.9 37.3 L67.4 37.7 L67.8 38.3Z\" stroke-width=\"0.75\"/><path d=\"M67.8 38.3 L59.4 37.3\" stroke-width=\"0.45\"/><path d=\"M67.8 38.3 L66.8 37.8 L65.9 37.3 L64.4 37.1 L64.4 36.1 L63.2 35.7 L63.2 34.7 L62.3 34.2 L62.4 33.1 L61.7 32.5 L61.9 31.4 L61.4 30.6 L61.5 29.5 L61.2 28.7 L61.3 27.7 L61.0 26.8 L61.0 25.8 L60.5 25.0 L60.1 24.2 L60.1 24.2 L60.6 25.0 L61.0 25.8 L61.8 26.4 L62.4 27.1 L63.3 27.5 L63.8 28.3 L64.8 28.7 L65.2 29.6 L66.2 30.0 L66.3 31.0 L67.3 31.4 L67.2 32.5 L68.1 33.0 L67.8 34.2 L68.6 34.8 L68.0 36.1 L67.9 37.2 L67.8 38.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M67.8 38.3 L66.8 37.8 L65.9 37.3 L64.4 37.1 L64.4 36.1 L63.2 35.7 L63.2 34.7 L62.3 34.2 L62.4 33.1 L61.7 32.5 L61.9 31.4 L61.4 30.6 L61.5 29.5 L61.2 28.7 L61.3 27.7 L61.0 26.8 L61.0 25.8 L60.5 25.0 L60.1 24.2 L60.1 24.2 L60.6 25.0 L61.0 25.8 L61.8 26.4 L62.4 27.1 L63.3 27.5 L63.8 28.3 L64.8 28.7 L65.2 29.6 L66.2 30.0 L66.3 31.0 L67.3 31.4 L67.2 32.5 L68.1 33.0 L67.8 34.2 L68.6 34.8 L68.0 36.1 L67.9 37.2 L67.8 38.3Z\" stroke-width=\"0.75\"/><path d=\"M67.8 38.3 L60.4 24.8\" stroke-width=\"0.45\"/><path d=\"M67.8 38.3 L67.6 37.6 L67.4 37.0 L66.8 36.2 L67.4 35.9 L67.0 35.2 L67.6 34.9 L67.4 34.3 L68.0 34.0 L68.0 33.5 L68.7 33.3 L68.8 32.8 L69.5 32.6 L69.7 32.2 L70.4 31.9 L70.7 31.5 L71.2 31.2 L71.4 30.8 L71.6 30.4 L71.6 30.4 L71.4 30.8 L71.2 31.2 L71.2 31.8 L71.2 32.3 L71.4 32.9 L71.2 33.4 L71.4 34.1 L71.1 34.5 L71.4 35.1 L71.0 35.5 L71.2 36.1 L70.6 36.4 L70.7 37.0 L69.9 37.1 L70.0 37.7 L69.0 37.8 L68.4 38.1 L67.8 38.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M67.8 38.3 L67.6 37.6 L67.4 37.0 L66.8 36.2 L67.4 35.9 L67.0 35.2 L67.6 34.9 L67.4 34.3 L68.0 34.0 L68.0 33.5 L68.7 33.3 L68.8 32.8 L69.5 32.6 L69.7 32.2 L70.4 31.9 L70.7 31.5 L71.2 31.2 L71.4 30.8 L71.6 30.4 L71.6 30.4 L71.4 30.8 L71.2 31.2 L71.2 31.8 L71.2 32.3 L71.4 32.9 L71.2 33.4 L71.4 34.1 L71.1 34.5 L71.4 35.1 L71.0 35.5 L71.2 36.1 L70.6 36.4 L70.7 37.0 L69.9 37.1 L70.0 37.7 L69.0 37.8 L68.4 38.1 L67.8 38.3Z\" stroke-width=\"0.75\"/><path d=\"M67.8 38.3 L71.5 30.7\" stroke-width=\"0.45\"/><path d=\"M72.0 46.0 Q 77.1 39.1 76.2 38.3\" stroke-width=\"0.9\"/><path d=\"M76.2 38.3 L75.6 38.1 L75.0 37.8 L74.0 37.7 L74.1 37.1 L73.3 37.0 L73.4 36.4 L72.8 36.1 L73.0 35.5 L72.6 35.1 L72.9 34.5 L72.6 34.1 L72.8 33.4 L72.6 32.9 L72.8 32.3 L72.8 31.8 L72.8 31.2 L72.6 30.8 L72.4 30.4 L72.4 30.4 L72.6 30.8 L72.8 31.2 L73.3 31.5 L73.6 31.9 L74.3 32.2 L74.5 32.6 L75.2 32.8 L75.3 33.3 L76.0 33.5 L76.0 34.0 L76.6 34.3 L76.4 34.9 L77.0 35.2 L76.6 35.9 L77.2 36.2 L76.6 37.0 L76.4 37.6 L76.2 38.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M76.2 38.3 L75.6 38.1 L75.0 37.8 L74.0 37.7 L74.1 37.1 L73.3 37.0 L73.4 36.4 L72.8 36.1 L73.0 35.5 L72.6 35.1 L72.9 34.5 L72.6 34.1 L72.8 33.4 L72.6 32.9 L72.8 32.3 L72.8 31.8 L72.8 31.2 L72.6 30.8 L72.4 30.4 L72.4 30.4 L72.6 30.8 L72.8 31.2 L73.3 31.5 L73.6 31.9 L74.3 32.2 L74.5 32.6 L75.2 32.8 L75.3 33.3 L76.0 33.5 L76.0 34.0 L76.6 34.3 L76.4 34.9 L77.0 35.2 L76.6 35.9 L77.2 36.2 L76.6 37.0 L76.4 37.6 L76.2 38.3Z\" stroke-width=\"0.75\"/><path d=\"M76.2 38.3 L72.5 30.7\" stroke-width=\"0.45\"/><path d=\"M76.2 38.3 L76.1 37.2 L76.0 36.1 L75.4 34.8 L76.2 34.2 L75.9 33.0 L76.8 32.5 L76.7 31.4 L77.7 31.0 L77.8 30.0 L78.8 29.6 L79.2 28.7 L80.2 28.3 L80.7 27.5 L81.6 27.1 L82.2 26.4 L83.0 25.8 L83.4 25.0 L83.9 24.2 L83.9 24.2 L83.5 25.0 L83.0 25.8 L83.0 26.8 L82.7 27.7 L82.8 28.7 L82.5 29.5 L82.6 30.6 L82.1 31.4 L82.3 32.5 L81.6 33.1 L81.7 34.2 L80.8 34.7 L80.8 35.7 L79.6 36.1 L79.6 37.1 L78.1 37.3 L77.2 37.8 L76.2 38.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M76.2 38.3 L76.1 37.2 L76.0 36.1 L75.4 34.8 L76.2 34.2 L75.9 33.0 L76.8 32.5 L76.7 31.4 L77.7 31.0 L77.8 30.0 L78.8 29.6 L79.2 28.7 L80.2 28.3 L80.7 27.5 L81.6 27.1 L82.2 26.4 L83.0 25.8 L83.4 25.0 L83.9 24.2 L83.9 24.2 L83.5 25.0 L83.0 25.8 L83.0 26.8 L82.7 27.7 L82.8 28.7 L82.5 29.5 L82.6 30.6 L82.1 31.4 L82.3 32.5 L81.6 33.1 L81.7 34.2 L80.8 34.7 L80.8 35.7 L79.6 36.1 L79.6 37.1 L78.1 37.3 L77.2 37.8 L76.2 38.3Z\" stroke-width=\"0.75\"/><path d=\"M76.2 38.3 L83.6 24.8\" stroke-width=\"0.45\"/><path d=\"M76.2 38.3 L76.6 37.7 L77.1 37.3 L77.5 36.4 L78.0 36.6 L78.4 35.9 L78.9 36.3 L79.4 35.8 L79.9 36.2 L80.4 35.9 L80.9 36.3 L81.4 36.2 L81.9 36.6 L82.4 36.6 L83.0 37.0 L83.5 37.1 L84.0 37.3 L84.5 37.2 L85.0 37.2 L85.0 37.2 L84.5 37.3 L84.0 37.3 L83.5 37.7 L83.1 37.9 L82.6 38.4 L82.2 38.5 L81.7 39.1 L81.2 39.1 L80.8 39.6 L80.3 39.4 L79.9 40.0 L79.3 39.6 L78.9 40.0 L78.3 39.4 L77.9 39.8 L77.3 39.0 L76.8 38.7 L76.2 38.3Z\" fill=\"var(--leaf)\" fill-opacity=\"0.38\" stroke=\"none\" filter=\"url(#wash)\"/><path d=\"M76.2 38.3 L76.6 37.7 L77.1 37.3 L77.5 36.4 L78.0 36.6 L78.4 35.9 L78.9 36.3 L79.4 35.8 L79.9 36.2 L80.4 35.9 L80.9 36.3 L81.4 36.2 L81.9 36.6 L82.4 36.6 L83.0 37.0 L83.5 37.1 L84.0 37.3 L84.5 37.2 L85.0 37.2 L85.0 37.2 L84.5 37.3 L84.0 37.3 L83.5 37.7 L83.1 37.9 L82.6 38.4 L82.2 38.5 L81.7 39.1 L81.2 39.1 L80.8 39.6 L80.3 39.4 L79.9 40.0 L79.3 39.6 L78.9 40.0 L78.3 39.4 L77.9 39.8 L77.3 39.0 L76.8 38.7 L76.2 38.3Z\" stroke-width=\"0.75\"/><path d=\"M76.2 38.3 L84.6 37.3\" stroke-width=\"0.45\"/><path d=\"M63 252 h15\" stroke-width=\"0.8\"/><path d=\"M70 252 c -3 6, -6 9, -10 12 M70 252 c 1 7, 3 10, 6 14 M70 252 c -1 6, 0 10, -1 15\" stroke-width=\"0.5\"/></g>";
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
function decorate(){
  const p = sel(); const med = p ? (p.medium || "hydro") : "hydro";
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
function drawBackground(p){
  const bg = $("#bg"); const W = innerWidth, H = innerHeight;
  const outdoor = p && p.where === "outdoor"; const r = rnd(7);
  let atm = "";
  if (p && !outdoor){
    for (let i = 0; i < 30; i++){ const x0 = W*0.12 + i*(W*0.76/29), L = 40 + 50*r(); const x1 = x0 + (x0 - W/2)*0.22*L/90; atm += `<path d="M${x0.toFixed(0)} 4 L${x1.toFixed(1)} ${L.toFixed(0)}" stroke-width="${(0.35+0.3*r()).toFixed(2)}" opacity="${(0.18+0.2*r()).toFixed(2)}"/>`; }
    atm += `<path d="M${W*0.12} 4 H${W*0.88}" stroke-width="2"/>`;
  } else if (p){
    const w = S.weather[(p.lat||BERLIN.lat)+","+(p.lon||BERLIN.lon)], c = w && w.j.current || {}, d = w && w.j.daily || {};
    const rain = (d.precipitation_sum && d.precipitation_sum[0]) || 0, gust = (d.wind_gusts_10m_max && d.wind_gusts_10m_max[0]) || 0;
    for (let i = 0; i < Math.min(110, rain*40); i++){ const x = r()*W, y = 6 + r()*80; atm += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} l -5 11" stroke-width="0.5" opacity="${(0.3+0.4*r()).toFixed(2)}"/>`; }
    for (let i = 0; i < (gust > 30 ? 6 : gust > 15 ? 3 : 0); i++){ const y = 8 + r()*60, x = -20 + r()*W*0.5, L = 120 + r()*140; atm += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} C ${(x+L*0.3).toFixed(0)} ${(y-6).toFixed(0)}, ${(x+L*0.6).toFixed(0)} ${(y+6).toFixed(0)}, ${(x+L).toFixed(0)} ${y.toFixed(0)} c 10 0, 12 -10, 4 -12" stroke-width="0.6" opacity="0.55" fill="none"/>`; }
  }
  bg.setAttribute("viewBox", `0 0 ${W} ${H}`); bg.setAttribute("width", W); bg.setAttribute("height", H);
  bg.innerHTML = `<defs><linearGradient id="zone" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" style="stop-color:var(--tint);stop-opacity:0"/><stop offset="1" style="stop-color:var(--tint)"/></linearGradient></defs>`+
    `<rect width="${W}" height="${H}" filter="url(#paper)"/><rect width="${W}" height="${H}" fill="url(#zone)"/><g fill="none" style="stroke:var(--ink)" stroke-linecap="round">${atm}</g>`;
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
    "&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m"+
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&timezone=Europe%2FBerlin&forecast_days=2";
  try {
    const j = await fetch(url).then(r => r.json());
    S.weather[key] = {at:Date.now(), j}; return S.weather[key];
  } catch(e){ return null; }
}

/* ---------- sync ---------- */
function setSync(text, err){ const b = $("#sync"); b.textContent = text; b.classList.toggle("err", !!err); }
function cache(){ try { localStorage.setItem(CACHE_KEY, JSON.stringify({plants:S.plants, tasks:S.tasks, logs:S.logs, changes:S.changes})); } catch(e){} }
function sortLogs(list){ return (list||[]).slice().sort((a,b) => (b.at||"").localeCompare(a.at||"")); }
async function loadAll(){
  if (!S.cfg || S.busy) return;
  S.busy = true; setSync("Syncing…");
  try {
    let [plants, tasks, logs, changes] = await Promise.all(["plants.json","tasks.json","logs.json","changes.json"].map(getJSON));
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
    setSync("Synced " + hm(S.synced.toISOString()));
  } catch(e){
    setSync(e.code === "auth" ? "Key rejected · open Settings" : "Offline · tap to retry", true);
  } finally { S.busy = false; renderAll(); }
}
function loadCache(){
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && c.plants){ Object.assign(S, {plants:c.plants, tasks:c.tasks||[], logs:sortLogs(c.logs), changes:c.changes||[]}); setSync("Saved copy"); } } catch(e){}
}

/* ---------- routing ---------- */
const VIEWS = ["today","log","plan","history","setup","plant"];
function route(){
  let v = location.hash.slice(1);
  if (v === "plant-new" || v === "plant-edit"){ openPlantForm(v === "plant-edit"); v = "plant"; }
  if (!VIEWS.includes(v)) v = "today";
  if (!S.cfg && v !== "setup") v = "setup";
  for (const x of VIEWS) document.getElementById("v-"+x).hidden = x !== v;
  $("#tabs").hidden = v === "setup" || v === "plant" || !S.plants.length;
  document.querySelectorAll("nav a").forEach(a => a.dataset.v === v ? a.setAttribute("aria-current","page") : a.removeAttribute("aria-current"));
  if (v === "setup") renderSetup();
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
  const p = sel(), t = p && p.targets && p.targets[k];
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
  const order = {active:0, resting:1, done:2};
  const list = S.plants.slice().sort((a,b) => (order[a.status]||0) - (order[b.status]||0));
  for (const p of list){
    const n = dueCount(p);
    box.append(h("button",{type:"button", class:"ptab"+(p.status !== "active" ? " rest" : ""), role:"tab", style:"--c:"+colorOf(p),
      "aria-current": p.id === S.sel ? "true" : "false", "aria-label": p.name + " · " + (MEDIA[p.medium]||MEDIA.hydro).label + (n ? " · " + n + " due" : ""),
      onclick:() => selectPlant(p.id)}, p.id === S.sel ? raw('<svg aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" viewBox="0 0 100 40" preserveAspectRatio="none"><ellipse cx="50" cy="20" rx="49" ry="18" style="fill:var(--c);fill-opacity:.6" filter="url(#wash)"/></svg>') : h("span",{class:"dot"}), h("span",{style:"position:relative"}, p.name), n ? h("span",{class:"badge",style:"position:relative"}, n) : null));
  }
  box.append(h("a",{class:"ptab add", href:"#plant-new", "aria-label":"Add plant"}, "+ specimen"));
  const cur = box.querySelector('[aria-current="true"]'); if (cur) cur.scrollIntoView({inline:"nearest", block:"nearest"});
}
function renderToday(){
  const p = sel(), T = today();
  document.documentElement.style.setProperty("--c", p ? colorOf(p) : "var(--ink)");
  $("#t-date").textContent = new Date().toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  const spec = $("#t-spec"); if (!spec.firstChild) spec.innerHTML = SPECIMEN;
  if (!p){
    $("#t-day").textContent = APP; $("#t-stage").textContent = S.cfg ? (S.synced ? "No plants" : "–") : "Not connected"; $("#t-medium").textContent = "";
    $("#t-tasks").replaceChildren(h("p",{class:"empty"}, S.synced ? "No plants yet. Add one under Settings & plants." : "Loading your plan…"));
    $("#t-grid").replaceChildren(); $("#t-next").replaceChildren(); $("#t-more").textContent = ""; decorateSoon(); return;
  }
  $("#t-date").textContent += " · " + p.name;
  $("#t-day").textContent = p.status === "resting" ? "Resting" : p.status === "done" ? "Finished" : (p.start ? "Day " + daysBetween(p.start, T) : p.name);
  const si = stageIndex(p);
  const st = $("#t-stage"); st.replaceChildren(
    raw('<svg aria-hidden="true" width="22" height="25" viewBox="0 0 30 34"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + GLYPHS[si] + '</g></svg>'),
    document.createTextNode(p.stageLabel || ["Seed","Sprout","Seedling","Growth","Flower","Drying"][si]));
  $("#t-medium").textContent = (MEDIA[p.medium]||MEDIA.hydro).label + " · " + (SYSTEMS[p.system] || "") + " · " + (WHERE[p.where] || "");

  const todays = mine(S.logs).filter(l => l.date === T);
  const lg = $("#t-logged");
  lg.className = "logged " + (todays.length ? "yes" : "no");
  lg.querySelector(".box").innerHTML = '<g fill="none" style="stroke:var(--ink)" stroke-linecap="round" filter="url(#rough)"><rect x="2" y="2" width="16" height="16" rx="2" stroke-width="1.2"/>' + (todays.length ? '<path d="M5 10 l3.5 3.5 L15 6" stroke-width="2"/>' : '') + '</g>';
  $("#t-logged-txt").textContent = todays.length ? "Entered today, " + hm(todays[0].at) + (todays.length > 1 ? " · " + todays.length + " entries" : "") : "Not entered yet today";
  $("#t-logbtn").textContent = todays.length ? "Log again" : "Log values";

  const due = openTasks().filter(t => t.due && t.due <= T).sort(sortTasks);
  const doneToday = mine(S.tasks).filter(t => t.status === "done" && t.doneAt && ymd(new Date(t.doneAt)) === T);
  const box = $("#t-tasks"); box.replaceChildren();
  if (!due.length && !doneToday.length) box.append(h("p",{class:"empty"},"Nothing due today."));
  for (const t of [...due, ...doneToday]) box.append(taskRow(t));
  $("#t-count").textContent = due.length ? due.length + " open" : (doneToday.length ? "all done" : "");

  // Observations: three plant values + three climate/weather values
  const fields = fieldsFor(p);
  const core = fields.filter(k => k !== "ppfd" && k !== "height");
  for (const k of ["height","ppfd"]) if (core.length < 3 && fields.includes(k)) core.push(k);
  const env = envTiles(p);
  const warm = env.warm || 0, frost = env.frost || 0;
  const grid = $("#t-grid"); grid.replaceChildren();
  let newest = null;
  core.slice(0,3).forEach((k, i) => {
    const l = latest(k);
    if (l && (!newest || l.at > newest)) newest = l.at;
    grid.append(tile(labelFor(p,k,true), l ? fmtv(k, l.v) : "–", statusOf(k, l && l.v), {soak:0.22, warm, frost}));
  });
  env.tiles.forEach(t => grid.append(tile(t[0], t[1], t[2], {soak:0.55})));
  const extra = fields.filter(k => !core.slice(0,3).includes(k)).map(k => { const l = latest(k); return l ? labelFor(p,k,true) + " " + fmtv(k, l.v) : null; }).filter(Boolean);
  if (env.more) extra.push(env.more);
  $("#t-more").textContent = extra.join(" · ");
  $("#t-envage").textContent = (newest ? "entered " + hm(newest) : "no entries yet") + (env.age ? " · " + env.age : "");

  const next = openTasks().filter(t => !t.due || t.due > T).sort(sortTasks).slice(0,4);
  const nb = $("#t-next"); nb.replaceChildren();
  if (!next.length) nb.append(h("p",{class:"empty"},"Nothing scheduled yet."));
  for (const t of next) nb.append(h("div",{class:"row"}, h("span",null,t.title), h("span",{class:"lead"}), h("span",{class:"when"}, t.due ? fmtDay(t.due) : (t.trigger || "when ready"))));
  decorateSoon();
}
function envTiles(p){
  const none = {cls:"none", word:"", txt:""}; const note = $("#t-envnote"); note.textContent = "";
  if ((p.where || "indoor") === "outdoor"){
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
  const T = p.targets || {};
  if (s){
    const v = vpd(s.temp, s.rh);
    const vs = v == null ? none : v < 0.8 ? {cls:"low", word:"low", txt:"aim 0.8–1.2"} : v > 1.4 ? {cls:"high", word:"high", txt:"aim 0.8–1.2"} : {cls:"ok", word:"good", txt:"aim 0.8–1.2"};
    const old = (Date.now() - new Date(s.at)) / 864e5;
    if (old > 2) note.textContent = "Sensor data is " + ago(s.at).replace(" ago","") + " old. Upload a fresh CSV with your next log.";
    const hi = T.air ? T.air[1] : 26;
    return {
      tiles:[["Air", s.temp != null ? s.temp.toFixed(1)+"°" : "–", statusOf("air", s.temp)], ["Humidity", s.rh != null ? Math.round(s.rh)+"%" : "–", statusOf("rh", s.rh)], ["VPD", v != null ? v.toFixed(2) : "–", vs]],
      warm: s.temp != null ? Math.max(0, Math.min(1, (s.temp - hi) / 4)) : 0,
      more: s.tmin != null ? "Air 24 h " + s.tmin.toFixed(0) + "–" + s.tmax.toFixed(0) + "°, humidity " + Math.round(s.hmin) + "–" + Math.round(s.hmax) + "%" : "",
      age: "sensor " + ago(s.at)
    };
  }
  const ma = latest("air"), mr = latest("rh");
  if (!ma && !mr) note.textContent = "No sensor data yet. Upload a CSV export with a log.";
  return {tiles:[["Air", ma ? fmtv("air", ma.v) : "–", statusOf("air", ma && ma.v)], ["Humidity", mr ? fmtv("rh", mr.v) : "–", statusOf("rh", mr && mr.v)], ["VPD","–",none]], age: ma || mr ? "manual " + ago((ma||mr).at) : ""};
}
function taskRow(t){
  const id = "task-" + t.id, done = t.status === "done";
  const cb = h("input",{type:"checkbox", id, checked:done, onchange:e => toggleTask(t, e.target.checked)});
  return h("label",{class:"task"+(done?" done":""), for:id}, cb,
    h("span",null, h("b",null,t.title), t.detail ? h("br") : null, t.detail ? h("span",{class:"d"},t.detail) : null));
}
async function toggleTask(t, on){
  const prev = {status:t.status, doneAt:t.doneAt};
  t.status = on ? "done" : "open"; t.doneAt = on ? new Date().toISOString() : null; renderAll();
  try {
    S.tasks = await mutate("tasks.json", list => (list||[]).map(x => x.id === t.id ? Object.assign({}, x, {status:t.status, doneAt:t.doneAt}) : x), (on ? "done: " : "reopen: ") + t.title);
    cache(); renderAll();
  } catch(e){ Object.assign(t, prev); renderAll(); setSync("Couldn't save · tap to retry", true); }
}
function renderPlan(){
  const p = sel(), T = today();
  const bar = $("#p-bar"), lg = $("#p-legend"); bar.replaceChildren(); lg.replaceChildren(); $("#p-upd").textContent = "";
  if (p && p.start){
    const total = daysBetween(p.start, p.endEst || T) || 1;
    const g = p.flipEst ? daysBetween(p.start, p.flipEst) : total;
    bar.append(h("div",{class:"g", style:"width:"+(100*g/total)+"%"}), h("div",{class:"b", style:"width:"+(100*(total-g)/total)+"%"}));
    const nowPct = Math.max(0, Math.min(100, 100*daysBetween(p.start, T)/total));
    bar.append(h("div",{class:"now", style:"left:calc("+nowPct+"% - 1px)", title:"Today"}));
    lg.append(h("span",null,"Start " + short(p.start)), h("span",null,"Growth"),
      p.flipEst ? h("span",null,"Bloom ~" + short(p.flipEst)) : null, p.endEst ? h("span",null,"End ~" + short(p.endEst)) : null);
    if (p.updated) $("#p-upd").textContent = "Updated " + fmtDay(p.updated);
  }
  const list = $("#p-list"); list.replaceChildren();
  const open = openTasks().sort(sortTasks);
  if (!open.length) list.append(h("li",null,h("span",{class:"empty"},"No open steps.")));
  for (const t of open){
    const isDue = t.due && t.due <= T;
    list.append(h("li",{class:"fr","data-soak":"0.12"},
      h("div",{style:"display:flex;flex-direction:column;gap:2px;min-width:0"}, h("span",{style:"font-weight:600"},t.title),
        (t.trigger || t.detail) ? h("span",{class:"muted small"}, t.trigger ? "Trigger: " + t.trigger : t.detail) : null),
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
function renderAll(){ renderTabs(); renderToday(); renderPlan(); renderHistory(); if (!$("#v-setup").hidden) renderSetup(); decorateSoon(); }

/* ---------- log form ---------- */
function renderLogForm(){
  const p = sel(); if (!p) return;
  const keep = {}; document.querySelectorAll("#l-fields input").forEach(i => keep[i.dataset.k] = i.value);
  const box = $("#l-fields"); box.replaceChildren();
  for (const k of fieldsFor(p)){
    const l = latest(k);
    box.append(h("label",{class:"f"}, labelFor(p,k), h("input",{type:"text", inputmode:"decimal", autocomplete:"off", "data-k":k, placeholder: l ? String(l.v) : "–", value: keep[k] || null})));
  }
  const chips = $("#chips"); chips.replaceChildren();
  for (const a of actionsFor(p)){
    chips.append(h("button",{type:"button", class:"chip", "aria-pressed": S.actions.has(a) ? "true" : "false", onclick:e => {
      const on = !S.actions.has(a); on ? S.actions.add(a) : S.actions.delete(a);
      e.currentTarget.setAttribute("aria-pressed", on ? "true" : "false");
    }}, a));
  }
  const indoor = (p.where || "indoor") === "indoor";
  $("#l-sensordrop").hidden = !indoor;
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
      const id = S.edit.id, shown = fieldsFor(p);
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
  $("#pl-sensorwrap").hidden = S.pf.where !== "indoor";
}
function openPlantForm(editing){
  const p = editing ? sel() : null;
  S.plantEdit = p ? p.id : null;
  S.pf = p ? {medium:p.medium||"hydro", system:p.system||"dwc", where:p.where||"indoor", status:p.status||"active"} : {medium:"living-soil", system:"hand", where:"indoor", status:"active"};
  $("#pl-title").textContent = p ? "Edit " + p.name : "New plant";
  $("#pl-name").value = p ? p.name : ""; $("#pl-start").value = p && p.start || ""; $("#pl-sprout").value = p && p.sprout || "";
  $("#pl-sensor").value = p && p.sensor || "";
  $("#pl-save").textContent = p ? "Save" : "Add plant"; $("#pl-statusmsg").textContent = "";
  renderPlantChips();
}
$("#pl-cancel").addEventListener("click", () => history.back());
$("#plantform").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#pl-name").value.trim(), st = $("#pl-statusmsg");
  if (!name){ st.textContent = "Give the plant a name."; return; }
  const fields = Object.assign({}, S.pf, {name, start:$("#pl-start").value || null, sprout:$("#pl-sprout").value || null, sensor:S.pf.where === "indoor" ? ($("#pl-sensor").value.trim() || null) : null});
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
