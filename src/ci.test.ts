import { describe, expect, it } from 'vitest';
import ciSource from '../.github/workflows/ci.yml?raw';

describe('CI workflow', () => {
  it('runs on pull requests and on pushes to main', () => {
    expect(ciSource).toMatch(/^on:\n\s+pull_request:/m);
    expect(ciSource).toMatch(/push:\n\s+branches: \[main\]/);
  });

  it('pins the Node version', () => {
    expect(ciSource).toMatch(/node-version: '\d+\.\d+\.\d+'/);
  });

  it('runs install, typecheck, test and build in order', () => {
    const steps = ['npm ci', 'npm run typecheck', 'npm test', 'npm run build'];
    const positions = steps.map((s) => ciSource.search(new RegExp(`^\\s+- run: ${s}$`, 'm')));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('exposes one job named test', () => {
    const jobs = ciSource.slice(ciSource.indexOf('\njobs:'));
    expect(jobs.match(/^ {2}\w[\w-]*:$/gm)).toEqual(['  test:']);
  });
});
