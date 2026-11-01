export interface CatalogVariant {
  id: string;
  label: string;
  pricePence: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  url: string;
  available: boolean;
  leadTimeDays: number;
  variants: CatalogVariant[];
}

/** Built to /catalog.json. The checkout Lambda prices orders from this, never from the browser. */
export interface Catalog {
  generatedAt: string;
  items: Record<string, CatalogItem>;
}

export function toPence(pounds: number): number {
  return Math.round(pounds * 100);
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export function formatGBP(pence: number): string {
  return gbp.format(pence / 100);
}
