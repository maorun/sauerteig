// Precached app shell for offline use.
// Bump CACHE on each release that must invalidate old entries.
const CACHE = 'sauerteig-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

// Fetch past the HTTP cache, so index.html and its assets come from the same release.
async function addFresh(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(`Precache failed: ${url}`);
      await cache.put(url, res);
    }),
  );
}

// Read the built index.html and collect its hashed JS and CSS files.
async function precache() {
  const cache = await caches.open(CACHE);
  await addFresh(cache, SHELL);
  const html = await (await cache.match('./index.html')).text();
  const assets = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => m[1]);
  await addFresh(cache, assets);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first without background refresh. Hashed assets never change. A new release
// bumps CACHE, so index.html and its assets always update together via a new install.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((c) => c.match(req))
      .then(async (hit) => {
        if (hit) return hit;
        try {
          return await fetch(req);
        } catch {
          const shell = req.mode === 'navigate' ? await caches.open(CACHE).then((c) => c.match('./index.html')) : undefined;
          return shell || Response.error();
        }
      }),
  );
});
