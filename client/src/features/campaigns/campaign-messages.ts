import { MAX_OPEN_TABLES } from '@lorkarium/contracts';
import type { CampaignsFailureKind } from '@/services/campaigns-api';
import type { TableSessionFailure } from '@/services/table-session-api';

export const OFFLINE_MESSAGE = 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
export const UNEXPECTED_MESSAGE = 'Algo deu errado do nosso lado. Tente de novo em instantes.';
export const NOT_MEMBER_MESSAGE = 'Essa mesa não existe ou você não participa dela.';
export const TOO_MANY_TABLES_MESSAGE = `Você já tem ${MAX_OPEN_TABLES} mesas abertas. Feche uma no menu lateral para abrir esta.`;

/** The message a screen shows for a failure no field owns.
 *
 *  Example: `failureMessage('offline') // 'Sem conexão com o servidor…'` */
export function failureMessage(kind: CampaignsFailureKind): string {
  if (kind === 'offline') return OFFLINE_MESSAGE;
  if (kind === 'not_found') return NOT_MEMBER_MESSAGE;
  return UNEXPECTED_MESSAGE;
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
