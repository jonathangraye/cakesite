import { formatGBP, type Catalog } from './catalog';

export interface DeliveryZone {
  id: string;
  name: string;
  feePence: number;
  /** Postcode districts (the part before the space), e.g. "BS1". */
  districts: string[];
}

export interface DeliveryRules {
  minLeadDays: number;
  maxAdvanceDays: number;
  /** ISO weekdays: 1 = Monday ... 7 = Sunday. */
  deliveryWeekdays: number[];
  /** YYYY-MM-DD dates with no deliveries. */
  blackoutDates: string[];
  minOrderPence: number;
  maxQuantityPerLine: number;
  maxNotesLength: number;
  zones: DeliveryZone[];
}

export interface OrderLine {
  id: string;
  variantId: string;
  name: string;
  variantLabel: string;
  unitPence: number;
  qty: number;
}

export interface ValidOrder {
  lines: OrderLine[];
  subtotalPence: number;
  zone: DeliveryZone;
  postcode: string;
  deliveryDate: string;
  notes: string;
}

export type OrderResult = { ok: true; order: ValidOrder } | { ok: false; errors: string[] };

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_LINES = 30;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Returns the postcode as "OUT IN" in capitals, or null if it isn't a valid UK postcode format. */
export function normalisePostcode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  if (!POSTCODE_RE.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function findZone(postcode: string, rules: DeliveryRules): DeliveryZone | null {
  const district = postcode.split(' ')[0];
  return rules.zones.find((zone) => zone.districts.some((d) => d.toUpperCase() === district)) ?? null;
}

export function weekdayName(isoWeekday: number): string {
  return WEEKDAYS[isoWeekday - 1] ?? '';
}

function toDayNumber(iso: string): number | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.getTime() / DAY_MS;
}

function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today's UK calendar date (YYYY-MM-DD), whatever timezone the code runs in. */
export function ukToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isoWeekday(iso: string): number {
  const day = toDayNumber(iso);
  if (day === null) return 0;
  const js = new Date(day * DAY_MS).getUTCDay();
  return js === 0 ? 7 : js;
}

export function formatDeliveryDate(iso: string): string {
  const day = toDayNumber(iso);
  if (day === null) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(day * DAY_MS));
}

export function deliveryDaysSentence(rules: DeliveryRules): string {
  const names = [...rules.deliveryWeekdays].sort((a, b) => a - b).map((d) => `${weekdayName(d)}s`);
  return `We deliver on ${new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(names)}.`;
}

/** A short form for headings and banners, e.g. "Tuesday to Saturday" or "Fridays and Saturdays". */
export function deliveryDaysRange(rules: DeliveryRules): string {
  const days = [...new Set(rules.deliveryWeekdays)].sort((a, b) => a - b);
  if (days.length === 7) return 'every day';
  const contiguous = days.length >= 3 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (contiguous) return `${weekdayName(days[0])} to ${weekdayName(days[days.length - 1])}`;
  return new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(days.map((d) => `${weekdayName(d)}s`));
}

export function basketLeadTime(itemIds: string[], catalog: Catalog): number {
  return itemIds.reduce((max, id) => Math.max(max, catalog.items[id]?.leadTimeDays ?? 0), 0);
}

export function deliveryWindow(leadTimeDays: number, rules: DeliveryRules, now: Date = new Date()) {
  const today = toDayNumber(ukToday(now)) as number;
  const earliest = today + Math.max(rules.minLeadDays, leadTimeDays);
  const latest = Math.max(earliest, today + rules.maxAdvanceDays);
  return { earliest: fromDayNumber(earliest), latest: fromDayNumber(latest) };
}

