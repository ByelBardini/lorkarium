import { priceKeyPartsOf, type BillingSubscriptionDto } from '@lorkarium/contracts';
import { dayOf } from '@/lib/paid-plan-text';
import { PLAN_NAMES } from '@/lib/plan-seal';
import { PERIOD_LABELS } from './billing-messages';

/** How a card subscription stands, in one sentence ("Seu plano" and the backoffice).
 *
 *  Example: `subscriptionLine(narradorMonthly) // 'Narrador mensal no cartão, renova em 16/12/2026'` */
export function subscriptionLine(subscription: BillingSubscriptionDto): string {
  const { plan, period } = priceKeyPartsOf(subscription.priceKey);
  const name = PLAN_NAMES[plan];
  const end = subscription.currentPeriodEnd === null ? null : dayOf(subscription.currentPeriodEnd);
  if (!subscription.renews)
    return end === null
      ? `Renovação do ${name} cancelada.`
      : `Renovação cancelada: o ${name} vale até ${end}.`;
  const label = `${name} ${PERIOD_LABELS[period].toLowerCase()} no cartão`;
  return end === null ? `${label}, aguardando a primeira cobrança` : `${label}, renova em ${end}`;
}
