import { MAX_OPEN_TABLES } from '@lorkarium/contracts';
import type { CampaignsFailure, CampaignsFailureKind } from '@/services/campaigns-api';
import type { TableSessionFailure } from '@/services/table-session-api';

export const OFFLINE_MESSAGE = 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
export const UNEXPECTED_MESSAGE = 'Algo deu errado do nosso lado. Tente de novo em instantes.';
export const NOT_MEMBER_MESSAGE = 'Essa mesa não existe ou você não participa dela.';
export const FORBIDDEN_MESSAGE = 'Só o mestre da mesa pode fazer isso.';
export const NOT_OPEN_MESSAGE = 'Abra a mesa para mudar as configurações.';
export const INVALID_MESSAGE = 'Confira os campos e tente de novo.';
export const TOO_MANY_TABLES_MESSAGE = `Você já tem ${MAX_OPEN_TABLES} mesas abertas. Feche uma no menu lateral para abrir esta.`;

/** The message a screen shows for a failure no field owns.
 *
 *  Example: `failureMessage('offline') // 'Sem conexão com o servidor…'` */
export function failureMessage(kind: CampaignsFailureKind): string {
  if (kind === 'offline') return OFFLINE_MESSAGE;
  if (kind === 'not_found') return NOT_MEMBER_MESSAGE;
  if (kind === 'forbidden') return FORBIDDEN_MESSAGE;
  if (kind === 'not_open') return NOT_OPEN_MESSAGE;
  return UNEXPECTED_MESSAGE;
}

/** The message of a refused command of the master (save, new code, delete): the wait of a rate
 *  limit and the refused fields have their own words.
 *
 *  Example: `commandFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 30 }) // 'Muitas tentativas. Tente de novo em 30 s.'` */
export function commandFailureMessage(failure: CampaignsFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas tentativas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  if (failure.kind === 'invalid') return INVALID_MESSAGE;
  return failureMessage(failure.kind);
}

/** The message the "Na mesa" panel shows when the live session of the table failed.
 *
 *  Example: `sessionFailureMessage('too_many_tables') // 'Você já tem 5 mesas abertas…'` */
export function sessionFailureMessage(
  failure: Exclude<TableSessionFailure, 'unauthenticated'>,
): string {
  if (failure === 'too_many_tables') return TOO_MANY_TABLES_MESSAGE;
  return failureMessage(failure);
}

/** The notice of a campaign its master deleted while it was open in this tab.
 *
 *  Example: `campaignDeletedMessage('Vharn') // 'A mesa “Vharn” foi excluída pelo mestre.'` */
export function campaignDeletedMessage(name: string): string {
  return `A mesa “${name}” foi excluída pelo mestre.`;
}
