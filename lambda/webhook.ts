import type Stripe from 'stripe';
import { findZone, formatDeliveryDate, type DeliveryRules } from '../src/lib/order-rules';
import { buildOrderRecord, type OrderRecord, type OrderStatus } from './order-record';

export interface OrderStore {
  /** Returns false if the order already exists. */
  createOrder(record: OrderRecord): Promise<boolean>;
  getOrder(orderId: string): Promise<OrderRecord | null>;
  markProcessed(orderId: string, at: Date): Promise<void>;
  /** Throws if the order doesn't exist yet, so Stripe retries the event later. */
  updateStatus(orderId: string, status: OrderStatus, at: Date): Promise<void>;
}

export interface Alerts {
  send(subject: string, message: string): Promise<void>;
}

export interface StripeApi {
  retrieveSession(id: string): Promise<Stripe.Checkout.Session>;
  updatePaymentIntent(id: string, params: Stripe.PaymentIntentUpdateParams): Promise<unknown>;
}

export interface WebhookDeps {
  stripe: StripeApi;
  store: OrderStore;
  alerts: Alerts;
  rules: DeliveryRules;
  now: () => Date;
}

export type WebhookResult = 'stored' | 'resumed' | 'duplicate' | 'updated' | 'ignored';

const shortId = (id: string) => id.slice(-8);

function dashboardUrl(record: OrderRecord): string {
  const base = `https://dashboard.stripe.com${record.livemode ? '' : '/test'}`;
  return record.paymentIntentId ? `${base}/payments/${record.paymentIntentId}` : `${base}/checkout/sessions`;
}

function zoneLabel(postcode: string | null, rules: DeliveryRules): string {
  if (!postcode) return 'no valid postcode';
  const zone = findZone(postcode, rules);
  return `${postcode} (${zone ? zone.name : 'outside the delivery area'})`;
}

export function mismatchAlert(record: OrderRecord, rules: DeliveryRules): { subject: string; message: string } {
  return {
    subject: `cakesite: check the delivery address for order ending ${shortId(record.orderId)}`,
    message: [
      "A paid order's delivery address is in a different delivery zone from the postcode the customer checked.",
      '',
      `Order: ending ${shortId(record.orderId)}`,
      `Delivery date: ${formatDeliveryDate(record.deliveryDate)}`,
      `Postcode checked on the site: ${zoneLabel(record.checkedPostcode, rules)}`,
      `Postcode on the delivery address: ${zoneLabel(record.shippingPostcode, rules)}`,
      `Customer: ${record.customerName ?? 'unknown'}`,
      '',
      `Open the payment in Stripe: ${dashboardUrl(record)}`,
      "Contact the customer before baking, and refund if you can't deliver.",
    ].join('\n'),
  };
}

function failedAlert(record: OrderRecord): { subject: string; message: string } {
  return {
    subject: `cakesite: payment failed for order ending ${shortId(record.orderId)}`,
    message: [
      'A delayed payment for this order failed, so it has not been paid.',
      '',
      `Order: ending ${shortId(record.orderId)}`,
      `Delivery date: ${formatDeliveryDate(record.deliveryDate)}`,
      `Customer: ${record.customerName ?? 'unknown'}`,
      '',
      `Open it in Stripe: ${dashboardUrl(record)}`,
      "Don't bake this order unless the customer pays another way.",
    ].join('\n'),
  };
}

async function flagAndAlert(record: OrderRecord, deps: WebhookDeps): Promise<void> {
  if (record.paymentIntentId) {
    const params: Stripe.PaymentIntentUpdateParams = { metadata: { address_check: record.addressCheck } };
    if (record.addressCheck === 'mismatch') {
      params.description = `[CHECK ADDRESS] Delivery ${formatDeliveryDate(record.deliveryDate)} to ${record.checkedPostcode ?? 'unknown'}`;
    }
    await deps.stripe.updatePaymentIntent(record.paymentIntentId, params);
  }
  if (record.addressCheck === 'mismatch') {
    const { subject, message } = mismatchAlert(record, deps.rules);
    await deps.alerts.send(subject, message);
  }
}

/**
 * Stripe delivers events at least once and retries on any failure, so every step is safe to repeat:
 * the order is written once, and the Stripe flag and alert are only marked done after they succeed.
 */
export async function processEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookResult> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = await deps.stripe.retrieveSession(event.data.object.id);
      let record = buildOrderRecord(session, deps.rules, deps.now());
      let result: WebhookResult = 'stored';
      if (!(await deps.store.createOrder(record))) {
        const existing = await deps.store.getOrder(record.orderId);
        if (existing?.processedAt) return 'duplicate';
        record = existing ?? record;
        result = 'resumed';
      }
      await flagAndAlert(record, deps);
      await deps.store.markProcessed(record.orderId, deps.now());
      return result;
    }
    case 'checkout.session.async_payment_succeeded': {
      await deps.store.updateStatus(event.data.object.id, 'paid', deps.now());
      return 'updated';
    }
    case 'checkout.session.async_payment_failed': {
      await deps.store.updateStatus(event.data.object.id, 'payment_failed', deps.now());
      const record = await deps.store.getOrder(event.data.object.id);
      if (record) {
        const { subject, message } = failedAlert(record);
        await deps.alerts.send(subject, message);
      }
      return 'updated';
    }
    default:
      return 'ignored';
  }
}
