import { describe, expect, it, vi } from 'vitest';
import swSource from '../public/sw.js?raw';

type Handler = (event: Record<string, unknown>) => void;

// Run public/sw.js against in-memory fakes of the Service Worker globals.
function loadWorker(opts: { online: boolean; cached?: Record<string, string>; caches?: string[]; putFails?: boolean; status?: number }) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, string>(Object.entries(opts.cached ?? {}));
  const deleted: string[] = [];
  const cache = {
    match: async (req: string | { url: string }) => {
      const key = typeof req === 'string' ? req : new URL(req.url).pathname;
      const body = store.get(key) ?? store.get(`.${key}`);
      return body === undefined ? undefined : new Response(body);
    },
    put: async (req: string | { url: string }, res: Response) => {
      if (opts.putFails) throw new Error('quota');
      store.set(typeof req === 'string' ? req : new URL(req.url).pathname, await res.text());
    },
  };
  const fetchMock = vi.fn(async () => {
    if (!opts.online) throw new TypeError('offline');
    return new Response('fresh', { status: opts.status ?? 200 });
  });
  const self = {
    location: { origin: 'https://x.test' },
    addEventListener: (name: string, fn: Handler) => (handlers[name] = fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
    registration: { showNotification: vi.fn(async () => undefined) },
  };
  const cachesApi = {
    open: async () => cache,
    keys: async () => opts.caches ?? [],
    delete: async (k: string) => void deleted.push(k),
  };
  // Node rejects relative URLs in Request, so the worker gets a plain stand-in.
  const FakeRequest = function (url: string) {
    return { url };
  };
  new Function('self', 'caches', 'fetch', 'Request', swSource)(self, cachesApi, fetchMock, FakeRequest);

  const respond = async (url: string, mode = 'cors') => {
    let result: Promise<Response> | undefined;
    handlers.fetch({
      request: { url, method: 'GET', mode },
      respondWith: (p: Promise<Response>) => (result = p),
    });
    return (await result) as Response;
  };
  return { handlers, store, deleted, fetchMock, self, respond };
}

describe('service worker', () => {
  it('uses the v2 cache and deletes old caches on activate', async () => {
    const w = loadWorker({ online: true, caches: ['sauerteig-v1', 'sauerteig-v2'] });
    let done: Promise<unknown> | undefined;
    w.handlers.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(w.deleted).toEqual(['sauerteig-v1']);
    expect(w.self.clients.claim).toHaveBeenCalled();
  });

  it('serves navigations from the network and refreshes the cached index.html', async () => {
    const w = loadWorker({ online: true, cached: { './index.html': 'stale' } });
    const res = await w.respond('https://x.test/', 'navigate');
    expect(await res.text()).toBe('fresh');
    expect(w.store.get('./index.html')).toBe('fresh');
  });

  it('falls back to the cached index.html when the network fails', async () => {
    const w = loadWorker({ online: false, cached: { './index.html': 'stale' } });
    const res = await w.respond('https://x.test/', 'navigate');
    expect(await res.text()).toBe('stale');
  });

  it('serves hashed assets cache-first without a network request', async () => {
    const w = loadWorker({ online: true, cached: { '/assets/app-1.js': 'cached' } });
    const res = await w.respond('https://x.test/assets/app-1.js');
    expect(await res.text()).toBe('cached');
    expect(w.fetchMock).not.toHaveBeenCalled();
  });

  it('serves the fresh response when the cache write fails', async () => {
    const w = loadWorker({ online: true, cached: { './index.html': 'stale' }, putFails: true });
    const res = await w.respond('https://x.test/', 'navigate');
    expect(await res.text()).toBe('fresh');
  });

  it('does not cache a partial 206 response', async () => {
    const w = loadWorker({ online: true, status: 206 });
    await w.respond('https://x.test/assets/app-2.js');
    expect(w.store.has('/assets/app-2.js')).toBe(false);
  });

  it('serves the manifest network-first so a new release shows up', async () => {
    const w = loadWorker({ online: true, cached: { '/manifest.webmanifest': 'old' } });
    const res = await w.respond('https://x.test/manifest.webmanifest');
    expect(await res.text()).toBe('fresh');
    const offline = loadWorker({ online: false, cached: { '/manifest.webmanifest': 'old' } });
    expect(await (await offline.respond('https://x.test/manifest.webmanifest')).text()).toBe('old');
  });

  it('treats a direct index.html request as the shell', async () => {
    const offline = loadWorker({ online: false, cached: { './index.html': 'stale' } });
    expect(await (await offline.respond('https://x.test/index.html')).text()).toBe('stale');
  });

  it('does not cache a failed navigation response', async () => {
    const w = loadWorker({ online: true, status: 500, cached: { './index.html': 'stale' } });
    await w.respond('https://x.test/', 'navigate');
    expect(w.store.get('./index.html')).toBe('stale');
  });

  it('keeps skipWaiting on install', async () => {
    const w = loadWorker({ online: true });
    let done: Promise<unknown> | undefined;
    w.fetchMock.mockImplementation(async () => new Response('<html></html>'));
    w.handlers.install({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(w.self.skipWaiting).toHaveBeenCalled();
  });

  describe('notifications', () => {
    const item = (tag: string, inMs: number) => ({ tag, at: Date.now() + inMs, title: `T-${tag}`, body: `B-${tag}` });

    it('shows a scheduled notification with the correct text', () => {
      vi.useFakeTimers();
      try {
        const w = loadWorker({ online: true });
        w.handlers.message({ data: { type: 'schedule', items: [item('peak', 60_000)] } });
        vi.advanceTimersByTime(59_000);
        expect(w.self.registration.showNotification).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2_000);
        expect(w.self.registration.showNotification).toHaveBeenCalledWith('T-peak', expect.objectContaining({ body: 'B-peak', tag: 'peak' }));
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows no notification after a cancel message', () => {
      vi.useFakeTimers();
      try {
        const w = loadWorker({ online: true });
        w.handlers.message({ data: { type: 'schedule', items: [item('peak', 1_000), item('urgent', 2_000)] } });
        w.handlers.message({ data: { type: 'cancel' } });
        vi.advanceTimersByTime(10_000);
        expect(w.self.registration.showNotification).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows one notification when two items share a tag', () => {
      vi.useFakeTimers();
      try {
        const w = loadWorker({ online: true });
        w.handlers.message({ data: { type: 'schedule', items: [item('peak', 1_000), item('peak', 2_000)] } });
        vi.advanceTimersByTime(10_000);
        expect(w.self.registration.showNotification).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('ignores an item with an unknown tag', () => {
      vi.useFakeTimers();
      try {
        const w = loadWorker({ online: true });
        w.handlers.message({ data: { type: 'schedule', items: [item('other', 1_000)] } });
        vi.advanceTimersByTime(10_000);
        expect(w.self.registration.showNotification).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('replaces the old schedule and ignores malformed items', () => {
      vi.useFakeTimers();
      try {
        const w = loadWorker({ online: true });
        w.handlers.message({ data: { type: 'schedule', items: [item('peak', 1_000)] } });
        w.handlers.message({ data: { type: 'schedule', items: [{ tag: 'x' }, null, item('urgent', 2_000)] } });
        vi.advanceTimersByTime(10_000);
        expect(w.self.registration.showNotification).toHaveBeenCalledTimes(1);
        expect(w.self.registration.showNotification).toHaveBeenCalledWith('T-urgent', expect.anything());
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
