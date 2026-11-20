import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { renderAstro } from '../support/render-astro';
import { publishedPages } from '../support/published-pages';
import { duplicatesOf, seoOf, seoProblemsOf } from '../support/seo-rules';

const SITE_URL = 'https://lorkarium.test';

async function renderedPages(): Promise<{ path: string; page: Document; indexable: boolean }[]> {
  const pages = await publishedPages();
  return Promise.all(
    pages.map(async ({ path, component, props, indexable }) => ({
      path,
      indexable,
      page: await renderAstro(component, { path, props }),
    })),
  );
}

describe('the SEO guard over every published page', () => {
  it('finds every page the site publishes', async () => {
    const paths = (await publishedPages()).map((entry) => entry.path);

    expect(paths).toEqual(
      expect.arrayContaining(['/', '/planos/', '/termos/', '/privacidade/', '/uso/']),
    );
    expect(paths).not.toContain('/obrigado/');
    expect(paths).not.toContain('/404/');
  });

  it('keeps title, description, h1, canonical and robots of each page in the rules', async () => {
    const problems = (await renderedPages()).flatMap(({ path, page, indexable }) =>
      seoProblemsOf(page, path, SITE_URL, { indexable }),
    );

    expect(problems).toEqual([]);
  });

  it('gives no two pages the same title or description', async () => {
    const seo = (await renderedPages()).map(({ path, page }) => seoOf(page, path));

    expect(duplicatesOf(seo)).toEqual([]);
  });

  it('bites: a page with a 200-character description fails the rules', () => {
    const description = 'x'.repeat(200);
    const html = `<html><head><title>Página de teste · Lorkarium</title>
      <meta name="description" content="${description}">
      <link rel="canonical" href="${SITE_URL}/teste/"></head><body><h1>Teste</h1></body></html>`;

    const problems = seoProblemsOf(new JSDOM(html).window.document, '/teste/', SITE_URL);

    expect(problems).toEqual([expect.stringMatching(/description has 200 chars/)]);
  });

  it('bites: noindex on an indexable page is reported, and allowed on a draft', () => {
    const html = `<html><head><title>Página de teste · Lorkarium</title>
      <meta name="description" content="${'d'.repeat(80)}"><meta name="robots" content="noindex">
      <link rel="canonical" href="${SITE_URL}/teste/"></head><body><h1>Teste</h1></body></html>`;
    const page = new JSDOM(html).window.document;

    expect(seoProblemsOf(page, '/teste/', SITE_URL)).toEqual([
      '/teste/: noindex on an indexable page',
    ]);
    expect(seoProblemsOf(page, '/teste/', SITE_URL, { indexable: false })).toEqual([]);
  });

  it('bites: two pages with one title are reported', () => {
    const page = { title: 'Igual · Lorkarium', description: 'd' };

    expect(
      duplicatesOf([
        { ...page, path: '/a/' },
        { ...page, path: '/b/', description: 'e' },
      ]),
    ).toEqual(['title "Igual · Lorkarium": /a/, /b/']);
  });
});
