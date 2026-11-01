import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { createWebhookHandler } from '../lambda/webhook-handler';
import type { WebhookDeps } from '../lambda/webhook';

const secret = 'whsec_test_secret';
const stripe = new Stripe('sk_test_unused');

function signedRequest(payload: string, signingSecret = secret): APIGatewayProxyEventV2 {
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret });
  return { headers: { 'stripe-signature': signature }, body: payload, isBase64Encoded: false } as unknown as APIGatewayProxyEventV2;
}

const payload = (livemode = false) => JSON.stringify({ id: 'evt_1', type: 'customer.created', livemode, data: { object: {} } });

function makeHandler(deps?: Partial<WebhookDeps>) {
  return createWebhookHandler({
    verify: (body, sig) => stripe.webhooks.constructEventAsync(body, sig, secret),
    deps: async () => deps as WebhookDeps,
    live: false,
  });
}

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('webhook handler', () => {
  it('accepts a correctly signed event', async () => {
    const res = await makeHandler({})(signedRequest(payload()));
    expect(res.statusCode).toBe(200);
  });

  it('accepts a base64-encoded body', async () => {
    const req = signedRequest(payload());
    const res = await makeHandler({})({ ...req, body: Buffer.from(req.body!).toString('base64'), isBase64Encoded: true });
    expect(res.statusCode).toBe(200);
  });

  it('rejects missing, forged or tampered signatures', async () => {
    const handler = makeHandler({});
    expect((await handler({ headers: {}, body: payload() } as unknown as APIGatewayProxyEventV2)).statusCode).toBe(400);
    expect((await handler(signedRequest(payload(), 'whsec_wrong'))).statusCode).toBe(400);
    const tampered = signedRequest(payload());
    expect((await handler({ ...tampered, body: tampered.body!.replace('customer', 'invoice') })).statusCode).toBe(400);
  });

  it('ignores events from the other Stripe mode', async () => {
    const getDeps = vi.fn();
    const handler = createWebhookHandler({
      verify: (body, sig) => stripe.webhooks.constructEventAsync(body, sig, secret),
      deps: getDeps,
      live: false,
    });
    const res = await handler(signedRequest(payload(true)));
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('wrong mode');
    expect(getDeps).not.toHaveBeenCalled();
  });

  it('returns 500 when processing fails, so Stripe retries', async () => {
    const handler = createWebhookHandler({
      verify: (body, sig) => stripe.webhooks.constructEventAsync(body, sig, secret),
      deps: async () => {
        throw new Error('no table');
      },
      live: false,
    });
    expect((await handler(signedRequest(payload()))).statusCode).toBe(500);
  });
});
