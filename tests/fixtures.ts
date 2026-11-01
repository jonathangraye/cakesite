import type Stripe from 'stripe';

type SessionOverrides = Omit<Partial<Stripe.Checkout.Session>, 'metadata'> & {
  metadata?: Record<string, string>;
  shippingPostcode?: string | null;
};

/** A completed Checkout Session as Stripe returns it with line items and products expanded. */
export function fakeSession(overrides: SessionOverrides = {}): Stripe.Checkout.Session {
  const { shippingPostcode = 'XX1 1AA', metadata, ...rest } = overrides;
  const session = {
    id: 'cs_test_a1b2c3d4e5f6g7h8',
    object: 'checkout.session',
    status: 'complete',
    payment_status: 'paid',
    livemode: false,
    created: Date.UTC(2026, 10, 1, 12) / 1000,
    currency: 'gbp',
    amount_subtotal: 5600,
    amount_total: 6000,
    shipping_cost: { amount_total: 400 },
    payment_intent: 'pi_test_123',
    metadata: {
      delivery_date: '2026-11-06',
      delivery_postcode: 'XX1 1AA',
      delivery_zone: 'zone-a',
      customer_notes: 'Ring the bell',
      ...metadata,
    },
    customer_details: { name: 'Sam Baker', email: 'sam@example.com', phone: '+447700900000' },
    collected_information: {
      shipping_details:
        shippingPostcode === null
          ? null
          : {
              name: 'Sam Baker',
              address: { line1: '1 Test Street', line2: null, city: 'Testville', postal_code: shippingPostcode, country: 'GB' },
            },
    },
    line_items: {
      object: 'list',
      data: [
        {
          description: 'Cake (6 inch)',
          quantity: 2,
          amount_total: 5600,
          price: { unit_amount: 2800, product: { id: 'prod_1', metadata: { item_id: 'cake', variant_id: '6-inch' } } },
        },
      ],
    },
    ...rest,
  };
  return session as unknown as Stripe.Checkout.Session;
}
