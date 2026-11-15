import { describe, expect, it } from 'vitest';
import { plansCopy } from '@/copy/plans-copy';
import PlansPage from '@/pages/planos.astro';
import { renderAstro } from '../support/render-astro';

function renderPlans(): Promise<Document> {
  return renderAstro(PlansPage, { path: '/planos/' });
}

describe('the plans page', () => {
  it('says up front that plans are under construction and not open', async () => {
    const page = await renderPlans();

    expect(page.querySelector('main h1')?.textContent?.trim()).toBe('Planos');
    expect(page.querySelector('main .eyebrow')?.textContent?.trim()).toBe('Em construção');
    const notice = page.querySelector('[data-plans-notice]')?.textContent ?? '';
    expect(notice).toMatch(/não estão abertos/);
    expect(notice).toMatch(/não há como assinar nem pagar/);
  });

  it('shows no price anywhere', async () => {
    const page = await renderPlans();

    expect(page.querySelector('main')?.textContent).not.toMatch(/R\$|\/mês|por mês/);
  });

  it('lists the four public plans in order, without the internal ones', async () => {
    const page = await renderPlans();

    const names = [...page.querySelectorAll('[data-plan] h2')].map((name) =>
      name.textContent?.trim(),
    );
    expect(names).toEqual(['Grátis', 'Apoiador', 'Narrador', 'Lenda']);
  });

  it('marks only the free plan as available today', async () => {
    const page = await renderPlans();

    const statuses = [...page.querySelectorAll('[data-plan] [data-plan-status]')].map((status) =>
      status.textContent?.trim(),
    );
    expect(statuses).toEqual([
      'Disponível no acesso antecipado',
      'Ainda não disponível',
      'Ainda não disponível',
      'Ainda não disponível',
    ]);
  });

  it('prints every limit of every plan from the catalog', async () => {
    const page = await renderPlans();

    const text = page.querySelector('main')?.textContent ?? '';
    const missing = plansCopy.plans.flatMap((plan) => plan.limits).filter((l) => !text.includes(l));
    expect(missing).toEqual([]);
  });

  it('stays out of search engines while under construction', async () => {
    const page = await renderPlans();

    expect(page.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });
});

describe('plansCopy', () => {
  it('opens only the free plan', () => {
    expect(plansCopy.plans.filter((plan) => plan.available).map((plan) => plan.name)).toEqual([
      'Grátis',
    ]);
  });

  it('caps the free plan at 2 bars, below the 8 the landing promises', () => {
    const free = plansCopy.plans.find((plan) => plan.name === 'Grátis');

    expect(free?.limits).toContain('2 barras e 2 formas por token');
  });
});
