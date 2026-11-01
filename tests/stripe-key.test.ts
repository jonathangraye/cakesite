import { describe, expect, it } from 'vitest';
import { loadStripeKey, loadWebhookSecret } from '../lambda/stripe-key';

describe('loadStripeKey', () => {
  it('accepts a test key in test mode', async () => {
    await expect(loadStripeKey({ STRIPE_SECRET_KEY: 'sk_test_abc' })).resolves.toBe('sk_test_abc');
    await expect(loadStripeKey({ STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'rk_test_abc' })).resolves.toBe('rk_test_abc');
  });
  it('trims surrounding whitespace', async () => {
    await expect(loadStripeKey({ STRIPE_SECRET_KEY: ' sk_test_abc\n' })).resolves.toBe('sk_test_abc');
  });
  it('refuses a live key unless STRIPE_MODE is live', async () => {
    await expect(loadStripeKey({ STRIPE_SECRET_KEY: 'sk_live_abc' })).rejects.toThrow(/not a test key/);
    await expect(loadStripeKey({ STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_abc' })).resolves.toBe('sk_live_abc');
    await expect(loadStripeKey({ STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_test_abc' })).rejects.toThrow(/not a live key/);
  });
  it('rejects unknown modes and missing config', async () => {
    await expect(loadStripeKey({ STRIPE_MODE: 'prod', STRIPE_SECRET_KEY: 'sk_test_abc' })).rejects.toThrow(/must be/);
    await expect(loadStripeKey({})).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});

describe('loadWebhookSecret', () => {
  it('accepts and trims a signing secret', async () => {
    await expect(loadWebhookSecret({ STRIPE_WEBHOOK_SECRET: 'whsec_abc\n' })).resolves.toBe('whsec_abc');
  });
  it('rejects other values and missing config', async () => {
    await expect(loadWebhookSecret({ STRIPE_WEBHOOK_SECRET: 'sk_test_abc' })).rejects.toThrow(/whsec_/);
    await expect(loadWebhookSecret({})).rejects.toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});
