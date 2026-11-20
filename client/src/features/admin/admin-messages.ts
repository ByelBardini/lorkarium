import type { UserPlan, UserReportReason } from '@lorkarium/contracts';
import { OFFLINE_MESSAGE, UNEXPECTED_MESSAGE } from '@/features/campaigns/campaign-messages';
import { PLAN_NAMES } from '@/lib/plan-seal';
import type { BadgeCatalogFailure, BadgesAdminFailure } from '@/services/badges-admin-api';
import type { UserAdminFailure } from '@/services/user-admin-api';

type MessageKind = Exclude<UserAdminFailure['kind'], 'rate_limited'>;

const MESSAGE_BY_KIND: Readonly<Record<MessageKind, string>> = {
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
  forbidden: 'Você não tem mais acesso ao backoffice.',
  self_action: 'Você não pode fazer isso com a sua própria conta.',
  owns_shared_campaigns: 'Essa conta criou mesas em que outras pessoas jogam.',
  email_taken: 'Esse e-mail já é de uma conta.',
  email_banned:
    'Esse e-mail é de uma conta excluída por violar a Política de uso e não pode ser convidado de novo.',
  already_suspended: 'A conta já está suspensa.',
  sanction_until_past: 'O fim da suspensão precisa ser depois de agora.',
  target_is_admin: 'Uma conta admin não recebe medida. Tire o acesso de admin antes.',
  appeal_already_decided: 'Essa contestação já foi decidida.',
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

const CATALOG_MESSAGE_BY_KIND: Readonly<Record<BadgeCatalogFailure['kind'], string>> = {
  name_taken: 'Já existe uma insígnia com esse nome.',
  order_stale: 'A lista de insígnias mudou no meio. Ela foi recarregada; ordene de novo.',
  badge_without_image: 'Uma insígnia marcada não tem imagem. A lista foi recarregada.',
  image_too_large: 'A imagem passa de 2 MB.',
  unsupported_image: 'Não deu para ler essa imagem. Use PNG, JPEG, WebP ou GIF.',
};

/** The sentence a refusal of the badge catalog shows; a vanished badge says so, not "conta".
 *
 *  Example: `badgeFailureMessage({ kind: 'name_taken' }) // 'Já existe uma insígnia com esse nome.'` */
export function badgeFailureMessage(failure: BadgesAdminFailure): string {
  if (isCatalogFailure(failure)) return CATALOG_MESSAGE_BY_KIND[failure.kind];
  if (failure.kind === 'not_found')
    return 'Essa insígnia não existe mais. A lista foi recarregada.';
  return adminFailureMessage(failure);
}

function isCatalogFailure(failure: BadgesAdminFailure): failure is BadgeCatalogFailure {
  return Object.hasOwn(CATALOG_MESSAGE_BY_KIND, failure.kind);
}

/** What deleting a badge takes away, said before the "Excluir".
 *
 *  Example: `badgeDeletionConsequence(12) // '12 contas perdem essa insígnia.'` */
export function badgeDeletionConsequence(holders: number): string {
  if (holders === 0) return 'Nenhuma conta tem essa insígnia.';
  if (holders === 1) return '1 conta perde essa insígnia.';
  return `${holders} contas perdem essa insígnia.`;
}

/** Example: `badgeHoldersLabel(1) // '1 conta'` */
export function badgeHoldersLabel(holders: number): string {
  return holders === 1 ? '1 conta' : `${holders} contas`;
}

export const ROLE_LABEL = { admin: 'Admin', user: 'Usuário' } as const;

/** Example: `deletionConsequence('bia', 2) // 'A conta de @bia e as 2 mesas só dela somem para sempre.'` */
export function deletionConsequence(username: string, soloCampaigns: number): string {
  if (soloCampaigns === 0) return `A conta de @${username} some para sempre.`;
  if (soloCampaigns === 1) return `A conta de @${username} e a mesa só dela somem para sempre.`;
  return `A conta de @${username} e as ${soloCampaigns} mesas só dela somem para sempre.`;
}

/** Example: `planChangedNotice('bia', 'lenda') // '@bia agora está no plano Lenda.'` */
export function planChangedNotice(username: string, plan: UserPlan): string {
  return `@${username} agora está no plano ${PLAN_NAMES[plan]}.`;
}

/** How the reports queue names each reason. */
export const REPORT_REASON_LABEL: Readonly<Record<UserReportReason, string>> = {
  harassment: 'Assédio',
  hate_speech: 'Discurso de ódio',
  spam: 'Spam',
  cheating: 'Trapaça',
  inappropriate_content: 'Conteúdo impróprio',
  impersonation: 'Se passar por outra pessoa',
  other: 'Outro',
};
