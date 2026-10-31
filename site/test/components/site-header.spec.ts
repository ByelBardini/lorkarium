import { describe, expect, it } from 'vitest';
import SiteHeader from '@/components/site-header.astro';
import { renderAstro } from '../support/render-astro';

function linkNamed(page: Document, name: string): HTMLAnchorElement | undefined {
  const links = Array.from(page.querySelectorAll('a'));
  return links.find((link) => link.textContent?.trim() === name);
}

describe('the site header', () => {
  it('sends "Já tenho conta" to the login of the web app', async () => {
    const page = await renderAstro(SiteHeader);

    expect(linkNamed(page, 'Já tenho conta')?.href).toBe('https://mesa.lorkarium.test/login');
  });

  it('sends "Baixar" to the thank-you page as a download CTA', async () => {
    const page = await renderAstro(SiteHeader);

    const download = linkNamed(page, 'Baixar');
    expect(download?.getAttribute('href')).toBe('/obrigado/');
    expect(download?.hasAttribute('data-download-cta')).toBe(true);
  });

  it.each([
    ['A sessão', '/#cena'],
    ['Combate', '/#combate'],
    ['Perguntas', '/#perguntas'],
  ])('links "%s" to the landing anchor %s', async (name, href) => {
    const page = await renderAstro(SiteHeader);

    expect(linkNamed(page, name)?.getAttribute('href')).toBe(href);
  });

  it('takes the brand back to the top of the landing', async () => {
    const page = await renderAstro(SiteHeader);

    const brand = page.querySelector('a[href="/#topo"]');
    expect(brand?.textContent).toContain('LORKARIUM');
  });

  it('hides the anchors and the login link on phones, keeping brand and "Baixar"', async () => {
    const page = await renderAstro(SiteHeader);

    expect(page.querySelector('nav')?.classList.contains('hidden')).toBe(true);
    expect(linkNamed(page, 'Já tenho conta')?.classList.contains('hidden')).toBe(true);
    expect(linkNamed(page, 'Baixar')?.classList.contains('hidden')).toBe(false);
  });
});
