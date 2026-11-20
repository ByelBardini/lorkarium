import { describe, expect, it } from 'vitest';
import { landingCopy } from '@/copy/landing-copy';
import { plansCopy } from '@/copy/plans-copy';
import { REPOSITORY_URL } from '@/lib/desktop-release';
import {
  breadcrumbsOf,
  faqGraphOf,
  planOffersOf,
  siteGraphOf,
  type SchemaNode,
} from '@/lib/structured-data';

const SITE = new URL('https://lorkarium.test/');
const PAGE = { title: 'Lorkarium · Mesa virtual', description: 'A mesa virtual de RPG.' };
const SCREENSHOT = '/_astro/hero.abc.png';

function nodeOfType(graph: readonly SchemaNode[], type: string): SchemaNode {
  const node = graph.find((candidate) => candidate['@type'] === type);
  if (!node) throw new Error(`no ${type} in ${JSON.stringify(graph)}`);
  return node;
}

function homeGraph(): readonly SchemaNode[] {
  return siteGraphOf({ site: SITE, path: '/', page: PAGE, screenshot: SCREENSHOT })['@graph'];
}

describe('siteGraphOf', () => {
  it('names the organization once, with an absolute logo and the repository as sameAs', () => {
    expect(nodeOfType(homeGraph(), 'Organization')).toMatchObject({
      '@id': 'https://lorkarium.test/#organization',
      name: 'Lorkarium',
      logo: 'https://lorkarium.test/icon-512.png',
      sameAs: [REPOSITORY_URL],
    });
  });

  it('ties the website to the organization and the page to the website', () => {
    const graph = homeGraph();

    expect(nodeOfType(graph, 'WebSite')).toMatchObject({
      '@id': 'https://lorkarium.test/#website',
      inLanguage: 'pt-BR',
      publisher: { '@id': 'https://lorkarium.test/#organization' },
    });
    expect(nodeOfType(graph, 'WebPage')).toMatchObject({
      url: 'https://lorkarium.test/',
      name: PAGE.title,
      description: PAGE.description,
      isPartOf: { '@id': 'https://lorkarium.test/#website' },
    });
  });

  it('describes the app with every landing feature, a screenshot and the free offer', () => {
    const app = nodeOfType(homeGraph(), 'SoftwareApplication');

    expect(app).toMatchObject({
      name: 'Lorkarium',
      operatingSystem: 'Windows 10, Windows 11, Web',
      applicationCategory: 'GameApplication',
      inLanguage: 'pt-BR',
      screenshot: 'https://lorkarium.test/_astro/hero.abc.png',
      featureList: landingCopy.features.map((feature) => feature.title),
      offers: [{ '@type': 'Offer', price: '0', priceCurrency: 'BRL' }],
    });
    expect(typeof app.description).toBe('string');
  });

  it('adds the extra offers after the free one', () => {
    const offers = planOffersOf(plansCopy);
    const graph = siteGraphOf({
      site: SITE,
      path: '/planos/',
      page: PAGE,
      screenshot: SCREENSHOT,
      offers,
    })['@graph'];

    const app = nodeOfType(graph, 'SoftwareApplication');
    expect(app.offers).toHaveLength(offers.length + 1);
  });

  it('never claims a rating, since there are no real reviews to back one', () => {
    const offers = planOffersOf(plansCopy);
    const graph = siteGraphOf({
      site: SITE,
      path: '/',
      page: PAGE,
      screenshot: SCREENSHOT,
      offers,
    });

    expect(JSON.stringify(graph)).not.toMatch(/aggregateRating|"review"/);
  });

  it('links the page to its breadcrumb trail when it has one', () => {
    const crumbs = [
      { name: 'Início', path: '/' },
      { name: 'Recursos', path: '/recursos/' },
    ];
    const graph = siteGraphOf({
      site: SITE,
      path: '/recursos/',
      page: PAGE,
      screenshot: SCREENSHOT,
      crumbs,
    })['@graph'];

    expect(nodeOfType(graph, 'WebPage').breadcrumb).toEqual({
      '@id': 'https://lorkarium.test/recursos/#breadcrumb',
    });
    expect(nodeOfType(graph, 'BreadcrumbList')['@id']).toBe(
      'https://lorkarium.test/recursos/#breadcrumb',
    );
  });

  it('refuses a path without the trailing slash the canonical URLs use', () => {
    expect(() =>
      siteGraphOf({ site: SITE, path: '/planos', page: PAGE, screenshot: SCREENSHOT }),
    ).toThrow(/"\/planos".*expected a path ending in \//);
  });
});

describe('faqGraphOf', () => {
  it('marks one Question per FAQ entry, in the order and with the text of the page', () => {
    const faq = faqGraphOf(landingCopy.faqs);

    expect(faq['@type']).toBe('FAQPage');
    expect(faq.mainEntity).toEqual(
      landingCopy.faqs.map((entry) => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: { '@type': 'Answer', text: entry.answer },
      })),
    );
  });
});

describe('planOffersOf', () => {
  it('offers each paid plan in each period, in reais with a dot', () => {
    const offers = planOffersOf(plansCopy);

    const paid = plansCopy.plans.filter((plan) => plan.priceCents !== null);
    expect(offers).toHaveLength(paid.length * 3);
    expect(offers).toContainEqual({
      '@type': 'Offer',
      name: 'Narrador · Anual',
      price: '142.90',
      priceCurrency: 'BRL',
    });
    expect(offers).toContainEqual(
      expect.objectContaining({ name: 'Apoiador · Mensal', price: '4.90' }),
    );
  });
});

describe('breadcrumbsOf', () => {
  it('numbers the crumbs from 1 with absolute items', () => {
    const trail = breadcrumbsOf(
      [
        { name: 'Início', path: '/' },
        { name: 'Recursos', path: '/recursos/' },
      ],
      SITE,
    );

    expect(trail.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Início', item: 'https://lorkarium.test/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Recursos',
        item: 'https://lorkarium.test/recursos/',
      },
    ]);
  });

  it('refuses an empty trail', () => {
    expect(() => breadcrumbsOf([], SITE)).toThrow(/\[\].*expected at least one crumb/);
  });
});
