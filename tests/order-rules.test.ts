import { describe, expect, it } from 'vitest';
import type { Catalog } from '../src/lib/catalog';
import {
  checkDeliveryDate,
  deliveryDaysRange,
  findZone,
  normalisePostcode,
  ukToday,
  validateOrder,
  type DeliveryRules,
} from '../src/lib/order-rules';

const rules: DeliveryRules = {
  minLeadDays: 2,
  maxAdvanceDays: 30,
  deliveryWeekdays: [2, 3, 4, 5, 6],
  blackoutDates: ['2026-11-12'],
  minOrderPence: 1500,
  maxQuantityPerLine: 10,
  maxNotesLength: 50,
  zones: [{ id: 'zone-a', name: 'Zone A', feePence: 500, districts: ['BS1', 'bs2'] }],
};

const catalog: Catalog = {
  generatedAt: '',
  items: {
    cake: {
      id: 'cake', name: 'Cake', category: 'cakes', url: '/menu/cake/', available: true, leadTimeDays: 3,
      variants: [{ id: '6-inch', label: '6 inch', pricePence: 2800 }],
    },
    cookie: {
      id: 'cookie', name: 'Cookie', category: 'cookies', url: '/menu/cookie/', available: true, leadTimeDays: 1,
      variants: [{ id: 'single', label: 'Single', pricePence: 300 }],
    },
    gone: {
      id: 'gone', name: 'Gone', category: 'cakes', url: '/menu/gone/', available: false, leadTimeDays: 2,
      variants: [{ id: 'one', label: 'One', pricePence: 2000 }],
    },
  },
};

// Monday 2 November 2026, 10:00 UK time.
const now = new Date('2026-11-02T10:00:00Z');
const valid = {
  items: [{ id: 'cake', variant: '6-inch', qty: 1 }],
  postcode: 'bs1 4dj',
  deliveryDate: '2026-11-06',
  notes: '  Ring the bell  ',
};

const errorsFor = (input: unknown) => {
  const r = validateOrder(input, catalog, rules, now);
  return r.ok ? [] : r.errors;
};

describe('normalisePostcode', () => {
  it('formats valid postcodes', () => {
    expect(normalisePostcode('bs14dj')).toBe('BS1 4DJ');
    expect(normalisePostcode(' sw1a  1aa ')).toBe('SW1A 1AA');
    expect(normalisePostcode('M1 1AE')).toBe('M1 1AE');
  });
  it('rejects invalid postcodes', () => {
    expect(normalisePostcode('hello')).toBeNull();
    expect(normalisePostcode('BS1')).toBeNull();
    expect(normalisePostcode('')).toBeNull();
  });
});

describe('findZone', () => {
  it('matches the full district, case-insensitively', () => {
    expect(findZone('BS2 1AA', rules)?.id).toBe('zone-a');
    expect(findZone('BS10 1AA', rules)).toBeNull();
    expect(findZone('BS3 1AA', rules)).toBeNull();
  });
});

