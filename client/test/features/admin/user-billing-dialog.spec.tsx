import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { ANA_SECURITY } from '../../support/account-security-api-fake';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { billingPaymentOf, subscriptionOf } from '../../support/billing-api-fake';

const PAYMENT_ID = '0b9a3c52-8f1e-4c1d-9a7b-6e5f4d3c2b1a';
const OTHER_ID = '1c8b2d41-7e0f-4b2c-8a6b-5d4e3c2b1a09';

describe('the billing of an account in the backoffice', () => {
  let deps: TestDependencies;

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
      subscriptions: [
        {
          ...subscriptionOf('narrador_monthly'),
          id: PAYMENT_ID,
          createdAt: '2026-11-16T15:00:00.000Z',
        },
      ],
      payments: [billingPaymentOf({ id: PAYMENT_ID })],
    };
  });

  async function openBillingOfBia(): Promise<HTMLElement> {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/admin/users'] });
    render(<RouterProvider router={router} />);
    await screen.findByRole('table', { name: 'Usuários' });
    await userEvent.click(screen.getByRole('button', { name: /Ações de Bia/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cobrança…' }));
    return screen.findByRole('dialog', { name: 'Cobrança de @biaflor' });
  }

  it('sums the account up on top: paid plan, renewal, received and refunded', async () => {
    const dialog = await openBillingOfBia();

    const facts = await within(dialog).findByLabelText('Resumo da cobrança');
    expect(facts).toHaveTextContent(/Plano pago\s*Narrador\s*até 23\/12\/2026/);
    expect(facts).toHaveTextContent(/Renovação\s*Renova\s*em 16\/12\/2026/);
    expect(facts).toHaveTextContent(/Recebido\s*R\$ 14,90/);
    expect(facts).toHaveTextContent(/Reembolsado\s*R\$ 0,00/);
  });

  it('lists the subscriptions and the payments, each status in words', async () => {
    const dialog = await openBillingOfBia();

    const subscriptions = await within(dialog).findByRole('table', {
      name: 'Assinaturas de cartão',
    });
    expect(within(subscriptions).getByRole('row', { name: /Narrador mensal/ })).toHaveTextContent(
      /Renova\s*16\/12\/2026/,
    );
    const payments = within(dialog).getByRole('table', { name: 'Pagamentos' });
    expect(within(payments).getByRole('row', { name: /^R\$ 14,90/ })).toHaveTextContent(
      /Pago\s*Narrador mensal · Cartão\s*16\/11\/2026/,
    );
  });

  it('the attempts that moved no money stay folded until asked', async () => {
    deps.billingApi.account = {
      ...deps.billingApi.account,
      payments: [
        billingPaymentOf({ id: PAYMENT_ID }),
        billingPaymentOf({ id: OTHER_ID, method: 'pix', status: 'cancelled', amountCents: 2490 }),
      ],
    };
    const dialog = await openBillingOfBia();

    const payments = await within(dialog).findByRole('table', { name: 'Pagamentos' });
    expect(within(payments).queryByRole('row', { name: /R\$ 24,90/ })).toBeNull();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Mostrar 1 tentativa não concluída' }),
    );

    expect(within(payments).getByRole('row', { name: /R\$ 24,90/ })).toHaveTextContent('Cancelado');
  });

  it('an account with nothing paid says so in each section', async () => {
    deps.billingApi.account = {
      paidPlan: null,
      paidPlanUntil: null,
      subscriptions: [],
      payments: [],
    };
    const dialog = await openBillingOfBia();

    expect(await within(dialog).findByText('Nenhuma assinatura de cartão.')).toBeVisible();
    expect(within(dialog).getByText('Nenhum pagamento.')).toBeVisible();
    expect(within(dialog).getByLabelText('Resumo da cobrança')).toHaveTextContent(
      /Plano pago\s*Nenhum\s*Renovação\s*Sem assinatura/,
    );
  });

  it('a refund asks the reason, confirms the amount and shows the result', async () => {
    const dialog = await openBillingOfBia();
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Reembolsar R$ 14,90' }),
    );

    const confirm = within(dialog).getByRole('button', { name: 'Confirmar reembolso de R$ 14,90' });
    expect(confirm).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText('Motivo do reembolso'),
      'Arrependimento em 7 dias (CDC)',
    );
    await userEvent.click(confirm);

    expect(
      await within(dialog).findByText('Reembolso feito: R$ 14,90 voltam para a conta.'),
    ).toBeVisible();
    const [call] = deps.billingApi.answers.callsOf('refund') as Array<{
      request: unknown;
      idempotencyKey: string;
    }>;
    expect(call?.request).toEqual({
      paymentId: PAYMENT_ID,
      reason: 'Arrependimento em 7 dias (CDC)',
    });
    expect(call?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    const payments = within(dialog).getByRole('table', { name: 'Pagamentos' });
    expect(within(payments).getByRole('row', { name: /^R\$ 14,90/ })).toHaveTextContent(
      'Reembolsado',
    );
  });

  it('without 2FA on, the refund shows disabled with the reason', async () => {
    deps.accountSecurityApi.currentSecurity = ANA_SECURITY;
    const dialog = await openBillingOfBia();

    expect(
      await within(dialog).findByRole('button', { name: 'Reembolsar R$ 14,90' }),
    ).toBeDisabled();
    expect(within(dialog).getByText(/Ative a verificação em duas etapas/)).toBeVisible();
  });

  it('a payment already refunded says so', async () => {
    deps.billingApi.answers.answer('refund', {
      ok: false,
      failure: { kind: 'refused', code: 'ALREADY_REFUNDED' },
    });
    const dialog = await openBillingOfBia();
    await userEvent.click(
      await within(dialog).findByRole('button', { name: 'Reembolsar R$ 14,90' }),
    );
    await userEvent.type(
      within(dialog).getByLabelText('Motivo do reembolso'),
      'Cobrança em duplicidade',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Confirmar reembolso de R$ 14,90' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Esse pagamento já foi reembolsado.',
    );
  });
});
