// Two Seats service worker: lets the app install and open its screens when the
// network is slow or gone. It only ever stores the app's own files. Movie data,
// accounts, posters and trailers always come live from the network, because they
// are on other sites (this worker never touches them).
const VERSION = "v1";
const SHELL_CACHE = `two-seats-shell-${VERSION}`;
const ASSET_CACHE = `two-seats-assets-${VERSION}`;
const MAX_ASSETS = 40;
const BASE = self.registration.scope;

const SHELL_FILES = ["", "manifest.webmanifest", "favicon.svg", "poster-placeholder.svg", "icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await Promise.all(SHELL_FILES.map((file) => shell.add(new Request(BASE + file, { cache: "reload" })).catch(() => {})));

      // Also keep the page's scripts and styles, so the app opens offline the very first time.
      try {
        const html = await (await fetch(BASE, { cache: "reload" })).text();
        const assets = await caches.open(ASSET_CACHE);
        const files = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => new URL(m[1], BASE).href);
        await Promise.all(files.map((file) => assets.add(file).catch(() => {})));
      } catch {
        // Offline start-up is a bonus; installing must not fail because of it.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, ASSET_CACHE];
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("two-seats-") && !keep.includes(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

const trim = async (cache) => {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Leave everything that is not a plain GET for our own site to the browser.
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(BASE)) return;

  // Opening or reloading the app: the newest page when online, the saved one when not.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const shell = await caches.open(SHELL_CACHE);
          shell.put(BASE, fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(BASE)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Built scripts and styles have fingerprinted names, so a saved copy never goes stale.
  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const saved = await cache.match(request);
        if (saved) return saved;
        const fresh = await fetch(request);
        if (fresh.ok) {
          await cache.put(request, fresh.clone());
          trim(cache);
        }
        return fresh;
      })(),
    );
    return;
  }

  // Icons, manifest and other small files: show the saved copy, refresh it in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const saved = await cache.match(request);
      const refresh = fetch(request)
        .then((fresh) => {
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        })
        .catch(() => saved);
      if (saved) event.waitUntil(refresh.catch(() => {}));
      return saved || refresh;
    })(),
  );
});
