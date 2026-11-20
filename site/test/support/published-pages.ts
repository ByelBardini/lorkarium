import { getCollection } from 'astro:content';
import type { experimental_AstroContainer as AstroContainer } from 'astro/container';
import GuideEntry from '@/components/guide-entry.astro';
import { guidePathOf } from '@/lib/guides';
import { hiddenPathsOf, type ContentPage } from '@/lib/sitemap-entry';

type AstroComponent = Parameters<AstroContainer['renderToString']>[0];

export interface PublishedPage {
  path: string;
  component: AstroComponent;
  props?: Record<string, unknown>;
  /** False for drafts and empty hubs: the specs render them (drafts are allowed) with noindex. */
  indexable: boolean;
}

// Static routes only; the guide routes (`[slug]`) come from the collection.
const STATIC_PAGES = import.meta.glob<{ default: AstroComponent }>('/src/pages/**/*.astro', {
  eager: true,
});
const NOT_PUBLISHED = /\[|\/404\.astro$|\/obrigado\.astro$/;

/**
 * Every page the site publishes, ready for `renderAstro`, with its path. A new `.astro` page or a
 * new guide joins on its own; the drafts come too, so their text meets the rules before review.
 * Example: `(await publishedPages()).map((page) => page.path) // ['/', '/planos/', …]`
 */
export async function publishedPages(): Promise<PublishedPage[]> {
  const guides = await getCollection('guides');
  const hidden = hiddenPathsOf(guides.map(contentPageOfGuide));
  const statics = Object.entries(STATIC_PAGES)
    .filter(([file]) => !NOT_PUBLISHED.test(file))
    .map(([file, module]) => ({ path: pathOfPageFile(file), component: module.default }));
  const guidePages = guides.map((guide) => ({
    path: guidePathOf(guide),
    component: GuideEntry,
    props: { guide },
  }));
  return [...statics, ...guidePages].map((page) => ({
    ...page,
    indexable: !hidden.includes(page.path),
  }));
}

function contentPageOfGuide(
  guide: Awaited<ReturnType<typeof getCollection<'guides'>>>[number],
): ContentPage {
  const { kind, updatedAt, draft } = guide.data;
  return { path: guidePathOf(guide), kind, updatedAt, draft };
}

function pathOfPageFile(file: string): string {
  const route = file.replace(/^\/src\/pages/, '').replace(/(index)?\.astro$/, '');
  return route.endsWith('/') ? route : `${route}/`;
}
