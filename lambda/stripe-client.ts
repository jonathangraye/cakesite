import Stripe from 'stripe';
import { loadStripeKey, loadWebhookSecret } from './stripe-key';

let client: Stripe | undefined;
let webhookSecret: string | undefined;

export async function getStripe(): Promise<Stripe> {
  client ??= new Stripe(await loadStripeKey());
  return client;
}

export async function getWebhookSecret(): Promise<string> {
  webhookSecret ??= await loadWebhookSecret();
  return webhookSecret;
}
