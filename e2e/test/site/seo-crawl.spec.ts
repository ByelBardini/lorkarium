import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Crawls the production build the way a search engine would: every URL of the sitemap must be
// indexable and agree with itself, and no internal link may be broken.

interface PageSeo {
  canonical: string | null;
  h1Count: number;
  description: string | null;
  robots: string | null;
  graph: unknown;
  internalLinks: string[];
}

async function sitemapUrls(request: APIRequestContext): Promise<string[]> {
  const index = await (await request.get('/sitemap-index.xml')).text();
  const sitemaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '');
  const bodies = await Promise.all(
    sitemaps.map(async (url) => (await request.get(new URL(url).pathname)).text()),
  );
  return bodies.flatMap((xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? ''));
}

// Runs in the page (the e2e workspace has no DOM types): what a crawler reads from the head.
const READ_PAGE_SEO = `(() => {
  const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) ?? null;
  const json = document.querySelector('script[type="application/ld+json"]')?.textContent;
  const hrefs = [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href'));
  return {
    canonical: attr('link[rel="canonical"]', 'href'),
    h1Count: document.querySelectorAll('h1').length,
    description: attr('meta[name="description"]', 'content'),
    robots: attr('meta[name="robots"]', 'content'),
    graph: json ? JSON.parse(json)['@graph'] : undefined,
    internalLinks: hrefs.filter((href) => href !== null),
  };
})()`;

async function seoOf(page: Page): Promise<PageSeo> {
  return (await page.evaluate(READ_PAGE_SEO)) as PageSeo;
}

// The crawl never leaves the build: the release lookup of the download buttons fails fast instead.
test.beforeEach(async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.abort());
});

test('every URL of the sitemap is indexable, canonical to itself and links nothing broken', async ({
  page,
  request,
}) => {
  const urls = await sitemapUrls(request);
  expect(urls.length).toBeGreaterThanOrEqual(5);
  const links = new Set<string>();

  for (const url of urls) {
    const response = await page.goto(new URL(url).pathname);
    expect(response?.status(), url).toBe(200);
    const seo = await seoOf(page);
    expect(seo.canonical, url).toBe(url);
    expect(seo.h1Count, url).toBe(1);
    expect(seo.description?.length ?? 0, url).toBeGreaterThan(0);
    expect(seo.robots, url).toBeNull();
    expect(Array.isArray(seo.graph), url).toBe(true);
    for (const href of seo.internalLinks) links.add(href.split('#')[0] ?? '/');
  }

  for (const href of links) {
    expect((await request.get(href)).status(), `internal link ${href}`).toBe(200);
  }
});

test('the thank-you and the error pages stay out of the sitemap and out of the index', async ({
  page,
  request,
}) => {
  const paths = (await sitemapUrls(request)).map((url) => new URL(url).pathname);
  expect(paths).not.toContain('/obrigado/');
  expect(paths).not.toContain('/404/');

  await page.goto('/obrigado/');
  expect((await seoOf(page)).robots).toBe('noindex');
  await page.goto('/nao-existe/');
  expect((await seoOf(page)).robots).toBe('noindex');
});
