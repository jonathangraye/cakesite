import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { ALLERGENS, ANIMAL_DERIVED, CATEGORIES, DIETARY } from './lib/menu-options';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens, for example "8-inch".');

const price = z
  .number()
  .positive()
  .refine((p) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-6, 'Prices can have at most 2 decimal places, for example 24.50.');

const menu = defineCollection({
  // Files starting with "_" (such as _template.md) are ignored.
  loader: glob({ pattern: ['**/*.md', '!**/_*.md'], base: './src/content/menu' }),
  schema: ({ image }) =>
    z.strictObject({
      name: z.string().min(2).max(60),
      summary: z.string().min(10).max(160),
      category: z.enum(CATEGORIES),
      image: image(),
      imageAlt: z.string().min(5),
      variants: z
        .array(z.strictObject({ id: slug, label: z.string().min(1).max(40), price }))
        .min(1, 'Add at least one variant with a price.')
        .refine((vs) => new Set(vs.map((v) => v.id)).size === vs.length, 'Each variant needs a unique id.'),
      allergens: z
        .array(z.enum(ALLERGENS))
        .refine(
          (list) => !list.some((a) => ANIMAL_DERIVED.includes(a)),
          `Items must be plant-based, so allergens can't include ${ANIMAL_DERIVED.join(', ')}. Use mayContain for cross-contamination warnings.`,
        ),
      mayContain: z.array(z.enum(ALLERGENS)).default([]),
      dietary: z.array(z.enum(DIETARY)).default([]),
      ingredients: z.string().min(5),
      leadTimeDays: z.number().int().min(0).max(30).default(2),
      available: z.boolean().default(true),
      featured: z.boolean().default(false),
      sortOrder: z.number().int().default(100),
    }),
});

export const collections = { menu };
