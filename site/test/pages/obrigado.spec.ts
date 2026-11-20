import { describe, expect, it } from 'vitest';
import ThankYouPage from '@/pages/obrigado.astro';
import { renderAstro } from '../support/render-astro';

describe('the thank-you page', () => {
  it('stays out of search engines', async () => {
    const page = await renderAstro(ThankYouPage, { path: '/obrigado/' });

    expect(page.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });

  it('walks through the three install steps, SmartScreen included', async () => {
    const page = await renderAstro(ThankYouPage, { path: '/obrigado/' });

    const steps = [...page.querySelectorAll('ol[aria-label="Como instalar"] > li')];
    expect(steps).toHaveLength(3);
    expect(steps[1]?.textContent).toContain('assinatura digital');
    expect(steps[1]?.textContent).toContain('não significa que um vírus');
    expect(steps[1]?.textContent).toContain('Mais informações');
    expect(steps[1]?.textContent).toContain('Executar assim mesmo');
    expect(steps[2]?.textContent).not.toMatch(/convite/i);
  });

  it('offers creating an account and the browser version', async () => {
    const page = await renderAstro(ThankYouPage, { path: '/obrigado/' });

    expect(
      page.querySelector('a[href="https://mesa.lorkarium.test/sign-up"]')?.textContent?.trim(),
    ).toBe('Criar conta');
    expect(page.body.textContent).not.toMatch(/convite/i);
    expect(page.querySelector('a[href="https://mesa.lorkarium.test/login"]')).not.toBeNull();
  });
});
