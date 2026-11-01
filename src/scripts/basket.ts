const KEY = 'cakesite:basket:v1';

export interface BasketLine {
  id: string;
  variant: string;
  qty: number;
}

function isLine(v: unknown): v is BasketLine {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return typeof l.id === 'string' && typeof l.variant === 'string' && Number.isInteger(l.qty) && (l.qty as number) > 0;
}

export function readBasket(): BasketLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    return [];
  }
}

export function writeBasket(lines: BasketLine[]): void {
  localStorage.setItem(KEY, JSON.stringify(lines));
  document.dispatchEvent(new CustomEvent('basket:change'));
}

export function addToBasket(id: string, variant: string, qty: number, maxQty: number): void {
  const lines = readBasket();
  const existing = lines.find((l) => l.id === id && l.variant === variant);
  if (existing) existing.qty = Math.min(maxQty, existing.qty + qty);
  else lines.push({ id, variant, qty: Math.min(maxQty, qty) });
  writeBasket(lines);
}

export function basketCount(): number {
  return readBasket().reduce((n, l) => n + l.qty, 0);
}

export function clearBasket(): void {
  writeBasket([]);
}
