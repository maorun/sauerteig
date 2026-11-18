// Precached app shell for offline use.
// Bump CACHE on each release that must invalidate old entries.
const CACHE = 'sauerteig-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
const INDEX = './index.html';

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
  const html = await (await cache.match(INDEX)).text();
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

// Store a copy of a good response. A failed write must never lose the fresh response.
async function store(cache, key, res) {
  if (res.status !== 200) return;
  try {
    await cache.put(key, res.clone());
  } catch {
    /* quota or write error: serve the network response anyway */
  }
}

// Network-first. The cache serves only when the network request fails (offline).
// The HTML shell and the manifest always show the newest release this way.
async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    await store(cache, key, res);
    return res;
  } catch {
    return (await cache.match(key)) || Response.error();
  }
}

// Cache-first for hashed assets. A hashed file never changes under the same name.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    await store(cache, req, res);
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const isShell = req.mode === 'navigate' || url.pathname.endsWith('/index.html');
  if (isShell) event.respondWith(networkFirst(req, INDEX));
  else if (url.pathname.includes('/assets/')) event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req, req));
});
