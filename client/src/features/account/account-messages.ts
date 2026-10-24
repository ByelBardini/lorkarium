import {
  NEW_PASSWORD_MIN_LENGTH,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
} from '@lorkarium/contracts';
import { OFFLINE_MESSAGE, UNEXPECTED_MESSAGE } from '@/features/campaigns/campaign-messages';
import type { AccountSecurityFailure } from '@/services/account-security-api';
import type { ProfileFailure } from '@/services/profile-api';

/** Every refusal the account screen can show. */
export type AccountFailure = ProfileFailure | AccountSecurityFailure;

type MessageKind = Exclude<AccountFailure['kind'], 'rate_limited'>;

const MESSAGE_BY_KIND: Readonly<Record<MessageKind, string>> = {
  invalid: 'Confira os campos e tente de novo.',
  unauthenticated: 'Sua sessão terminou. Entre de novo.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
  avatar_too_large: 'A foto pode ter até 5 MB.',
  unsupported_image: 'Esse arquivo não é uma imagem que dá para usar (PNG, JPEG, WebP ou GIF).',
  current_password_invalid: 'Senha atual incorreta.',
  email_taken: 'Esse e-mail já está em uso.',
  email_unchanged: 'Esse já é o seu e-mail.',
  email_token_invalid: 'Esse link venceu ou já foi usado. Peça a troca de novo em Minha conta.',
  session_not_found: 'Essa sessão já tinha saído.',
  current_session: 'Este aparelho sai pelo "Sair" do menu.',
  two_factor_code_invalid: 'Código incorreto. Confira o app e tente de novo.',
  two_factor_already_enabled: 'O 2FA já está ligado.',
  two_factor_not_started: 'O tempo para ligar o 2FA acabou. Comece de novo.',
  two_factor_not_enabled: 'O 2FA já está desligado.',
};

/** The sentence a refusal shows, in the field it belongs to or in the alert.
 *
 *  Example: `accountFailureMessage({ kind: 'email_taken' }) // 'Esse e-mail já está em uso.'` */
export function accountFailureMessage(failure: AccountFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas tentativas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  return MESSAGE_BY_KIND[failure.kind];
}

/** The messages of the fields, written once for the profile and the dialogs. */
export const FIELD_MESSAGES = {
  emptyName: 'O apelido não pode ficar vazio.',
  longName: `Use no máximo ${PROFILE_NAME_MAX_LENGTH} caracteres.`,
  longBio: `Use no máximo ${PROFILE_BIO_MAX_LENGTH} caracteres.`,
  emptyCurrentPassword: 'Informe sua senha atual.',
  shortNewPassword: `A senha nova precisa de pelo menos ${NEW_PASSWORD_MIN_LENGTH} caracteres.`,
  longNewPassword: 'A senha pode ter no máximo 256 caracteres.',
  passwordsDiffer: 'As senhas não são iguais.',
  emptyEmail: 'Informe o novo e-mail.',
  invalidEmail: 'Informe um e-mail válido, como voce@exemplo.com.',
  invalidTotp: 'O código tem 6 números.',
  invalidCode: 'Use os 6 números do app ou um código de recuperação.',
} as const;
