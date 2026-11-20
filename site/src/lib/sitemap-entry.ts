// Imported by astro.config.mjs, which has no `@/` alias: keep this module free of imports.

/** What the sitemap needs to know about one Markdown page of the content collections. */
export interface ContentPage {
  /** The site path, ending in `/`. */
  path: string;
  updatedAt: string;
  draft: boolean;
  /** `recurso` guides fill the hub; legal pages have none. */
  kind: 'legal' | 'recurso';
}

export interface SitemapEntry {
  url: string;
  lastmod?: string;
}

// Never in the index: the post-download steps and the error page.
const NEVER_INDEXED = ['/obrigado/', '/404/'];

const MONTHS_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * The sitemap entry of a URL, with `lastmod` only when a content page dates it. Never the build
 * date: a lastmod that changes on every build makes Google ignore the field.
 * Example: `sitemapEntryOf({ url: 'https://x/termos/' }, new Map([['/termos/', '2026-11-01']])).lastmod // '2026-11-01T00:00:00.000Z'`
 */
export function sitemapEntryOf(
  entry: SitemapEntry,
  updatedAtByPath: ReadonlyMap<string, string>,
): SitemapEntry {
  const updatedAt = updatedAtByPath.get(new URL(entry.url).pathname);
  if (updatedAt === undefined) return { url: entry.url };
  return { ...entry, lastmod: isoDateOf(updatedAt) };
}

/**
 * Whether a path belongs in the sitemap and the index.
 * Example: `isIndexablePath('/obrigado/', []) // false`
 */
export function isIndexablePath(path: string, hiddenPaths: readonly string[]): boolean {
  return !NEVER_INDEXED.includes(path) && !hiddenPaths.includes(path);
}

/**
 * The paths to keep out of the index: drafts and the hubs with no published guide.
 * Example: `hiddenPathsOf([{ path: '/recursos/x/', draft: true, kind: 'recurso', … }]) // ['/recursos/x/', '/recursos/']`
 */
export function hiddenPathsOf(pages: readonly ContentPage[]): string[] {
  const drafts = pages.filter((page) => page.draft).map((page) => page.path);
  const emptyHubs = (['recurso'] as const)
    .filter((kind) => !pages.some((page) => page.kind === kind && !page.draft))
    .map((kind) => HUB_PATH[kind]);
  return [...drafts, ...emptyHubs];
}

export const HUB_PATH = { recurso: '/recursos/' } as const;

/**
 * A date of the frontmatter as ISO: `2026-11-20` or the legal pages' `19 de novembro de 2026`.
 * Example: `isoDateOf('19 de novembro de 2026') // '2026-11-19T00:00:00.000Z'`
 */
export function isoDateOf(updatedAt: string): string {
  const parts = isoPartsOf(updatedAt) ?? longPtPartsOf(updatedAt);
  if (parts === null) {
    throw new Error(
      `updatedAt is ${JSON.stringify(updatedAt)}; expected YYYY-MM-DD or "19 de novembro de 2026"`,
    );
  }
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

/**
 * The page a content file builds, from its path under `src/content/` and its frontmatter.
 * Example: `contentPageOf('guides/recursos/dados-3d.md', '---\nkind: recurso\nupdatedAt: 2026-11-20\ndraft: true\n---').path // '/recursos/dados-3d/'`
 */
export function contentPageOf(relativePath: string, source: string): ContentPage {
  const slug = relativePath.replace(/\\/g, '/').replace(/\.md$/, '');
  const [collection, ...rest] = slug.split('/');
  const kind = collection === 'legal' ? 'legal' : kindOf(frontmatterValue(source, 'kind'), slug);
  return {
    path: pathOfSlug(kind, rest.at(-1) ?? ''),
    updatedAt: frontmatterValue(source, 'updatedAt'),
    draft: frontmatterValue(source, 'draft') === 'true',
    kind,
  };
}

function isoPartsOf(updatedAt: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(updatedAt);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function longPtPartsOf(updatedAt: string): [number, number, number] | null {
  const match = /^(\d{1,2}) de ([a-zç]+) de (\d{4})$/.exec(updatedAt);
  const month = match ? MONTHS_PT.indexOf(match[2] ?? '') + 1 : 0;
  if (!match || month === 0) return null;
  return [Number(match[3]), month, Number(match[1])];
}

function frontmatterValue(source: string, key: string): string {
  const match = new RegExp(`^${key}:\\s*['"]?([^'"\\r\\n]*)['"]?\\s*$`, 'm').exec(source);
  if (!match)
    throw new Error(`frontmatter has no "${key}" in ${JSON.stringify(source.slice(0, 120))}`);
  return (match[1] ?? '').trim();
}

function kindOf(kind: string, slug: string): ContentPage['kind'] {
  if (kind === 'recurso') return kind;
  throw new Error(`guide ${slug} has kind ${JSON.stringify(kind)}; expected recurso`);
}

function pathOfSlug(kind: ContentPage['kind'], name: string): string {
  if (kind === 'recurso') return `/recursos/${name}/`;
  return `/${name}/`;
}
