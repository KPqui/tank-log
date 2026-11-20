// App shell cache: network first, cache as fallback. Data calls to api.github.com are never cached.
const CACHE = "flowerphile-v52";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./specimen.js?v=52", "./bgart.js?v=52","./stylize.js?v=52","./rules.js?v=52","./chart.js?v=52","./bridge.js?v=52","./howto.js?v=52","./quiz.js?v=52","./branches.js?v=52","./ai.js?v=52","./steps.js?v=52", "./app.js?v=52", "./icons/icon-192.png", "./icons/icon-512.png"];
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
