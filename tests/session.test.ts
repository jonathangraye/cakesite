import { describe, expect, it } from 'vitest';
import { buildSessionParams } from '../lambda/session';
import type { ValidOrder } from '../src/lib/order-rules';

const order: ValidOrder = {
  lines: [
    { id: 'cake', variantId: '6-inch', name: 'Cake', variantLabel: '6 inch', unitPence: 2800, qty: 2 },
  ],
  subtotalPence: 5600,
  zone: { id: 'zone-a', name: 'Zone A', feePence: 500, districts: ['BS1'] },
  postcode: 'BS1 4DJ',
  deliveryDate: '2026-11-06',
  notes: 'Ring the bell',
};

describe('buildSessionParams', () => {
  const p = buildSessionParams(order, 'https://cake.graye.co.uk');

  it('charges in GBP using catalog prices', () => {
    expect(p.mode).toBe('payment');
    expect(p.currency).toBe('gbp');
    expect(p.line_items).toEqual([
      {
        quantity: 2,
        price_data: {
          currency: 'gbp',
          unit_amount: 2800,
          product_data: { name: 'Cake (6 inch)', metadata: { item_id: 'cake', variant_id: '6-inch' } },
        },
      },
    ]);
  });

  it('adds the zone delivery fee and UK-only addresses', () => {
    expect(p.shipping_address_collection).toEqual({ allowed_countries: ['GB'] });
    expect(p.shipping_options?.[0]?.shipping_rate_data).toMatchObject({
      display_name: 'Local delivery: Zone A',
      fixed_amount: { amount: 500, currency: 'gbp' },
    });
  });

  it('records the delivery details for the seller', () => {
    const expected = {
      delivery_date: '2026-11-06',
      delivery_postcode: 'BS1 4DJ',
      delivery_zone: 'zone-a',
      customer_notes: 'Ring the bell',
    };
    expect(p.metadata).toEqual(expected);
    expect(p.payment_intent_data?.metadata).toEqual(expected);
    // ICU versions differ on the comma after the weekday.
    expect(p.payment_intent_data?.description).toMatch(/^Delivery Friday,? 6 November 2026 to BS1 4DJ$/);
  });

  it('omits empty notes and returns to the site', () => {
    const q = buildSessionParams({ ...order, notes: '' }, 'https://cake.graye.co.uk');
    expect(q.metadata).not.toHaveProperty('customer_notes');
    expect(q.success_url).toBe('https://cake.graye.co.uk/order/success/?session_id={CHECKOUT_SESSION_ID}');
    expect(q.cancel_url).toBe('https://cake.graye.co.uk/order/cancelled/');
  });
});
