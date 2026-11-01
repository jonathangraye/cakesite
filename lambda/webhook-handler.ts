import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type Stripe from 'stripe';
import deliveryJson from '../src/data/delivery.json';
import type { DeliveryRules } from '../src/lib/order-rules';
import { errorSummary, json } from './http';
import { getStripe, getWebhookSecret } from './stripe-client';
import { stripeMode } from './stripe-key';
import { processEvent, type WebhookDeps } from './webhook';

const rules: DeliveryRules = deliveryJson;
const MAX_BODY_BYTES = 1_000_000;

export interface HandlerOptions {
  verify: (payload: string | Buffer, signature: string) => Promise<Stripe.Event>;
  deps: () => Promise<WebhookDeps>;
  live: boolean;
}

export function createWebhookHandler(opts: HandlerOptions) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const signature = event.headers?.['stripe-signature'];
    if (!signature) return json(400, { error: 'Missing Stripe signature.' });

    // Signatures are computed over the exact bytes Stripe sent.
    const payload = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64') : (event.body ?? '');
    if (Buffer.byteLength(payload) > MAX_BODY_BYTES) return json(413, { error: 'Payload too large.' });

    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = await opts.verify(payload, signature);
    } catch {
      console.warn('webhook_bad_signature');
      return json(400, { error: 'Invalid signature.' });
    }

    if (stripeEvent.livemode !== opts.live) {
      console.warn('webhook_wrong_mode', stripeEvent.id);
      return json(200, { received: true, ignored: 'wrong mode' });
    }

    try {
      const result = await processEvent(stripeEvent, await opts.deps());
      console.log('webhook_ok', stripeEvent.type, stripeEvent.id, result);
      return json(200, { received: true });
    } catch (err) {
      console.error('webhook_failed', stripeEvent.type, stripeEvent.id, errorSummary(err));
      return json(500, { error: 'Processing failed.' });
    }
  };
}

let deps: WebhookDeps | undefined;

async function productionDeps(): Promise<WebhookDeps> {
  if (deps) return deps;
  const stripe = await getStripe();
  const table = process.env.ORDERS_TABLE;
  const topic = process.env.ALERT_TOPIC_ARN;

  let store: WebhookDeps['store'];
  let alerts: WebhookDeps['alerts'];
  if (table && topic) {
    const [{ dynamoStore }, { snsAlerts }] = await Promise.all([import('./dynamo-store'), import('./sns-alerts')]);
    store = dynamoStore(table);
    alerts = snsAlerts(topic);
  } else if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error('ORDERS_TABLE and ALERT_TOPIC_ARN must be set in Lambda');
  } else {
    const { memoryStore, consoleAlerts } = await import('./dev-adapters');
    store = memoryStore();
    alerts = consoleAlerts();
  }

  deps = {
    stripe: {
      retrieveSession: (id) =>
        stripe.checkout.sessions.retrieve(id, { expand: ['line_items.data.price.product'] }),
      updatePaymentIntent: (id, params) => stripe.paymentIntents.update(id, params),
    },
    store,
    alerts,
    rules,
    now: () => new Date(),
  };
  return deps;
}

export const handler = createWebhookHandler({
  verify: async (payload, signature) =>
    (await getStripe()).webhooks.constructEventAsync(payload, signature, await getWebhookSecret()),
  deps: productionDeps,
  live: stripeMode() === 'live',
});
