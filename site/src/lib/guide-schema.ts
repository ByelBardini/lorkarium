import { z } from 'astro/zod';

export const GUIDE_KINDS = ['recurso'] as const;

/** Real captures of the app a guide may show (`src/assets/screens/<shot>.png`). */
export const GUIDE_SHOTS = [
  'hero',
  'dice',
  'chat',
  'tracker',
  'feature-board',
  'feature-combat',
  'feature-play',
] as const;

const faqEntry = z.strictObject({ question: z.string().min(1), answer: z.string().min(1) });

/**
 * The frontmatter of a guide (`src/content/guides/**`). The lengths are the ones the SEO guard
 * cobra, so a guide too long for the result fails at `astro sync`, not in review.
 * Example: `guideSchema.parse({ kind: 'recurso', title: 'Dados 3D online · Lorkarium', … })`
 */
export const guideSchema = z.strictObject({
  kind: z.enum(GUIDE_KINDS, {
    error: (issue) => `kind is ${JSON.stringify(issue.input)}; expected ${GUIDE_KINDS.join(' | ')}`,
  }),
  /** Short name for the trail and the hub card: `Dados 3D`, `Grid de combate`. */
  name: z.string().min(1).max(40),
  title: z.string().min(10).max(60),
  description: z.string().min(70).max(160),
  h1: z.string().min(1),
  /** The line under the h1, in Cormorant italic gold. */
  lead: z.string().min(1),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  draft: z.boolean(),
  /** Position in the hub, lowest first. */
  order: z.number().int().nonnegative(),
  /** Ids of other guides (`recursos/grid-de-combate`); a missing one fails the build. */
  related: z.array(z.string()).default([]),
  faqs: z.array(faqEntry).optional(),
  shot: z.enum(GUIDE_SHOTS).optional(),
  shotAlt: z.string().min(1).optional(),
});

export type GuideShot = (typeof GUIDE_SHOTS)[number];

export type GuideData = z.infer<typeof guideSchema>;
