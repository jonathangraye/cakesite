import { describe, expect, it } from 'vitest';
import { buildOrderRecord, checkAddress } from '../lambda/order-record';
import rules from '../src/data/delivery.json';
import { fakeSession } from './fixtures';

describe('checkAddress', () => {
  it('matches the same postcode however it is typed', () => {
    expect(checkAddress('XX1 1AA', 'xx11aa', rules)).toEqual({
      check: 'match',
      checkedPostcode: 'XX1 1AA',
      shippingPostcode: 'XX1 1AA',
    });
  });
  it('accepts a different postcode in the same zone', () => {
    expect(checkAddress('XX1 1AA', 'XX2 9ZZ', rules).check).toBe('same_zone');
  });
  it('flags a different zone, outside the area, or a missing postcode', () => {
    expect(checkAddress('XX1 1AA', 'XX3 1AA', rules).check).toBe('mismatch');
    expect(checkAddress('XX1 1AA', 'SW1A 1AA', rules).check).toBe('mismatch');
    expect(checkAddress('XX1 1AA', null, rules).check).toBe('mismatch');
    expect(checkAddress('XX1 1AA', 'not a postcode', rules).check).toBe('mismatch');
    expect(checkAddress(undefined, 'XX1 1AA', rules).check).toBe('mismatch');
  });
});

describe('buildOrderRecord', () => {
  const now = new Date('2026-11-01T12:05:00Z');

  it('captures the order, delivery and customer details', () => {
    const r = buildOrderRecord(fakeSession(), rules, now);
    expect(r).toMatchObject({
      orderId: 'cs_test_a1b2c3d4e5f6g7h8',
      status: 'paid',
      livemode: false,
      createdAt: '2026-11-01T12:00:00.000Z',
      updatedAt: '2026-11-01T12:05:00.000Z',
      deliveryDate: '2026-11-06',
      deliveryZone: 'zone-a',
      addressCheck: 'match',
      notes: 'Ring the bell',
      customerEmail: 'sam@example.com',
      shippingAddress: { line1: '1 Test Street', postalCode: 'XX1 1AA', country: 'GB' },
      subtotalPence: 5600,
      deliveryPence: 400,
      totalPence: 6000,
      paymentIntentId: 'pi_test_123',
    });
    expect(r.items).toEqual([
      { name: 'Cake (6 inch)', itemId: 'cake', variantId: '6-inch', quantity: 2, unitAmountPence: 2800, totalPence: 5600 },
    ]);
    expect(r.processedAt).toBeUndefined();
  });

  it('marks delayed payments and address mismatches', () => {
    const r = buildOrderRecord(fakeSession({ payment_status: 'unpaid', shippingPostcode: 'XX3 1AA' }), rules, now);
    expect(r.status).toBe('awaiting_payment');
    expect(r.addressCheck).toBe('mismatch');
  });

  it('never leaves the delivery date index key empty', () => {
    const r = buildOrderRecord(fakeSession({ metadata: { delivery_date: '' } }), rules, now);
    expect(r.deliveryDate).toBe('unknown');
  });
});
