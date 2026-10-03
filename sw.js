// Service worker: offline support for CommercialistApp.
//
// Strategy:
//  - Page (index.html): network-first. Online you always get the latest
//    version; if the network fails or takes more than NETWORK_TIMEOUT_MS,
//    the cached copy is served.
//  - Other assets (icons, manifest): cache-first.
//
// Bump CACHE_VERSION when icons or manifest change. Changes to index.html
// are picked up automatically, but bumping it is harmless.
const CACHE_VERSION = "v3";
const CACHE_NAME = `commercialistapp-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;
const PAGE_KEY = "./index.html";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: "reload" bypasses the browser HTTP cache, so the new cache
      // never gets filled with stale copies of the previous version
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("commercialistapp-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function cachedPage() {
  return caches.match(PAGE_KEY).then((res) => res || caches.match("./"));
}

function networkFirstPage(url) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };

    // Slow network: serve the cached page, let the fetch keep updating the cache
    const timer = setTimeout(() => {
      cachedPage().then((cached) => { if (cached) finish(cached); });
    }, NETWORK_TIMEOUT_MS);

    // "no-cache" revalidates with the server instead of trusting the
    // 10-minute HTTP cache set by GitHub Pages
    fetch(url, { cache: "no-cache", credentials: "same-origin" })
      .then((response) => {
        clearTimeout(timer);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(PAGE_KEY, copy));
          finish(response);
        } else {
          cachedPage().then((cached) => finish(cached || response));
        }
      })
      .catch(() => {
        clearTimeout(timer);
        cachedPage().then((cached) => finish(cached || Response.error()));
      });
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isPage = request.mode === "navigate" || url.pathname.endsWith("/index.html");
  if (isPage) {
    event.respondWith(networkFirstPage(url.href));
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) => cached || fetch(request)
    )
  );
});