/** Returns a customer-facing error, or null if the date is OK. */
export function checkDeliveryDate(
  date: string,
  leadTimeDays: number,
  rules: DeliveryRules,
  now: Date = new Date(),
): string | null {
  if (toDayNumber(date) === null) return 'Choose a delivery date.';
  const { earliest, latest } = deliveryWindow(leadTimeDays, rules, now);
  if (date < earliest) return `The earliest we can deliver this order is ${formatDeliveryDate(earliest)}.`;
  if (date > latest) {
    return `We take orders up to ${rules.maxAdvanceDays} days ahead. Choose a date on or before ${formatDeliveryDate(latest)}.`;
  }
  const weekday = isoWeekday(date);
  if (!rules.deliveryWeekdays.includes(weekday)) {
    return `We don't deliver on ${weekdayName(weekday)}s. ${deliveryDaysSentence(rules)}`;
  }
  if (rules.blackoutDates.includes(date)) {
    return `We aren't delivering on ${formatDeliveryDate(date)}. Please choose another date.`;
  }
  return null;
}

function parseLine(raw: unknown, catalog: Catalog, rules: DeliveryRules): OrderLine | string {
  if (typeof raw !== 'object' || raw === null) return 'Invalid basket item.';
  const { id, variant, qty } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || typeof variant !== 'string') return 'Invalid basket item.';
  const item = Object.hasOwn(catalog.items, id) ? catalog.items[id] : undefined;
  if (!item || !item.available) {
    return 'An item in your basket is no longer available. Please remove it and try again.';
  }
  const v = item.variants.find((x) => x.id === variant);
  if (!v) return `${item.name}: that option is no longer available.`;
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > rules.maxQuantityPerLine) {
    return `${item.name}: quantity must be between 1 and ${rules.maxQuantityPerLine}.`;
  }
  return { id, variantId: v.id, name: item.name, variantLabel: v.label, unitPence: v.pricePence, qty };
}

/** The single source of truth for whether an order can be placed. Runs in the browser and in the Lambda. */
export function validateOrder(
  input: unknown,
  catalog: Catalog,
  rules: DeliveryRules,
  now: Date = new Date(),
): OrderResult {
  if (typeof input !== 'object' || input === null) return { ok: false, errors: ['Invalid order.'] };
  const { items, postcode, deliveryDate, notes } = input as Record<string, unknown>;
  const errors: string[] = [];
  const lines: OrderLine[] = [];

  if (!Array.isArray(items) || items.length === 0) {
    errors.push('Your basket is empty.');
  } else if (items.length > MAX_LINES) {
    errors.push(`Orders can have up to ${MAX_LINES} different items.`);
  } else {
    const seen = new Set<string>();
    for (const raw of items) {
      const line = parseLine(raw, catalog, rules);
      if (typeof line === 'string') {
        errors.push(line);
        continue;
      }
      const key = `${line.id}:${line.variantId}`;
      if (seen.has(key)) {
        errors.push(`${line.name} (${line.variantLabel}) is in your basket twice.`);
        continue;
      }
      seen.add(key);
      lines.push(line);
    }
  }

  const pc = typeof postcode === 'string' ? normalisePostcode(postcode) : null;
  const zone = pc ? findZone(pc, rules) : null;
  if (!pc) errors.push('Enter a valid UK postcode.');
  else if (!zone) errors.push(`Sorry, we don't deliver to ${pc} yet.`);

  const leadTimeDays = basketLeadTime(lines.map((l) => l.id), catalog);
  const dateError =
    typeof deliveryDate === 'string'
      ? checkDeliveryDate(deliveryDate, leadTimeDays, rules, now)
      : 'Choose a delivery date.';
  if (dateError) errors.push(dateError);

  let cleanNotes = '';
  if (notes != null && typeof notes !== 'string') errors.push('Invalid notes.');
  else if (typeof notes === 'string') {
    cleanNotes = notes.trim();
    if (cleanNotes.length > rules.maxNotesLength) errors.push(`Notes can be up to ${rules.maxNotesLength} characters.`);
  }

  const subtotalPence = lines.reduce((sum, l) => sum + l.unitPence * l.qty, 0);
  if (lines.length > 0 && subtotalPence < rules.minOrderPence) {
    errors.push(`The minimum order is ${formatGBP(rules.minOrderPence)} before delivery.`);
  }

  if (errors.length > 0 || !pc || !zone) return { ok: false, errors };
  return {
    ok: true,
    order: { lines, subtotalPence, zone, postcode: pc, deliveryDate: deliveryDate as string, notes: cleanNotes },
  };
}
