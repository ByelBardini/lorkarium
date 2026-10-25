import { describe, expect, it } from 'vitest';
import FaqList from '@/components/faq-list.astro';
import { landingCopy } from '@/copy/landing-copy';
import { renderAstro } from '../support/render-astro';

describe('FaqList', () => {
  it('renders one exclusive <details> per question', async () => {
    const faq = await renderAstro(FaqList);

    const items = [...faq.querySelectorAll('details')];
    expect(items).toHaveLength(landingCopy.faqs.length);
    expect(items.every((item) => item.getAttribute('name') === 'faq')).toBe(true);
  });

  it('opens only the first question', async () => {
    const faq = await renderAstro(FaqList);

    const open = [...faq.querySelectorAll('details')].map((item) => item.hasAttribute('open'));
    expect(open).toEqual(landingCopy.faqs.map((_, index) => index === 0));
  });

  it('answers the price as free during early access', async () => {
    const faq = await renderAstro(FaqList);

    const price = [...faq.querySelectorAll('details')].find((item) =>
      item.querySelector('summary')?.textContent?.includes('Quanto custa?'),
    );
    expect(price?.textContent).toContain('grátis enquanto está em acesso antecipado');
  });

  it('links the account question to an invite request e-mail', async () => {
    const faq = await renderAstro(FaqList);

    const account = [...faq.querySelectorAll('details')].find((item) =>
      item.querySelector('summary')?.textContent?.includes('Como consigo uma conta?'),
    );
    const invite = account?.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
    expect(invite?.href).toBe(
      'mailto:contato@lorkarium.test?subject=Convite%20para%20o%20Lorkarium',
    );
  });
});
