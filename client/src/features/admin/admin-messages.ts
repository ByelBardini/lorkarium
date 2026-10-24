import { OFFLINE_MESSAGE, UNEXPECTED_MESSAGE } from '@/features/campaigns/campaign-messages';
import type { UserAdminFailure } from '@/services/user-admin-api';

type MessageKind = Exclude<UserAdminFailure['kind'], 'rate_limited'>;

const MESSAGE_BY_KIND: Readonly<Record<MessageKind, string>> = {
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
  forbidden: 'Você não tem mais acesso ao backoffice.',
  self_action: 'Você não pode fazer isso com a sua própria conta.',
  owns_shared_campaigns: 'Essa conta criou mesas em que outras pessoas jogam.',
  email_taken: 'Esse e-mail já é de uma conta.',
  already_invited: 'Já existe um convite para esse e-mail.',
  account_suspended: 'A conta está suspensa. Reative antes de mandar o link.',
  not_found: 'Essa conta ou convite não existe mais. Recarregue a lista.',
  invalid: 'Confira os campos e tente de novo.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
  mail_delivery_failed:
    'O servidor de e-mail recusou ou não respondeu. Confira o SMTP_URL do server e tente de novo.',
};

/** The sentence a refusal of the backoffice shows.
 *
 *  Example: `adminFailureMessage({ kind: 'self_action' }) // 'Você não pode fazer isso com a sua própria conta.'` */
export function adminFailureMessage(failure: UserAdminFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas tentativas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  return MESSAGE_BY_KIND[failure.kind];
}

export const ROLE_LABEL = { admin: 'Admin', user: 'Usuário' } as const;

/** Example: `deletionConsequence('bia', 2) // 'A conta de @bia e as 2 mesas só dela somem para sempre.'` */
export function deletionConsequence(username: string, soloCampaigns: number): string {
  if (soloCampaigns === 0) return `A conta de @${username} some para sempre.`;
  if (soloCampaigns === 1) return `A conta de @${username} e a mesa só dela somem para sempre.`;
  return `A conta de @${username} e as ${soloCampaigns} mesas só dela somem para sempre.`;
}
