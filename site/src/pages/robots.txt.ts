import type { APIContext } from 'astro';

/**
 * `/robots.txt`, built from `site` so the sitemap line follows SITE_URL.
 * Example: with SITE_URL=https://lorkarium.com.br it ends in `Sitemap: https://lorkarium.com.br/sitemap-index.xml`
 */
export function GET({ site }: Pick<APIContext, 'site'>): Response {
  if (!site) {
    throw new Error(`site is ${String(site)}; expected SITE_URL like https://lorkarium.com.br`);
  }
  const sitemapUrl = new URL('/sitemap-index.xml', site).href;
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
