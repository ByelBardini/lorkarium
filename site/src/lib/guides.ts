import type { GuideData } from '@/lib/guide-schema';
import type { Crumb } from '@/lib/structured-data';

/** A guide as the content collection gives it; tests pass plain objects of the same shape. */
export interface GuideEntry {
  /** The path under `src/content/guides/` without `.md`: `recursos/dados-3d`. */
  id: string;
  data: GuideData;
}

export interface GuideLink {
  id: string;
  title: string;
  description: string;
  href: string;
}

const HUBS = {
  recurso: { name: 'Recursos', path: '/recursos/', ogImage: '/og-recursos.png' },
} as const;

/**
 * The guides a build shows: the published ones, plus the drafts when drafts are allowed (dev, CI).
 * Example: `visibleGuidesOf(await getCollection('guides'), GUIDE_DRAFTS_ALLOWED)`
 */
export function visibleGuidesOf<T extends GuideEntry>(
  guides: readonly T[],
  draftsAllowed: boolean,
): T[] {
  return guides
    .filter((guide) => draftsAllowed || !guide.data.draft)
    .toSorted((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
}

/**
 * The `getStaticPaths` of a guide route: one path per visible guide of the kind.
 * Example: `guidePathsOf(guides, 'recurso', false)[0] // { params: { slug: 'dados-3d' }, props: { guide } }`
 */
export function guidePathsOf<T extends GuideEntry>(
  guides: readonly T[],
  kind: GuideData['kind'],
  draftsAllowed: boolean,
): { params: { slug: string }; props: { guide: T } }[] {
  return visibleGuidesOf(guides, draftsAllowed)
    .filter((guide) => guide.data.kind === kind)
    .map((guide) => ({ params: { slug: slugOf(guide) }, props: { guide } }));
}

/**
 * The site path of a guide.
 * Example: `guidePathOf({ id: 'recursos/dados-3d', data }) // '/recursos/dados-3d/'`
 */
export function guidePathOf(guide: GuideEntry): string {
  return `${HUBS[guide.data.kind].path}${slugOf(guide)}/`;
}

/**
 * The trail from the home page to a guide, the same one the BreadcrumbList publishes.
 * Example: `guideCrumbsOf(dados).map((crumb) => crumb.name) // ['Início', 'Recursos', 'Dados 3D']`
 */
export function guideCrumbsOf(guide: GuideEntry): Crumb[] {
  const pageName = guide.data.name;
  const home = { name: 'Início', path: '/' };
  const hub = HUBS[guide.data.kind];
  return [home, { name: hub.name, path: hub.path }, { name: pageName, path: guidePathOf(guide) }];
}

/**
 * The share image of a guide: the one of its hub.
 * Example: `guideOgImageOf(dados) // '/og-recursos.png'`
 */
export function guideOgImageOf(guide: GuideEntry): string {
  return HUBS[guide.data.kind].ogImage;
}

/**
 * The links a guide lists under "Veja também". An id with no guide fails the build: an internal
 * link never breaks in silence.
 * Example: `relatedGuidesOf(dados, guides)[0].href // '/recursos/chat-da-mesa/'`
 */
export function relatedGuidesOf(guide: GuideEntry, guides: readonly GuideEntry[]): GuideLink[] {
  return guide.data.related.map((id) => {
    const target = guides.find((candidate) => candidate.id === id);
    if (!target) {
      const known = guides.map((candidate) => candidate.id).join(', ');
      throw new Error(`guide ${guide.id} relates to "${id}"; expected one of ${known}`);
    }
    return linkOf(target);
  });
}

/**
 * A guide as a card or a link.
 * Example: `linkOf(dados).href // '/recursos/dados-3d/'`
 */
export function linkOf(guide: GuideEntry): GuideLink {
  const { name, description } = guide.data;
  return { id: guide.id, title: name, description, href: guidePathOf(guide) };
}

/**
 * The hub links the header and the footer show: only hubs with a visible guide.
 * Example: `guideNavLinksOf(guides, false) // [{ label: 'Recursos', href: '/recursos/' }]`
 */
export function guideNavLinksOf(
  guides: readonly GuideEntry[],
  draftsAllowed: boolean,
): { label: string; href: string }[] {
  const visible = visibleGuidesOf(guides, draftsAllowed);
  return (['recurso'] as const)
    .filter((kind) => visible.some((guide) => guide.data.kind === kind))
    .map((kind) => ({ label: HUBS[kind].name, href: HUBS[kind].path }));
}

function slugOf(guide: GuideEntry): string {
  return guide.id.split('/').at(-1) ?? guide.id;
}
