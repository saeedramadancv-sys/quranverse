/**
 * sw.js — offline support for QuranVerse.
 *
 * Strategy — network first everywhere, with the cache as a safety net:
 *   • Navigations  — network, falling back to the cached shell.
 *   • Static files — network, falling back to the cache after NETWORK_TIMEOUT_MS.
 *   • Cross-origin — left alone (Google Fonts fall back to system fonts offline,
 *                    and the recitation audio in recite.js streams normally).
 *
 * A deployed update therefore always wins on a healthy connection, a weak
 * connection still renders instantly from cache, and the app works offline —
 * without depending on a CACHE_VERSION bump to avoid serving stale files.
 * `activate` still drops older caches whenever the version does change.
 */
const CACHE_VERSION = "quranverse-v4";

// How long to wait for the network before falling back to the cache.
const NETWORK_TIMEOUT_MS = 2500;

const CORE_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "css/styles.css",
  "js/config.js",
  "js/data.js",
  "js/verify.js",
  "js/api.js",
  "js/recite.js",
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

  // Everything else: network first, but fall back to the cache as soon as the
  // network looks slow. Fresh code always wins on a healthy connection, a weak
  // connection still renders instantly, and offline works from cache — without
  // needing a cache-version bump on every deploy to avoid serving stale files.
  event.respondWith(networkFirstWithTimeout(request, NETWORK_TIMEOUT_MS));
});

function networkFirstWithTimeout(request, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res) => {
      if (!settled && res) { settled = true; resolve(res); }
    };

    // If the network hasn't answered in time, serve whatever we have.
    const timer = setTimeout(() => {
      caches.match(request).then(done);
    }, ms);

    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        }
        done(res);           // no-op if the cache already answered
      })
      .catch(() => {
        clearTimeout(timer);
        caches.match(request).then((cached) => done(cached || Response.error()));
      });
  });
}
