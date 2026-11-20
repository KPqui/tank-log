#!/bin/sh
# Flowerphile static build for Cloudflare Pages / Netlify (free tiers, private repo).
# Copies only what the phone needs into dist/; repo history, AGENT.md, tools/ and docs are not served.
# Cloudflare Pages: build command "sh build.sh", output directory "dist". Netlify: same (netlify.toml).
set -e
rm -rf dist && mkdir -p dist/knowledge dist/icons dist/skill
cp index.html start.html manifest.webmanifest *.js _headers dist/
rm -f dist/build.sh
cp icons/* dist/icons/
cp knowledge/*.json dist/knowledge/
cp skill/flowerphile-skill.zip dist/skill/
[ -f moved.json ] && cp moved.json dist/ || true
echo "dist ready: $(ls dist | wc -l) entries"
