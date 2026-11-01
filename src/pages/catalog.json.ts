import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { toPence, type Catalog } from '../lib/catalog';

export const GET: APIRoute = async () => {
  const entries = await getCollection('menu');
  const catalog: Catalog = {
    generatedAt: new Date().toISOString(),
    items: Object.fromEntries(
      entries.map((e) => [
        e.id,
        {
          id: e.id,
          name: e.data.name,
          category: e.data.category,
          url: `/menu/${e.id}/`,
          available: e.data.available,
          leadTimeDays: e.data.leadTimeDays,
          variants: e.data.variants.map((v) => ({ id: v.id, label: v.label, pricePence: toPence(v.price) })),
        },
      ]),
    ),
  };
  return new Response(JSON.stringify(catalog), { headers: { 'Content-Type': 'application/json' } });
};
