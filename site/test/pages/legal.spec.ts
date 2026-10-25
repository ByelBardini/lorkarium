import { describe, expect, it } from 'vitest';
import PrivacyPage from '@/pages/privacidade.astro';
import TermsPage from '@/pages/termos.astro';
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

  it.each([
    ['/termos/', TermsPage],
    ['/privacidade/', PrivacyPage],
  ])('the final text at %s is indexable and says when it was updated', async (path, page) => {
    const document = await renderAstro(page, { path });

    expect(document.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.querySelector('main article p')?.textContent).toBe(
      'Atualizado em 25 de outubro de 2026',
    );
  });
});
