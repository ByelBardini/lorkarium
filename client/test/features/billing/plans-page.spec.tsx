import { PLAN_LIMITS } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { CHECKOUT_URL } from '../../support/billing-api-fake';

describe('the plans page (/planos)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith({ ...ANA, plan: 'free', limits: PLAN_LIMITS.free });
  });

  async function openPlans(): Promise<HTMLElement> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/planos'] });
    render(<RouterProvider router={router} />);
    return screen.findByRole('region', { name: 'Planos' });
  }

  function cardOf(page: HTMLElement, plan: string): HTMLElement {
    return within(page).getByRole('article', { name: plan });
  }

  async function subscribe(page: HTMLElement, plan: string): Promise<HTMLElement> {
    await userEvent.click(
      within(cardOf(page, plan)).getByRole('button', { name: `Assinar ${plan}` }),
    );
    return screen.findByRole('dialog', { name: `Assinar ${plan}` });
  }

  it('starts on the annual period: the month it comes to, the total and the saving', async () => {
    const page = await openPlans();

    expect(within(page).getByRole('radio', { name: 'Anual, até 20% de desconto' })).toBeChecked();
    const narrador = cardOf(page, 'Narrador');
    expect(narrador).toHaveTextContent(/11\s*,91\s*\/mês/);
    expect(narrador).toHaveTextContent('R$ 142,90 por ano');
    expect(narrador).toHaveTextContent('economiza R$ 35,90');
    expect(narrador).toHaveTextContent('R$ 14,90/mês');
  });

  it('the monthly period shows the price itself, charged every month', async () => {
    const page = await openPlans();
    await userEvent.click(within(page).getByRole('radio', { name: 'Mensal' }));

    expect(cardOf(page, 'Lenda')).toHaveTextContent(/24\s*,90\s*\/mês/);
    expect(cardOf(page, 'Lenda')).toHaveTextContent('Cobrado todo mês no cartão');
  });

  it('each plan carries its seal and Narrador is marked for whoever runs the table', async () => {
    const page = await openPlans();

    expect(within(cardOf(page, 'Lenda')).getByRole('img', { name: 'Plano Lenda' })).toBeVisible();
    expect(cardOf(page, 'Narrador')).toHaveTextContent('Para quem mestra');
  });

  it('marks the plan of the account and says it in the header', async () => {
    const page = await openPlans();

    expect(
      within(cardOf(page, 'Grátis')).getByRole('button', { name: 'Seu plano atual' }),
    ).toBeDisabled();
    expect(within(page).getByText('Seu plano:').parentElement).toHaveTextContent(
      'Seu plano: Grátis',
    );
  });

  it('subscribing shows the summary first and leaves for the Mercado Pago only on confirm', async () => {
    const page = await openPlans();
    await userEvent.click(within(page).getByRole('radio', { name: 'Pix' }));

    const dialog = await subscribe(page, 'Lenda');
    const receipt = within(dialog).getByRole('list', { name: 'Resumo da compra' });
    expect(receipt).toHaveTextContent(/Lenda · 12 meses\s*R\$ 298,80/);
    expect(receipt).toHaveTextContent(/Desconto do plano anual \(20%\)\s*− R\$ 59,90/);
    expect(receipt).toHaveTextContent(/Total hoje.*R\$ 238,90/);
    expect(dialog).toHaveTextContent('Vale até 14/10/2027');
    expect(dialog).toHaveTextContent('Não renova sozinho');
    expect(deps.billingApi.answers.callsOf('checkout')).toEqual([]);

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Continuar no Mercado Pago' }),
    );

    expect(deps.billingApi.answers.callsOf('checkout')).toEqual([
      { priceKey: 'lenda_annual', method: 'pix' },
    ]);
    expect(deps.checkoutNavigation.visited).toEqual([CHECKOUT_URL]);
  });

  it('a monthly card subscription has no discount line and says the next charge', async () => {
    const page = await openPlans();
    await userEvent.click(within(page).getByRole('radio', { name: 'Mensal' }));

    const dialog = await subscribe(page, 'Narrador');
    const receipt = within(dialog).getByRole('list', { name: 'Resumo da compra' });
    expect(receipt).not.toHaveTextContent('Desconto');
    expect(receipt).toHaveTextContent(/Total hoje\s*R\$ 14,90/);
    expect(dialog).toHaveTextContent('Próxima cobrança em 14/11/2026: R$ 14,90');
    expect(dialog).toHaveTextContent('7 dias');
  });

  it('a refused redirect never leaves the app and says so in the summary', async () => {
    deps.billingApi.answers.answer('checkout', { ok: false, failure: { kind: 'unexpected' } });
    const page = await openPlans();

    const dialog = await subscribe(page, 'Narrador');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Continuar no Mercado Pago' }),
    );

    expect(deps.checkoutNavigation.visited).toEqual([]);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Não deu para abrir o pagamento',
    );
  });

  it('a 429 says how long to wait', async () => {
    deps.billingApi.answers.answer('checkout', {
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 42 },
    });
    const page = await openPlans();

    const dialog = await subscribe(page, 'Narrador');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Continuar no Mercado Pago' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tente de novo em 42 s');
  });

  it('a paid Narrador marks Narrador as current and offers only the upgrade to Lenda', async () => {
    deps.authApi.answerMeWith({
      ...ANA,
      plan: 'free',
      limits: PLAN_LIMITS.narrador,
      paidPlan: 'narrador',
      paidPlanUntil: '2027-11-24T15:00:00.000Z',
    });
    const page = await openPlans();

    expect(
      within(cardOf(page, 'Narrador')).getByRole('button', { name: 'Seu plano atual' }),
    ).toBeDisabled();
    for (const below of ['Grátis', 'Apoiador']) {
      expect(within(cardOf(page, below)).queryByRole('button', { name: /^Assinar/ })).toBeNull();
      expect(cardOf(page, below)).toHaveTextContent('Incluído no seu plano');
    }
    const upgrade = within(cardOf(page, 'Lenda')).getByRole('button', {
      name: 'Fazer upgrade para Lenda',
    });
    await userEvent.click(upgrade);
    expect(await screen.findByRole('dialog', { name: 'Assinar Lenda' })).toBeVisible();
  });

  it('an account with a Lenda of the admin has nothing left to buy', async () => {
    deps.authApi.answerMeWith({ ...ANA, plan: 'lenda', limits: PLAN_LIMITS.lenda });
    const page = await openPlans();

    expect(
      within(cardOf(page, 'Lenda')).getByRole('button', { name: 'Seu plano atual' }),
    ).toBeDisabled();
    expect(within(page).queryByRole('button', { name: /^(Assinar|Fazer upgrade)/ })).toBeNull();
  });

  it('an admin on a stored Grátis is shown as Administrador, above every plan on sale', async () => {
    deps.authApi.answerMeWith({
      ...ANA,
      role: 'admin',
      plan: 'free',
      limits: PLAN_LIMITS.amigo_do_dono,
    });
    const page = await openPlans();

    expect(within(page).getByText('Seu plano:').parentElement).toHaveTextContent(
      'Seu plano: Administrador',
    );
    expect(within(page).queryByRole('button', { name: 'Seu plano atual' })).toBeNull();
    expect(within(page).queryByRole('button', { name: /^(Assinar|Fazer upgrade)/ })).toBeNull();
    expect(cardOf(page, 'Lenda')).toHaveTextContent('Incluído no seu plano');
  });

  it('compares every limit side by side', async () => {
    const page = await openPlans();

    expect(within(page).getByRole('table', { name: 'Limites por plano' })).toBeVisible();
  });

  it('the catalog that does not load shows the failure instead of prices', async () => {
    deps.billingApi.answers.answer('prices', { ok: false, failure: { kind: 'offline' } });
    const page = await openPlans();

    expect(within(page).getByRole('alert')).toHaveTextContent('Sem conexão');
    expect(within(page).queryByRole('article')).toBeNull();
  });
});
