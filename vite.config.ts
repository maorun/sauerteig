import { defineConfig } from 'vitest/config';
import { swCachePlugin } from './vite-plugin-sw-cache';

export default defineConfig({
  base: './',
  plugins: [swCachePlugin()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
