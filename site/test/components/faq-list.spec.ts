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
    expect(price?.textContent).toContain('gratuito durante o acesso antecipado');
  });

  it('titles the questions in the voice of the table', async () => {
    const faq = await renderAstro(FaqList);

    expect(faq.querySelector('section#perguntas h2')?.textContent?.trim()).toBe(
      'Perguntas da mesa',
    );
  });

  it('ends every answer that asks for an invite with the "Pedir convite" link', async () => {
    const faq = await renderAstro(FaqList);

    const inviteAnswers = [...faq.querySelectorAll('details p')].filter((answer) =>
      answer.querySelector('a[href*="subject="]'),
    );
    expect(inviteAnswers.length).toBe(1);
    expect(
      inviteAnswers.every((answer) => answer.lastElementChild?.textContent === 'Pedir convite'),
    ).toBe(true);
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
