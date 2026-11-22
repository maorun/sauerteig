import {
  MAX_INVENTORY_G,
  MAX_RATIO_PART,
  MAX_TEMP_C,
  MAX_TOTAL_G,
  MIN_TEMP_C,
  parseInventoryGrams,
  parseRatioParts,
  type Amounts,
  type Ratio,
} from './calc';

/** Each check returns the valid value or the German error text. */
export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Validated<T> => ({ ok: true, value });
const fail = (error: string): Validated<never> => ({ ok: false, error });

export const AMOUNT_TOO_SMALL = 'Menge zu klein für dieses Verhältnis. Menge erhöhen.';

export function validateRatio(flour: string, water: string, starter: string): Validated<Ratio> {
  const ratio = parseRatioParts(flour, water, starter);
  return ratio ? ok(ratio) : fail(`Mehl, Wasser und ASG müssen Zahlen zwischen 0 und ${MAX_RATIO_PART} sein.`);
}

export function validateTemp(value: string): Validated<number> {
  const temp = Number(value);
  if (!Number.isFinite(temp) || value === '' || temp < MIN_TEMP_C || temp > MAX_TEMP_C) {
    return fail(`Temperatur muss zwischen ${MIN_TEMP_C} und ${MAX_TEMP_C} °C liegen.`);
  }
  return ok(temp);
}

export function validateTotal(value: string): Validated<number> {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0 || total > MAX_TOTAL_G) {
    return fail(`Menge muss zwischen 1 und ${MAX_TOTAL_G} g liegen.`);
  }
  return ok(total);
}

export function validateStart(value: string): Validated<Date> {
  const start = new Date(value);
  return Number.isNaN(start.getTime()) ? fail('Startzeit ungültig.') : ok(start);
}

/** Checks a non-empty stock input. The caller handles the empty field. */
export function validateInventory(value: string): Validated<number> {
  const grams = parseInventoryGrams(value);
  return grams === null ? fail(`Vorrat muss zwischen 0 und ${MAX_INVENTORY_G} g liegen.`) : ok(grams);
}

/** Error text for the "refreshed" button, when the stock amount is missing or invalid. */
export function validateInventoryForRefresh(value: string): Validated<number> {
  const grams = parseInventoryGrams(value);
  return grams === null ? fail(`Zuerst Vorrat zwischen 0 und ${MAX_INVENTORY_G} g eingeben.`) : ok(grams);
}

export function validateAmounts(amounts: Amounts): Validated<Amounts> {
  return amounts.flour < 1 || amounts.water < 1 || amounts.starter < 1 ? fail(AMOUNT_TOO_SMALL) : ok(amounts);
}

/** An empty start means "now". Seconds drop, because the tracker input has minute resolution. */
export function validateTargetTimes(target: string, start: string, now: Date): Validated<{ target: Date; start: Date }> {
  const targetDate = new Date(target);
  const startDate = start === '' ? new Date(now.getTime()) : new Date(start);
  startDate.setSeconds(0, 0);
  if (Number.isNaN(targetDate.getTime()) || Number.isNaN(startDate.getTime())) {
    return fail('Zielzeit oder Startzeit ungültig.');
  }
  return ok({ target: targetDate, start: startDate });
}

export function validateTargetOrder(target: Date, start: Date): Validated<true> {
  return target.getTime() <= start.getTime() ? fail('Zielzeit muss nach der Startzeit liegen.') : ok(true);
}

/** An empty fed time means "now". */
export function validateFedTime(value: string, now: Date): Validated<Date> {
  const fed = value === '' ? new Date(now.getTime()) : new Date(value);
  return Number.isNaN(fed.getTime()) ? fail('Zeit des Fütterns ungültig.') : ok(fed);
}
