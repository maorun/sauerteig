import { describe, expect, it } from 'vitest';
import {
  type Validated,
  validateAmounts,
  validateFedTime,
  validateInventory,
  validateInventoryForRefresh,
  validateRatio,
  validateStart,
  validateTargetOrder,
  validateTargetTimes,
  validateTemp,
  validateTotal,
} from './validate';

const err = (r: Validated<unknown>): string => {
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
};

describe('validateRatio', () => {
  it('accepts a valid ratio and a decimal comma', () => {
    expect(validateRatio('1', '2', '0,5')).toEqual({ ok: true, value: { flour: 1, water: 2, starter: 0.5 } });
    expect(validateRatio('1000', '1', '1').ok).toBe(true);
  });
  it('rejects empty, zero, negative, text and values above the maximum', () => {
    for (const bad of [['', '1', '1'], ['0', '1', '1'], ['1', '-1', '1'], ['1', '1', 'x'], ['1001', '1', '1']]) {
      expect(err(validateRatio(bad[0], bad[1], bad[2]))).toBe('Mehl, Wasser und ASG müssen Zahlen zwischen 0 und 1000 sein.');
    }
  });
});

describe('validateTemp', () => {
  it('accepts the limits 4 °C and 38 °C', () => {
    expect(validateTemp('4')).toEqual({ ok: true, value: 4 });
    expect(validateTemp('38')).toEqual({ ok: true, value: 38 });
  });
  it('rejects values outside the limits, empty and text', () => {
    for (const bad of ['3.9', '38.1', '', 'abc']) {
      expect(err(validateTemp(bad))).toBe('Temperatur muss zwischen 4 und 38 °C liegen.');
    }
  });
});

describe('validateTotal', () => {
  it('accepts 1 g and the maximum', () => {
    expect(validateTotal('1').ok).toBe(true);
    expect(validateTotal('1000000')).toEqual({ ok: true, value: 1_000_000 });
  });
  it('rejects zero, negative, above the maximum and text', () => {
    for (const bad of ['0', '-5', '1000001', 'abc']) {
      expect(err(validateTotal(bad))).toBe('Menge muss zwischen 1 und 1000000 g liegen.');
    }
  });
  it('treats an empty value as 0 and rejects it', () => {
    expect(err(validateTotal(''))).toBe('Menge muss zwischen 1 und 1000000 g liegen.');
  });
});

describe('validateStart', () => {
  it('accepts a local date time', () => {
    const r = validateStart('2026-11-22T08:30');
    expect(r.ok && r.value.getHours()).toBe(8);
  });
  it('rejects empty and invalid values', () => {
    expect(err(validateStart(''))).toBe('Startzeit ungültig.');
    expect(err(validateStart('nope'))).toBe('Startzeit ungültig.');
  });
});

describe('validateInventory', () => {
  it('accepts 0 and the maximum', () => {
    expect(validateInventory('0')).toEqual({ ok: true, value: 0 });
    expect(validateInventory('1000000').ok).toBe(true);
  });
  it('rejects negative, above the maximum and text', () => {
    for (const bad of ['-1', '1000001', 'abc', '1e3']) {
      expect(err(validateInventory(bad))).toBe('Vorrat muss zwischen 0 und 1000000 g liegen.');
    }
  });
  it('uses another text for the refresh button', () => {
    expect(validateInventoryForRefresh('50')).toEqual({ ok: true, value: 50 });
    for (const bad of ['', '-1', '1000001']) {
      expect(err(validateInventoryForRefresh(bad))).toBe('Zuerst Vorrat zwischen 0 und 1000000 g eingeben.');
    }
  });
});

describe('validateAmounts', () => {
  it('accepts amounts of at least 1 g', () => {
    expect(validateAmounts({ flour: 1, water: 1, starter: 1 }).ok).toBe(true);
  });
  it('rejects an amount below 1 g', () => {
    for (const a of [{ flour: 0, water: 1, starter: 1 }, { flour: 1, water: 0, starter: 1 }, { flour: 1, water: 1, starter: 0 }]) {
      expect(err(validateAmounts(a))).toBe('Menge zu klein für dieses Verhältnis. Menge erhöhen.');
    }
  });
});

describe('validateTargetTimes and validateTargetOrder', () => {
  const now = new Date(2026, 10, 22, 8, 30, 45, 500);
  it('uses now without seconds for an empty start', () => {
    const r = validateTargetTimes('2026-11-23T08:00', '', now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.start.getTime()).toBe(new Date(2026, 10, 22, 8, 30, 0, 0).getTime());
      expect(r.value.start).not.toBe(now);
    }
  });
  it('rejects an invalid target or start', () => {
    expect(err(validateTargetTimes('x', '', now))).toBe('Zielzeit oder Startzeit ungültig.');
    expect(err(validateTargetTimes('2026-11-23T08:00', 'x', now))).toBe('Zielzeit oder Startzeit ungültig.');
  });
  it('rejects a target that is not after the start', () => {
    const d = new Date(2026, 10, 22, 9, 0);
    expect(err(validateTargetOrder(d, d))).toBe('Zielzeit muss nach der Startzeit liegen.');
    expect(validateTargetOrder(new Date(d.getTime() + 60_000), d).ok).toBe(true);
  });
});

describe('validateFedTime', () => {
  const now = new Date(2026, 10, 22, 8, 30);
  it('uses now for an empty value', () => {
    const r = validateFedTime('', now);
    expect(r.ok && r.value.getTime()).toBe(now.getTime());
  });
  it('rejects an invalid value', () => {
    expect(err(validateFedTime('x', now))).toBe('Zeit des Fütterns ungültig.');
  });
});
