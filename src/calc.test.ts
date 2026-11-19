import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  calcTargetOptions,
  MIN_STARTER_SHARE,
  MAX_STARTER_SHARE,
  starterShareForPeak,
  TARGET_TEMPS_C,
  calcAmounts,
  DEFAULT_FLOUR,
  FLOUR_LABELS,
  FLOUR_SPEED,
  FLOUR_TYPES,
  flourSpeedFactor,
  isFlourType,
  type FlourType,
  COLD_TEMP_STEP_C,
  COLD_TEMP_THRESHOLD_C,
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
  it('slows down much faster below the cold threshold (12 °C)', () => {
    expect(doublingTimeHours(COLD_TEMP_THRESHOLD_C)).toBeCloseTo(3.5 * Math.pow(2, (24 - COLD_TEMP_THRESHOLD_C) / 7), 5);
    const atCold = doublingTimeHours(COLD_TEMP_THRESHOLD_C);
    expect(doublingTimeHours(COLD_TEMP_THRESHOLD_C - COLD_TEMP_STEP_C)).toBeCloseTo(atCold * 2, 5);
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

  it('takes 2 to 4 days for rye-whole 1:1:1 at 7 °C in the fridge (regression)', () => {
    const t = calcTiming(r111, 7, 'rye-whole');
    expect(t.peakHours).toBeGreaterThanOrEqual(48);
    expect(t.peakHours).toBeLessThanOrEqual(96);
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
    const baseAt12 = 3.5 * 2 ** ((24 - 12) / 7);
    const doublingAt4 = baseAt12 * 2 ** ((12 - 4) / 2.1);
    expect(calcTiming(r111, 4).peakHours).toBeCloseTo(doublingAt4 * Math.log2(3), 5);
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

describe('calcTargetOptions', () => {
  const start = new Date('2026-01-01T08:00:00Z');
  const at = (h: number) => new Date(start.getTime() + h * 3_600_000);

  it('throws for a target that is not after the start', () => {
    expect(() => calcTargetOptions(start, start, 150)).toThrow(RangeError);
    expect(() => calcTargetOptions(at(-1), start, 150)).toThrow(RangeError);
  });

  it.each([4, 8, 12, 24])('round-trips %i h through calcTiming (regression)', (h) => {
    const options = calcTargetOptions(at(h), start, 200);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(calcTiming(o.ratio, o.tempC).peakHours).toBeCloseTo(h, 6);
      expect(o.starterShare).toBeGreaterThanOrEqual(MIN_STARTER_SHARE);
      expect(o.starterShare).toBeLessThanOrEqual(MAX_STARTER_SHARE);
      expect(o.amounts.flour + o.amounts.water + o.amounts.starter).toBe(200);
    }
  });

  it('needs less starter at warmer temperatures', () => {
    const options = calcTargetOptions(at(12), start, 300);
    for (let i = 1; i < options.length; i++) {
      expect(options[i].starterShare).toBeLessThan(options[i - 1].starterShare);
    }
  });

  it('filters extreme ratios', () => {
    // 4 h at 18 °C needs more starter than the upper bound allows.
    const temps = calcTargetOptions(at(4), start, 200).map((o) => o.tempC);
    expect(temps).not.toContain(18);
    // 24 h at 28 °C needs less starter than the lower bound allows.
    expect(calcTargetOptions(at(24), start, 200).map((o) => o.tempC)).not.toContain(28);
    // Very short target: no option at all.
    expect(calcTargetOptions(at(0.5), start, 200)).toEqual([]);
  });

  it.each([
    ['upper', 3, 3 - 1e-6, 3 + 1e-6],
    ['lower', 0.05, 0.05 + 1e-6, 0.05 - 1e-6],
  ])('applies the %s starter share bound', (_name, _bound, inside, outside) => {
    const hours = (s: number) => calcTiming({ flour: 1, water: 1, starter: s }, 24).peakHours;
    expect(calcTargetOptions(at(hours(inside)), start, 1000, [24])).toHaveLength(1);
    expect(calcTargetOptions(at(hours(outside)), start, 1000, [24])).toHaveLength(0);
  });

  it('skips options whose amounts round to zero grams', () => {
    // 2 g split as 1 g flour, 1 g water and 0 g starter: every option is dropped.
    expect(calcTargetOptions(at(8), start, 2)).toEqual([]);
    expect(calcTargetOptions(at(8), start, 200).length).toBeGreaterThan(0);
  });

  it.each([0.1, 0.5, 1, 2.5])('inverts the formula at every temperature for s = %f', (s) => {
    for (const t of TARGET_TEMPS_C) {
      const peak = calcTiming({ flour: 1, water: 1, starter: s }, t).peakHours;
      expect(starterShareForPeak(peak, t)).toBeCloseTo(s, 9);
    }
  });

  it('returns null for impossible durations', () => {
    expect(starterShareForPeak(0, 22)).toBeNull();
    expect(starterShareForPeak(Number.NaN, 22)).toBeNull();
    // Shorter than a pure-starter refill can take: share would be infinite.
    expect(starterShareForPeak(0.1, 22)).toBeNull();
  });
});

describe('flour types', () => {
  const ratio = { flour: 1, water: 1, starter: 1 };

  it('defines the speed factor of each flour type', () => {
    expect(FLOUR_SPEED).toEqual({
      'rye-whole': 0.75,
      rye: 0.82,
      'wheat-whole': 0.85,
      spelt: 0.9,
      'wheat-white': 1,
    });
    for (const f of FLOUR_TYPES) {
      expect(flourSpeedFactor(f)).toBe(FLOUR_SPEED[f]);
      expect(FLOUR_LABELS[f]).not.toBe('');
    }
  });

  it('uses wheat 550 as baseline and default', () => {
    expect(DEFAULT_FLOUR).toBe('wheat-white');
    expect(flourSpeedFactor()).toBe(1);
    expect(calcTiming(ratio, 24, 'wheat-white')).toEqual(calcTiming(ratio, 24));
  });

  it('validates flour types', () => {
    expect(isFlourType('rye-whole')).toBe(true);
    expect(isFlourType('toString')).toBe(false);
    expect(isFlourType(undefined)).toBe(false);
    expect(() => flourSpeedFactor('corn' as FlourType)).toThrow(RangeError);
  });

  it.each(FLOUR_TYPES)('scales peak and window of %s by its speed factor', (f) => {
    const base = calcTiming(ratio, 24);
    const t = calcTiming(ratio, 24, f);
    expect(t.peakHours).toBeCloseTo(base.peakHours * FLOUR_SPEED[f], 9);
    expect(t.doublingHours).toBeCloseTo(base.doublingHours * FLOUR_SPEED[f], 9);
    expect(t.windowEndHours).toBeCloseTo(base.windowEndHours * FLOUR_SPEED[f], 9);
  });

  it('orders the flours from fastest to slowest', () => {
    const peaks = FLOUR_TYPES.map((f) => calcTiming(ratio, 24, f).peakHours);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeGreaterThan(peaks[i - 1]);
  });

  it('lets rye whole grain peak at least 20 % earlier than white wheat', () => {
    const rye = calcTiming(ratio, 24, 'rye-whole').peakHours;
    const wheat = calcTiming(ratio, 24, 'wheat-white').peakHours;
    expect(rye).toBeLessThan(wheat * 0.8);
  });

  describe('target time round trip', () => {
    const start = new Date('2026-03-01T08:00:00Z');
    const at = (h: number) => new Date(start.getTime() + h * 3_600_000);

    it.each(FLOUR_TYPES)('reproduces the target duration with %s', (f) => {
      const options = calcTargetOptions(at(10), start, 1000, [20, 24], f);
      expect(options.length).toBeGreaterThan(0);
      for (const o of options) {
        expect(o.flour).toBe(f);
        expect(calcTiming(o.ratio, o.tempC, f).peakHours).toBeCloseTo(10, 6);
      }
    });

    it('needs more starter with slower flour for the same target', () => {
      const share = (f: FlourType) => calcTargetOptions(at(10), start, 1000, [24], f)[0].starterShare;
      expect(share('rye-whole')).toBeLessThan(share('wheat-white'));
    });

    it('inverts starterShareForPeak per flour', () => {
      for (const f of FLOUR_TYPES) {
        const s = starterShareForPeak(8, 22, f);
        expect(s).not.toBeNull();
        expect(calcTiming({ flour: 1, water: 1, starter: s as number }, 22, f).peakHours).toBeCloseTo(8, 9);
      }
    });

    it('defaults to wheat 550 like before', () => {
      expect(calcTargetOptions(at(10), start, 1000)).toEqual(
        calcTargetOptions(at(10), start, 1000, TARGET_TEMPS_C, 'wheat-white'),
      );
    });
  });
});
