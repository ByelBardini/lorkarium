import { PLAN_LIMITS } from '@lorkarium/contracts';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRoutes } from '@/app/router';
import { rememberPaidPlanBeforeCheckout } from '@/features/billing/checkout-departure';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';

// paidPlanUntil carries the 7 days of grace; the page says the end of the paid period.
const UNTIL = '2026-12-23T15:00:00.000Z';
const PERIOD_END = '2026-12-16T15:00:00.000Z';
const PAID_STATUS = {
  paidPlan: 'lenda',
  paidPlanUntil: UNTIL,
  periodEnd: PERIOD_END,
  subscription: null,
} as const;

describe('the return from the checkout (/planos/retorno)', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
  });

  function openReturn(): void {
    const router = createMemoryRouter(buildRoutes(deps), { initialEntries: ['/planos/retorno'] });
    render(<RouterProvider router={router} />);
  }

  function paidAna() {
    const free = { ...ANA, plan: 'free', limits: PLAN_LIMITS.free } as const;
    return { ...free, paidPlan: 'lenda', paidPlanUntil: UNTIL, limits: PLAN_LIMITS.lenda } as const;
  }

  it('says it is confirming until /me brings the paid plan, then the plan and its end', async () => {
    deps.billingApi.status_ = PAID_STATUS;
    const free = { ...ANA, plan: 'free', limits: PLAN_LIMITS.free } as const;
    const paid = {
      ...free,
      paidPlan: 'lenda',
      paidPlanUntil: UNTIL,
      limits: PLAN_LIMITS.lenda,
    } as const;
    deps.authApi.answerMeWith(free);
    const release = deps.billingWaits.hold();
    openReturn();

    expect(await screen.findByText('Confirmando o pagamento…')).toBeVisible();
    deps.authApi.answerMeWith(paid);
    release();

    expect(await screen.findByText('Lenda ativo até 16/12/2026')).toBeVisible();
    expect(screen.queryByText(/23\/12\/2026/)).toBeNull();
    expect(deps.sessionStore.getState().session).toMatchObject({ user: { paidPlan: 'lenda' } });
  });

  it('with the billing service down, names the plan without the grace end', async () => {
    deps.authApi.answerMeWith({ ...ANA, plan: 'free', limits: PLAN_LIMITS.free });
    deps.billingApi.answers.answer('status', { ok: false, failure: { kind: 'offline' } });
    const release = deps.billingWaits.hold();
    openReturn();
    await screen.findByText('Confirmando o pagamento…');
    deps.authApi.answerMeWith(paidAna());
    release();

    expect(await screen.findByText('Lenda ativo.')).toBeVisible();
    expect(screen.queryByText(/23\/12\/2026/)).toBeNull();
  });

  // The return is a fresh load: the boot's /me can already bring the plan the webhook granted
  // while the buyer paid in the bank's app (production, 2026-11-19).
  it('coming back after the webhook already granted the plan, confirms it at once', async () => {
    deps.billingApi.status_ = PAID_STATUS;
    rememberPaidPlanBeforeCheckout(deps.checkoutStorage, null);
    deps.authApi.answerMeWith(paidAna());
    openReturn();

    expect(await screen.findByText('Lenda ativo até 16/12/2026')).toBeVisible();
  });

  it('a renewal keeps waiting while the end is still the one held before the checkout', async () => {
    rememberPaidPlanBeforeCheckout(deps.checkoutStorage, UNTIL);
    deps.authApi.answerMeWith(paidAna());
    openReturn();

    expect(await screen.findByText(/O Mercado Pago ainda não confirmou/)).toBeVisible();
  });

  it('without a confirmation after the checks, says the plan comes in by itself', async () => {
    deps.authApi.answerMeWith({ ...ANA, plan: 'free', limits: PLAN_LIMITS.free });
    openReturn();

    expect(await screen.findByText(/O Mercado Pago ainda não confirmou/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver Seu plano' })).toHaveAttribute(
      'href',
      '/account?aba=plano',
    );
  });
});
