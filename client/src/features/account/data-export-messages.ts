import { OFFLINE_MESSAGE as OFFLINE } from '@/features/campaigns/campaign-messages';
import { formatClockTime } from '@/lib/clock-time';
import type { BillingFailure } from '@/services/billing-api';
import type { DataExportFailure } from '@/services/data-export-api';

function sameDay(one: Date, other: Date): boolean {
  return one.toDateString() === other.toDateString();
}

/** When the next archive can be asked, from the seconds the server gave and the person's clock:
 *  the hour alone today, "amanhã" before it otherwise (the wait is never over a day).
 *
 *  Example: `nextExportMessage(new Date(2026, 10, 19, 10, 0), 16200) // 'Você poderá baixar de novo às 14:30.'` */
export function nextExportMessage(now: Date, retryAfterSeconds: number): string {
  const next = new Date(now.getTime() + retryAfterSeconds * 1000);
  const day = sameDay(now, next) ? '' : 'amanhã ';
  return `Você poderá baixar de novo ${day}às ${formatClockTime(next)}.`;
}

/** The line under "Baixar meus dados" when the archive did not come.
 *
 *  Example: `dataExportFailureMessage({ kind: 'offline' }, now) // 'Sem conexão…'` */
export function dataExportFailureMessage(failure: DataExportFailure, now: Date): string {
  if (failure.kind === 'too_soon') return nextExportMessage(now, failure.retryAfterSeconds);
  if (failure.kind === 'offline') return OFFLINE;
  return 'Não foi possível preparar o arquivo agora. Tente de novo em instantes.';
}

/** The line under "Dados de pagamento" when the billing service did not answer: only that row
 *  says it, the rest of the account is not about the billing service.
 *
 *  Example: `paymentExportFailureMessage({ kind: 'unexpected' }) // 'O serviço de cobrança…'` */
export function paymentExportFailureMessage(failure: BillingFailure): string {
  if (failure.kind === 'offline') return OFFLINE;
  if (failure.kind === 'rate_limited') {
    return `Muitos pedidos seguidos. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  return 'O serviço de cobrança não respondeu agora. Tente de novo em instantes.';
}

/** The name of the payment data file, by the person's day.
 *
 *  Example: `paymentExportFileName('ana', new Date(2026, 10, 19)) // 'lorkarium-pagamentos-ana-2026-11-19.json'` */
export function paymentExportFileName(username: string, now: Date): string {
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');
  return `lorkarium-pagamentos-${username}-${day}.json`;
}
