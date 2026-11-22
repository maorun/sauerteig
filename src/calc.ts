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
/** Temperature change that halves or doubles the speed in the ambient range (>= 12 °C). */
const TEMP_STEP_C = 7;
/**
 * Threshold below which cold-induced dormancy (Kältestarre) slows microbial activity
 * non-linearly. Below this temperature, metabolic activity drops much faster.
 */
export const COLD_TEMP_THRESHOLD_C = 12;
/** Temperature drop that halves the speed below COLD_TEMP_THRESHOLD_C. */
export const COLD_TEMP_STEP_C = 2.1;
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

/** Upper bound for one ratio part, so the sum of the parts stays finite. */
export const MAX_RATIO_PART = 1000;

/** Builds a ratio from the three input strings. Returns null unless each part is a number from above 0 to MAX_RATIO_PART. */
export function parseRatioParts(flour: string, water: string, starter: string): Ratio | null {
  const parts = [flour, water, starter].map((p) => (p.trim() === '' ? NaN : Number(p.trim().replace(',', '.'))));
  if (parts.some((n) => !Number.isFinite(n) || n <= 0 || n > MAX_RATIO_PART)) {
    return null;
  }
  return { flour: parts[0], water: parts[1], starter: parts[2] };
}

export function doublingTimeHours(tempC: number): number {
  const t = Math.min(MAX_TEMP_C, Math.max(MIN_TEMP_C, tempC));
  if (t < COLD_TEMP_THRESHOLD_C) {
    const baseAtThreshold = REF_DOUBLING_H * Math.pow(2, (REF_TEMP_C - COLD_TEMP_THRESHOLD_C) / TEMP_STEP_C);
    return baseAtThreshold * Math.pow(2, (COLD_TEMP_THRESHOLD_C - t) / COLD_TEMP_STEP_C);
  }
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

export type DeadlineLevel = 'ok' | 'soon' | 'urgent' | 'overdue';

export interface DeadlineStatus {
  level: DeadlineLevel;
  /** Hours until the refresh deadline (the end of the window). Negative if passed. */
  hoursLeft: number;
}

/** Share of the peak time before the deadline at which the warning turns urgent. */
const URGENT_BAND = 0.25;

/**
 * Rates the time left until the refresh deadline (windowEndHours), where acid builds up
 * and the culture starves. `ok` before the peak, `soon` after the peak, `urgent` shortly
 * before the deadline and `overdue` after it.
 */
export function getDeadlineStatus(elapsedHours: number, timing: Timing): DeadlineStatus {
  const hoursLeft = timing.windowEndHours - elapsedHours;
  if (hoursLeft < 0) return { level: 'overdue', hoursLeft };
  if (hoursLeft <= timing.peakHours * URGENT_BAND) return { level: 'urgent', hoursLeft };
  if (elapsedHours >= timing.peakHours) return { level: 'soon', hoursLeft };
  return { level: 'ok', hoursLeft };
}

/** Start of the `urgent` deadline level, as hours after the start. */
export function urgentStartHours(timing: Timing): number {
  return timing.windowEndHours - timing.peakHours * URGENT_BAND;
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

/** Starter stock of the baker, as stored between sessions. */
export interface StarterInventory {
  /** Available starter in grams. */
  grams: number;
  flour: FlourType;
  /** ISO timestamp of the last refreshment, null if the baker has not set one. */
  refreshedAt: string | null;
}

export const MAX_INVENTORY_G = 1_000_000;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Parses a gram input. Returns null unless it is a decimal number from 0 to MAX_INVENTORY_G. */
export function parseInventoryGrams(value: unknown): number | null {
  let n = value;
  if (typeof value === 'string') {
    const text = value.trim().replace(',', '.');
    n = /^(\d+(\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
  }
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX_INVENTORY_G ? n : null;
}

/** Parses stored inventory JSON. Returns null for missing, corrupt or out-of-range data. */
export function parseStarterInventory(raw: string | null): StarterInventory | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { grams, flour, refreshedAt } = data as Record<string, unknown>;
  if (typeof grams !== 'number' || parseInventoryGrams(grams) === null) return null;
  if (!isFlourType(flour)) return null;
  if (refreshedAt === null) return { grams, flour, refreshedAt: null };
  // Only a canonical ISO string passes, so a tampered loose date string cannot load a wrong time.
  if (typeof refreshedAt !== 'string' || !ISO_TIMESTAMP.test(refreshedAt) || Number.isNaN(new Date(refreshedAt).getTime())) {
    return null;
  }
  return { grams, flour, refreshedAt };
}

export function serializeStarterInventory(inventory: StarterInventory): string {
  return JSON.stringify({ grams: inventory.grams, flour: inventory.flour, refreshedAt: inventory.refreshedAt });
}

/** Upper bound for the total amount in grams, so the amounts stay finite. */
export const MAX_TOTAL_G = 1_000_000;

export interface TrackerInputs {
  ratio: Ratio;
  tempC: number;
  totalG: number;
}

/** Parses stored tracker inputs. Returns null for missing, corrupt or out-of-range data, so the caller keeps its defaults. */
export function parseTrackerInputs(raw: string | null): TrackerInputs | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { flour, water, starter, tempC, totalG } = data as Record<string, unknown>;
  const isPart = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= MAX_RATIO_PART;
  if (!isPart(flour) || !isPart(water) || !isPart(starter)) return null;
  if (typeof tempC !== 'number' || !Number.isFinite(tempC) || tempC < MIN_TEMP_C || tempC > MAX_TEMP_C) return null;
  if (typeof totalG !== 'number' || !Number.isFinite(totalG) || totalG <= 0 || totalG > MAX_TOTAL_G) return null;
  return { ratio: { flour, water, starter }, tempC, totalG };
}

export function serializeTrackerInputs(inputs: TrackerInputs): string {
  const { ratio, tempC, totalG } = inputs;
  return JSON.stringify({ flour: ratio.flour, water: ratio.water, starter: ratio.starter, tempC, totalG });
}

export interface SupplyCheck {
  sufficient: boolean;
  /** Missing starter in whole grams, 0 if the supply is sufficient. */
  shortfall: number;
}

/** Compares the available starter with the amount a refreshment needs. */
export function checkStarterSupply(available: number, needed: number): SupplyCheck {
  const shortfall = Math.max(0, Math.ceil(needed - available));
  return { sufficient: shortfall === 0, shortfall };
}

/** Cold storage durations with a recommended feeding ratio. */
export type FridgeDuration = 'short' | 'week';

export interface FridgeOption {
  /** Days until the starter needs the next refreshment. */
  days: number;
  /** Ratio flour : water : starter. More fresh flour and water give the culture food for a longer pause. */
  ratio: Ratio;
}

/** Storage temperature range (°C) for which the ratios apply. */
export const FRIDGE_MIN_TEMP_C = 4;
export const FRIDGE_MAX_TEMP_C = 6;

export const FRIDGE_OPTIONS: Readonly<Record<FridgeDuration, FridgeOption>> = {
  short: { days: 3, ratio: { flour: 2, water: 2, starter: 1 } },
  week: { days: 7, ratio: { flour: 5, water: 5, starter: 1 } },
};

export const FRIDGE_DURATIONS: readonly FridgeDuration[] = Object.keys(FRIDGE_OPTIONS) as FridgeDuration[];

export function isFridgeDuration(value: unknown): value is FridgeDuration {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FRIDGE_OPTIONS, value);
}

export interface FridgePlan {
  duration: FridgeDuration;
  ratio: Ratio;
  /** Amounts for the requested total, rounded to whole grams. */
  amounts: Amounts;
  /** Latest time for the next refreshment. */
  nextFeed: Date;
}

/**
 * Plans the feeding before cold storage at 4..6 °C and the latest date of the next refreshment.
 * The storage lasts a fixed number of 24 h blocks, so a daylight saving change shifts the local clock time.
 */
export function calcFridgePlan(duration: FridgeDuration, fedAt: Date, total: number): FridgePlan {
  if (!isFridgeDuration(duration)) throw new RangeError(`unknown fridge duration: ${String(duration)}`);
  if (Number.isNaN(fedAt.getTime())) throw new RangeError('fedAt must be a valid date');
  const { days, ratio } = FRIDGE_OPTIONS[duration];
  return {
    duration,
    ratio: { ...ratio },
    amounts: calcAmounts(ratio, total),
    nextFeed: new Date(fedAt.getTime() + days * 24 * 3_600_000),
  };
}

export interface CombinedSchedule {
  /** End of the ambient rise. The starter is at its maximum activity. */
  peak: Date;
  /** Latest time to feed the starter and move it into the fridge. */
  transfer: Date;
  /** Hours the starter stays stable at ambient temperature after the peak. */
  ambientStableHours: number;
  duration: FridgeDuration;
  /** Latest refreshment after the chilled storage that starts at the transfer time. */
  fridgeEnd: Date;
}

/**
 * Joins the ambient rise and the chilled storage into two stages.
 * Stage 1 runs from the start to the peak and on to the end of the window (transfer).
 * Stage 2 starts at the transfer and lasts the number of days of the fridge option.
 */
export function calcCombinedSchedule(schedule: Schedule, duration: FridgeDuration): CombinedSchedule {
  if (!isFridgeDuration(duration)) throw new RangeError(`unknown fridge duration: ${String(duration)}`);
  const { peak, windowEnd } = schedule;
  if (Number.isNaN(peak.getTime()) || Number.isNaN(windowEnd.getTime())) {
    throw new RangeError('schedule must contain valid dates');
  }
  if (windowEnd.getTime() < peak.getTime()) throw new RangeError('windowEnd must not be before peak');
  return {
    peak,
    transfer: windowEnd,
    ambientStableHours: (windowEnd.getTime() - peak.getTime()) / 3_600_000,
    duration,
    fridgeEnd: new Date(windowEnd.getTime() + FRIDGE_OPTIONS[duration].days * 24 * 3_600_000),
  };
}

/** One refreshment of the feeding log. */
export interface FeedingEntry {
  /** ISO timestamp of the refreshment. */
  at: string;
  ratio: Ratio;
  tempC: number;
  flour: FlourType;
}

/** The log keeps only the newest entries. */
export const MAX_FEEDING_LOG = 20;

function isFeedingEntry(value: unknown): value is FeedingEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { at, ratio, tempC, flour } = value as Record<string, unknown>;
  if (typeof at !== 'string' || !ISO_TIMESTAMP.test(at) || Number.isNaN(new Date(at).getTime())) return false;
  if (typeof ratio !== 'object' || ratio === null || Array.isArray(ratio)) return false;
  const r = ratio as Record<string, unknown>;
  const isPart = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= MAX_RATIO_PART;
  if (!isPart(r.flour) || !isPart(r.water) || !isPart(r.starter)) return false;
  if (typeof tempC !== 'number' || !Number.isFinite(tempC) || tempC < MIN_TEMP_C || tempC > MAX_TEMP_C) return false;
  return isFlourType(flour);
}

