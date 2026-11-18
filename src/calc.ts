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

/** Flour types, from fastest to slowest fermentation. */
export type FlourType = 'rye-whole' | 'rye' | 'wheat-whole' | 'spelt' | 'wheat-white';

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

/**
 * Time factor per flour type relative to wheat flour type 550 (1.0).
 * Below 1 = faster: more ash and enzymes feed the culture.
 */
export const FLOUR_SPEED: Readonly<Record<FlourType, number>> = {
  'rye-whole': 0.75,
  rye: 0.82,
  'wheat-whole': 0.85,
  spelt: 0.9,
  'wheat-white': 1,
};

export const FLOUR_LABELS: Readonly<Record<FlourType, string>> = {
  'rye-whole': 'Roggenvollkornmehl',
  rye: 'Roggenmehl (Type 997/1150)',
  'wheat-whole': 'Weizenvollkornmehl',
  spelt: 'Dinkelmehl',
  'wheat-white': 'Weizenmehl (Type 550)',
};

export const FLOUR_TYPES: readonly FlourType[] = Object.keys(FLOUR_SPEED) as FlourType[];
export const DEFAULT_FLOUR: FlourType = 'wheat-white';

export function isFlourType(value: unknown): value is FlourType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FLOUR_SPEED, value);
}

export function flourSpeedFactor(flour: FlourType = DEFAULT_FLOUR): number {
  if (!isFlourType(flour)) throw new RangeError(`unknown flour type: ${String(flour)}`);
  return FLOUR_SPEED[flour];
}

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

export function calcTiming(ratio: Ratio, tempC: number, flour: FlourType = DEFAULT_FLOUR): Timing {
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
  const peakHours = base * PEAK_DOUBLINGS * starterFactor * hydrationFactor * flourSpeedFactor(flour);
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

export interface TargetOption {
  tempC: number;
  /** Starter share relative to 1 part flour and 1 part water (1:1:s). */
  starterShare: number;
  ratio: Ratio;
  /** Hours from start to peak. */
  durationHours: number;
  flour: FlourType;
  /** Rounded to whole grams, so small totals deviate slightly from the exact ratio. */
  amounts: Amounts;
}

export const TARGET_TEMPS_C: readonly number[] = [18, 20, 22, 24, 26, 28];
/** Realistic bounds for s in 1:1:s (1:1:0.05 = 1:20:20 down to 1:1:3). */
export const MIN_STARTER_SHARE = 0.05;
export const MAX_STARTER_SHARE = 3;

/**
 * Inverts the peakHours formula of calcTiming for a 100 % hydration ratio 1:1:s.
 * Returns null if no starter share exists for this duration and temperature.
 */
export function starterShareForPeak(
  peakHours: number,
  tempC: number,
  flour: FlourType = DEFAULT_FLOUR,
): number | null {
  if (!Number.isFinite(peakHours) || peakHours <= 0) return null;
  const refDilution = Math.log2(3);
  const base = doublingTimeHours(tempC) * flourSpeedFactor(flour);
  // peakHours = base * PEAK_DOUBLINGS * (dilution + 1) / (refDilution + 1), with dilution = log2(1 / f).
  const dilution = (peakHours * (refDilution + 1)) / (base * PEAK_DOUBLINGS) - 1;
  if (dilution <= 0) return null; // f >= 1: cannot be reached, even pure starter is too slow
  const fraction = Math.pow(2, -dilution);
  return (2 * fraction) / (1 - fraction);
}

export function calcTargetOptions(
  target: Date,
  start: Date,
  total: number,
  temps: readonly number[] = TARGET_TEMPS_C,
  flour: FlourType = DEFAULT_FLOUR,
): TargetOption[] {
  assertPositive(total, 'total');
  const durationHours = (target.getTime() - start.getTime()) / 3_600_000;
  assertPositive(durationHours, 'duration');
  const options: TargetOption[] = [];
  for (const tempC of temps) {
    const s = starterShareForPeak(durationHours, tempC, flour);
    if (s === null || s < MIN_STARTER_SHARE || s > MAX_STARTER_SHARE) continue;
    const ratio: Ratio = { flour: 1, water: 1, starter: s };
    const amounts = calcAmounts(ratio, total);
    if (amounts.flour < 1 || amounts.water < 1 || amounts.starter < 1) continue;
    options.push({ tempC, starterShare: s, ratio, durationHours, amounts, flour });
  }
  return options;
}
