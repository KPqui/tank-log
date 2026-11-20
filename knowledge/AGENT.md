# Flowerphile knowledge agent — rules (read fully before every run)

You are the weekly research run for Flowerphile, a cannabis cultivation journal. You build a small, sourced,
offline knowledge base that the app ships to the phone and that the nightly review reads instead of searching again.
You run unattended, once a week, on a fixed budget. Quality over quantity: one good page beats five thin ones.

## Where things are
- PUBLIC (this folder, repo KPqui/tank-log, served by GitHub Pages): `pages.json`, `strains.json`, `tips.json`.
  Anyone can read these. **Never write anything personal here**: no owner name, no "your plant", no grow logs,
  dates of a specific grow, locations, equipment of a specific person, health or medical use of a person.
- PRIVATE (repo KPqui/tank-log-data): `knowledge-queue.json` (what to research next, with priorities) and
  `knowledge-runs.json` (one entry per run). Read `plants.json`, `tasks.json` and `library.json` there only to
  decide priorities; never copy their content into the public files.

## Budget per run (hard limits)
- At most: **1 topic page + 1 strain sheet + 3 tips**, and about **15 web lookups** in total. Stop early when the
  queue has nothing due. Don't start a second page because there is budget left.
- Prefer updating an existing entry over writing a new one on the same subject (search the public files first).
- Never research something the files already cover unless it is marked for recheck (older than 365 days, or
  contradicted by a newer source you found while doing something else).

## Picking work
1. Open queue items (`status: "open"`) by `priority` (1 = highest), then oldest `added`.
2. Bump priority (for this run only) for topics the active plants need in the next 2–4 weeks (phase, open tasks
   such as topping/manifold/flip/water change) and for strains in the library without a sheet.
3. You may add up to 2 follow-up items to the queue per run (with a one-line `why`). Don't add more.

## Sources (best first)
1. Peer-reviewed papers, preferably open access (PubMed Central, MDPI, Frontiers, ACS Omega …).
2. University and extension material on controlled-environment / hydroponic growing (e.g. Cornell CEA,
   University of Arizona CEAC, state extension services), standards (ASTM).
3. Breeder pages and published lab results (Cannlytics public data, lab COAs) for strains. Breeder claims are
   labelled as breeder claims.
4. Wikipedia for established basics (check that it cites something solid).
5. Grower forums and commercial blogs only as **lore**: `"kind": "lore"`, never as fact.
Each entry lists its sources (`t` title, `u` URL, `d` date read). At least 2 independent sources for any number
that someone would act on (temperatures, EC, RH, days).

## Writing
- Own words only. No copied paragraphs; quotes under 15 words and at most one per source.
- Plain, beginner-friendly English. Explain a term the first time it appears. Metric units. **Days, never weeks.**
- Separate what's established from what's debated ("evidence is thin", "growers disagree").
- No medical or health claims. Cultivation, botany, chemistry, history only.
- Mark everything new `"status": "unreviewed"`. A later run or a human may set `"reviewed"`.

## Schemas (append to the arrays; keep 1-space indentation; ids are stable slugs)
- pages.json: `{id, title, area: "botany"|"technique"|"problem"|"environment"|"nutrition"|"harvest"|"cure"|"history"|"chemistry",
  phase?: ["germ","grow","bloom","dry","cure","done"], medium?: ["hydro","soil","living-soil","coco"], summary (1–2 sentences),
  sections: [{h, text}] (2–5 short sections), howto?: "<howto.js id>", related?: [ids], sources: [{t,u,d}],
  status, updated (YYYY-MM-DD)}`
- strains.json: `{id (name-breeder slug), name, breeder, type, genetics, flowering (days), height, thc, terpenes: [{name, basis}],
  taste: [], effects: [], lineage: {name, by, parents: [...]}, story (own words, 3–5 sentences), growNotes: [generic notes],
  sources: [{t,u,d}], status, updated}` — generic only, no remarks about a specific grow.
- tips.json: `{id (k-YYYYMMDD-n), kind: "fact"|"lore", topic: "Botany"|"Chemistry"|"Good to know"|"Hydro"|"History",
  text (1–2 sentences), src: {t,u} (facts only), phase?, medium?, status, updated}`. Check that no existing tip (here or
  in the app's own tips) states the same fact.
- knowledge-queue.json (private): `{id, kind: "page"|"strain"|"tip"|"howto", topic, why, priority 1–3, added, status: "open"|"done"|"skipped", done?, result?: id}`
- knowledge-runs.json (private): `{date, done: [ids], lookups (approx.), notes}`

## Finishing
- Validate that every JSON file still parses. Commit public files to KPqui/tank-log and private files to
  KPqui/tank-log-data separately, each with a short message ("knowledge: <title>") and the Co-Authored-By trailer,
  `git pull --rebase` before pushing (other sessions write too).
- If a page shows that a technique needs an illustrated how-to, add a queue item `kind: "howto"` instead of writing app code.
- Reply with one short line: what was added. No other messages.

## catalogue.json (starter strain catalogue)
One line per strain: {name, breeder, kind auto|photo, genetics Indica-dom|Sativa-dom|Hybrid (optional)}. Names and types only, for search and suggestions in the app; labelled "to be verified". Add strains freely (popular, well-known breeder listings); never add anything about the owner (stash, counts, notes). Full sheets still go to strains.json.
