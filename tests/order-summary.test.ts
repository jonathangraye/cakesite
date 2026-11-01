import { describe, expect, it } from 'vitest';
import { SESSION_ID_RE, summariseSession } from '../lambda/order-summary';
import { fakeSession } from './fixtures';

const now = new Date('2026-11-01T13:00:00Z');

describe('summariseSession', () => {
  it('returns only what the success page shows', () => {
    const s = summariseSession(fakeSession(), now);
    expect(s).toEqual({
      paymentStatus: 'paid',
      items: [{ name: 'Cake (6 inch)', quantity: 2, totalPence: 5600 }],
      subtotalPence: 5600,
      deliveryPence: 400,
      totalPence: 6000,
      deliveryDate: '2026-11-06',
      postcodeDistrict: 'XX1',
    });
    const text = JSON.stringify(s);
    for (const secret of ['Sam', 'sam@example.com', '7700900000', 'Test Street', '1AA', 'Ring the bell', 'pi_test']) {
      expect(text).not.toContain(secret);
    }
  });

  it('shows delayed payments as processing', () => {
    expect(summariseSession(fakeSession({ payment_status: 'unpaid' }), now)?.paymentStatus).toBe('processing');
  });

  it('hides unfinished and old sessions', () => {
    expect(summariseSession(fakeSession({ status: 'open' }), now)).toBeNull();
    expect(summariseSession(fakeSession({ status: 'expired' }), now)).toBeNull();
    expect(summariseSession(fakeSession(), new Date('2026-12-02T13:00:00Z'))).toBeNull();
  });
});

describe('SESSION_ID_RE', () => {
  it('accepts Checkout Session ids only', () => {
    expect(SESSION_ID_RE.test('cs_test_a1b2c3d4e5f6g7h8')).toBe(true);
    expect(SESSION_ID_RE.test('cs_live_a1b2c3d4e5f6g7h8')).toBe(true);
    expect(SESSION_ID_RE.test('pi_test_a1b2c3d4e5f6g7h8')).toBe(false);
    expect(SESSION_ID_RE.test('cs_test_short')).toBe(false);
    expect(SESSION_ID_RE.test('cs_test_a1b2c3d4e5/../x')).toBe(false);
  });
});
