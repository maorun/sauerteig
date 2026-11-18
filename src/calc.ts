export interface Ratio {
  flour: number;
  water: number;
  starter: number;
}

export interface Amounts {
  flour: number;
  water: number;
  starter: number;
}

export interface Timing {
  /** Hours until the starter has doubled. */
  doublingHours: number;
  /** Hours until maximum activity. */
  peakHours: number;
  /** Hours until the storage window (usable after peak) ends. */
  windowEndHours: number;
}

export interface Schedule {
  start: Date;
  doubling: Date;
  peak: Date;
  windowEnd: Date;
}

export type PhaseName = 'lag' | 'growth' | 'peak' | 'decline' | 'over';

export interface Phase {
  name: PhaseName;
  /** Progress 0..1 on the way to the peak. */
  progress: number;
}

/** Doubling time of a 1:1:1 refreshment at the reference temperature. */
const REF_DOUBLING_H = 3.5;
const REF_TEMP_C = 24;
/** Temperature change that halves or doubles the speed. */
const TEMP_STEP_C = 7;
export const MIN_TEMP_C = 4;
export const MAX_TEMP_C = 38;
/** Peak lies at the point where the volume has tripled (log2(3) doublings). */
const PEAK_DOUBLINGS = Math.log2(3);
const WINDOW_FACTOR = 1.5;

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number`);
  }
}

export function calcAmounts(ratio: Ratio, total: number): Amounts {
  assertPositive(ratio.flour, 'flour');
  assertPositive(ratio.water, 'water');
  assertPositive(ratio.starter, 'starter');
  assertPositive(total, 'total');
  const sum = ratio.flour + ratio.water + ratio.starter;
  const whole = Math.round(total);
  const flour = Math.round((whole * ratio.flour) / sum);
  const water = Math.round((whole * ratio.water) / sum);
  // The starter takes the rounding remainder, so the parts always add up.
  return { flour, water, starter: whole - flour - water };
}

export function parseRatio(text: string): Ratio | null {
  const parts = text.split(':').map((p) => Number(p.trim().replace(',', '.')));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  return { flour: parts[0], water: parts[1], starter: parts[2] };
}

export function doublingTimeHours(tempC: number): number {
  const t = Math.min(MAX_TEMP_C, Math.max(MIN_TEMP_C, tempC));
  return REF_DOUBLING_H * Math.pow(2, (REF_TEMP_C - t) / TEMP_STEP_C);
}

export function calcTiming(ratio: Ratio, tempC: number): Timing {
  assertPositive(ratio.flour, 'flour');
  assertPositive(ratio.water, 'water');
  assertPositive(ratio.starter, 'starter');
  const base = doublingTimeHours(tempC);
  const sum = ratio.flour + ratio.water + ratio.starter;
  // Starter fraction of the new mix; 1/3 is the reference (1:1:1).
  // More starter = more culture = faster, less starter = slower.
  const fraction = ratio.starter / sum;
  const dilution = Math.log2(1 / fraction); // doublings needed to refill
  const refDilution = Math.log2(3);
  const starterFactor = (dilution + 1) / (refDilution + 1);
  // Hydration (water / flour): wetter dough ferments a little faster.
  const hydration = ratio.water / ratio.flour;
  const hydrationFactor = Math.min(1.25, Math.max(0.8, 1 - 0.15 * Math.log2(hydration)));
  const peakHours = base * PEAK_DOUBLINGS * starterFactor * hydrationFactor;
  return {
    doublingHours: peakHours / PEAK_DOUBLINGS,
    peakHours,
    windowEndHours: peakHours * WINDOW_FACTOR,
  };
}

export function buildSchedule(start: Date, timing: Timing): Schedule {
  const at = (h: number) => new Date(start.getTime() + h * 3_600_000);
  return {
    start,
    doubling: at(timing.doublingHours),
    peak: at(timing.peakHours),
    windowEnd: at(timing.windowEndHours),
  };
}

export function getPhase(elapsedHours: number, timing: Timing): Phase {
  const progress = Math.min(1, Math.max(0, elapsedHours / timing.peakHours));
  const e = elapsedHours;
  const peakBand = timing.peakHours * 0.1;
  if (e > timing.windowEndHours) return { name: 'over', progress };
  if (e > timing.peakHours + peakBand) return { name: 'decline', progress };
  if (e >= timing.peakHours - peakBand) return { name: 'peak', progress };
  if (e < timing.doublingHours * 0.25) return { name: 'lag', progress };
  return { name: 'growth', progress };
}

export function splitHours(hours: number): { hours: number; minutes: number } {
  const total = Math.round(Math.max(0, hours) * 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}
