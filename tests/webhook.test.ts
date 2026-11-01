import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../lambda/dev-adapters';
import rules from '../src/data/delivery.json';
import { processEvent, type WebhookDeps } from '../lambda/webhook';
import { fakeSession } from './fixtures';

function setup(session = fakeSession()) {
  const store = memoryStore();
  const sent: { subject: string; message: string }[] = [];
  const deps: WebhookDeps = {
    stripe: {
      retrieveSession: vi.fn(async () => session),
      updatePaymentIntent: vi.fn(async () => ({})),
    },
    store,
    alerts: { send: vi.fn(async (subject: string, message: string) => void sent.push({ subject, message })) },
    rules,
    now: () => new Date('2026-11-01T12:05:00Z'),
  };
  return { deps, store, sent };
}

const event = (type: string, id = 'cs_test_a1b2c3d4e5f6g7h8') =>
  ({ id: 'evt_1', type, livemode: false, data: { object: { id } } }) as unknown as Stripe.Event;

vi.spyOn(console, 'log').mockImplementation(() => {});

describe('processEvent', () => {
  it('stores a completed order and tags the payment without alerting', async () => {
    const { deps, store, sent } = setup();
    await expect(processEvent(event('checkout.session.completed'), deps)).resolves.toBe('stored');
    const order = await store.getOrder('cs_test_a1b2c3d4e5f6g7h8');
    expect(order?.status).toBe('paid');
    expect(order?.processedAt).toBe('2026-11-01T12:05:00.000Z');
    expect(deps.stripe.updatePaymentIntent).toHaveBeenCalledWith('pi_test_123', { metadata: { address_check: 'match' } });
    expect(sent).toEqual([]);
  });

  it('flags an address in another zone in Stripe and by email', async () => {
    const { deps, sent } = setup(fakeSession({ shippingPostcode: 'XX3 1AA' }));
    await processEvent(event('checkout.session.completed'), deps);
    const [, params] = vi.mocked(deps.stripe.updatePaymentIntent).mock.calls[0];
    expect(params.metadata).toEqual({ address_check: 'mismatch' });
    expect(params.description).toMatch(/^\[CHECK ADDRESS\]/);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain('order ending e5f6g7h8');
    expect(sent[0].message).toContain('XX1 1AA (Zone A (placeholder))');
    expect(sent[0].message).toContain('XX3 1AA (Zone B (placeholder))');
    expect(sent[0].message).toContain('https://dashboard.stripe.com/test/payments/pi_test_123');
    // The email goes to the seller, but keep contact details and the full address out of it.
    expect(sent[0].message).not.toContain('sam@example.com');
    expect(sent[0].message).not.toContain('Test Street');
  });

  it('ignores repeat deliveries of the same event', async () => {
    const { deps, sent } = setup(fakeSession({ shippingPostcode: 'XX3 1AA' }));
    await processEvent(event('checkout.session.completed'), deps);
    await expect(processEvent(event('checkout.session.completed'), deps)).resolves.toBe('duplicate');
    expect(deps.stripe.updatePaymentIntent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
  });

  it('finishes the job on retry when the alert failed the first time', async () => {
    const { deps, store, sent } = setup(fakeSession({ shippingPostcode: 'XX3 1AA' }));
    vi.mocked(deps.alerts.send).mockRejectedValueOnce(new Error('SNS down'));
    await expect(processEvent(event('checkout.session.completed'), deps)).rejects.toThrow('SNS down');
    expect((await store.getOrder('cs_test_a1b2c3d4e5f6g7h8'))?.processedAt).toBeUndefined();

    await expect(processEvent(event('checkout.session.completed'), deps)).resolves.toBe('resumed');
    expect(sent).toHaveLength(1);
    expect((await store.getOrder('cs_test_a1b2c3d4e5f6g7h8'))?.processedAt).toBeDefined();
  });

  it('updates delayed payments and alerts when one fails', async () => {
    const { deps, store, sent } = setup(fakeSession({ payment_status: 'unpaid' }));
    await processEvent(event('checkout.session.completed'), deps);
    expect((await store.getOrder('cs_test_a1b2c3d4e5f6g7h8'))?.status).toBe('awaiting_payment');

    await expect(processEvent(event('checkout.session.async_payment_succeeded'), deps)).resolves.toBe('updated');
    expect((await store.getOrder('cs_test_a1b2c3d4e5f6g7h8'))?.status).toBe('paid');

    await processEvent(event('checkout.session.async_payment_failed'), deps);
    expect((await store.getOrder('cs_test_a1b2c3d4e5f6g7h8'))?.status).toBe('payment_failed');
    expect(sent.map((s) => s.subject)).toEqual([expect.stringContaining('payment failed')]);
  });

  it('fails a status update for an order it has not stored yet, so Stripe retries', async () => {
    const { deps } = setup();
    await expect(processEvent(event('checkout.session.async_payment_succeeded', 'cs_test_unknown12345'), deps)).rejects.toThrow();
  });

  it('ignores other event types', async () => {
    const { deps } = setup();
    await expect(processEvent(event('customer.created'), deps)).resolves.toBe('ignored');
    expect(deps.stripe.retrieveSession).not.toHaveBeenCalled();
  });
});
