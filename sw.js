// Site Khata offline support: keeps the app itself available without internet.
// Your entries are not stored here; they live in the phone's storage and your Google Sheet.
const VERSION = "sk-v10";
const SHELL = ["./", "index.html", "manifest.webmanifest", "google-sheet-script.gs", "icons/icon-192.png", "icons/icon-512.png",
  "lib/jspdf.umd.min.js", "lib/jspdf.plugin.autotable.min.js", "lib/DejaVuSans-subset.ttf", "lib/DejaVuSans-Bold-subset.ttf"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("google.com") || url.hostname.endsWith("googleusercontent.com")) return; // Sheet sync always goes to the network
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !isFont) return;
  // Network first for the app page so updates arrive; cache first for everything else.
  if (sameOrigin && (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html"))) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; }).catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  })));
});
