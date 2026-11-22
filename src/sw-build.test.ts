import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const dirs: string[] = [];

const BUILD_TIMEOUT = 30_000;

// Run the project build config on a generated entry that holds a marker. This tests the plugin, not the app. Return the built sw.js.
// Each build gets its own temp dir for the entry and the output.
async function buildApp(marker: string, worker?: string): Promise<string> {
  const tmp = mkdtempSync(join(tmpdir(), 'sauerteig-build-'));
  dirs.push(tmp);
  const entry = join(tmp, 'entry.ts');
  const outDir = join(tmp, 'dist');
  writeFileSync(entry, `console.log(${JSON.stringify(marker)});`);
  await build({
    root,
    logLevel: 'silent',
    configFile: join(root, 'vite.config.ts'),
    publicDir: worker === undefined ? join(root, 'public') : publicWith(tmp, worker),
    build: { outDir, emptyOutDir: true, rollupOptions: { input: entry } },
  });
  return readFileSync(join(outDir, 'sw.js'), 'utf8');
}

// Copy public/ and replace sw.js, so a test can change the worker alone.
function publicWith(tmp: string, worker: string): string {
  const dir = join(tmp, 'public');
  cpSync(join(root, 'public'), dir, { recursive: true });
  writeFileSync(join(dir, 'sw.js'), worker);
  return dir;
}

const cacheName = (sw: string) => /^const CACHE = '([^']+)';$/m.exec(sw)?.[1];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('service worker cache name plugin', () => {
  it('gets a different cache name for different content', async () => {
    const a = cacheName(await buildApp('one'));
    const b = cacheName(await buildApp('two'));
    expect(a).toMatch(/^sauerteig-[0-9a-f]{12}$/);
    expect(b).toMatch(/^sauerteig-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  }, BUILD_TIMEOUT);

  it('gets the same cache name for the same content', async () => {
    expect(cacheName(await buildApp('same'))).toBe(cacheName(await buildApp('same')));
  }, BUILD_TIMEOUT);

  it('gets a different cache name when only the worker changes', async () => {
    const source = readFileSync(join(root, 'public/sw.js'), 'utf8');
    const a = cacheName(await buildApp('worker', source));
    const b = cacheName(await buildApp('worker', `${source}\n// changed`));
    expect(a).not.toBe(b);
  }, BUILD_TIMEOUT);

  it('keeps the rest of the worker unchanged', async () => {
    const built = await buildApp('rest');
    const source = readFileSync(join(root, 'public/sw.js'), 'utf8');
    const strip = (s: string) => s.replace(/^const CACHE = .*$/m, '');
    expect(strip(built)).toBe(strip(source));
  }, BUILD_TIMEOUT);
});
