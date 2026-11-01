import type Stripe from 'stripe';
import { findZone, normalisePostcode, type DeliveryRules } from '../src/lib/order-rules';

/**
 * match: the delivery address has the postcode the customer checked.
 * same_zone: a different postcode in the same delivery zone, so the fee paid is still right.
 * mismatch: a different zone, outside the delivery area, or no usable postcode.
 */
export type AddressCheck = 'match' | 'same_zone' | 'mismatch';
export type OrderStatus = 'paid' | 'awaiting_payment' | 'payment_failed';

export interface OrderItem {
  name: string;
  itemId: string | null;
  variantId: string | null;
  quantity: number;
  unitAmountPence: number;
  totalPence: number;
}

export interface OrderAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface OrderRecord {
  orderId: string;
  status: OrderStatus;
  livemode: boolean;
  createdAt: string;
  updatedAt: string;
  deliveryDate: string;
  deliveryZone: string | null;
  checkedPostcode: string | null;
  shippingPostcode: string | null;
  addressCheck: AddressCheck;
  notes: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingName: string | null;
  shippingAddress: OrderAddress | null;
  items: OrderItem[];
  currency: string;
  subtotalPence: number;
  deliveryPence: number;
  totalPence: number;
  paymentIntentId: string | null;
  /** Set once the Stripe flag and any alert have been sent. */
  processedAt?: string;
}

export function checkAddress(
  checked: string | null | undefined,
  shipping: string | null | undefined,
  rules: DeliveryRules,
): { check: AddressCheck; checkedPostcode: string | null; shippingPostcode: string | null } {
  const checkedPostcode = checked ? normalisePostcode(checked) : null;
  const shippingPostcode = shipping ? normalisePostcode(shipping) : null;
  if (!checkedPostcode || !shippingPostcode) return { check: 'mismatch', checkedPostcode, shippingPostcode };
  if (checkedPostcode === shippingPostcode) return { check: 'match', checkedPostcode, shippingPostcode };
  const a = findZone(checkedPostcode, rules);
  const b = findZone(shippingPostcode, rules);
  const check = a && b && a.id === b.id ? 'same_zone' : 'mismatch';
  return { check, checkedPostcode, shippingPostcode };
}

export function statusFromSession(session: Stripe.Checkout.Session): OrderStatus {
  return session.payment_status === 'unpaid' ? 'awaiting_payment' : 'paid';
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

function lineItem(li: Stripe.LineItem): OrderItem {
  const product = li.price?.product;
  const meta = product && typeof product === 'object' && 'metadata' in product ? product.metadata : {};
  return {
    name: li.description ?? 'Item',
    itemId: meta.item_id ?? null,
    variantId: meta.variant_id ?? null,
    quantity: li.quantity ?? 0,
    unitAmountPence: li.price?.unit_amount ?? 0,
    totalPence: li.amount_total,
  };
}

/** Expects a session from `retrieveSessionWithItems(..., { products: true })`. */
export function buildOrderRecord(session: Stripe.Checkout.Session, rules: DeliveryRules, now: Date): OrderRecord {
  const meta = session.metadata ?? {};
  const shipping = session.collected_information?.shipping_details ?? null;
  const addr = shipping?.address ?? null;
  const { check, checkedPostcode, shippingPostcode } = checkAddress(meta.delivery_postcode, addr?.postal_code, rules);
  const customer = session.customer_details;

  return {
    orderId: session.id,
    status: statusFromSession(session),
    livemode: session.livemode,
    createdAt: new Date(session.created * 1000).toISOString(),
    updatedAt: now.toISOString(),
    // deliveryDate is an index key, so it can never be empty.
    deliveryDate: meta.delivery_date || 'unknown',
    deliveryZone: meta.delivery_zone ?? null,
    checkedPostcode,
    shippingPostcode,
    addressCheck: check,
    notes: meta.customer_notes ?? null,
    customerName: customer?.name ?? null,
    customerEmail: customer?.email ?? null,
    customerPhone: customer?.phone ?? null,
    shippingName: shipping?.name ?? null,
    shippingAddress: addr
      ? {
          line1: addr.line1 ?? null,
          line2: addr.line2 ?? null,
          city: addr.city ?? null,
          postalCode: addr.postal_code ?? null,
          country: addr.country ?? null,
        }
      : null,
    items: (session.line_items?.data ?? []).map(lineItem),
    currency: session.currency ?? 'gbp',
    subtotalPence: session.amount_subtotal ?? 0,
    deliveryPence: session.shipping_cost?.amount_total ?? 0,
    totalPence: session.amount_total ?? 0,
    paymentIntentId: idOf(session.payment_intent),
  };
}
