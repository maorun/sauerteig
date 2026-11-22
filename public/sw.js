// Precached app shell for offline use.
// Fallback name for dev. vite build replaces it with a hash of the built files (vite-plugin-sw-cache.ts).
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

// Timers of the scheduled notifications, by tag. A browser can stop an idle worker,
// so a notification is reliable only while the browser keeps the worker alive.
const timers = new Map();
const MAX_DELAY_MS = 2 ** 31 - 1;
const TAGS = ['peak', 'urgent'];

function cancelAll() {
  for (const id of timers.values()) clearTimeout(id);
  timers.clear();
}

function schedule(items) {
  cancelAll();
  for (const item of items) {
    if (!item || !TAGS.includes(item.tag) || typeof item.title !== 'string' || typeof item.body !== 'string') continue;
    const delay = item.at - Date.now();
    if (!Number.isFinite(delay) || delay <= 0 || delay > MAX_DELAY_MS) continue;
    // A second item with the same tag replaces the first one.
    clearTimeout(timers.get(item.tag));
    timers.set(
      item.tag,
      setTimeout(() => {
        timers.delete(item.tag);
        self.registration
          .showNotification(item.title, { body: item.body, tag: item.tag, icon: './icon-192.png' })
          .catch(() => undefined);
      }, delay),
    );
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'cancel') cancelAll();
  else if (data.type === 'schedule' && Array.isArray(data.items)) schedule(data.items);
});

// A tap on the notification opens the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => (list.length > 0 ? list[0].focus() : self.clients.openWindow('./'))),
  );
});
