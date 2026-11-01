import type Stripe from 'stripe';
import { formatDeliveryDate, type ValidOrder } from '../src/lib/order-rules';

export function buildSessionParams(order: ValidOrder, siteUrl: string): Stripe.Checkout.SessionCreateParams {
  const prettyDate = formatDeliveryDate(order.deliveryDate);
  const metadata: Record<string, string> = {
    delivery_date: order.deliveryDate,
    delivery_postcode: order.postcode,
    delivery_zone: order.zone.id,
  };
  if (order.notes) metadata.customer_notes = order.notes;

  return {
    mode: 'payment',
    currency: 'gbp',
    line_items: order.lines.map((l) => ({
      quantity: l.qty,
      price_data: {
        currency: 'gbp',
        unit_amount: l.unitPence,
        product_data: {
          name: `${l.name} (${l.variantLabel})`,
          metadata: { item_id: l.id, variant_id: l.variantId },
        },
      },
    })),
    shipping_address_collection: { allowed_countries: ['GB'] },
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: `Local delivery: ${order.zone.name}`,
          fixed_amount: { amount: order.zone.feePence, currency: 'gbp' },
        },
      },
    ],
    phone_number_collection: { enabled: true },
    custom_text: {
      // Stripe can't restrict addresses by postcode, so remind the customer here.
      shipping_address: {
        message: `Please use an address in ${order.postcode}, the postcode you checked. Preferred delivery date: ${prettyDate}.`,
      },
    },
    metadata,
    payment_intent_data: {
      description: `Delivery ${prettyDate} to ${order.postcode}`,
      metadata,
    },
    success_url: `${siteUrl}/order/success/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/order/cancelled/`,
  };
}
