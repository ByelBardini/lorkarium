import { priceKeyPartsOf, type BillingAdminSubscriptionDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { PERIOD_LABELS } from '@/features/billing/billing-messages';
import { dayOf } from '@/lib/paid-plan-text';
import { PLAN_NAMES } from '@/lib/plan-seal';
import { cn } from '@/lib/utils';
import { splitSubscriptions, subscriptionStatusViewOf } from './billing-admin-view';
import {
  AttemptsToggle,
  BILLING_TABLE_CELL,
  BILLING_TABLE_HEAD,
  BillingStatusMark,
} from './billing-status-mark';

const COLUMNS = ['Plano', 'Situação', 'Fim do período', 'Criada em'];

export type BillingSubscriptionsTableProps = Readonly<{
  subscriptions: readonly BillingAdminSubscriptionDto[];
}>;

/** The card subscriptions of an account, newest first; the ones that never got a first charge
 *  (checkout left halfway) stay folded under a toggle.
 *
 *  Example: `<BillingSubscriptionsTable subscriptions={detail.subscriptions} />` */
export function BillingSubscriptionsTable({ subscriptions }: BillingSubscriptionsTableProps) {
  const [showAttempts, setShowAttempts] = useState(false);
  const { main, attempts } = splitSubscriptions(subscriptions);
  const shown = showAttempts ? [...main, ...attempts] : main;
  return (
    <div className="flex flex-col gap-1">
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma assinatura de cartão.</p>
      ) : (
        <SubscriptionsTable subscriptions={shown} />
      )}
      <AttemptsToggle
        count={attempts.length}
        open={showAttempts}
        onToggle={() => setShowAttempts(!showAttempts)}
      />
    </div>
  );
}

function SubscriptionsTable({ subscriptions }: BillingSubscriptionsTableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Assinaturas de cartão</caption>
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((title) => (
              <th key={title} scope="col" className={BILLING_TABLE_HEAD}>
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((subscription) => (
            <SubscriptionRow key={subscription.id} subscription={subscription} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscriptionRow({
  subscription,
}: Readonly<{ subscription: BillingAdminSubscriptionDto }>) {
  const { plan, period } = priceKeyPartsOf(subscription.priceKey);
  const end = subscription.currentPeriodEnd;
  return (
    <tr className="border-b border-divider last:border-b-0">
      <td className={cn(BILLING_TABLE_CELL, 'text-foreground')}>
        {PLAN_NAMES[plan]} <span className="text-label">{PERIOD_LABELS[period].toLowerCase()}</span>
      </td>
      <td className={BILLING_TABLE_CELL}>
        <BillingStatusMark view={subscriptionStatusViewOf(subscription)} />
      </td>
      <td className={cn(BILLING_TABLE_CELL, 'text-label tabular-nums')}>
        {end === null ? '—' : dayOf(end)}
      </td>
      <td className={cn(BILLING_TABLE_CELL, 'text-muted-foreground tabular-nums')}>
        {dayOf(subscription.createdAt)}
      </td>
    </tr>
  );
}
