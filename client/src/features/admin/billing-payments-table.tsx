import {
  priceKeyPartsOf,
  REFUND_REASON_MIN_LENGTH,
  type BillingPaymentDto,
} from '@lorkarium/contracts';
import { Fragment, useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { billingFailureMessage, brlOf, PERIOD_LABELS } from '@/features/billing/billing-messages';
import { dayOf } from '@/lib/paid-plan-text';
import { PLAN_NAMES } from '@/lib/plan-seal';
import { cn } from '@/lib/utils';
import type { BillingApi, BillingFailure } from '@/services/billing-api';
import { paymentStatusViewOf, splitPayments } from './billing-admin-view';
import {
  AttemptsToggle,
  BILLING_TABLE_CELL,
  BILLING_TABLE_HEAD,
  BillingStatusMark,
} from './billing-status-mark';

const COLUMNS = ['Valor', 'Situação', 'Descrição', 'Data'];

export type BillingPaymentsTableProps = Readonly<{
  payments: readonly BillingPaymentDto[];
  api: Pick<BillingApi, 'refund'>;
  twoFactorOn: boolean;
  onRefunded: (payment: BillingPaymentDto) => void;
}>;

/** The payments of an account, newest first: amount, status, what was bought and when, and
 *  "Reembolsar" on an approved one (the reason opens under its row). The attempts that moved no
 *  money (Pix never paid, checkout left) stay folded under a toggle.
 *
 *  Example: `<BillingPaymentsTable payments={payments} api={api} twoFactorOn onRefunded={replace} />` */
export function BillingPaymentsTable(props: BillingPaymentsTableProps): React.JSX.Element {
  const [showAttempts, setShowAttempts] = useState(false);
  const { main, attempts } = splitPayments(props.payments);
  const shown = showAttempts ? [...main, ...attempts] : main;
  return (
    <div className="flex flex-col gap-1">
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pagamento.</p>
      ) : (
        <PaymentsTable {...props} payments={shown} />
      )}
      <AttemptsToggle
        count={attempts.length}
        open={showAttempts}
        onToggle={() => setShowAttempts(!showAttempts)}
      />
    </div>
  );
}

function PaymentsTable(props: BillingPaymentsTableProps): React.JSX.Element {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Pagamentos</caption>
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((title) => (
              <th key={title} scope="col" className={BILLING_TABLE_HEAD}>
                {title}
              </th>
            ))}
            <th scope="col" className={BILLING_TABLE_HEAD}>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.payments.map((payment) => (
            <PaymentRows key={payment.id} {...props} payment={payment} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PaymentRowsProps = BillingPaymentsTableProps & Readonly<{ payment: BillingPaymentDto }>;

function PaymentRows({ payment, api, twoFactorOn, onRefunded }: PaymentRowsProps) {
  const [refunding, setRefunding] = useState(false);
  const [done, setDone] = useState(false);
  const amount = brlOf(payment.amountCents);
  return (
    <Fragment>
      <tr className="border-b border-divider last:border-b-0">
        <PaymentCells payment={payment} />
        <td className={cn(BILLING_TABLE_CELL, 'text-right')}>
          {payment.status === 'approved' && !refunding && (
            <Button
              variant="outline"
              size="sm"
              aria-label={`Reembolsar ${amount}`}
              title={twoFactorOn ? undefined : 'Exige a verificação em duas etapas ativa'}
              disabled={!twoFactorOn}
              onClick={() => setRefunding(true)}
            >
              Reembolsar
            </Button>
          )}
        </td>
      </tr>
      {(refunding || done) && (
        <tr className="border-b border-divider">
          <td colSpan={COLUMNS.length + 1} className="pb-4">
            {done ? (
              <p className="text-sm text-chart-4">Reembolso feito: {amount} voltam para a conta.</p>
            ) : (
              <RefundForm
                payment={payment}
                api={api}
                onCancel={() => setRefunding(false)}
                onRefunded={(refunded) => {
                  setRefunding(false);
                  setDone(true);
                  onRefunded(refunded);
                }}
              />
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function PaymentCells({ payment }: Readonly<{ payment: BillingPaymentDto }>) {
  const { plan, period } = priceKeyPartsOf(payment.priceKey);
  const settled = payment.status !== 'pending' && payment.status !== 'cancelled';
  return (
    <>
      <td
        className={cn(
          BILLING_TABLE_CELL,
          'font-semibold tabular-nums',
          settled ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {brlOf(payment.amountCents)}
      </td>
      <td className={BILLING_TABLE_CELL}>
        <BillingStatusMark view={paymentStatusViewOf(payment.status)} />
      </td>
      <td className={cn(BILLING_TABLE_CELL, 'text-label')}>
        {PLAN_NAMES[plan]} {PERIOD_LABELS[period].toLowerCase()}
        <span className="text-muted-foreground">
          {' '}
          · {payment.method === 'pix' ? 'Pix' : 'Cartão'}
        </span>
      </td>
      <td className={cn(BILLING_TABLE_CELL, 'text-muted-foreground tabular-nums')}>
        {dayOf(payment.createdAt)}
      </td>
    </>
  );
}

type RefundFormProps = Readonly<{
  payment: BillingPaymentDto;
  api: Pick<BillingApi, 'refund'>;
  onCancel: () => void;
  onRefunded: (payment: BillingPaymentDto) => void;
}>;

// One key per opened form: a double click or a retry of the same attempt refunds once.
function RefundForm({ payment, api, onCancel, onRefunded }: RefundFormProps): React.JSX.Element {
  const reasonId = useId();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<BillingFailure | null>(null);
  const submit = (): void => {
    setBusy(true);
    void api
      .refund({ paymentId: payment.id, reason: reason.trim() }, idempotencyKey)
      .then((result) => {
        setBusy(false);
        if (result.ok) return onRefunded(result.value);
        setFailure(result.failure);
      });
  };
  return (
    <div className="flex flex-col gap-2 border-l-2 border-primary pl-3">
      <Label htmlFor={reasonId}>Motivo do reembolso</Label>
      <Textarea
        id={reasonId}
        value={reason}
        placeholder={`Pelo menos ${REFUND_REASON_MIN_LENGTH} caracteres; fica no registro.`}
        onChange={(event) => setReason(event.target.value)}
      />
      {failure !== null && (
        <Alert variant="destructive">{billingFailureMessage(failure, 'reembolsar')}</Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          size="sm"
          disabled={busy || reason.trim().length < REFUND_REASON_MIN_LENGTH}
          onClick={submit}
        >
          Confirmar reembolso de {brlOf(payment.amountCents)}
        </Button>
      </div>
    </div>
  );
}
