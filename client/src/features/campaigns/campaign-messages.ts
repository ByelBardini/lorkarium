import type { CampaignsFailureKind } from '@/services/campaigns-api';

export const OFFLINE_MESSAGE = 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
export const UNEXPECTED_MESSAGE = 'Algo deu errado do nosso lado. Tente de novo em instantes.';
export const NOT_MEMBER_MESSAGE = 'Essa mesa não existe ou você não participa dela.';

/** The message a screen shows for a failure no field owns.
 *
 *  Example: `failureMessage('offline') // 'Sem conexão com o servidor…'` */
export function failureMessage(kind: CampaignsFailureKind): string {
  if (kind === 'offline') return OFFLINE_MESSAGE;
  if (kind === 'not_found') return NOT_MEMBER_MESSAGE;
  return UNEXPECTED_MESSAGE;
}
