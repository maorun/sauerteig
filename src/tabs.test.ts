import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import { nextTab, TAB_NAMES } from './tabs';

const panel = (name: string): string => {
  const start = html.indexOf(`id="panel-${name}"`);
  expect(start).toBeGreaterThan(-1);
  const other = TAB_NAMES.filter((n) => n !== name).map((n) => html.indexOf(`id="panel-${n}"`));
  const end = other.filter((i) => i > start).sort((a, b) => a - b)[0] ?? html.indexOf('</main>');
  return html.slice(start, end);
};

describe('tab navigation', () => {
  it('moves with arrow keys and wraps around', () => {
    expect(nextTab('tracker', 'ArrowRight')).toBe('target');
    expect(nextTab('target', 'ArrowRight')).toBe('fridge');
    expect(nextTab('fridge', 'ArrowRight')).toBe('tracker');
    expect(nextTab('tracker', 'ArrowLeft')).toBe('fridge');
    expect(nextTab('fridge', 'Home')).toBe('tracker');
    expect(nextTab('tracker', 'End')).toBe('fridge');
  });
  it('ignores other keys', () => {
    expect(nextTab('tracker', 'a')).toBeNull();
  });
});

describe('index.html structure', () => {
  it('has a tablist with one tab for each panel', () => {
    expect(html).toContain('role="tablist"');
    for (const n of TAB_NAMES) {
      expect(html).toContain(`id="tab-${n}"`);
      expect(html).toMatch(new RegExp(`id="tab-${n}"[^>]*aria-controls="panel-${n}"`));
    }
  });
  it('shows the tracker first and hides the target panel', () => {
    expect(html).toMatch(/id="panel-target"[^>]*\bhidden\b/);
    expect(html).not.toMatch(/id="panel-tracker"[^>]*\bhidden\b/);
  });
  it('has a starter inventory card with warning in the tracker panel', () => {
    const tracker = panel('tracker');
    for (const id of ['inv-grams', 'inv-flour', 'inv-time', 'inv-warning', 'btn-inv-refreshed']) {
      expect(tracker).toContain(`id="${id}"`);
    }
  });
  it('has a fridge panel with duration select, re-feed output and no tracker form', () => {
    const fridge = panel('fridge');
    expect(html).toMatch(/id="panel-fridge"[^>]*\bhidden\b/);
    for (const id of ['f-duration', 'f-fed', 'f-total', 'f-ratio', 'f-flour', 'f-water', 'f-starter', 'f-next']) {
      expect(fridge).toContain(`id="${id}"`);
    }
    expect(fridge).toContain('value="short"');
    expect(fridge).toContain('value="week"');
    expect(fridge).not.toContain('id="form"');
    expect(panel('tracker')).not.toContain('f-duration');
  });
  it('keeps the target calculator out of the tracker panel', () => {
    const tracker = panel('tracker');
    expect(tracker).toContain('id="form"');
    expect(tracker).toContain('id="h-sched"');
    expect(tracker).not.toContain('h-target');
    expect(tracker).not.toContain('target-form');
    const target = panel('target');
    expect(target).toContain('id="target-form"');
    expect(target).toContain('id="t-table"');
    expect(target).not.toContain('id="form"');
  });
});
