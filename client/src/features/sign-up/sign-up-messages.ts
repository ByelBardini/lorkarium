import { OFFLINE_MESSAGE, UNEXPECTED_MESSAGE } from '@/features/campaigns/campaign-messages';
import type { SignUpFailure } from '@/services/sign-up-api';

export const SIGN_UP_CLOSED = 'O cadastro está fechado no momento.';
export const SIGN_UP_LINK_DEAD = 'Esse link venceu ou já foi usado.';
export const EMAIL_PROBLEM = 'Informe um e-mail, como voce@exemplo.com.';

const SECONDS_PER_MINUTE = 60;

const MESSAGE_BY_KIND: Readonly<Record<Exclude<SignUpFailure['kind'], 'rate_limited'>, string>> = {
  registration_closed: SIGN_UP_CLOSED,
  human_check_failed: 'A verificação não passou. Faça de novo e envie.',
  invalid: 'Confira o campo e tente de novo.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
};

/** The sentence of a refusal on the sign-up and new-password request pages; the wait in minutes,
 *  because the limits of these routes count in minutes.
 *
 *  Example: `signUpFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 90 }) // '… em 2 min.'` */
export function signUpFailureMessage(failure: SignUpFailure): string {
  if (failure.kind !== 'rate_limited') return MESSAGE_BY_KIND[failure.kind];
  const minutes = Math.max(1, Math.ceil(failure.retryAfterSeconds / SECONDS_PER_MINUTE));
  return `Muitos pedidos. Tente de novo em ${minutes} min.`;
}

/** The "Você já está conectado como @x" of the pages that create an account.
 *
 *  Example: `signedInToSignUp('caio') // 'Você já está conectado como @caio. Para criar outra conta, saia primeiro.'` */
export function signedInToSignUp(username: string): string {
  return `Você já está conectado como @${username}. Para criar outra conta, saia primeiro.`;
}
