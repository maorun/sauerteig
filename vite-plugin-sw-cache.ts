import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

const CACHE_LINE = /^const CACHE = '[^']*';(?=\r?$)/m;
const WORKER = 'sw.js';

// List all files below a directory, sorted for a stable hash.
function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]))
    .sort();
}

// Hash the built files. The worker counts without its CACHE line, because the hash goes into that line.
export function buildHash(outDir: string): string {
  const hash = createHash('sha256');
  for (const file of listFiles(outDir)) {
    const name = relative(outDir, file);
    const body = name === WORKER ? Buffer.from(readFileSync(file, 'utf8').replace(CACHE_LINE, '')) : readFileSync(file);
    hash.update(name).update('\0').update(body).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

// Write the cache name into the built sw.js. The source keeps a fallback name for dev and tests.
export function swCachePlugin(): Plugin {
  return {
    name: 'sauerteig-sw-cache',
    apply: 'build',
    enforce: 'post',
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      const file = join(outDir, WORKER);
      const source = readFileSync(file, 'utf8');
      if (!CACHE_LINE.test(source)) throw new Error(`No CACHE constant found in ${WORKER}`);
      writeFileSync(file, source.replace(CACHE_LINE, `const CACHE = 'sauerteig-${buildHash(outDir)}';`));
    },
  };
}
