import type Stripe from 'stripe';
import { normalisePostcode } from '../src/lib/order-rules';

export const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{10,250}$/;

/** How long after checkout the success-page summary stays available. */
export const SUMMARY_MAX_AGE_DAYS = 30;

/** What the success page may show. Deliberately excludes name, email, phone and full address. */
export interface OrderSummary {
  paymentStatus: 'paid' | 'processing';
  items: { name: string; quantity: number; totalPence: number }[];
  subtotalPence: number;
  deliveryPence: number;
  totalPence: number;
  deliveryDate: string | null;
  postcodeDistrict: string | null;
}

export function summariseSession(session: Stripe.Checkout.Session, now: Date = new Date()): OrderSummary | null {
  if (session.status !== 'complete') return null;
  const ageDays = (now.getTime() / 1000 - session.created) / 86_400;
  if (ageDays > SUMMARY_MAX_AGE_DAYS) return null;

  const meta = session.metadata ?? {};
  const postcode = normalisePostcode(meta.delivery_postcode ?? '');
  return {
    paymentStatus: session.payment_status === 'unpaid' ? 'processing' : 'paid',
    items: (session.line_items?.data ?? []).map((li) => ({
      name: li.description ?? 'Item',
      quantity: li.quantity ?? 0,
      totalPence: li.amount_total,
    })),
    subtotalPence: session.amount_subtotal ?? 0,
    deliveryPence: session.shipping_cost?.amount_total ?? 0,
    totalPence: session.amount_total ?? 0,
    deliveryDate: meta.delivery_date ?? null,
    postcodeDistrict: postcode ? postcode.split(' ')[0] : null,
  };
}
