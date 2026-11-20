import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { ANA_SECURITY } from '../../support/account-security-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { adminSubscriptionOf } from '../../support/billing-api-fake';
import { bia } from '../../support/user-admin-api-fake';

const LOST_TIME = 'a pessoa perde o tempo pago restante';

describe('deleting an account with a paid plan', () => {
  let deps: TestDependencies;
  const biaId = bia(new Date()).id;

  beforeEach(() => {
    deps = testDependencies();
    deps.authApi.answerMeWith(ROOT_ADMIN);
    deps.accountSecurityApi.currentSecurity = {
      ...ANA_SECURITY,
      twoFactor: { enabled: true, recoveryCodesLeft: 10 },
    };
    deps.billingApi.account = {
      paidPlan: 'narrador',
      paidPlanUntil: '2026-12-23T15:00:00.000Z',
      subscriptions: [adminSubscriptionOf()],
      payments: [],
    };
  });

  async function openDeletionOfBia(): Promise<HTMLElement> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/users'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('table', { name: 'Usuários' });
    await userEvent.click(screen.getByRole('button', { name: /Ações de Bia/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Excluir usuário' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Excluir @biaflor?' });
    await userEvent.type(
      await within(dialog).findByLabelText('Digite @biaflor para confirmar'),
      '@biaflor',
    );
    return dialog;
  }

  it('a card that renews: the plan line shows, and "Excluir" cancels the renewal before deleting', async () => {
    const releaseCancel = deps.billingApi.answers.hold('adminCancel');
    const dialog = await openDeletionOfBia();

    expect(dialog).toHaveTextContent(
      `Narrador mensal no cartão, renova em 16/12/2026; ${LOST_TIME}.`,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    expect(await within(dialog).findByText('Cancelando a renovação…')).toBeVisible();
    expect(deps.userAdminApi.answers.callsOf('deleteUser')).toEqual([]);
    releaseCancel({ ok: true, value: { subscription: null, cancelled: true } });
    expect(await screen.findByText('A conta @biaflor foi excluída.')).toBeInTheDocument();
    const [cancel] = deps.billingApi.answers.callsOf('adminCancel') as Array<{
      userId: string;
      idempotencyKey: string;
    }>;
    expect(cancel?.userId).toBe(biaId);
    expect(cancel?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(deps.userAdminApi.answers.callsOf('deleteUser')).toEqual([biaId]);
  });

  it('no subscription: no plan line, and "Excluir" deletes without touching the billing', async () => {
    deps.billingApi.account = {
      paidPlan: null,
      paidPlanUntil: null,
      subscriptions: [],
      payments: [],
    };
    const dialog = await openDeletionOfBia();

    expect(dialog).not.toHaveTextContent(LOST_TIME);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('A conta @biaflor foi excluída.')).toBeInTheDocument();
    expect(deps.billingApi.answers.callsOf('adminCancel')).toEqual([]);
  });

  it('a plan paid by Pix: the line says until when, and nothing is cancelled', async () => {
    deps.billingApi.account = { ...deps.billingApi.account, subscriptions: [] };
    const dialog = await openDeletionOfBia();

    expect(dialog).toHaveTextContent(`Narrador pago até 23/12/2026; ${LOST_TIME}.`);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('A conta @biaflor foi excluída.')).toBeInTheDocument();
    expect(deps.billingApi.answers.callsOf('adminCancel')).toEqual([]);
  });

  it('the cancel fails: the error shows, nothing is deleted, and "Excluir mesmo assim" deletes', async () => {
    deps.billingApi.answers.answer('adminCancel', {
      ok: false,
      failure: { kind: 'refused', code: 'GATEWAY_UNAVAILABLE' },
    });
    const dialog = await openDeletionOfBia();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('O Mercado Pago não respondeu.');
    expect(alert).toHaveTextContent('a cobrança cancela sozinha em até 1 hora');
    expect(deps.userAdminApi.answers.callsOf('deleteUser')).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir mesmo assim' }));

    expect(await screen.findByText('A conta @biaflor foi excluída.')).toBeInTheDocument();
    expect(deps.billingApi.answers.callsOf('adminCancel')).toHaveLength(1);
  });

  it('without 2FA on, "Excluir" stays disabled with the reason, as the refund does', async () => {
    deps.accountSecurityApi.currentSecurity = ANA_SECURITY;
    const dialog = await openDeletionOfBia();

    expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeDisabled();
    expect(
      within(dialog).getByText(
        'Ative a verificação em duas etapas da sua conta para cancelar a renovação antes de excluir.',
      ),
    ).toBeVisible();
  });

  it('the billing service asks 2FA anyway (stale page): the alert names 2FA, not the refund', async () => {
    deps.billingApi.answers.answer('adminCancel', {
      ok: false,
      failure: { kind: 'refused', code: 'TWO_FACTOR_REQUIRED' },
    });
    const dialog = await openDeletionOfBia();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ative a verificação em duas etapas da sua conta para mexer na cobrança de outra conta.',
    );
  });

  it('the billing cannot be read: says so, and "Excluir mesmo assim" deletes without cancelling', async () => {
    deps.billingApi.answers.answer('adminAccount', { ok: false, failure: { kind: 'offline' } });
    const dialog = await openDeletionOfBia();

    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('Não deu para conferir a cobrança');
    expect(alert).toHaveTextContent('a cobrança cancela sozinha em até 1 hora');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir mesmo assim' }));

    expect(await screen.findByText('A conta @biaflor foi excluída.')).toBeInTheDocument();
    expect(deps.billingApi.answers.callsOf('adminCancel')).toEqual([]);
  });
});