/** Appends an entry (oldest first) and drops the oldest entries above MAX_FEEDING_LOG. Does not change the input. */
export function addFeedingEntry(log: readonly FeedingEntry[], entry: FeedingEntry): FeedingEntry[] {
  if (!isFeedingEntry(entry)) throw new RangeError('invalid feeding entry');
  return [...log, { at: entry.at, ratio: { ...entry.ratio }, tempC: entry.tempC, flour: entry.flour }].slice(-MAX_FEEDING_LOG);
}

/** Parses the stored log. Returns null for missing or corrupt data, so the caller starts with an empty log. */
export function parseFeedingLog(raw: string | null): FeedingEntry[] | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length > MAX_FEEDING_LOG || !data.every(isFeedingEntry)) return null;
  return data.map((e) => ({ at: e.at, ratio: { ...e.ratio }, tempC: e.tempC, flour: e.flour }));
}

export function serializeFeedingLog(log: readonly FeedingEntry[]): string {
  return JSON.stringify(log.map((e) => ({ at: e.at, ratio: e.ratio, tempC: e.tempC, flour: e.flour })));
}

/** Hours between each entry and the one before it. The first entry has null. A clock change gives 0, never a negative value. */
export function feedingIntervals(log: readonly FeedingEntry[]): (number | null)[] {
  return log.map((e, i) => (i === 0 ? null : Math.max(0, new Date(e.at).getTime() - new Date(log[i - 1].at).getTime()) / 3_600_000));
}
