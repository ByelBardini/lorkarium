import { describe, expect, it } from 'vitest';
import PrivacyPage from '@/pages/privacidade.astro';
import TermsPage from '@/pages/termos.astro';
import AcceptableUsePage from '@/pages/uso.astro';
import { renderAstro } from '../support/render-astro';

const PRIVACY_CHANNEL = 'mailto:privacidade@evolutivasistemas.com.br';

describe('the legal pages', () => {
  it('renders the terms title and Markdown body inside the site frame', async () => {
    const page = await renderAstro(TermsPage, { path: '/termos/' });

    expect(page.querySelector('main h1')?.textContent).toBe('Termos de uso');
    expect(page.querySelector('main h2')?.textContent).toBe('1. Quem somos e o que você aceita');
    expect(page.querySelector('header a[href="/obrigado/"]')).not.toBeNull();
    expect(page.querySelector('footer a[href="/privacidade/"]')).not.toBeNull();
  });

  it('names the controller and links the terms to the privacy policy', async () => {
    const page = await renderAstro(TermsPage, { path: '/termos/' });

    expect(page.querySelector('main')?.textContent).toContain('Evolutiva Sistemas');
    expect(page.querySelector('main article a[href="/privacidade/"]')).not.toBeNull();
  });

  it('identifies the supplier in the terms with the masked CPF only (Decreto 7.962/2013)', async () => {
    const page = await renderAstro(TermsPage, { path: '/termos/' });
    const supplier = page.querySelector('main article address');

    expect(supplier?.textContent).toContain('***.982.247-**');
    expect(page.documentElement.outerHTML).not.toContain('52998224725');
  });

  it('renders the privacy policy at its own canonical path', async () => {
    const page = await renderAstro(PrivacyPage, { path: '/privacidade/' });

    expect(page.querySelector('main h1')?.textContent).toBe('Política de privacidade');
    expect(page.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://lorkarium.test/privacidade/',
    );
  });

  it('gives the data subject a working channel to the controller (LGPD art. 41)', async () => {
    const page = await renderAstro(PrivacyPage, { path: '/privacidade/' });

    expect(page.querySelector(`main article a[href="${PRIVACY_CHANNEL}"]`)).not.toBeNull();
  });

  it('renders the acceptable use policy at /uso/, incorporated by the terms', async () => {
    const page = await renderAstro(AcceptableUsePage, { path: '/uso/' });

    expect(page.querySelector('main h1')?.textContent).toBe('Política de uso aceitável');
    expect(page.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://lorkarium.test/uso/',
    );
    expect(page.querySelector('main article a[href="/termos/"]')).not.toBeNull();
  });

  it('points the terms at the acceptable use policy', async () => {
    const page = await renderAstro(TermsPage, { path: '/termos/' });

    expect(page.querySelector('main article a[href="/uso/"]')).not.toBeNull();
  });

  it.each([
    ['/termos/', TermsPage],
    ['/privacidade/', PrivacyPage],
    ['/uso/', AcceptableUsePage],
  ])('the final text at %s is indexable and says when it was updated', async (path, page) => {
    const document = await renderAstro(page, { path });

    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.querySelector('main article p')?.textContent).toBe(
      'Atualizado em 20 de novembro de 2026',
    );
  });
});
