import type { AdminUserDto, BillingAdminAccountDto, BillingPaymentDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { billingFailureMessage, brlOf } from '@/features/billing/billing-messages';
import { dayOf } from '@/lib/paid-plan-text';
import { PLAN_NAMES } from '@/lib/plan-seal';
import type { BillingApi, BillingResult } from '@/services/billing-api';
import { paymentTotalsOf, renewalOf } from './billing-admin-view';
import { BillingPaymentsTable } from './billing-payments-table';
import { BillingSubscriptionsTable } from './billing-subscriptions-table';
import { TwoFactorRequiredNote } from './two-factor-required-note';

export type UserBillingDialogProps = Readonly<{
  user: AdminUserDto;
  api: Pick<BillingApi, 'adminAccount' | 'refund'>;
  /** The admin's own 2FA: a refund moves money, so it asks the highest bar the app has. */
  twoFactorOn: boolean;
  onClose: () => void;
}>;

/** "Cobrança de @bia": the account at a glance (paid plan, renewal, received, refunded), then its
 *  card subscriptions and its payments, and "Reembolsar" an approved payment with a written
 *  reason (the whole amount, audited).
 *
 *  Example: `<UserBillingDialog user={bia} api={deps.billingApi} twoFactorOn onClose={close} />` */
export function UserBillingDialog(props: UserBillingDialogProps): React.JSX.Element {
  const [account, setAccount] = useState<BillingResult<BillingAdminAccountDto> | null>(null);
  useEffect(() => {
    void props.api.adminAccount(props.user.id).then(setAccount);
  }, [props.api, props.user.id]);
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[85vh] gap-7 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cobrança de @{props.user.username}</DialogTitle>
          <DialogDescription>
            Assinaturas e pagamentos no Mercado Pago. Só leitura, menos o reembolso.
          </DialogDescription>
        </DialogHeader>
        {account === null && <p role="status">Carregando a cobrança…</p>}
        {account !== null && !account.ok && (
          <Alert variant="destructive">
            {billingFailureMessage(account.failure, 'carregar a cobrança')}
          </Alert>
        )}
        {account?.ok && <BillingDetail {...props} detail={account.value} />}
      </DialogContent>
    </Dialog>
  );
}

type DetailProps = UserBillingDialogProps & Readonly<{ detail: BillingAdminAccountDto }>;

function BillingDetail({ detail, api, twoFactorOn }: DetailProps): React.JSX.Element {
  const [payments, setPayments] = useState(detail.payments);
  const replace = (payment: BillingPaymentDto): void =>
    setPayments((all) => all.map((each) => (each.id === payment.id ? payment : each)));
  const refundable = payments.some((payment) => payment.status === 'approved');
  return (
    <>
      <BillingSummary detail={detail} payments={payments} />
      <BillingSection title="Assinaturas de cartão">
        <BillingSubscriptionsTable subscriptions={detail.subscriptions} />
      </BillingSection>
      <BillingSection title="Pagamentos">
        {refundable && !twoFactorOn && <TwoFactorRequiredNote action="reembolsar" />}
        <BillingPaymentsTable
          payments={payments}
          api={api}
          twoFactorOn={twoFactorOn}
          onRefunded={replace}
        />
      </BillingSection>
    </>
  );
}

type BillingSummaryProps = Readonly<{
  detail: BillingAdminAccountDto;
  payments: readonly BillingPaymentDto[];
}>;

function BillingSummary({ detail, payments }: BillingSummaryProps): React.JSX.Element {
  const totals = paymentTotalsOf(payments);
  const renewal = renewalOf(detail.subscriptions);
  const until = detail.paidPlanUntil === null ? null : `até ${dayOf(detail.paidPlanUntil)}`;
  return (
    <dl
      aria-label="Resumo da cobrança"
      className="grid grid-cols-2 gap-y-4 border-y border-border py-4 sm:grid-cols-4"
    >
      <SummaryFact term="Plano pago" detail={until}>
        {detail.paidPlan === null ? 'Nenhum' : PLAN_NAMES[detail.paidPlan]}
      </SummaryFact>
      <SummaryFact term="Renovação" detail={renewal.detail}>
        {renewal.headline}
      </SummaryFact>
      <SummaryFact term="Recebido">{brlOf(totals.receivedCents)}</SummaryFact>
      <SummaryFact term="Reembolsado">{brlOf(totals.refundedCents)}</SummaryFact>
    </dl>
  );
}

type SummaryFactProps = Readonly<{
  term: string;
  detail?: string | null;
  children: React.ReactNode;
}>;

function SummaryFact({ term, detail = null, children }: SummaryFactProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 border-divider px-4 first:pl-0 sm:border-l sm:first:border-l-0">
      <dt className="text-[11px] font-semibold tracking-[0.12em] text-placeholder uppercase">
        {term}
      </dt>
      <dd className="text-base font-semibold text-foreground tabular-nums">{children}</dd>
      {detail !== null && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

type BillingSectionProps = Readonly<{ title: string; children: React.ReactNode }>;

function BillingSection({ title, children }: BillingSectionProps): React.JSX.Element {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {children}
    </section>
  );
}
