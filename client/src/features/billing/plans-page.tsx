import {
  BILLING_PLANS,
  type AuthUserDto,
  type BillingMethod,
  type BillingPeriod,
  type BillingPriceDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { PlanGridTable } from '@/features/account/plan-grid-table';
import { PLAN_NAMES, planTitleOf, sealHolderOfAccount, type PlanSealHolder } from '@/lib/plan-seal';
import type { BillingApi, BillingResult } from '@/services/billing-api';
import { billingFailureMessage, PERIOD_LABELS } from './billing-messages';
import { CheckoutSummaryDialog, type CheckoutChoice } from './checkout-summary-dialog';
import { bestSavingPercentOf, offerPriceOf } from './offer-price';
import { PlanOffer } from './plan-offer';
import { SegmentedChoice } from './segmented-choice';

export type PlansPageProps = Readonly<{
  prices: BillingResult<readonly BillingPriceDto[]>;
  account: AuthUserDto;
  billingApi: Pick<BillingApi, 'checkout'>;
  goToCheckout: (url: string) => void;
  /** Today, fixed for the visit: the dates of the summary count from it. */
  now: Date;
}>;

const PERIOD_VALUES = ['monthly', 'semiannual', 'annual'] as const;
const METHODS = [
  { value: 'card', label: 'Cartão' },
  { value: 'pix', label: 'Pix' },
] as const;

/** "Planos": the catalog the billing service answers, by period and method, beside the account's
 *  own plan; "Assinar" opens the summary, which leaves for the hosted checkout. Below, every limit
 *  side by side.
 *
 *  Example: `<PlansPage prices={result} account={user} billingApi={api} goToCheckout={assign} now={now} />` */
export function PlansPage(props: PlansPageProps): React.JSX.Element {
  const titleId = useId();
  const holder = sealHolderOfAccount(props.account);
  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full flex-col gap-10 px-4 py-8 sm:px-8 lg:px-12"
    >
      <title>Lorkarium · Planos</title>
      <header className="flex flex-wrap items-end gap-6">
        <div className="flex flex-1 flex-col gap-2">
          <h1 id={titleId} className="font-display text-[42px] leading-[1.05] font-medium">
            Planos
          </h1>
          <p className="text-sm text-muted-foreground">O que cada plano libera e quanto custa.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          <span>Seu plano:</span>{' '}
          <strong className="font-semibold text-foreground">{planTitleOf(holder)}</strong>
        </p>
      </header>
      {props.prices.ok ? (
        <PlanChooser {...props} prices={props.prices.value} holder={holder} />
      ) : (
        <Alert variant="destructive">
          {billingFailureMessage(props.prices.failure, 'carregar os preços')}
        </Alert>
      )}
      <PlanGridTable holder={holder} />
    </section>
  );
}

type ChooserProps = Omit<PlansPageProps, 'prices' | 'account'> &
  Readonly<{
    prices: readonly BillingPriceDto[];
    holder: PlanSealHolder;
  }>;

function PlanChooser({
  prices,
  holder,
  billingApi,
  goToCheckout,
  now,
}: ChooserProps): React.JSX.Element {
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const [method, setMethod] = useState<BillingMethod>('card');
  const [choice, setChoice] = useState<CheckoutChoice | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <SegmentedChoice
          legend="Período"
          value={period}
          options={periodOptions(prices)}
          onChange={setPeriod}
        />
        <SegmentedChoice legend="Pagamento" value={method} options={METHODS} onChange={setMethod} />
        <p className="pb-2.5 text-[13px] text-muted-foreground">
          {method === 'card'
            ? 'No cartão a assinatura renova sozinha; cancele a renovação quando quiser.'
            : 'No Pix você paga o período de uma vez, sem renovação automática.'}
        </p>
      </div>
      <div className="grid gap-px border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
        {(['free', ...BILLING_PLANS] as const).map((plan) => (
          <PlanOffer
            key={plan}
            plan={plan}
            price={plan === 'free' ? null : offerPriceOf(prices, plan, period, method)}
            holder={holder}
            busy={choice !== null}
            onSubscribe={(price) =>
              setChoice({ planName: PLAN_NAMES[plan], period, method, price })
            }
          />
        ))}
      </div>
      {choice && (
        <CheckoutSummaryDialog
          choice={choice}
          billingApi={billingApi}
          goToCheckout={goToCheckout}
          now={now}
          onClose={() => setChoice(null)}
        />
      )}
    </div>
  );
}

// The longer periods carry their best discount on the segment itself ("até 20%").
function periodOptions(prices: readonly BillingPriceDto[]) {
  return PERIOD_VALUES.map((value) => {
    const saving = bestSavingPercentOf(prices, value);
    if (saving === 0) return { value, label: PERIOD_LABELS[value] };
    return {
      value,
      label: PERIOD_LABELS[value],
      note: `-${saving}%`,
      noteLabel: `até ${saving}% de desconto`,
    };
  });
}
