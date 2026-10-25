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

  it('describes the product as a free Windows SoftwareApplication in JSON-LD', async () => {
    const page = await renderAstro(SiteLayout, { props: PAGE_PROPS });

    expect(structuredData(page)).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Lorkarium',
      operatingSystem: 'Windows 10, Windows 11',
      url: 'https://lorkarium.test/',
      offers: { price: '0', priceCurrency: 'BRL' },
    });
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
