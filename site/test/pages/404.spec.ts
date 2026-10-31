import { describe, expect, it } from 'vitest';
import NotFoundPage from '@/pages/404.astro';
import { renderAstro } from '../support/render-astro';

describe('the not-found page', () => {
  it('leads back to the landing from inside the site frame', async () => {
    const page = await renderAstro(NotFoundPage, { path: '/nao-existe/' });

    const back = page.querySelector('main a[href="/"]');
    expect(back?.textContent?.trim()).toBe('Voltar para o início');
  });

  it('tells the visitor in the voice of the table and in plain words', async () => {
    const page = await renderAstro(NotFoundPage, { path: '/nao-existe/' });

    expect(page.querySelector('main h1')?.textContent?.trim()).toBe('Esta casa não está no mapa');
    expect(page.querySelector('main')?.textContent).toContain('Página não encontrada');
  });

  it('stays out of search engines', async () => {
    const page = await renderAstro(NotFoundPage, { path: '/nao-existe/' });

    expect(page.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });
});
