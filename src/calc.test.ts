import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  calcAmounts,
  calcTiming,
  doublingTimeHours,
  getPhase,
  parseRatio,
  splitHours,
} from './calc';

describe('calcAmounts', () => {
  it('splits 1:1:1 equally (regression)', () => {
    expect(calcAmounts({ flour: 1, water: 1, starter: 1 }, 300)).toEqual({
      flour: 100,
      water: 100,
      starter: 100,
    });
  });

  it('handles varied ratio 5:5:1 (hydration 100 %)', () => {
    const a = calcAmounts({ flour: 5, water: 5, starter: 1 }, 220);
    expect(a.flour).toBe(100);
    expect(a.water).toBe(100);
    expect(a.starter).toBe(20);
  });

  it('handles high hydration 1:2:1', () => {
    const a = calcAmounts({ flour: 1, water: 2, starter: 1 }, 200);
    expect(a).toEqual({ flour: 50, water: 100, starter: 50 });
  });

  it('rounds a fractional total once', () => {
    const a = calcAmounts({ flour: 1, water: 1, starter: 1 }, 100.4);
    expect(a.flour + a.water + a.starter).toBe(100);
  });

  it('sums to the requested total after rounding', () => {
    const a = calcAmounts({ flour: 1, water: 1, starter: 1 }, 100);
    expect(a.flour + a.water + a.starter).toBe(100);
  });

  it('rejects invalid input', () => {
    expect(() => calcAmounts({ flour: 0, water: 1, starter: 1 }, 100)).toThrow();
    expect(() => calcAmounts({ flour: 1, water: -1, starter: 1 }, 100)).toThrow();
    expect(() => calcAmounts({ flour: 1, water: 1, starter: 1 }, 0)).toThrow();
    expect(() => calcAmounts({ flour: 1, water: 1, starter: NaN }, 10)).toThrow();
  });
});

describe('parseRatio', () => {
  it('parses colon separated values', () => {
    expect(parseRatio('1:2:1')).toEqual({ flour: 1, water: 2, starter: 1 });
    expect(parseRatio(' 5 : 5 : 1 ')).toEqual({ flour: 5, water: 5, starter: 1 });
    expect(parseRatio('1:1,5:1')).toEqual({ flour: 1, water: 1.5, starter: 1 });
  });
  it('returns null for invalid ratios', () => {
    expect(parseRatio('1:1')).toBeNull();
    expect(parseRatio('a:b:c')).toBeNull();
    expect(parseRatio('1:0:1')).toBeNull();
  });
});

describe('doublingTimeHours', () => {
  it('is the reference value at 24 °C', () => {
    expect(doublingTimeHours(24)).toBeCloseTo(3.5, 5);
  });
  it('halves per +7 °C and doubles per -7 °C', () => {
    expect(doublingTimeHours(31)).toBeCloseTo(1.75, 5);
    expect(doublingTimeHours(17)).toBeCloseTo(7, 5);
  });
  it('is slow at low temperature', () => {
    expect(doublingTimeHours(4)).toBeGreaterThan(20);
  });
  it('clamps temperatures outside 4..38 °C', () => {
    expect(doublingTimeHours(-10)).toBe(doublingTimeHours(4));
    expect(doublingTimeHours(60)).toBe(doublingTimeHours(38));
  });
});

/** Starter-dilution factor of calcTiming, derived independently of hydration. */
function starterScaled(r: { flour: number; water: number; starter: number }): number {
  const fraction = r.starter / (r.flour + r.water + r.starter);
  return (Math.log2(1 / fraction) + 1) / (Math.log2(3) + 1);
}

