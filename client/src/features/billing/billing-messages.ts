import type { BillingErrorCode, BillingPeriod } from '@lorkarium/contracts';
import type { BillingFailure } from '@/services/billing-api';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Cents of BRL as the screens write them.
 *
 *  Example: `brlOf(1490) // 'R$ 14,90'` */
export function brlOf(cents: number): string {
  // Intl puts a no-break space after R$; an accessible name is matched with a plain one.
  return BRL.format(cents / 100).replace(/\u00a0/g, ' ');
}

export const PERIOD_LABELS: Readonly<Record<BillingPeriod, string>> = {
  monthly: 'Mensal',
  semiannual: 'Semestral',
  annual: 'Anual',
};

const REFUSAL_MESSAGES: Partial<Record<BillingErrorCode, string>> = {
  UNAUTHENTICATED: 'Sua sessão acabou. Entre de novo para continuar.',
  ALREADY_SUBSCRIBED:
    'Você já assina esse plano no cartão. Para trocar, cancele a renovação antes.',
  NO_ACTIVE_SUBSCRIPTION: 'Não há renovação ativa para cancelar.',
  GATEWAY_UNAVAILABLE: 'O Mercado Pago não respondeu. Tente de novo em instantes.',
  PIX_UNAVAILABLE: 'O Pix está indisponível no momento. Assine pelo cartão ou tente mais tarde.',
  TWO_FACTOR_REQUIRED: 'Ative a verificação em duas etapas da sua conta para reembolsar.',
  ALREADY_REFUNDED: 'Esse pagamento já foi reembolsado.',
  PAYMENT_NOT_FOUND: 'Esse pagamento não existe mais.',
};

/** The sentence of a billing call that failed; `action` names what was being done.
 *
 *  Example: `billingFailureMessage({ kind: 'offline' }, 'abrir o pagamento')` */
export function billingFailureMessage(failure: BillingFailure, action: string): string {
  if (failure.kind === 'offline') return 'Sem conexão. Tente de novo quando a internet voltar.';
  if (failure.kind === 'rate_limited')
    return `Muitas tentativas seguidas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  const known = failure.kind === 'refused' && failure.code !== null;
  return (known && REFUSAL_MESSAGES[failure.code]) || `Não deu para ${action} agora.`;
}
