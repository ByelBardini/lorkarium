import {
  priceKeyPartsOf,
  type BillingStatusDto,
  type BillingSubscriptionDto,
} from '@lorkarium/contracts';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { dayOf } from '@/lib/paid-plan-text';
import { PLAN_NAMES } from '@/lib/plan-seal';
import type { BillingApi, BillingFailure, BillingResult } from '@/services/billing-api';
import { billingFailureMessage } from './billing-messages';
import { subscriptionLine } from './subscription-line';

export type SubscriptionPanelProps = Readonly<{
  billingApi: Pick<BillingApi, 'status' | 'cancel'>;
  now: Date;
}>;

/** "Assinatura" inside "Seu plano": how the paid plan renews (card) or ends (Pix), the grace
 *  notice past the paid period, and "Cancelar renovação" after a confirmation. Read apart from the
 *  page: a billing service that does not answer never breaks "Minha conta".
 *
 *  Example: `<SubscriptionPanel billingApi={billingApi} now={now} />` */
export function SubscriptionPanel({ billingApi, now }: SubscriptionPanelProps): React.JSX.Element {
  const titleId = useId();
  const [status, setStatus] = useState<BillingResult<BillingStatusDto> | null>(null);
  useEffect(() => {
    void billingApi.status().then(setStatus);
  }, [billingApi]);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h3 id={titleId} className="text-base font-semibold">
        Assinatura
      </h3>
      {status === null ? null : <StatusBody status={status} billingApi={billingApi} now={now} />}
    </section>
  );
}

type StatusBodyProps = Readonly<{
  status: BillingResult<BillingStatusDto>;
  billingApi: Pick<BillingApi, 'cancel'>;
  now: Date;
}>;

function StatusBody({ status, billingApi, now }: StatusBodyProps): React.JSX.Element {
  if (!status.ok)
    return (
      <p className="text-sm text-muted-foreground">
        {billingFailureMessage(status.failure, 'carregar a assinatura')}
      </p>
    );
  const { subscription } = status.value;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <GraceNotice status={status.value} now={now} />
      {subscription === null ? (
        <NoSubscription status={status.value} />
      ) : (
        <CardSubscription subscription={subscription} billingApi={billingApi} />
      )}
    </div>
  );
}

// Past the paid period and before `paidPlanUntil` the card is being charged again.
function GraceNotice({
  status,
  now,
}: Readonly<{ status: BillingStatusDto; now: Date }>): React.JSX.Element | null {
  const { paidPlan, paidPlanUntil, periodEnd } = status;
  if (paidPlan === null || paidPlanUntil === null || periodEnd === null) return null;
  if (Date.parse(periodEnd) > now.getTime()) return null;
  return (
    <Alert variant="destructive">
      Pagamento pendente: o {PLAN_NAMES[paidPlan]} vale até {dayOf(paidPlanUntil)} enquanto a
      cobrança é tentada de novo. Confira o cartão no Mercado Pago.
    </Alert>
  );
}

function NoSubscription({ status }: Readonly<{ status: BillingStatusDto }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {status.paidPlan !== null && status.periodEnd !== null ? (
        <p>
          Pago por Pix até {dayOf(status.periodEnd)}. Para continuar, pague o próximo período em
          Planos antes de vencer.
        </p>
      ) : null}
      <Link to="/planos" className="underline">
        Ver planos e preços
      </Link>
    </div>
  );
}

type CardSubscriptionProps = Readonly<{
  subscription: BillingSubscriptionDto;
  billingApi: Pick<BillingApi, 'cancel'>;
}>;

function CardSubscription({ subscription, billingApi }: CardSubscriptionProps): React.JSX.Element {
  const [current, setCurrent] = useState(subscription);
  const [failure, setFailure] = useState<BillingFailure | null>(null);
  const cancel = (): void => {
    void billingApi
      .cancel()
      .then((result) => (result.ok ? setCurrent(result.value) : setFailure(result.failure)));
  };
  return (
    <div className="flex flex-col gap-2">
      <p>{subscriptionLine(current)}</p>
      {failure === null ? null : (
        <Alert variant="destructive">
          {billingFailureMessage(failure, 'cancelar a renovação')}
        </Alert>
      )}
      {current.renews ? <CancelRenewal subscription={current} onConfirm={cancel} /> : null}
    </div>
  );
}

type CancelRenewalProps = Readonly<{ subscription: BillingSubscriptionDto; onConfirm: () => void }>;

function CancelRenewal({ subscription, onConfirm }: CancelRenewalProps): React.JSX.Element {
  const name = PLAN_NAMES[priceKeyPartsOf(subscription.priceKey).plan];
  const end =
    subscription.currentPeriodEnd === null
      ? 'o fim do período'
      : dayOf(subscription.currentPeriodEnd);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="self-start">
          Cancelar renovação
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar a renovação?</AlertDialogTitle>
          <AlertDialogDescription>
            O {name} continua valendo até {end} e não é cobrado de novo. Nada da sua mesa é apagado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Manter</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Cancelar renovação</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
