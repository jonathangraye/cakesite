import Stripe from 'stripe';
import { loadStripeKey, loadWebhookSecret } from './stripe-key';

let client: Stripe | undefined;
let webhookSecret: string | undefined;

export async function getStripe(): Promise<Stripe> {
  client ??= new Stripe(await loadStripeKey());
  return client;
}

/**
 * Expanding line_items on a session only returns the first 10, and orders can have more lines,
 * so fetch them separately. Orders are capped well below 100 lines.
 */
export async function retrieveSessionWithItems(
  stripe: Stripe,
  id: string,
  opts: { products?: boolean } = {},
): Promise<Stripe.Checkout.Session> {
  const [session, lineItems] = await Promise.all([
    stripe.checkout.sessions.retrieve(id),
    stripe.checkout.sessions.listLineItems(id, {
      limit: 100,
      ...(opts.products ? { expand: ['data.price.product'] } : {}),
    }),
  ]);
  return { ...session, line_items: lineItems };
}

export async function getWebhookSecret(): Promise<string> {
  webhookSecret ??= await loadWebhookSecret();
  return webhookSecret;
}
