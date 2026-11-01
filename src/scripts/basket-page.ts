import { readBasket, writeBasket, type BasketLine } from './basket';
import { formatGBP, type Catalog, type CatalogItem, type CatalogVariant } from '../lib/catalog';
import {
  basketLeadTime,
  checkDeliveryDate,
  deliveryWindow,
  findZone,
  normalisePostcode,
  validateOrder,
  type DeliveryRules,
} from '../lib/order-rules';
import deliveryJson from '../data/delivery.json';

const rules: DeliveryRules = deliveryJson;

/** Only ever leave the site for Stripe Checkout, whatever the API returns. */
function stripeCheckoutUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' ? url.href : null;
  } catch {
    return null;
  }
}

const root = document.querySelector<HTMLElement>('[data-basket]');

function el<T extends HTMLElement>(selector: string): T {
  const found = root?.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}

interface ResolvedLine extends BasketLine {
  item: CatalogItem;
  v: CatalogVariant;
}

function resolve(catalog: Catalog): { lines: ResolvedLine[]; dropped: number } {
  const stored = readBasket();
  const lines = stored.flatMap((l) => {
    const item = Object.hasOwn(catalog.items, l.id) ? catalog.items[l.id] : undefined;
    const v = item?.variants.find((x) => x.id === l.variant);
    return item && v && item.available ? [{ ...l, item, v }] : [];
  });
  return { lines, dropped: stored.length - lines.length };
}

function setErrors(list: HTMLElement, errors: string[]) {
  list.replaceChildren(
    ...errors.map((e) => {
      const li = document.createElement('li');
      li.textContent = e;
      return li;
    }),
  );
  list.hidden = errors.length === 0;
}

async function main() {
  if (!root) return;
  const loading = el('[data-loading]');
  const empty = el('[data-empty]');
  const notice = el('[data-notice]');
  const content = el('[data-content]');
  const linesEl = el('[data-lines]');
  const form = el<HTMLFormElement>('[data-form]');
  const postcode = el<HTMLInputElement>('[data-postcode]');
  const postcodeMsg = el('[data-postcode-msg]');
  const date = el<HTMLInputElement>('[data-date]');
  const dateMsg = el('[data-date-msg]');
  const notes = el<HTMLTextAreaElement>('[data-notes]');
  const subtotalEl = el('[data-subtotal]');
  const deliveryEl = el('[data-delivery]');
  const totalEl = el('[data-total]');
  const errorsEl = el('[data-errors]');
  const submit = el<HTMLButtonElement>('[data-submit]');

  let catalog: Catalog;
  try {
    const res = await fetch('/catalog.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    catalog = (await res.json()) as Catalog;
  } catch {
    loading.textContent = "We couldn't load the menu. Please refresh the page.";
    return;
  }
  loading.hidden = true;

  const initial = resolve(catalog);
  if (initial.dropped > 0) {
    writeBasket(initial.lines.map(({ id, variant, qty }) => ({ id, variant, qty })));
    notice.textContent = 'Some items were removed from your basket because they are no longer available.';
    notice.hidden = false;
  }

  const currentZone = () => {
    const pc = normalisePostcode(postcode.value);
    return pc ? findZone(pc, rules) : null;
  };

  function renderTotals(lines: ResolvedLine[]) {
    const subtotal = lines.reduce((s, l) => s + l.v.pricePence * l.qty, 0);
    const zone = currentZone();
    subtotalEl.textContent = formatGBP(subtotal);
    deliveryEl.textContent = zone ? formatGBP(zone.feePence) : 'Enter your postcode';
    totalEl.textContent = formatGBP(subtotal + (zone?.feePence ?? 0));

    const { earliest, latest } = deliveryWindow(basketLeadTime(lines.map((l) => l.id), catalog), rules);
    date.min = earliest;
    date.max = latest;
  }

  function render() {
    const { lines } = resolve(catalog);
    empty.hidden = lines.length > 0;
    content.hidden = lines.length === 0;
    linesEl.replaceChildren(
      ...lines.map((l) => {
        const li = document.createElement('li');
        li.className = 'basket-line';

        const info = document.createElement('div');
        const name = document.createElement('a');
        name.href = l.item.url;
        name.textContent = l.item.name;
        const variant = document.createElement('p');
        variant.className = 'muted';
        variant.textContent = `${l.v.label} · ${formatGBP(l.v.pricePence)} each`;
        info.append(name, variant);

        const qty = document.createElement('input');
        qty.type = 'number';
        qty.min = '1';
        qty.max = String(rules.maxQuantityPerLine);
        qty.value = String(l.qty);
        qty.setAttribute('aria-label', `Quantity of ${l.item.name}, ${l.v.label}`);
        qty.addEventListener('change', () => {
          const n = Math.min(rules.maxQuantityPerLine, Math.max(1, Math.trunc(Number(qty.value)) || 1));
          writeBasket(
            readBasket().map((b) => (b.id === l.id && b.variant === l.variant ? { ...b, qty: n } : b)),
          );
          render();
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'link-button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          writeBasket(readBasket().filter((b) => !(b.id === l.id && b.variant === l.variant)));
          render();
        });

        const total = document.createElement('p');
        total.className = 'line-total';
        total.textContent = formatGBP(l.v.pricePence * l.qty);

        li.append(info, qty, total, remove);
        return li;
      }),
    );
    renderTotals(lines);
  }

  function checkPostcode() {
    if (!postcode.value.trim()) {
      postcodeMsg.textContent = '';
    } else {
      const pc = normalisePostcode(postcode.value);
      const zone = pc ? findZone(pc, rules) : null;
      if (!pc) postcodeMsg.textContent = 'Enter a valid UK postcode.';
      else if (!zone) postcodeMsg.textContent = `Sorry, we don't deliver to ${pc} yet.`;
      else postcodeMsg.textContent = `We deliver to ${pc} (${zone.name}).`;
      if (pc) postcode.value = pc;
    }
    render();
  }

  function checkDate() {
    if (!date.value) {
      dateMsg.textContent = '';
      return;
    }
    const lead = basketLeadTime(resolve(catalog).lines.map((l) => l.id), catalog);
    dateMsg.textContent = checkDeliveryDate(date.value, lead, rules) ?? '';
  }

  postcode.addEventListener('change', checkPostcode);
  date.addEventListener('change', checkDate);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      items: readBasket(),
      postcode: postcode.value,
      deliveryDate: date.value,
      notes: notes.value,
    };
    const local = validateOrder(payload, catalog, rules);
    if (!local.ok) {
      setErrors(errorsEl, local.errors);
      return;
    }
    setErrors(errorsEl, []);
    submit.disabled = true;
    submit.textContent = 'Taking you to payment…';
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; errors?: string[] };
      const url = res.ok ? stripeCheckoutUrl(body.url) : null;
      if (url) {
        window.location.assign(url);
        return;
      }
      setErrors(errorsEl, body.errors ?? ['Something went wrong. Please try again.']);
    } catch {
      setErrors(errorsEl, ["We couldn't reach the payment service. Check your connection and try again."]);
    }
    submit.disabled = false;
    submit.textContent = 'Continue to payment';
  });

  render();
}

void main();
