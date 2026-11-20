import { describe, expect, it } from 'vitest';
import SiteLayout from '@/layouts/site-layout.astro';
import { renderAstro } from '../support/render-astro';

const PAGE_PROPS = { title: 'Termos de uso · Lorkarium', description: 'Os termos do Lorkarium.' };

function metaContent(page: Document, selector: string): string | null {
  return page.querySelector(selector)?.getAttribute('content') ?? null;
}

function structuredData(page: Document): Record<string, unknown> {
  const script = page.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.textContent ?? '{}') as Record<string, unknown>;
}

describe('the site layout', () => {
  it('points the canonical link at SITE_URL plus the page path', async () => {
    const page = await renderAstro(SiteLayout, { props: PAGE_PROPS, path: '/termos/' });

    const canonical = page.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://lorkarium.test/termos/');
  });

  it('shares the page through Open Graph with an absolute og:image', async () => {
    const page = await renderAstro(SiteLayout, { props: PAGE_PROPS, path: '/termos/' });

    expect(metaContent(page, 'meta[property="og:title"]')).toBe('Termos de uso · Lorkarium');
    expect(metaContent(page, 'meta[property="og:url"]')).toBe('https://lorkarium.test/termos/');
    expect(metaContent(page, 'meta[property="og:image"]')).toBe('https://lorkarium.test/og.png');
    expect(metaContent(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
  });

  it('publishes a single JSON-LD block holding the whole @graph', async () => {
    const page = await renderAstro(SiteLayout, { props: PAGE_PROPS, path: '/termos/' });

    expect(page.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
    const graph = structuredData(page)['@graph'] as Record<string, unknown>[];
    expect(graph.map((node) => node['@type'])).toEqual([
      'Organization',
      'WebSite',
      'WebPage',
      'SoftwareApplication',
    ]);
    expect(graph[2]).toMatchObject({ url: 'https://lorkarium.test/termos/' });
  });

  it('adds the trail and the page nodes it receives to the graph', async () => {
    const props = {
      ...PAGE_PROPS,
      crumbs: [{ name: 'Início', path: '/' }],
      structuredData: [{ '@type': 'FAQPage', mainEntity: [] }],
    };
    const page = await renderAstro(SiteLayout, { props });

    const types = (structuredData(page)['@graph'] as Record<string, unknown>[]).map(
      (node) => node['@type'],
    );
    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('FAQPage');
  });

  it('escapes < so no value closes the data block early', async () => {
    const props = { ...PAGE_PROPS, title: 'A </script><b>x</b>' };
    const page = await renderAstro(SiteLayout, { props });

    const script = page.querySelector('script[type="application/ld+json"]');
    expect(script?.innerHTML).not.toContain('</script>');
    expect(page.querySelector('head b')).toBeNull();
  });

  it('links the icons by stable site paths, never by a data: URL', async () => {
    const page = await renderAstro(SiteLayout, { props: PAGE_PROPS });

    const hrefOf = (selector: string): string | null =>
      page.querySelector(selector)?.getAttribute('href') ?? null;
    expect(hrefOf('link[rel="icon"][type="image/svg+xml"]')).toBe('/favicon.svg');
    expect(hrefOf('link[rel="icon"][sizes="48x48"]')).toBe('/favicon-48.png');
    expect(hrefOf('link[rel="apple-touch-icon"]')).toBe('/apple-touch-icon.png');
    expect(hrefOf('link[rel="manifest"]')).toBe('/site.webmanifest');
    const inlined = [...page.querySelectorAll('link[href^="data:"]')];
    expect(inlined.map((link) => link.outerHTML)).toEqual([]);
  });

  it('shares the image and alt text the page asks for', async () => {
    const props = {
      ...PAGE_PROPS,
      ogImage: '/og-recursos.png',
      ogImageAlt: 'Recursos no Lorkarium',
    };
    const page = await renderAstro(SiteLayout, { props });

    expect(metaContent(page, 'meta[property="og:image"]')).toBe(
      'https://lorkarium.test/og-recursos.png',
    );
    expect(metaContent(page, 'meta[property="og:image:alt"]')).toBe('Recursos no Lorkarium');
  });

  it('falls back to og.png with the default alt text when the page names no image', async () => {
    const page = await renderAstro(SiteLayout, { props: PAGE_PROPS });

    expect(metaContent(page, 'meta[property="og:image"]')).toBe('https://lorkarium.test/og.png');
    expect(metaContent(page, 'meta[property="og:image:alt"]')).toBe(
      'Mapas e combate para o seu RPG',
    );
  });

  it('refuses an og:image from another host', async () => {
    const props = { ...PAGE_PROPS, ogImage: 'https://x.com/a.png' };

    await expect(renderAstro(SiteLayout, { props })).rejects.toThrow(
      /https:\/\/x\.com\/a\.png.*expected a site path like \/og\.png/,
    );
  });

  it('preloads the Latin Cinzel the h1 is drawn with, once, from the fontsource file', async () => {
    const page = await renderAstro(SiteLayout, { props: PAGE_PROPS });

    const preloads = [...page.querySelectorAll('link[rel="preload"][as="font"]')];
    expect(preloads).toHaveLength(1);
    expect(preloads[0]?.getAttribute('type')).toBe('font/woff2');
    expect(preloads[0]?.hasAttribute('crossorigin')).toBe(true);
    expect(preloads[0]?.getAttribute('href')).toMatch(/cinzel-latin-wght-normal.*\.woff2/);
  });

  it('leaves the page indexable when it does not ask for noindex', async () => {
    const page = await renderAstro(SiteLayout, { props: PAGE_PROPS });

    expect(page.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('asks robots not to index a page that sets noindex', async () => {
    const page = await renderAstro(SiteLayout, { props: { ...PAGE_PROPS, noindex: true } });

    expect(metaContent(page, 'meta[name="robots"]')).toBe('noindex');
  });

  it('frames the slot between the header and the footer inside main', async () => {
    const page = await renderAstro(SiteLayout, {
      props: PAGE_PROPS,
      slots: { default: '<p id="page-body">Corpo</p>' },
    });

    expect(page.querySelector('header ~ main #page-body')).not.toBeNull();
    expect(page.querySelector('main ~ footer')).not.toBeNull();
  });
});
