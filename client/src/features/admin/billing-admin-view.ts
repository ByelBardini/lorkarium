import type {
  BillingAdminAccountDto,
  BillingAdminSubscriptionDto,
  BillingPaymentDto,
  BillingSubscriptionDto,
} from '@lorkarium/contracts';
import { subscriptionLine } from '@/features/billing/subscription-line';
import { dayOf } from '@/lib/paid-plan-text';
import { PLAN_NAMES } from '@/lib/plan-seal';

/** The tone of a status: success (moss), waiting (steel), problem (rust), past (muted). */
export type BillingTone = 'success' | 'waiting' | 'problem' | 'past';

export type BillingStatusView = Readonly<{ label: string; tone: BillingTone }>;

const PAYMENT_STATUS_VIEWS: Readonly<Record<BillingPaymentDto['status'], BillingStatusView>> = {
  approved: { label: 'Pago', tone: 'success' },
  pending: { label: 'Pendente', tone: 'waiting' },
  rejected: { label: 'Recusado', tone: 'problem' },
  charged_back: { label: 'Contestado', tone: 'problem' },
  refunded: { label: 'Reembolsado', tone: 'past' },
  cancelled: { label: 'Cancelado', tone: 'past' },
};

/** How a payment reads in the backoffice.
 *
 *  Example: `paymentStatusViewOf('approved') // { label: 'Pago', tone: 'success' }` */
export function paymentStatusViewOf(status: BillingPaymentDto['status']): BillingStatusView {
  return PAYMENT_STATUS_VIEWS[status];
}

/** How a card subscription reads in the backoffice: renewing, cancelled (the plan still holds
 *  until the end), waiting for its first charge, or over.
 *
 *  Example: `subscriptionStatusViewOf({ status: 'active', renews: true }) // { label: 'Renova', … }` */
export function subscriptionStatusViewOf(
  subscription: Pick<BillingSubscriptionDto, 'status' | 'renews'>,
): BillingStatusView {
  if (subscription.status === 'pending') return { label: 'Não concluída', tone: 'waiting' };
  if (subscription.status === 'ended') return { label: 'Encerrada', tone: 'past' };
  if (subscription.status === 'active' && subscription.renews)
    return { label: 'Renova', tone: 'success' };
  return { label: 'Cancelada', tone: 'past' };
}

export type SplitList<T> = Readonly<{ main: readonly T[]; attempts: readonly T[] }>;

function newestFirst<T extends Readonly<{ createdAt: string }>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// A Pix never paid or a checkout left halfway moves no money: it stays one click away, not in
// the way of the payments that did.
const PAYMENT_ATTEMPT_STATUSES: ReadonlySet<BillingPaymentDto['status']> = new Set([
  'pending',
  'cancelled',
]);

/** The payments that moved money, newest first, apart from the attempts that did not.
 *
 *  Example: `splitPayments(payments).attempts.length // 4` */
export function splitPayments(
  payments: readonly BillingPaymentDto[],
): SplitList<BillingPaymentDto> {
  const sorted = newestFirst(payments);
  return {
    main: sorted.filter((payment) => !PAYMENT_ATTEMPT_STATUSES.has(payment.status)),
    attempts: sorted.filter((payment) => PAYMENT_ATTEMPT_STATUSES.has(payment.status)),
  };
}

/** The subscriptions that got a first charge, newest first, apart from the ones never paid.
 *
 *  Example: `splitSubscriptions(subscriptions).main[0] // the one in force` */
export function splitSubscriptions(
  subscriptions: readonly BillingAdminSubscriptionDto[],
): SplitList<BillingAdminSubscriptionDto> {
  const sorted = newestFirst(subscriptions);
  return {
    main: sorted.filter((subscription) => subscription.status !== 'pending'),
    attempts: sorted.filter((subscription) => subscription.status === 'pending'),
  };
}

/** What the account paid and got back, in cents.
 *
 *  Example: `paymentTotalsOf(payments) // { receivedCents: 14290, refundedCents: 0 }` */
export function paymentTotalsOf(
  payments: readonly BillingPaymentDto[],
): Readonly<{ receivedCents: number; refundedCents: number }> {
  const sumOf = (status: BillingPaymentDto['status']): number =>
    payments
      .filter((payment) => payment.status === status)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
  return { receivedCents: sumOf('approved'), refundedCents: sumOf('refunded') };
}

export type DeletionBilling = Readonly<{
  /** The card subscription that would keep charging: cancelled before the account goes. */
  renewing: BillingAdminSubscriptionDto | null;
  /** What the deletion takes from the paid plan; `null` without one. */
  line: string | null;
}>;

const LOST_PAID_TIME = 'a pessoa perde o tempo pago restante.';

/** What deleting the account does to its billing: the renewal to cancel first, and the sentence
 *  of the dialog.
 *
 *  Example: `deletionBillingOf(account).line // 'Narrador pago até 23/12/2026; a pessoa perde…'` */
export function deletionBillingOf(account: BillingAdminAccountDto): DeletionBilling {
  const renewing =
    splitSubscriptions(account.subscriptions).main.find(
      (subscription) => subscription.status === 'active' && subscription.renews,
    ) ?? null;
  if (renewing !== null)
    return { renewing, line: `${subscriptionLine(renewing)}; ${LOST_PAID_TIME}` };
  if (account.paidPlan === null || account.paidPlanUntil === null)
    return { renewing: null, line: null };
  const paid = `${PLAN_NAMES[account.paidPlan]} pago até ${dayOf(account.paidPlanUntil)}`;
  return { renewing: null, line: `${paid}; ${LOST_PAID_TIME}` };
}

/** The renewal of the account, from its newest subscription that got charged: a headline and,
 *  when there is one, the date under it.
 *
 *  Example: `renewalOf(subscriptions) // { headline: 'Renova', detail: 'em 16/12/2026' }` */
export function renewalOf(
  subscriptions: readonly BillingAdminSubscriptionDto[],
): Readonly<{ headline: string; detail: string | null }> {
  const current = splitSubscriptions(subscriptions).main[0];
  if (current === undefined) return { headline: 'Sem assinatura', detail: null };
  if (current.status === 'ended') return { headline: 'Encerrada', detail: null };
  const end = current.currentPeriodEnd === null ? null : dayOf(current.currentPeriodEnd);
  if (current.status === 'active' && current.renews)
    return { headline: 'Renova', detail: end === null ? null : `em ${end}` };
  return { headline: 'Cancelada', detail: end === null ? null : `vale até ${end}` };
}
