import type { ReputationSummaryDto, UserReportReason } from '@lorkarium/contracts';
import type {
  ProfileCardLoadFailure,
  ProfileLookupFailure,
  ReputationFailure,
  UserReportFailure,
} from '@/services/profile-card-api';

const COUNT_FORMAT = new Intl.NumberFormat('pt-BR');
const DAY_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** A count as the card writes it (dot for thousands).
 *
 *  Example: `cardCount(4812) // '4.812'` */
export function cardCount(count: number): string {
  return COUNT_FORMAT.format(count);
}

/** The "Desde" tag of the banner, the day the account was made (local time); the Dono do
 *  Lorkarium is there "Desde o início".
 *
 *  Example: `memberSinceTag({ memberSince: '2025-01-05T12:00:00.000Z', lorkariumOwner: false }) // 'Desde 05/01/2025'` */
export function memberSinceTag({
  memberSince,
  lorkariumOwner,
}: Readonly<{ memberSince: string; lorkariumOwner: boolean }>): string {
  if (lorkariumOwner) return 'Desde o início';
  const date = new Date(memberSince);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`memberSince "${memberSince}" is not a date: expected an ISO instant`);
  }
  return `Desde ${DAY_FORMAT.format(date)}`;
}

/** The approval attribute: the percent, or the notice below the minimum of votes.
 *
 *  Example: `approvalText({ up: 1, down: 0, myVote: null, percent: null }) // 'Sem votos suficientes'` */
export function approvalText(reputation: ReputationSummaryDto): string {
  return reputation.percent === null ? 'Sem votos suficientes' : `${reputation.percent}%`;
}

/** The reasons of a report as the dialog lists them, in the contract's order. */
export const REPORT_REASON_LABELS: Readonly<Record<UserReportReason, string>> = {
  harassment: 'Assédio',
  hate_speech: 'Discurso de ódio',
  spam: 'Spam',
  cheating: 'Trapaça',
  inappropriate_content: 'Conteúdo impróprio',
  impersonation: 'Se passando por outra pessoa',
  underage: 'Parece ter menos de 18 anos',
  other: 'Outro motivo',
};

/** Why the card could not be read (pt-BR).
 *
 *  Example: `cardLoadFailureText({ kind: 'user_not_found' }) // 'Essa conta não existe mais.'` */
export function cardLoadFailureText(failure: ProfileCardLoadFailure): string {
  if (failure.kind === 'user_not_found') return 'Essa conta não existe mais.';
  if (failure.kind === 'unauthenticated') return 'Sua sessão caiu. Entre de novo.';
  return 'Não deu para abrir o perfil.';
}

/** Why the lookup by @ found no card (pt-BR), quoting the text as it was typed.
 *
 *  Example: `profileLookupFailureText({ kind: 'user_not_found' }, 'ByelB') // 'O usuário "ByelB" não foi encontrado no Lorkarium.'` */
export function profileLookupFailureText(failure: ProfileLookupFailure, typed: string): string {
  if (failure.kind === 'user_not_found') {
    return `O usuário "${typed}" não foi encontrado no Lorkarium.`;
  }
  if (failure.kind === 'rate_limited') {
    return `Muitas buscas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  return cardLoadFailureText(failure);
}

const COMMAND_FAILURE_TEXT: Partial<
  Record<(ReputationFailure | UserReportFailure)['kind'], string>
> = {
  reputation_not_allowed: 'Só quem divide uma mesa com a pessoa pode votar.',
  report_already_open: 'Você já tem uma denúncia aberta sobre essa pessoa.',
  campaign_not_shared: 'Vocês não jogam juntos nessa mesa.',
  attachment_not_found: 'Um dos prints não foi encontrado. Anexe de novo.',
  offline: 'Sem conexão. Tente de novo.',
  user_not_found: 'Essa conta não existe mais.',
};

/** Why a vote or a report was refused (pt-BR).
 *
 *  Example: `cardCommandFailureText({ kind: 'report_already_open' })` */
export function cardCommandFailureText(failure: ReputationFailure | UserReportFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas tentativas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  return COMMAND_FAILURE_TEXT[failure.kind] ?? 'Algo deu errado. Tente de novo.';
}
