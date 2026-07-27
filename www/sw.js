/**
 * sw.js — offline support for QuranVerse.
 *
 * Strategy:
 *   • Navigations  — network first, falling back to the cached shell. This means
 *                    a deployed update always wins when online, so the app can
 *                    never get stuck on a stale build.
 *   • Static files — stale-while-revalidate: serve instantly from cache, then
 *                    refresh the entry in the background for next launch.
 *   • Cross-origin — left alone (Google Fonts fall back to system fonts offline).
 *
 * Bump CACHE_VERSION on every deploy; `activate` drops every older cache.
 */
const CACHE_VERSION = "quranverse-v1";

const CORE_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "css/styles.css",
  "js/config.js",
  "js/data.js",
  "js/verify.js",
  "js/api.js",
  "js/speech.js",
  "js/recorder.js",
  "js/stats.js",
  "js/app.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll is atomic: one bad URL would abort the install, so add
      // individually and tolerate misses.
      .then((cache) => Promise.all(
        CORE_ASSETS.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Page loads: prefer the network so deploys land immediately.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Everything else: cache first, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
