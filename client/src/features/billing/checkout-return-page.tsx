import type { AuthUserDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { dayOf } from '@/lib/paid-plan-text';
import { PLAN_NAMES } from '@/lib/plan-seal';
import type { AuthApi } from '@/services/auth-api';
import type { BillingApi } from '@/services/billing-api';
import type { SessionStore } from '@/stores/session-store';

export type CheckoutReturnPageProps = Readonly<{
  authApi: Pick<AuthApi, 'me'>;
  billingApi: Pick<BillingApi, 'status'>;
  sessionStore: StoreApi<SessionStore>;
  wait: (ms: number) => Promise<void>;
}>;

// About two minutes of checks: the webhook usually lands in seconds; past it the reconcile does.
const CHECK_EVERY_MS = 3000;
const CHECKS = 40;

type ReturnState =
  | Readonly<{ kind: 'confirming' }>
  | Readonly<{ kind: 'confirmed'; user: AuthUserDto; periodEnd: string | null }>
  | Readonly<{ kind: 'not_yet' }>;

/** The page the Mercado Pago sends the browser back to: only the webhook grants the plan, so it
 *  asks `/me` until the paid plan (or its new end) shows, then updates the session (the seal)
 *  and says until when the paid period goes.
 *
 *  Example: `<CheckoutReturnPage authApi={authApi} billingApi={billingApi} sessionStore={sessionStore} wait={sleep} />` */
export function CheckoutReturnPage(props: CheckoutReturnPageProps): React.JSX.Element {
  const state = usePaymentConfirmation(props);
  return (
    // A signed-in screen: full width beside the rail, left-aligned; only the text is capped.
    <section
      aria-label="Retorno do pagamento"
      className="flex w-full flex-col gap-4 px-4 py-8 sm:px-8 lg:px-12 [&_p]:max-w-prose"
    >
      <title>Lorkarium · Pagamento</title>
      <h1 className="font-display text-[42px] leading-[1.05] font-medium">Pagamento</h1>
      <ReturnMessage state={state} />
    </section>
  );
}

function ReturnMessage({ state }: Readonly<{ state: ReturnState }>): React.JSX.Element {
  if (state.kind === 'confirming') return <p role="status">Confirmando o pagamento…</p>;
  if (state.kind === 'confirmed') return <p role="status">{confirmedLine(state)}</p>;
  return (
    <div className="flex flex-col gap-3">
      <p>
        O Mercado Pago ainda não confirmou o pagamento (o Pix pode levar alguns minutos). Assim que
        ele confirmar, o plano entra sozinho, sem você fazer nada.
      </p>
      <Link to="/account?aba=plano" className="text-sm underline">
        Ver Seu plano
      </Link>
    </div>
  );
}

// The end of the paid period, never `paidPlanUntil`: that one carries the 7 days of grace and
// read as a date a week later than "Seu plano" says.
function confirmedLine({
  user,
  periodEnd,
}: Readonly<{ user: AuthUserDto; periodEnd: string | null }>): string {
  if (user.paidPlan === null) return 'Plano ativo.';
  const name = PLAN_NAMES[user.paidPlan];
  return periodEnd === null ? `${name} ativo.` : `${name} ativo até ${dayOf(periodEnd)}`;
}

async function paidPeriodEndOf(billingApi: Pick<BillingApi, 'status'>): Promise<string | null> {
  const status = await billingApi.status();
  return status.ok ? status.value.periodEnd : null;
}

function usePaymentConfirmation({
  authApi,
  billingApi,
  sessionStore,
  wait,
}: CheckoutReturnPageProps): ReturnState {
  const [state, setState] = useState<ReturnState>({ kind: 'confirming' });
  useEffect(() => {
    const before = untilOf(sessionStore.getState());
    let alive = true;
    void (async () => {
      for (let check = 0; check < CHECKS && alive; check += 1) {
        const me = await authApi.me();
        const user = me.ok ? me.value : null;
        if (alive && user !== null && isNewPaidPlan(user, before)) {
          sessionStore.getState().signedIn(user);
          const periodEnd = await paidPeriodEndOf(billingApi);
          if (alive) setState({ kind: 'confirmed', user, periodEnd });
          return;
        }
        await wait(CHECK_EVERY_MS);
      }
      if (alive) setState({ kind: 'not_yet' });
    })();
    return () => {
      alive = false;
    };
  }, [authApi, billingApi, sessionStore, wait]);
  return state;
}

function untilOf(store: SessionStore): string | null {
  return store.session.status === 'authenticated' ? store.session.user.paidPlanUntil : null;
}

// A renewal keeps the paid plan and moves its end: the new end is the sign, not the plan alone.
function isNewPaidPlan(user: AuthUserDto, before: string | null): boolean {
  return user.paidPlan !== null && user.paidPlanUntil !== before;
}
