import { describe, expect, it } from 'vitest';
import SiteFooter from '@/components/site-footer.astro';
import { renderAstro } from '../support/render-astro';

function hrefOf(page: Document, name: string): string | null {
  const links = Array.from(page.querySelectorAll('footer a'));
  const link = links.find((candidate) => candidate.textContent?.trim() === name);
  return link?.getAttribute('href') ?? null;
}

describe('the site footer', () => {
  it.each([
    ['Termos de uso', '/termos/'],
    ['Privacidade', '/privacidade/'],
    ['Contato', 'mailto:contato@lorkarium.test'],
  ])('links "%s" to %s', async (name, href) => {
    const page = await renderAstro(SiteFooter);

    expect(hrefOf(page, name)).toBe(href);
  });

  it('signs off with the brand and the tagline', async () => {
    const page = await renderAstro(SiteFooter);

    expect(page.body.textContent).toContain('LORKARIUM');
  });
});
