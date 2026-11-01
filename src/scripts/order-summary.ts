import { formatGBP } from '../lib/catalog';
import { formatDeliveryDate } from '../lib/order-rules';

interface OrderSummary {
  paymentStatus: 'paid' | 'processing';
  items: { name: string; quantity: number; totalPence: number }[];
  subtotalPence: number;
  deliveryPence: number;
  totalPence: number;
  deliveryDate: string | null;
  postcodeDistrict: string | null;
}

/** Fills in the success page. If anything fails, the generic thank-you message still stands. */
export async function showOrderSummary(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-summary]');
  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  if (!root || !sessionId) return;

  let summary: OrderSummary;
  try {
    const res = await fetch(`/api/order?session_id=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return;
    summary = (await res.json()) as OrderSummary;
  } catch {
    return;
  }

  const set = (selector: string, value: string) => {
    const el = root.querySelector<HTMLElement>(selector);
    if (el) el.textContent = value;
  };

  const where = summary.postcodeDistrict ? ` to ${summary.postcodeDistrict}` : '';
  const when = summary.deliveryDate ? formatDeliveryDate(summary.deliveryDate) : 'your chosen date';
  set(
    '[data-delivery]',
    summary.paymentStatus === 'paid'
      ? `Delivery${where} on ${when}.`
      : `Delivery${where} on ${when}, once your payment clears.`,
  );

  root.querySelector('[data-items]')?.replaceChildren(
    ...summary.items.map((item) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${item.quantity} × ${item.name}`;
      const price = document.createElement('span');
      price.textContent = formatGBP(item.totalPence);
      li.append(name, price);
      return li;
    }),
  );
  set('[data-subtotal]', formatGBP(summary.subtotalPence));
  set('[data-delivery-fee]', formatGBP(summary.deliveryPence));
  set('[data-total]', formatGBP(summary.totalPence));
  root.hidden = false;
}
