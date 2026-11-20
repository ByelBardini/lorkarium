import type { BillingMethod, BillingPeriod, CheckoutRequestDto } from '@lorkarium/contracts';
import { CalendarClockIcon, ExternalLinkIcon, LockIcon, Undo2Icon } from 'lucide-react';
import { useState } from 'react';
import { LegalDocumentLink } from '@/components/legal-document-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dayOf } from '@/lib/paid-plan-text';
import type { BillingApi, BillingFailure } from '@/services/billing-api';
import { billingFailureMessage, brlOf, PERIOD_LABELS } from './billing-messages';
import type { OfferPrice } from './offer-price';

export type CheckoutChoice = Readonly<{
  planName: string;
  period: BillingPeriod;
  method: BillingMethod;
  price: OfferPrice;
}>;

export type CheckoutSummaryDialogProps = Readonly<{
  choice: CheckoutChoice;
  /** Today, for the end of the period and the next charge. */
  now: Date;
  billingApi: Pick<BillingApi, 'checkout'>;
  goToCheckout: (url: string) => void;
  onClose: () => void;
}>;

const DISCOUNT_LABELS: Readonly<Record<BillingPeriod, string>> = {
  monthly: 'Desconto',
  semiannual: 'Desconto do plano semestral',
  annual: 'Desconto do plano anual',
};

/** The summary before leaving for the Mercado Pago, as a receipt: the months at the monthly
 *  price, the discount of the period, the total of today; then what happens next (the next charge
 *  or the end of a Pix, cancelling, the 7 days to give up) and that continuing accepts the Terms of
 *  use (a line with the link, nothing recorded: the billing service owns the checkout). Only
 *  "Continuar no Mercado Pago" asks the checkout; the browser leaves only for a redirect the DTO
 *  accepted.
 *
 *  Example: `<CheckoutSummaryDialog choice={choice} now={now} billingApi={api} goToCheckout={assign} onClose={close} />` */
export function CheckoutSummaryDialog(props: CheckoutSummaryDialogProps): React.JSX.Element {
  const { choice } = props;
  const checkout = useCheckout(props.billingApi, props.goToCheckout);
  const request = { priceKey: choice.price.priceKey, method: choice.method };
  const methodName = choice.method === 'pix' ? 'Pix' : 'Cartão de crédito';
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assinar {choice.planName}</DialogTitle>
          <DialogDescription>
            {PERIOD_LABELS[choice.period]} · {methodName}
          </DialogDescription>
        </DialogHeader>
        <Receipt choice={choice} />
        <NextSteps choice={choice} now={props.now} />
        {checkout.failure && (
          <Alert variant="destructive">
            {billingFailureMessage(checkout.failure, 'abrir o pagamento')}
          </Alert>
        )}
        <p className="text-center text-xs text-muted-foreground">
          Ao continuar, você aceita os{' '}
          <LegalDocumentLink document="terms" className="text-foreground underline" />, inclusive as
          regras de planos e reembolso.
        </p>
        <div className="flex flex-col gap-2">
          <Button size="xl" disabled={checkout.busy} onClick={() => checkout.start(request)}>
            Continuar no Mercado Pago
            <ExternalLinkIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
          <Button variant="ghost" size="lg" onClick={props.onClose}>
            Voltar
          </Button>
        </div>
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <LockIcon aria-hidden="true" className="size-3.5 shrink-0" />O pagamento é feito na página
          do Mercado Pago; o Lorkarium não vê os dados do cartão.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Receipt({ choice }: Readonly<{ choice: CheckoutChoice }>): React.JSX.Element {
  const { price, period, planName } = choice;
  const months = price.months === 1 ? '1 mês' : `${price.months} meses`;
  const discount = price.fullCents - price.totalCents;
  return (
    <ul aria-label="Resumo da compra" className="flex flex-col gap-2.5 border-y border-border py-4">
      <ReceiptLine label={`${planName} · ${months}`} value={brlOf(price.fullCents)} />
      {discount > 0 && (
        <ReceiptLine
          label={`${DISCOUNT_LABELS[period]} (${price.savingPercent}%)`}
          value={`− ${brlOf(discount)}`}
          accent
        />
      )}
      <li className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
        <span className="flex flex-col">
          <span className="font-semibold">Total hoje</span>
          {price.months > 1 && (
            <span className="text-xs text-muted-foreground">
              equivale a R$ {price.reais}
              {price.cents} por mês
            </span>
          )}
        </span>
        <span className="font-display text-[30px] leading-none font-semibold lining-nums">
          {brlOf(price.totalCents)}
        </span>
      </li>
    </ul>
  );
}

type ReceiptLineProps = Readonly<{ label: string; value: string; accent?: boolean }>;

function ReceiptLine({ label, value, accent = false }: ReceiptLineProps): React.JSX.Element {
  return (
    <li className="flex justify-between gap-4 text-sm">
      <span className={accent ? 'text-primary' : 'text-muted-foreground'}>{label}</span>
      <span className={accent ? 'text-primary tabular-nums' : 'tabular-nums'}>{value}</span>
    </li>
  );
}

type NextStepsProps = Readonly<{ choice: CheckoutChoice; now: Date }>;

function NextSteps({ choice, now }: NextStepsProps): React.JSX.Element {
  const end = dayOf(monthsAfter(now, choice.price.months).toISOString());
  const total = brlOf(choice.price.totalCents);
  const pix = choice.method === 'pix';
  return (
    <ul className="flex flex-col gap-2.5 text-[13px] leading-snug text-label">
      <NextStep icon={CalendarClockIcon}>
        {pix
          ? `Vale até ${end}. Não renova sozinho: avisamos por e-mail antes de vencer.`
          : `Próxima cobrança em ${end}: ${total}, e assim a cada período, pelo mesmo valor, até você cancelar. Cancele a renovação quando quiser em Minha conta.`}
      </NextStep>
      <NextStep icon={Undo2Icon}>
        Desistiu? Em até 7 dias depois da compra, fale com o suporte e o valor volta inteiro.
      </NextStep>
    </ul>
  );
}

type NextStepProps = Readonly<{ icon: typeof Undo2Icon; children: React.ReactNode }>;

function NextStep({ icon: Icon, children }: NextStepProps): React.JSX.Element {
  return (
    <li className="flex gap-2.5">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>{children}</span>
    </li>
  );
}

function monthsAfter(date: Date, months: number): Date {
  const after = new Date(date);
  after.setMonth(after.getMonth() + months);
  return after;
}

type Checkout = Readonly<{
  busy: boolean;
  failure: BillingFailure | null;
  start: (request: CheckoutRequestDto) => void;
}>;

function useCheckout(
  billingApi: Pick<BillingApi, 'checkout'>,
  goToCheckout: (url: string) => void,
): Checkout {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<BillingFailure | null>(null);
  const start: Checkout['start'] = (request) => {
    setBusy(true);
    setFailure(null);
    void billingApi.checkout(request).then((result) => {
      if (result.ok) return goToCheckout(result.value);
      setBusy(false);
      setFailure(result.failure);
    });
  };
  return { busy, failure, start };
}
