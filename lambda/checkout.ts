import { readFileSync } from 'node:fs';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import Stripe from 'stripe';
import deliveryJson from '../src/data/delivery.json';
import type { Catalog } from '../src/lib/catalog';
import { validateOrder, type DeliveryRules } from '../src/lib/order-rules';
import { buildSessionParams } from './session';
import { loadStripeKey } from './stripe-key';

const rules: DeliveryRules = deliveryJson;
const MAX_BODY_BYTES = 20_000;

let catalog: Catalog | undefined;
let stripe: Stripe | undefined;

function getCatalog(): Catalog {
  catalog ??= JSON.parse(readFileSync(new URL('./catalog.json', import.meta.url), 'utf8')) as Catalog;
  return catalog;
}

async function getStripe(): Promise<Stripe> {
  stripe ??= new Stripe(await loadStripeKey());
  return stripe;
}

// Never return 403/404: CloudFront swaps those for the site's 404 page.
function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : (event.body ?? '');
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(413, { errors: ['Order is too large.'] });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { errors: ['Invalid request.'] });
  }

  const result = validateOrder(body, getCatalog(), rules);
  if (!result.ok) return json(422, { errors: result.errors });

  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    console.error('checkout_failed: SITE_URL is not set');
    return json(500, { errors: ["We couldn't start payment. Please try again later."] });
  }

  try {
    const client = await getStripe();
    const session = await client.checkout.sessions.create(buildSessionParams(result.order, siteUrl));
    if (!session.url) throw new Error('Stripe returned a session without a URL');
    return json(200, { url: session.url });
  } catch (err) {
    // Log the reason only: order details include the customer's postcode and notes.
    const e = err as { type?: string; code?: string; message?: string; detail?: { code?: string; message?: string } };
    console.error('checkout_failed:', e.type ?? 'Error', e.code ?? e.detail?.code ?? '', e.message ?? String(err), e.detail?.message ?? '');
    return json(500, { errors: ["We couldn't start payment. Please try again in a moment."] });
  }
}
