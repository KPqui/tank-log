/* Flowerphile · ai.js — "Ask your AI" (tier 1): the portable manual, the check-in packet, and reading the answer back.
   Pure functions, no DOM, no storage. app.js gathers the data, shows the preview and applies what the grower confirms.
     AI.MANUAL                      the manual every AI gets (markdown; also the base of the Claude skill later)
     AI.packet(d)                   → {text, photos}   d = {plant, profile, stage, phase, today, since, first, logs, tasks, flags,
                                                             learnings, targets, fields, tiles, chips, keys, knowledge, howtos, app}
     AI.extract(text)               → the update object from a pasted answer, or throws a plain-language Error
     AI.check(u, d)                 → {plant, note, items:[{type, label, why, ok, data}], errors:[]}   d = {plant, tasks, keys, today}
   The answer format: a fenced block ```flowerphile-update { … } ``` (schema in the manual, version 1). */
(function(){
  const MANUAL = `# Flowerphile manual for your AI (version 1)

You are helping a home grower through **Flowerphile**, a grow journal app on their phone. The app already does the routine part by itself: it plans regular checks, reacts to each log entry, and moves steps around. You are the layer on top: you look at photos, read the grower's notes, use judgment, and adjust the plan. The grower pastes your answer back into the app, sees every change you propose, and decides.

## Your role
- Read the check-in below: who the grower is, how this plant is set up, what happened since the last check-in, what is planned.
- Say plainly how the plant is doing and why, in a few sentences, in the grower's language and at their level (a beginner gets simple words and one thing at a time; an experienced grower gets numbers and reasons).
- Then propose changes to the plan, only where they help. Fewer good changes beat many small ones. "No changes needed" is a fine answer.
- On the **first check-in** for a plant, tailor the fresh plan once: read the setup answers and the grower's experience, and shape steps, targets, warnings and the screen (tiles, log fields) to how *they* grow.

## Source standards
- Start from the vetted knowledge included in the check-in. Search only when it doesn't cover the question.
- Prefer, in this order: official and citable sources (universities, extension services, standards, peer-reviewed papers, reference works), then the breeder's own information for strain questions.
- Forum, Reddit and grow-shop knowledge only when at least partly backed up by other independent sources, and always labelled as such ("common grower practice, not well studied").
- Say when you are unsure or when sources disagree. Never present a guess as a fact.
- Write in your own words; don't copy text from sources. A tip you add needs a real source (title and link); lore needs the label.
- No health or medical claims (no effects on illnesses, no dosing). Stick to the plant.

## What you may change
Tasks (add, move, mark done, drop), target ranges, watch-out flags, the three main tiles on Today, the log fields and quick-tap chips for this plant, new custom log fields (e.g. pot weight), tips, and learnings when a run closes.
- Be conservative: one stressful step (topping, training, defoliation, transplant, water change, light change) per day at most; big jobs on days the grower has time.
- Every change carries a short, plain reason (\`why\`). Changes without a reason are shown unticked.
- Use days, never weeks ("bloom day 21", "in 3 days").
- Keep the app's own routine checks unless you have a reason; don't add a step that already exists.
- Refer to existing steps by their id from the check-in.

## Reply format
First your short assessment in normal text. Then exactly one fenced block like this (JSON, leave out what you don't change):

\`\`\`flowerphile-update
{
 "v": 1,
 "plant": "<plant id from the check-in>",
 "note": "One or two sentences the grower sees at the top of the preview.",
 "tasks": {
  "add":  [{"title": "Short imperative title", "detail": "How, in 1–3 sentences", "due": "YYYY-MM-DD", "big": false, "howto": "<how-to id, optional>", "why": "reason"}],
  "move": [{"id": "<step id>", "due": "YYYY-MM-DD", "why": "reason"}],
  "done": [{"id": "<step id>", "why": "reason"}],
  "drop": [{"id": "<step id>", "why": "reason"}]
 },
 "targets": [{"key": "ph", "range": [6.0, 6.5], "why": "reason"}],
 "flags": {"add": [{"lvl": "warn", "text": "What to watch for", "why": "reason"}], "remove": [{"k": "<flag key>", "why": "reason"}]},
 "screen": {
  "tiles": {"keys": ["watered", "pot_kg", "height"], "why": "reason"},
  "fields": {"add": ["pot_kg"], "hide": ["nodes"], "why": "reason"},
  "custom": [{"key": "pot_kg", "label": "Pot weight kg", "unit": " kg", "decimals": 1, "why": "reason"}],
  "chips": {"add": ["Turned the pot"], "why": "reason"}
 },
 "tips": [{"text": "A sourced fact in your own words", "topic": "Botany", "src": {"t": "Source title", "u": "https://…"}, "why": "reason"}],
 "learnings": [{"text": "What to do differently next run", "why": "reason"}]
}
\`\`\`
- Tile and field keys: use the keys listed in the check-in, or define a custom field first (key: lowercase letters, digits, underscore; up to 16 characters). Tiles show up to three values; "watered" and "fed" show days since.
- Dates: from yesterday up to 90 days ahead.
- Plain JSON: double quotes, no comments, no trailing commas.

## Safety
- Urgent signs (water above 25 °C in hydro, air above 30 °C, pH far off, sudden droop, discoloured or mushy roots, mould or bud rot): say so first and clearly, add a step for today, and suggest what to check.
- Nothing that endangers the grower: no electrical improvisation, no unsafe chemicals, no fire risks; suggest a qualified person when in doubt.
- Stay within the grower's local rules; don't help with selling.
- If photos or data are unclear, ask for a better photo or a value instead of guessing.
- Your advice is only as good as what you can see. Say so when it matters.`;

  const D = s => new Date(s + "T12:00:00");
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const add = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return ymd(d); };
  const isDay = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(D(s));
  const str = (v, max) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
  const arr = v => Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
  const aunit = u => { u = typeof u === "string" ? u.slice(0, 6) : ""; return u && /^[a-z%°]/i.test(u) && u !== "%" && !u.startsWith("°") ? " " + u.trim() : u; };
  const KEY_RE = /^[a-z][a-z0-9_]{1,15}$/;
  /* sanity bounds for target ranges (anything outside is a typo, not advice) */
  const BOUNDS = {ph:[4,8.5], res_ph:[4,8.5], runoff_ph:[4,8.5], ec:[0,4], res_ec:[0,4], runoff_ec:[0,5], water:[10,30], air:[10,35], rh:[20,90], ppfd:[0,1500], jar_rh:[50,70], height:[0,400]};

  /* ---- the check-in packet ---- */
  const EXP = {new: "new to growing", some: "has grown a few times", pro: "experienced"};
  const GERM = {yes: "knows how to germinate", rough: "roughly knows germination", no: "hasn't germinated seeds before"};
  const MET = {none: "no meters", ph: "a pH pen", phec: "pH and EC meters", sensors: "pH/EC meters and Bluetooth climate sensors"};
  function packet(d){
    const p = d.plant, pr = d.profile, L = [];
    const kv = o => Object.entries(o || {}).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length) && typeof v !== "object").map(([k, v]) => k + ": " + v).join(" · ");
    L.push("# Flowerphile check-in: " + (p.name || p.id) + " · " + d.today);
    L.push("Please read the manual, then the check-in, and answer in the manual's reply format." + (d.first ? " **This is the first check-in for this plant: tailor the fresh plan to this grower and setup.**" : ""));
    L.push("", MANUAL, "", "---", "", "## The grower");
    L.push(pr ? [EXP[pr.exp] || "", GERM[pr.germ] || "", MET[pr.meters] ? "owns " + MET[pr.meters] : ""].filter(Boolean).join("; ") + "." : "No profile given (assume an experienced grower with meters and sensors).");
    L.push("", "## The plant (id: " + p.id + ")");
    L.push("- " + [p.strain && "strain " + p.strain + (p.breeder ? " (" + p.breeder + ")" : ""), p.kind && (p.kind === "auto" ? "autoflower" : "photoperiod"), p.medium, p.system, p.where].filter(Boolean).join(", "));
    L.push("- Now: " + d.stage + (p.start ? " · started " + p.start : "") + (p.sprout ? " · sprouted " + p.sprout : "") + (p.flip ? " · bloom from " + p.flip : "") + (p.flipEst ? " · bloom expected ~" + p.flipEst : "") + (p.endEst ? " · end expected ~" + p.endEst : ""));
    if (p.setup) L.push("- Setup answers: " + kv(p.setup));
    const tg = Object.entries(d.targets || {}).map(([k, v]) => k + " " + v.join("–")).join(", ");
    if (tg) L.push("- Targets: " + tg);
    L.push("- Screen now: tiles " + (d.tiles || []).join(", ") + " · log fields " + (d.fields || []).join(", ") + " · chips " + (d.chips || []).join(", "));
    L.push("- Keys you can use for tiles/fields: " + (d.keys || []).join(", ") + ", watered, fed");
    if ((d.flags || []).length){ L.push("", "## Watch-out flags"); d.flags.forEach(f => L.push("- [" + (f.k || "-") + "] " + (f.lvl === "warn" ? "WARNING: " : "") + f.text)); }
    if ((d.learnings || []).length){ L.push("", "## Learnings from earlier runs"); d.learnings.forEach(x => L.push("- " + x)); }
    L.push("", "## Logged " + (d.since ? "since the last check-in (" + d.since.slice(0, 10) + ")" : "so far") + ", newest first");
    if (!(d.logs || []).length) L.push("Nothing logged yet.");
    const photos = [];
    (d.logs || []).slice(0, 40).forEach(l => {
      const vals = (d.keys || []).filter(k => l[k] != null && l[k] !== "").map(k => k + " " + l[k]);
      const s = l.sensor && (l.sensor.tavg != null || l.sensor.temp != null) ? "air " + (l.sensor.tavg ?? l.sensor.temp) + " °C / " + (l.sensor.havg ?? l.sensor.rh) + " % (24 h)" : "";
      const ph = (l.photos || []).map(x => { photos.push(x); return "photo " + photos.length; });
      L.push("- " + (l.at || l.date || "").slice(0, 16).replace("T", " ") + ": " + [vals.join(", "), (l.actions || []).join(", "), s, l.note && "note: \"" + str(l.note, 400) + "\"", ph.join(", "), l.ask && "asked \"" + l.ask + "\" → " + l.answer].filter(Boolean).join(" · "));
    });
    L.push("", "## Planned steps (id · due · title)");
    if (!(d.tasks || []).length) L.push("None open.");
    (d.tasks || []).forEach(t => L.push("- " + t.id + " · " + (t.due || "open") + " · " + t.title + (t.urgent ? " (urgent)" : "") + (t.src === "app" ? " (app routine)" : "") + (t.detail ? " — " + str(t.detail, 160) : "")));
    if ((d.knowledge || []).length || (d.howtos || []).length){
      L.push("", "## Vetted knowledge (start here before searching)");
      (d.knowledge || []).forEach(k => L.push("- **" + k.title + "**" + (k.status === "reviewed" ? "" : " (not yet reviewed)") + ": " + str(k.summary, 600) + (k.sources && k.sources.length ? " Sources: " + k.sources.map(s => s.t).join("; ") + "." : "")));
      if ((d.howtos || []).length) L.push("- How-tos in the app (use the id in `howto`): " + d.howtos.map(x => x.id + " (" + x.title + ")").join(", "));
    }
    L.push("", photos.length ? "## Photos\n" + photos.length + " photo(s) attached, numbered in the order above (newest first)." : "## Photos\nNone since the last check-in.");
    L.push("", "App " + (d.app || "") + " · answer format version 1.");
    return {text: L.join("\n"), photos};
  }

  /* ---- reading the answer ---- */
  function extract(text){
    text = String(text || "");
    let body = null, m = text.match(/```\s*flowerphile-update\s*\n?([\s\S]*?)```/i);
    if (m) body = m[1];
    else if ((m = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*```/i)) && /"(tasks|screen|targets|flags|tips|note)"/.test(m[1])) body = m[1];
    else { const a = text.indexOf("{"), b = text.lastIndexOf("}"); if (a >= 0 && b > a && /"(tasks|screen|targets|flags)"/.test(text.slice(a, b + 1))) body = text.slice(a, b + 1); }
    if (!body) throw new Error("No flowerphile-update block found. Paste your AI's whole answer, including the part in ``` marks.");
    body = body.replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/,\s*([}\]])/g, "$1").replace(/^\s*\/\/.*$/gm, "");
    try { const u = JSON.parse(body); if (!u || typeof u !== "object" || Array.isArray(u)) throw 0; return u; }
    catch(e){ throw new Error("The block is there, but it isn't valid JSON. Ask your AI: \"Please resend the flowerphile-update block as plain valid JSON.\""); }
  }

  /* d = {plant, tasks (this plant's, all statuses), keys (known field keys), today} → items to preview; nothing is applied here */
  function check(u, d){
    const p = d.plant, T = d.today, items = [], errors = [], max = add(T, 90), min = add(T, -1);
    const nm = k => (d.label && d.label(k)) || k, keys = new Set(d.keys || []), open = new Map((d.tasks || []).filter(t => t.status !== "done").map(t => [t.id, t]));
    const push = (type, label, why, data, ok) => { why = str(why, 240); items.push({type, label, why, data, ok: ok !== false && !!why}); };
    const fmt = s => D(s).toLocaleDateString("en-GB", {weekday: "short", day: "numeric", month: "short"});
    if (u.v != null && +u.v > 1) errors.push("This answer uses a newer format (v" + u.v + "); some parts may be skipped.");
    if (u.plant && u.plant !== p.id) errors.push("Your AI addressed plant \"" + u.plant + "\"; showing it for " + (p.name || p.id) + ".");
    const t = u.tasks || {};
    arr(t.add).slice(0, 8).forEach(x => {
      const title = str(x.title, 80); if (!title){ errors.push("A new step without a title was skipped."); return; }
      let due = isDay(x.due) ? x.due : T; if (due < min) due = T; if (due > max){ errors.push("\"" + title + "\": date too far ahead, skipped."); return; }
      if ([...open.values()].some(o => o.title.toLowerCase() === title.toLowerCase())){ errors.push("\"" + title + "\" is already planned, skipped."); return; }
      push("task-add", "New step: " + title + " · " + fmt(due), x.why, {title, detail: str(x.detail, 500), due, big: !!x.big, howto: str(x.howto, 30) || null});
    });
    if (arr(t.add).length > 8) errors.push("Only the first 8 new steps are shown.");
    arr(t.move).forEach(x => { const o = open.get(x.id); if (!o){ errors.push("Couldn't find step " + x.id + " to move."); return; }
      if (!isDay(x.due) || x.due < min || x.due > max){ errors.push("\"" + o.title + "\": no usable new date."); return; }
      if (x.due === o.due) return;
      push("task-move", "Move: " + o.title + " · " + (o.due ? fmt(o.due) + " → " : "") + fmt(x.due), x.why, {id: o.id, due: x.due}); });
    arr(t.done).forEach(x => { const o = open.get(x.id); if (!o){ errors.push("Couldn't find step " + x.id + "."); return; } push("task-done", "Mark done: " + o.title, x.why, {id: o.id}); });
    arr(t.drop).forEach(x => { const o = open.get(x.id); if (!o){ errors.push("Couldn't find step " + x.id + "."); return; } push("task-drop", "Drop: " + o.title, x.why, {id: o.id}); });
    arr(u.targets).forEach(x => {
      const k = str(x.key, 16), r = Array.isArray(x.range) ? x.range.map(Number) : null, b = BOUNDS[k];
      if (!k || !r || r.length !== 2 || !r.every(Number.isFinite) || r[0] >= r[1]){ errors.push("A target for \"" + (k || "?") + "\" wasn't a usable range."); return; }
      if (b && (r[0] < b[0] || r[1] > b[1])){ errors.push("Target " + k + " " + r.join("–") + " is outside a sane range, skipped."); return; }
      const was = (p.targets || {})[k]; if (was && was[0] === r[0] && was[1] === r[1]) return;
      push("target", "Target " + nm(k).replace(/ (in|°C|%|cm)$/, "") + ": " + (was ? was.join("–") + " → " : "") + r.join("–"), x.why, {key: k, range: r}); });
    const f = u.flags || {};
    arr(f.add).slice(0, 5).forEach(x => { const text = str(x.text, 240); if (text) push("flag-add", (x.lvl === "warn" ? "Warning: " : "Watch for: ") + text, x.why, {lvl: x.lvl === "warn" ? "warn" : "info", text}); });
    arr(f.remove).forEach(x => { const fl = (p.flags || []).find(y => y.k === x.k); if (fl) push("flag-remove", "Remove flag: " + fl.text, x.why, {k: fl.k}); else errors.push("Couldn't find flag " + x.k + "."); });
    const sc = u.screen || {}, custom = [];
    arr(sc.custom).slice(0, 4).forEach(x => {
      const k = str(x.key, 16).toLowerCase(), label = str(x.label, 30);
      if (!KEY_RE.test(k) || !label){ errors.push("A custom field needs a key (a–z, 0–9, _) and a label; skipped."); return; }
      if (keys.has(k) && !(p.ui && (p.ui.custom || []).some(c => c.key === k))){ errors.push("\"" + k + "\" already exists; using the existing field."); return; }
      const dd = Math.max(0, Math.min(2, parseInt(x.decimals ?? x.d ?? 1, 10) || 0));
      custom.push(k); push("custom", "New log field: " + label, x.why, {key: k, label, short: str(x.short, 14) || label.replace(/\s+(kg|g|cm|L|%|°C)$/i, ""), unit: aunit(x.unit), d: dd});
    });
    const known = k => keys.has(k) || custom.includes(k) || k === "watered" || k === "fed";
    if (sc.tiles){ const ks = arr(sc.tiles.keys || sc.tiles).filter(k => typeof k === "string").map(k => k.toLowerCase()).slice(0, 3), bad = ks.filter(k => !known(k));
      if (bad.length) errors.push("Unknown tile key(s) " + bad.join(", ") + " skipped.");
      const good = ks.filter(known); if (good.length) push("tiles", "Today tiles: " + good.map(k => custom.includes(k) ? (arr(sc.custom).find(c => str(c.key, 16).toLowerCase() === k) || {}).label || k : nm(k)).join(" · "), sc.tiles.why || sc.why, {keys: good}); }
    if (sc.fields){ const a = arr(sc.fields.add).filter(k => typeof k === "string" && known(k) && !["watered", "fed"].includes(k)), hd = arr(sc.fields.hide).filter(k => typeof k === "string");
      if (a.length || hd.length) push("fields", "Log fields: " + [a.length && "+ " + a.map(k => custom.includes(k) ? (arr(sc.custom).find(c => str(c.key, 16).toLowerCase() === k) || {}).label || k : nm(k)).join(", "), hd.length && "hide " + hd.map(nm).join(", ")].filter(Boolean).join(" · "), sc.fields.why || sc.why, {add: a, hide: hd}); }
    if (sc.chips){ const c = arr(sc.chips.add || sc.chips).map(x => str(x, 24)).filter(Boolean).slice(0, 6); if (c.length) push("chips", "Quick-tap chips: + " + c.join(", "), sc.chips.why || sc.why, {add: c}); }
    arr(u.tips).slice(0, 3).forEach(x => { const text = str(x.text, 400), src = x.src && str(x.src.t, 160) ? {t: str(x.src.t, 160), u: /^https?:\/\//.test(x.src.u || "") ? str(x.src.u, 300) : undefined} : null;
      if (!text) return; const lore = !src || /lore|forum|reddit/i.test(x.kind || "");
      push("tip", (lore ? "Tip (forum lore · unverified): " : "Tip: ") + text, x.why || (src ? "Source: " + src.t : ""), {text, topic: str(x.topic, 20) || null, src, kind: lore ? "lore" : "fact"}, !!src || !!x.why); });
    arr(u.learnings).slice(0, 4).forEach(x => { const text = str(x.text, 300); if (text) push("learning", "Learning: " + text, x.why, {text}); });
    return {plant: p.id, note: str(u.note, 400), items, errors};
  }

  window.AI = {MANUAL, packet, extract, check, KEY_RE, VERSION: 1};
})();
