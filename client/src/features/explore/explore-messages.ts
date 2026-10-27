import {
  ALREADY_OWNER_MESSAGE,
  commandFailureMessage,
} from '@/features/campaigns/campaign-messages';
import type { CampaignsFailure } from '@/services/campaigns-api';

/** Refusals about the password: they open (or keep open) the password dialog. */
export const PASSWORD_FAILURES: ReadonlySet<CampaignsFailure['kind']> = new Set([
  'password_required',
  'password_invalid',
]);

/** The words of a refused "Entrar" (or "Entrar como juggernaut") on a listed campaign.
 *
 *  Example: `publicJoinFailureMessage({ kind: 'not_found' }) // 'Essa mesa não está mais aberta ao público.'` */
export function publicJoinFailureMessage(failure: CampaignsFailure): string {
  if (failure.kind === 'password_required') return 'Essa mesa pede senha.';
  if (failure.kind === 'password_invalid') return 'Senha incorreta.';
  if (failure.kind === 'not_found') return 'Essa mesa não está mais aberta ao público.';
  if (failure.kind === 'already_owner') return ALREADY_OWNER_MESSAGE;
  return commandFailureMessage(failure);
}
