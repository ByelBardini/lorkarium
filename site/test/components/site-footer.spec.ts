import { describe, expect, it } from 'vitest';
import SiteFooter from '@/components/site-footer.astro';
import { renderAstro } from '../support/render-astro';

const REPOSITORY = 'https://github.com/ByelBardini/lorkarium';

function footerLinks(page: Document): HTMLAnchorElement[] {
  return Array.from(page.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Rodapé"] a'));
}

function linkNamed(page: Document, name: string): HTMLAnchorElement | undefined {
  return footerLinks(page).find((candidate) => candidate.textContent?.trim() === name);
}

describe('the site footer', () => {
  it.each([
    ['Planos', '/planos/'],
    ['Termos de uso', '/termos/'],
    ['Privacidade', '/privacidade/'],
    ['Política de uso', '/uso/'],
    ['Código-fonte', REPOSITORY],
    ['Contato', 'mailto:contato@lorkarium.test'],
  ])('links "%s" to %s', async (name, href) => {
    const page = await renderAstro(SiteFooter);

    expect(linkNamed(page, name)?.getAttribute('href')).toBe(href);
  });

  it('opens the source code away from the site, without handing it the opener', async () => {
    const page = await renderAstro(SiteFooter);
    const source = linkNamed(page, 'Código-fonte');

    expect(source?.getAttribute('target')).toBe('_blank');
    expect(source?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('keeps the site links on the site (only the source code opens a new tab)', async () => {
    const page = await renderAstro(SiteFooter);
    const newTab = footerLinks(page).filter((link) => link.getAttribute('target') === '_blank');

    expect(newTab.map((link) => link.textContent?.trim())).toEqual(['Código-fonte']);
  });

  it('lists the plans, the three legal texts, the source code and the contact, in that order', async () => {
    const page = await renderAstro(SiteFooter);

    expect(footerLinks(page).map((link) => link.textContent?.trim())).toEqual([
      'Planos',
      'Termos de uso',
      'Privacidade',
      'Política de uso',
      'Código-fonte',
      'Contato',
    ]);
  });

  it('signs off with the brand and the tagline', async () => {
    const page = await renderAstro(SiteFooter);

    expect(page.body.textContent).toContain('LORKARIUM');
  });
});
