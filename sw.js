// App shell cache: network first, cache as fallback. Data calls to api.github.com are never cached.
const CACHE = "flowerphile-v60";
const SHELL = ["./", "./index.html", "./start.html", "./manifest.webmanifest", "./specimen.js?v=60", "./bgart.js?v=60","./stylize.js?v=60","./rules.js?v=60","./feed.js?v=60","./chart.js?v=60","./bridge.js?v=60","./howto.js?v=60","./quiz.js?v=60","./branches.js?v=60","./ai.js?v=60","./steps.js?v=60", "./app.js?v=60", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});
