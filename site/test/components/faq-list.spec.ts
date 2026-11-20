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

  it('answers the price as free to play, with paid plans signed in the app', async () => {
    const faq = await renderAstro(FaqList);

    const price = [...faq.querySelectorAll('details')].find((item) =>
      item.querySelector('summary')?.textContent?.includes('Quanto custa?'),
    );
    expect(price?.textContent).toContain('Jogar é de graça');
    expect(price?.textContent).toContain('assinados no app');
    expect(price?.textContent).not.toContain('não estão à venda');
  });

  it('sends the price answer to the plans page', async () => {
    const faq = await renderAstro(FaqList);

    const price = [...faq.querySelectorAll('details')].find((item) =>
      item.querySelector('summary')?.textContent?.includes('Quanto custa?'),
    );
    expect(price?.querySelector('p')?.lastElementChild?.getAttribute('href')).toBe('/planos/');
  });

  it('ends the open source answer with the link to the repository', async () => {
    const faq = await renderAstro(FaqList);

    const openSource = [...faq.querySelectorAll('details')].find((item) =>
      item.querySelector('summary')?.textContent?.includes('open source'),
    );
    expect(openSource?.querySelector('p')?.lastElementChild?.getAttribute('href')).toBe(
      'https://github.com/ByelBardini/lorkarium',
    );
  });

  it('titles the questions in the voice of the table', async () => {
    const faq = await renderAstro(FaqList);

    expect(faq.querySelector('section#perguntas h2')?.textContent?.trim()).toBe(
      'Perguntas da mesa',
    );
  });

  it('asks for no invite in any answer', async () => {
    const faq = await renderAstro(FaqList);

    expect(faq.querySelector('a[href*="subject="]')).toBeNull();
    expect(faq.body.textContent).not.toMatch(/convite/i);
  });

  it('ends the account answer with the "Criar conta" link to the app', async () => {
    const faq = await renderAstro(FaqList);

    const account = [...faq.querySelectorAll('details')].find((item) =>
      item.querySelector('summary')?.textContent?.includes('Como consigo uma conta?'),
    );
    const signUp = account?.querySelector('p')?.lastElementChild;
    expect(signUp?.textContent).toBe('Criar conta');
    expect(signUp?.getAttribute('href')).toBe('https://mesa.lorkarium.test/sign-up');
  });
});
