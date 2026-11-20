import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { guideSchema } from '@/lib/guide-schema';

const legal = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/legal' }),
  schema: z.strictObject({
    title: z.string().min(1),
    updatedAt: z.string().min(1),
    draft: z.boolean(),
  }),
});

// The recurso pages (docs/context/site/seo.md, Páginas de intenção).
const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: guideSchema,
});

export const collections = { legal, guides };
