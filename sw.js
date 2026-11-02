"use strict";

// Lock-In Tracker service worker. Network first, so a fresh deploy shows up on the
// next load; the cached copy is used when you are offline. Entries live in the
// browser's own storage and are never touched here.
// When you add or rename an app file, add it to SHELL and bump CACHE.
const CACHE = "lockin-shell-v1";
const SHELL = [
  "./", "index.html", "css/style.css",
  "js/config.js", "js/store.js", "js/csv.js", "js/affirmations.js", "js/views.js", "js/app.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match("index.html")))
  );
});