describe('ukToday', () => {
  it('uses UK time, not UTC', () => {
    expect(ukToday(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    expect(ukToday(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });
});

describe('checkDeliveryDate', () => {
  it('accepts a delivery day after the lead time', () => {
    expect(checkDeliveryDate('2026-11-05', 3, rules, now)).toBeNull();
  });
  it('rejects dates inside the lead time', () => {
    expect(checkDeliveryDate('2026-11-04', 3, rules, now)).toMatch(/earliest/);
    expect(checkDeliveryDate('2026-11-03', 0, rules, now)).toMatch(/earliest/);
  });
  it('rejects non-delivery weekdays, blackout dates and far-off dates', () => {
    expect(checkDeliveryDate('2026-11-08', 3, rules, now)).toMatch(/Sundays/);
    expect(checkDeliveryDate('2026-11-12', 3, rules, now)).toMatch(/aren't delivering/);
    expect(checkDeliveryDate('2026-12-05', 3, rules, now)).toMatch(/30 days ahead/);
  });
  it('rejects malformed and impossible dates', () => {
    expect(checkDeliveryDate('06/11/2026', 3, rules, now)).toMatch(/Choose/);
    expect(checkDeliveryDate('2026-02-30', 3, rules, now)).toMatch(/Choose/);
  });
});

describe('validateOrder', () => {
  it('accepts a valid order and prices it from the catalog', () => {
    const r = validateOrder(valid, catalog, rules, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.subtotalPence).toBe(2800);
    expect(r.order.postcode).toBe('BS1 4DJ');
    expect(r.order.zone.id).toBe('zone-a');
    expect(r.order.notes).toBe('Ring the bell');
    expect(r.order.lines[0]).toMatchObject({ name: 'Cake', variantLabel: '6 inch', unitPence: 2800, qty: 1 });
  });

  it('ignores any price the browser sends', () => {
    const r = validateOrder({ ...valid, items: [{ id: 'cake', variant: '6-inch', qty: 1, pricePence: 1 }] }, catalog, rules, now);
    expect(r.ok && r.order.subtotalPence).toBe(2800);
  });

  it('rejects bad input shapes', () => {
    expect(errorsFor(null)).toEqual(['Invalid order.']);
    expect(errorsFor('order')).toEqual(['Invalid order.']);
    expect(errorsFor({ ...valid, items: [] })).toContain('Your basket is empty.');
    expect(errorsFor({ ...valid, notes: 42 })).toContain('Invalid notes.');
  });

  it('rejects unknown, unavailable and prototype-key items', () => {
    for (const id of ['nope', 'gone', '__proto__', 'constructor']) {
      expect(errorsFor({ ...valid, items: [{ id, variant: 'one', qty: 1 }] })[0]).toMatch(/no longer available/);
    }
    expect(errorsFor({ ...valid, items: [{ id: 'cake', variant: '12-inch', qty: 1 }] })[0]).toMatch(/option/);
  });

  it('rejects bad quantities and duplicate lines', () => {
    for (const qty of [0, -1, 1.5, 11, '2']) {
      expect(errorsFor({ ...valid, items: [{ id: 'cake', variant: '6-inch', qty }] })[0]).toMatch(/quantity/);
    }
    const dup = { id: 'cake', variant: '6-inch', qty: 1 };
    expect(errorsFor({ ...valid, items: [dup, dup] })[0]).toMatch(/twice/);
  });

  it('rejects postcodes outside the delivery area', () => {
    expect(errorsFor({ ...valid, postcode: 'M1 1AE' })).toContain("Sorry, we don't deliver to M1 1AE yet.");
    expect(errorsFor({ ...valid, postcode: 'nope' })).toContain('Enter a valid UK postcode.');
  });

  it("uses the longest lead time in the basket", () => {
    const items = [{ id: 'cookie', variant: 'single', qty: 5 }, { id: 'cake', variant: '6-inch', qty: 1 }];
    expect(errorsFor({ ...valid, items, deliveryDate: '2026-11-04' })[0]).toMatch(/earliest/);
    expect(errorsFor({ ...valid, items, deliveryDate: '2026-11-05' })).toEqual([]);
  });

  it('enforces the minimum order and notes length', () => {
    expect(errorsFor({ ...valid, items: [{ id: 'cookie', variant: 'single', qty: 2 }] })[0]).toMatch(/minimum order is £15.00/);
    expect(errorsFor({ ...valid, notes: 'x'.repeat(51) })[0]).toMatch(/up to 50/);
  });
});

describe('deliveryDaysRange', () => {
  const days = (deliveryWeekdays: number[]) => deliveryDaysRange({ ...rules, deliveryWeekdays });
  it('shortens a run of days to a range', () => {
    expect(days([2, 3, 4, 5, 6])).toBe('Tuesday to Saturday');
    expect(days([6, 4, 5])).toBe('Thursday to Saturday');
  });
  it('lists other patterns', () => {
    expect(days([5, 6])).toBe('Fridays and Saturdays');
    expect(days([1, 3, 5])).toBe('Mondays, Wednesdays and Fridays');
    expect(days([1, 2, 3, 4, 5, 6, 7])).toBe('every day');
  });
});
