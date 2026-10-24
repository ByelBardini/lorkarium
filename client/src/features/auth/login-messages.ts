import type { LoginFailure, TwoFactorLoginFailure } from '@/services/auth-api';

type LoginRefusal = LoginFailure | TwoFactorLoginFailure;

const MESSAGE_BY_KIND: Readonly<Record<Exclude<LoginRefusal['kind'], 'rate_limited'>, string>> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  offline: 'Sem conexão com o servidor. Confira sua internet e tente de novo.',
  unexpected: 'Algo deu errado do nosso lado. Tente de novo em instantes.',
  two_factor_required: 'Sua conta pede o código do app autenticador.',
  two_factor_code_invalid: 'Código incorreto.',
  two_factor_challenge_expired: 'O tempo para o código acabou. Entre de novo.',
};

/** The sentence of a login refusal (either step), for the alert at the top of the form.
 *
 *  Example: `failureMessage({ kind: 'rate_limited', retryAfterSeconds: 30 }) // 'Muitas tentativas. Tente de novo em 30 s.'` */
export function failureMessage(failure: LoginRefusal): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas tentativas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  return MESSAGE_BY_KIND[failure.kind];
}
