import { landingCopy, type FaqCopy } from '@/copy/landing-copy';
import type { PlanCopy } from '@/copy/plans-copy';
import { REPOSITORY_URL } from '@/lib/desktop-release';
import { PLAN_PERIODS } from '@/lib/plan-price';

// No aggregateRating anywhere: Google's guidelines demand real reviews, and the site has none yet.

/** One schema.org node of the JSON-LD graph. */
export type SchemaNode = Readonly<Record<string, unknown>>;

/** A step of the visible trail, from the home page down. */
export interface Crumb {
  name: string;
  /** A site path ending in `/`, like `/recursos/`. */
  path: string;
}

export interface Offer extends SchemaNode {
  '@type': 'Offer';
  name?: string;
  price: string;
  priceCurrency: 'BRL';
}

export interface SiteGraphInput {
  site: URL;
  /** The page path, ending in `/` like the canonical URL. */
  path: string;
  page: { title: string; description: string };
  /** The URL of a real screenshot of the app (an `/_astro/` asset). */
  screenshot: string;
  crumbs?: readonly Crumb[];
  /** Offers beyond the free plan (the paid plans, on `/planos/`). */
  offers?: readonly Offer[];
  /** Nodes only this page has, like its FAQPage. */
  extraNodes?: readonly SchemaNode[];
}

export interface SiteGraph {
  '@context': 'https://schema.org';
  '@graph': readonly SchemaNode[];
}

const APP_DESCRIPTION =
  'Mesa virtual para RPG de mesa, independente de sistema: mapas com grid, iniciativa, pontos de vida, condições, dados 3D, fichas programáveis e chat em tempo real. Para Windows e navegador.';

const FREE_OFFER: Offer = { '@type': 'Offer', price: '0', priceCurrency: 'BRL' };

/**
 * The whole JSON-LD graph of a page: Organization, WebSite, WebPage, SoftwareApplication, plus the
 * trail and the page's own nodes.
 * Example: `siteGraphOf({ site, path: '/', page, screenshot })['@graph'].length // 4`
 */
export function siteGraphOf(input: SiteGraphInput): SiteGraph {
  const { site, path, crumbs = [], extraNodes = [] } = input;
  assertTrailingSlash(path);
  const pageUrl = new URL(path, site).href;
  const trail =
    crumbs.length === 0 ? [] : [{ ...breadcrumbsOf(crumbs, site), '@id': `${pageUrl}#breadcrumb` }];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationOf(site),
      websiteOf(site),
      webPageOf(input, pageUrl, trail.length > 0),
      softwareApplicationOf(input),
      ...trail,
      ...extraNodes,
    ],
  };
}

/**
 * The FAQPage of a list of questions, with the same text the page shows.
 * Example: `faqGraphOf(landingCopy.faqs).mainEntity[0].name // 'Quanto custa?'`
 */
export function faqGraphOf(faqs: readonly FaqCopy[]): SchemaNode & { mainEntity: SchemaNode[] } {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

/**
 * One Offer per paid plan and period, from the same cents the plans page shows.
 * Example: `planOffersOf(plansCopy)[0] // { name: 'Apoiador · Mensal', price: '4.90', … }`
 */
export function planOffersOf(copy: { plans: readonly PlanCopy[] }): Offer[] {
  return copy.plans.flatMap((plan) => {
    const prices = plan.priceCents;
    if (prices === null) return [];
    return PLAN_PERIODS.map((period) => ({
      '@type': 'Offer' as const,
      name: `${plan.name} · ${period.label}`,
      price: (prices[period.key] / 100).toFixed(2),
      priceCurrency: 'BRL' as const,
    }));
  });
}

/**
 * The BreadcrumbList of a trail, positions from 1 and absolute items.
 * Example: `breadcrumbsOf([{ name: 'Início', path: '/' }], site).itemListElement[0].position // 1`
 */
export function breadcrumbsOf(
  crumbs: readonly Crumb[],
  site: URL,
): SchemaNode & { itemListElement: SchemaNode[] } {
  if (crumbs.length === 0) {
    throw new Error(`breadcrumbs are ${JSON.stringify(crumbs)}; expected at least one crumb`);
  }
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: new URL(crumb.path, site).href,
    })),
  };
}

function assertTrailingSlash(path: string): void {
  if (path.endsWith('/')) return;
  throw new Error(`page path is ${JSON.stringify(path)}; expected a path ending in /`);
}

function organizationOf(site: URL): SchemaNode {
  return {
    '@type': 'Organization',
    '@id': `${site.origin}/#organization`,
    name: 'Lorkarium',
    url: new URL('/', site).href,
    logo: new URL('/icon-512.png', site).href,
    sameAs: [REPOSITORY_URL],
  };
}

function websiteOf(site: URL): SchemaNode {
  return {
    '@type': 'WebSite',
    '@id': `${site.origin}/#website`,
    name: 'Lorkarium',
    url: new URL('/', site).href,
    inLanguage: 'pt-BR',
    publisher: { '@id': `${site.origin}/#organization` },
  };
}

function webPageOf(input: SiteGraphInput, pageUrl: string, hasTrail: boolean): SchemaNode {
  return {
    '@type': 'WebPage',
    '@id': `${pageUrl}#webpage`,
    url: pageUrl,
    name: input.page.title,
    description: input.page.description,
    inLanguage: 'pt-BR',
    isPartOf: { '@id': `${input.site.origin}/#website` },
    ...(hasTrail ? { breadcrumb: { '@id': `${pageUrl}#breadcrumb` } } : {}),
  };
}

function softwareApplicationOf(input: SiteGraphInput): SchemaNode {
  const { site, screenshot, offers = [] } = input;
  return {
    '@type': 'SoftwareApplication',
    '@id': `${site.origin}/#app`,
    name: 'Lorkarium',
    description: APP_DESCRIPTION,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Windows 10, Windows 11, Web',
    inLanguage: 'pt-BR',
    url: new URL('/', site).href,
    image: new URL('/og.png', site).href,
    screenshot: new URL(screenshot, site).href,
    featureList: landingCopy.features.map((feature) => feature.title),
    publisher: { '@id': `${site.origin}/#organization` },
    offers: [FREE_OFFER, ...offers],
  };
}
