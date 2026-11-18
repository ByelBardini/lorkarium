import { describe, expect, it } from 'vitest';
import { plansCopy } from '@/copy/plans-copy';
import PlansPage from '@/pages/planos.astro';
import { renderAstro } from '../support/render-astro';

function renderPlans(): Promise<Document> {
  return renderAstro(PlansPage, { path: '/planos/' });
}

describe('the plans page', () => {
  it('says up front that the paid plans are not open yet and the prices may change', async () => {
    const page = await renderPlans();

    expect(page.querySelector('main h1')?.textContent).toMatch(/Sua mesa, seu ritmo/);
    const notice = page.querySelector('[data-plans-notice]')?.textContent ?? '';
    expect(notice).toMatch(/abrem depois do acesso antecipado/);
    expect(notice).toMatch(/podem mudar/);
  });

  it('chooses the period with three radios, the annual one checked, each with its saving', async () => {
    const page = await renderPlans();

    const radios = [...page.querySelectorAll<HTMLInputElement>('input[name="periodo"]')];
    expect(radios.map((radio) => radio.value)).toEqual(['mensal', 'semestral', 'anual']);
    expect(radios.find((radio) => radio.checked)?.value).toBe('anual');
    const labels = [...page.querySelectorAll('[data-period-option]')].map((l) => l.textContent);
    expect(labels[1]).toMatch(/até 10%/);
    expect(labels[2]).toMatch(/até 20%/);
  });

  it('prices each paid plan in every period: the month it comes to, the total and the saving', async () => {
    const page = await renderPlans();

    const narrador = page.querySelector('[data-plan="Narrador"]');
    const annual = narrador?.querySelector('[data-period="anual"]')?.textContent ?? '';
    expect(annual).toMatch(/11\s*,91/);
    expect(annual).toMatch(/R\$ 14,90\/mês/);
    expect(annual).toMatch(/R\$ 142,90 por ano/);
    expect(annual).toMatch(/economiza R\$ 35,90/);
    expect(narrador?.querySelector('[data-period="mensal"]')?.textContent).toMatch(/14\s*,90/);
    expect(narrador?.querySelector('[data-period="semestral"]')?.textContent).toMatch(
      /R\$ 79,90 a cada 6 meses/,
    );
  });

  it('draws the seal of each paid plan and the crystal of the logo on Grátis', async () => {
    const page = await renderPlans();

    const seals = [...page.querySelectorAll('[data-plan] [data-plan-seal]')].map((seal) =>
      seal.getAttribute('data-plan-seal'),
    );
    expect(seals).toEqual(['logo', 'apoiador', 'narrador', 'lenda']);
    expect(page.querySelector('[data-plan="Lenda"] [data-plan-seal] svg path')).not.toBeNull();
  });

  it('asks the invitation on Grátis and a notice by e-mail on the paid plans', async () => {
    const page = await renderPlans();

    const free = page.querySelector('[data-plan="Grátis"] [data-plan-cta]');
    expect(free?.textContent?.trim()).toBe('Pedir convite');
    const lenda = page.querySelector('[data-plan="Lenda"] [data-plan-cta]');
    expect(lenda?.textContent?.trim()).toBe('Me avise quando abrir');
    expect(lenda?.getAttribute('href')).toMatch(/^mailto:.*subject=.*Lenda/);
  });

  it('marks the Narrador as the plan for whoever runs the table', async () => {
    const page = await renderPlans();

    expect(page.querySelector('[data-plan="Narrador"] [data-plan-tag]')?.textContent?.trim()).toBe(
      'Para quem mestra',
    );
  });

  it('answers the questions about paying', async () => {
    const page = await renderPlans();

    const questions = [...page.querySelectorAll('#perguntas summary')].map((q) => q.textContent);
    expect(questions.join(' ')).toMatch(/Cartão ou Pix/);
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

  it('keeps the prices of the billing catalog, in cents', () => {
    const prices = Object.fromEntries(plansCopy.plans.map((plan) => [plan.name, plan.priceCents]));

    expect(prices).toEqual({
      Grátis: null,
      Apoiador: { mensal: 490, semestral: 2690, anual: 4690 },
      Narrador: { mensal: 1490, semestral: 7990, anual: 14290 },
      Lenda: { mensal: 2490, semestral: 13390, anual: 23890 },
    });
  });

  it('caps the free plan at 1 bar and no interactive map, below the 8 bars the landing promises', () => {
    const free = plansCopy.plans.find((plan) => plan.name === 'Grátis');

    expect(free?.limits).toContain('1 barra e 2 formas por token');
    expect(free?.limits).toContain('3 grids e 1 modelo de ficha sem scripts por mesa');
  });

  it('keeps the desktop windows, the effect auras and the animated art on Lenda only', () => {
    const limitsOf = (name: string) =>
      plansCopy.plans.find((plan) => plan.name === name)?.limits.join(' | ') ?? '';

    expect(limitsOf('Narrador')).not.toMatch(/Janelas|efeito|animad/);
    expect(limitsOf('Lenda')).toContain('Janelas de Chat e Imagens no app para Windows');
    expect(limitsOf('Lenda')).toContain('Auras com efeito ou imagem');
  });

  it('tells that what passed the plan stays, read only', () => {
    expect(plansCopy.rules.join(' ')).toContain('só leitura');
  });
});
