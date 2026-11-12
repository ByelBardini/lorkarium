import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { accountPlanOf } from '../../support/account-plan-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

describe('"Seu plano" in Minha conta', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ANA);
  });

  async function openPlan(): Promise<HTMLElement> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/account'] });
    render(<RouterProvider router={router} />);
    return screen.findByRole('region', { name: 'Seu plano' });
  }

  function cellOf(table: HTMLElement, row: string, column: string): HTMLElement {
    const headers = within(table).getAllByRole('columnheader');
    const index = headers.findIndex((header) => header.textContent?.startsWith(column));
    const line = within(table).getByRole('row', { name: new RegExp(`^${row}`) });
    const cell = within(line).getAllByRole('cell')[index - 1];
    if (cell === undefined) throw new Error(`no cell ${row} × ${column} (index ${index})`);
    return cell;
  }

  it('a free account with 1 table and 40 MB shows Grátis and the usage against the grid', async () => {
    deps.accountPlanApi.plan = accountPlanOf('free', { campaignsOwned: 1, storageMegabytes: 40 });
    const section = await openPlan();

    expect(within(section).getByRole('heading', { name: 'Grátis', level: 3 })).toBeVisible();
    expect(within(section).getByText('1 de 1 mesa')).toBeVisible();
    expect(within(section).getByText('40 MB de 100 MB')).toBeVisible();
  });

  it('the grid compares the four plans and marks the account one', async () => {
    deps.accountPlanApi.plan = accountPlanOf('narrador', { campaignsOwned: 2 });
    const section = await openPlan();
    const table = within(section).getByRole('table', { name: 'Limites por plano' });

    const current = within(table).getByRole('columnheader', { current: true });
    expect(current).toHaveTextContent('Narrador');
    expect(current).toHaveTextContent('Seu plano');
    expect(cellOf(table, 'Grids por mesa', 'Grátis')).toHaveTextContent('5');
    expect(cellOf(table, 'Grids por mesa', 'Narrador')).toHaveTextContent('20');
    expect(cellOf(table, 'Armazenamento', 'Lenda')).toHaveTextContent('10 GB');
    expect(cellOf(table, 'Duplicar grid', 'Grátis')).toHaveTextContent('não');
    expect(within(section).getByText('2 de 5 mesas')).toBeVisible();
  });

  it('a Lenda account sees "ilimitado" on the fair-use items, the real number elsewhere', async () => {
    deps.accountPlanApi.plan = accountPlanOf('lenda');
    const section = await openPlan();
    const table = within(section).getByRole('table', { name: 'Limites por plano' });

    expect(within(section).getByRole('heading', { name: 'Lenda', level: 3 })).toBeVisible();
    expect(within(table).getByRole('columnheader', { current: true })).toHaveTextContent('Lenda');
    for (const row of ['Grids por mesa', 'Mapas interativos', 'Modelos de ficha', 'Fichas de NPC'])
      expect(cellOf(table, row, 'Lenda')).toHaveTextContent('ilimitado');
    expect(cellOf(table, 'Jogadores por mesa', 'Lenda')).toHaveTextContent('20');
    expect(cellOf(table, 'Grids por mesa', 'Narrador')).toHaveTextContent('20');
  });

  it('an Amigo do Dono account has no plan limit: the usage has no ceiling', async () => {
    deps.accountPlanApi.plan = accountPlanOf('amigo_do_dono', {
      campaignsOwned: 3,
      storageMegabytes: 1536,
    });
    const section = await openPlan();

    expect(within(section).getByRole('heading', { name: 'Amigo do Dono', level: 3 })).toBeVisible();
    expect(within(section).getByText(/sem limite de plano/i)).toBeVisible();
    expect(within(section).getByText('3 mesas')).toBeVisible();
    expect(within(section).getByText('1,5 GB')).toBeVisible();
  });

  it('an admin keeps the stored plan name but has no plan limit', async () => {
    deps.profileApi.profile = { ...deps.profileApi.profile, admin: true };
    deps.accountPlanApi.plan = accountPlanOf('free', {
      limitsOf: 'amigo_do_dono',
      campaignsOwned: 1,
    });
    const section = await openPlan();
    const table = within(section).getByRole('table', { name: 'Limites por plano' });

    expect(within(section).getByText(/administrador.*sem limite de plano/i)).toBeVisible();
    expect(within(table).getByRole('columnheader', { current: true })).toHaveTextContent(
      'Amigo do Dono',
    );
    expect(within(section).getByText('1 mesa')).toBeVisible();
  });

  it('the one seal sits beside the name of the plan', async () => {
    deps.accountPlanApi.plan = accountPlanOf('lenda');
    const section = await openPlan();
    const heading = within(section).getByRole('heading', { name: 'Lenda', level: 3 });
    expect(heading.nextElementSibling).toBe(
      within(section).getByRole('img', { name: 'Plano Lenda' }),
    );
  });

  it('an Apoiador sees its name and seal, the Grátis numbers and the customizations open', async () => {
    deps.accountPlanApi.plan = accountPlanOf('apoiador', { campaignsOwned: 1 });
    const section = await openPlan();
    const table = within(section).getByRole('table', { name: 'Limites por plano' });

    expect(within(section).getByRole('heading', { name: 'Apoiador', level: 3 })).toBeVisible();
    expect(within(section).getByRole('img', { name: 'Apoiador' })).toBeVisible();
    expect(within(section).getByText('1 de 1 mesa')).toBeVisible();
    expect(within(table).getByRole('columnheader', { current: true })).toHaveTextContent(
      'Apoiador',
    );
    expect(within(section).getByText(/personalizações da conta.*liberadas/i)).toBeVisible();
  });

  it('the Dono do Lorkarium on Grátis shows its seal and why there is no plan limit', async () => {
    deps.profileApi.profile = { ...deps.profileApi.profile, lorkariumOwner: true };
    deps.accountPlanApi.plan = accountPlanOf('free', { limitsOf: 'amigo_do_dono' });
    const section = await openPlan();

    expect(await within(section).findByRole('img', { name: 'Dono do Lorkarium' })).toBeVisible();
    expect(within(section).getByText(/dono do lorkarium: sem limite de plano/i)).toBeVisible();
  });

  it('Grátis shows no seal', async () => {
    deps.accountPlanApi.plan = accountPlanOf('free');
    const section = await openPlan();
    await within(section).findByRole('heading', { name: 'Grátis', level: 3 });
    expect(within(section).queryByRole('img', { name: /^Plano |^Apoiador$/ })).toBeNull();
  });

  it('says whether the account customizations are open (the Apoiador opens them)', async () => {
    deps.accountPlanApi.plan = accountPlanOf('apoiador');
    const section = await openPlan();
    expect(within(section).getByText(/personalizações da conta.*liberadas/i)).toBeVisible();
  });

  it('a free account is told where the customizations are', async () => {
    deps.accountPlanApi.plan = accountPlanOf('free');
    const section = await openPlan();
    expect(
      within(section).getByText(/personalizações da conta.*Apoiador.*Narrador.*Lenda/i),
    ).toBeVisible();
  });

  it('a failed GET /account/plan shows the section alert and the rest of the page stays', async () => {
    deps.accountPlanApi.answers.answer('get', { ok: false, failure: { kind: 'unexpected' } });
    const section = await openPlan();

    expect(within(section).getByRole('alert')).toHaveTextContent(
      'Não deu para carregar seu plano.',
    );
    expect(within(section).queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Apelido')).toHaveValue('Ana');
    expect(screen.getByRole('region', { name: 'Conta e segurança' })).toBeVisible();
  });

  it('offline says so, and "Tentar de novo" loads the plan once it answers', async () => {
    deps.accountPlanApi.answers.answer('get', { ok: false, failure: { kind: 'offline' } });
    const section = await openPlan();
    expect(within(section).getByRole('alert')).toHaveTextContent(/sem conexão/i);

    deps.accountPlanApi.answers.clear('get');
    await userEvent.click(within(section).getByRole('button', { name: 'Tentar de novo' }));

    expect(await within(section).findByRole('table', { name: 'Limites por plano' })).toBeVisible();
  });
});