describe('calcTiming', () => {
  const r111 = { flour: 1, water: 1, starter: 1 };

  it('gives about 5.5 h to peak for 1:1:1 at 24 °C', () => {
    const t = calcTiming(r111, 24);
    expect(t.peakHours).toBeCloseTo(3.5 * Math.log2(3), 5);
    expect(t.doublingHours).toBeLessThan(t.peakHours);
  });

  it('is faster with more starter (1:1:5 vs 1:1:1)', () => {
    expect(calcTiming({ flour: 1, water: 1, starter: 5 }, 24).peakHours).toBeLessThan(
      calcTiming(r111, 24).peakHours,
    );
  });

  it('is slower with less starter (10:10:1)', () => {
    expect(calcTiming({ flour: 10, water: 10, starter: 1 }, 24).peakHours).toBeGreaterThan(
      calcTiming(r111, 24).peakHours,
    );
  });

  it('is much slower at low temperature', () => {
    const cold = calcTiming(r111, 12).peakHours;
    expect(cold).toBeGreaterThan(calcTiming(r111, 24).peakHours * 2);
  });

  it('is faster with high hydration, slower with low hydration', () => {
    const base = calcTiming(r111, 24).peakHours;
    expect(calcTiming({ flour: 1, water: 2, starter: 1 }, 24).peakHours).toBeLessThan(base);
    expect(calcTiming({ flour: 2, water: 1, starter: 1 }, 24).peakHours).toBeGreaterThan(base);
  });

  it('bounds the hydration effect to the factors 0.8 and 1.25', () => {
    // Same starter fraction (1/3) keeps starterFactor at 1, so only hydration differs.
    const base = calcTiming(r111, 24).peakHours;
    expect(calcTiming({ flour: 1, water: 1000, starter: 500.5 }, 24).peakHours / base).toBeCloseTo(
      starterScaled({ flour: 1, water: 1000, starter: 500.5 }) * 0.8,
      5,
    );
    expect(calcTiming({ flour: 1000, water: 1, starter: 500.5 }, 24).peakHours / base).toBeCloseTo(
      starterScaled({ flour: 1000, water: 1, starter: 500.5 }) * 1.25,
      5,
    );
  });

  it('gives exact values at the temperature limits', () => {
    expect(calcTiming(r111, 4).peakHours).toBeCloseTo(3.5 * 2 ** (20 / 7) * Math.log2(3), 5);
    expect(calcTiming(r111, 38).peakHours).toBeCloseTo(3.5 * 2 ** (-14 / 7) * Math.log2(3), 5);
  });

  it('storage window ends after peak', () => {
    const t = calcTiming(r111, 24);
    expect(t.windowEndHours).toBeGreaterThan(t.peakHours);
  });
});

describe('buildSchedule', () => {
  it('computes peak and storage window dates', () => {
    const start = new Date('2026-01-01T08:00:00Z');
    const s = buildSchedule(start, { peakHours: 6, doublingHours: 4.8, windowEndHours: 9 });
    expect(s.start).toEqual(start);
    expect(s.peak.toISOString()).toBe('2026-01-01T14:00:00.000Z');
    expect(s.windowEnd.toISOString()).toBe('2026-01-01T17:00:00.000Z');
    expect(s.doubling.toISOString()).toBe('2026-01-01T12:48:00.000Z');
  });
});

describe('getPhase', () => {
  const timing = { peakHours: 6, doublingHours: 4.8, windowEndHours: 9 };
  it('walks through the phases', () => {
    expect(getPhase(0, timing).name).toBe('lag');
    expect(getPhase(2, timing).name).toBe('growth');
    expect(getPhase(6, timing).name).toBe('peak');
    expect(getPhase(8, timing).name).toBe('decline');
    expect(getPhase(10, timing).name).toBe('over');
  });
  it('switches phases exactly at the boundaries', () => {
    // doubling*0.25 = 1.2 h, peak band = 0.6 h, window end = 9 h
    expect(getPhase(1.19, timing).name).toBe('lag');
    expect(getPhase(1.2, timing).name).toBe('growth');
    expect(getPhase(5.39, timing).name).toBe('growth');
    expect(getPhase(5.4, timing).name).toBe('peak');
    expect(getPhase(6.6, timing).name).toBe('peak');
    expect(getPhase(6.61, timing).name).toBe('decline');
    expect(getPhase(9, timing).name).toBe('decline');
    expect(getPhase(9.01, timing).name).toBe('over');
  });
  it('reports progress 0..1 and clamps', () => {
    expect(getPhase(-1, timing).progress).toBe(0);
    expect(getPhase(3, timing).progress).toBeCloseTo(0.5, 5);
    expect(getPhase(20, timing).progress).toBe(1);
  });
});

describe('splitHours', () => {
  it('formats hours and minutes', () => {
    expect(splitHours(5.5)).toEqual({ hours: 5, minutes: 30 });
    expect(splitHours(1.999)).toEqual({ hours: 2, minutes: 0 });
    expect(splitHours(0)).toEqual({ hours: 0, minutes: 0 });
  });
});
