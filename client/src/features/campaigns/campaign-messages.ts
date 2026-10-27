import { MAX_OPEN_TABLES } from '@lorkarium/contracts';
import type { CampaignsFailure, CampaignsFailureKind } from '@/services/campaigns-api';
import type { TableSessionFailure } from '@/services/table-session-api';
import type { DeletedTableNotice } from '@/stores/open-tables-store';

export const OFFLINE_MESSAGE = 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
export const UNEXPECTED_MESSAGE = 'Algo deu errado do nosso lado. Tente de novo em instantes.';
/** What "Pública" means, in the new-table form and in the settings. */
export const PUBLIC_VISIBILITY_HINT =
  'Aparece em Explorar mesas: quem quiser entra sem o código (com a senha, se houver).';
export const NOT_MEMBER_MESSAGE = 'Essa mesa não existe ou você não participa dela.';
export const FORBIDDEN_MESSAGE = 'Só o mestre da mesa pode fazer isso.';
export const NOT_OPEN_MESSAGE = 'Abra a mesa para mudar as configurações.';
export const INVALID_MESSAGE = 'Confira os campos e tente de novo.';
export const ALREADY_OWNER_MESSAGE = 'Você já é o dono desta mesa.';
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

/** The words of a refused "Ativar modo juggernaut" / "Sair do modo juggernaut".
 *
 *  Example: `juggernautFailureMessage({ kind: 'already_owner' }) // 'Você já é o dono desta mesa.'` */
export function juggernautFailureMessage(failure: CampaignsFailure): string {
  if (failure.kind === 'forbidden') return 'Só um admin entra como juggernaut.';
  if (failure.kind === 'already_owner') return ALREADY_OWNER_MESSAGE;
  return commandFailureMessage(failure);
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

/** The notice of a table the server closed under this tab: deleted by its master, or left (a
 *  juggernaut who was not a member turned the mode off).
 *
 *  Example: `closedTableMessage({ campaignId, name: 'Vharn', reason: 'removed' }) // 'Você saiu da mesa “Vharn”.'` */
export function closedTableMessage(notice: DeletedTableNotice): string {
  if (notice.reason === 'removed') return `Você saiu da mesa “${notice.name}”.`;
  return campaignDeletedMessage(notice.name);
}
