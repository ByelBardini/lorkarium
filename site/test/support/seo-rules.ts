// The limits Google shows in a result: past them the title or description is cut.
const TITLE_CHARS = { min: 10, max: 60 };
const DESCRIPTION_CHARS = { min: 70, max: 160 };

export interface PageSeo {
  path: string;
  title: string;
  description: string;
}

/**
 * The SEO problems of one rendered page; empty when it passes the site's rules.
 * Example: `seoProblemsOf(doc, '/planos/', 'https://lorkarium.test') // []`
 */
export function seoProblemsOf(
  page: Document,
  path: string,
  siteUrl: string,
  { indexable = true }: { indexable?: boolean } = {},
): string[] {
  const { title, description } = seoOf(page, path);
  const canonical = page.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const problems = [
    lengthProblem('title', title, TITLE_CHARS),
    lengthProblem('description', description, DESCRIPTION_CHARS),
    /^Lorkarium\b|\bLorkarium$/.test(title)
      ? null
      : `title "${title}" must start or end with Lorkarium`,
    page.querySelectorAll('h1').length === 1
      ? null
      : `${page.querySelectorAll('h1').length} h1, expected 1`,
    canonical === `${siteUrl}${path}` ? null : `canonical ${canonical}, expected ${siteUrl}${path}`,
    indexable && page.querySelector('meta[name="robots"][content*="noindex"]')
      ? 'noindex on an indexable page'
      : null,
  ];
  return problems
    .filter((problem): problem is string => problem !== null)
    .map((p) => `${path}: ${p}`);
}

/**
 * The title and description of a rendered page.
 * Example: `seoOf(doc, '/').title // 'Lorkarium · Mapas e combate para o seu RPG'`
 */
export function seoOf(page: Document, path: string): PageSeo {
  const description = page.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  return { path, title: page.title, description };
}

/**
 * The pairs of pages that share a title or a description.
 * Example: `duplicatesOf([{ path: '/a/', title: 'X', … }, { path: '/b/', title: 'X', … }]) // ['title "X": /a/, /b/']`
 */
export function duplicatesOf(pages: readonly PageSeo[]): string[] {
  return (['title', 'description'] as const).flatMap((field) => {
    const byValue = new Map<string, PageSeo[]>();
    for (const page of pages) byValue.set(page[field], [...(byValue.get(page[field]) ?? []), page]);
    return [...byValue]
      .filter(([, group]) => group.length > 1)
      .map(([value, group]) => `${field} "${value}": ${group.map((page) => page.path).join(', ')}`);
  });
}

function lengthProblem(
  field: string,
  value: string,
  limits: { min: number; max: number },
): string | null {
  if (value.length >= limits.min && value.length <= limits.max) return null;
  return `${field} has ${value.length} chars ("${value}"), expected ${limits.min}–${limits.max}`;
}
