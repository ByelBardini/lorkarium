import {
  NEW_PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  newPasswordDto,
  usernameDto,
} from '@lorkarium/contracts';
import { OFFLINE_MESSAGE, UNEXPECTED_MESSAGE } from '@/features/campaigns/campaign-messages';
import type { AccountLinksFailure } from '@/services/account-links-api';

export const INVITATION_LINK_DEAD =
  'Esse link venceu ou já foi usado. Peça um novo a quem te convidou.';
export const RESET_LINK_DEAD =
  'Esse link venceu ou já foi usado. Peça um novo a quem administra o Lorkarium.';

type MessageKind = Exclude<
  AccountLinksFailure['kind'],
  'rate_limited' | 'username_taken' | 'link_invalid'
>;

const MESSAGE_BY_KIND: Readonly<Record<MessageKind, string>> = {
  email_taken: 'Esse e-mail já é de uma conta. Entre com ele ou peça ajuda a quem te convidou.',
  invalid: 'Confira os campos e tente de novo.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
};

/** The sentence of a refusal shown in the alert of a link page.
 *
 *  Example: `linkFailureMessage({ kind: 'offline' }) // 'Sem conexão com o servidor…'` */
export function linkFailureMessage(failure: AccountLinksFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas tentativas. Tente de novo em ${failure.retryAfterSeconds} s.`;
  }
  if (failure.kind === 'username_taken' || failure.kind === 'link_invalid')
    return MESSAGE_BY_KIND.invalid;
  return MESSAGE_BY_KIND[failure.kind];
}

/** What is wrong with a typed @, in pt-BR, by the contracts' `usernameDto`; `undefined` when fine.
 *
 *  Example: `usernameProblem('ab') // 'Use de 3 a 20 caracteres.'` */
export function usernameProblem(username: string): string | undefined {
  const parsed = usernameDto.safeParse(username);
  if (parsed.success) return undefined;
  const trimmed = username.trim();
  if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) {
    return `Use de ${USERNAME_MIN_LENGTH} a ${USERNAME_MAX_LENGTH} caracteres.`;
  }
  return 'Use só letras minúsculas, números, ponto e _.';
}

/** What is wrong with a new password and its repetition; `undefined` for each one that is fine.
 *
 *  Example: `passwordProblems('1234567', '1234567').password // 'A senha precisa de pelo menos 8 caracteres.'` */
export function passwordProblems(
  password: string,
  repeated: string,
): Readonly<{ password?: string; repeated?: string }> {
  if (!newPasswordDto.safeParse(password).success) {
    const tooLong = password.length > 256;
    return {
      password: tooLong
        ? 'A senha pode ter no máximo 256 caracteres.'
        : `A senha precisa de pelo menos ${NEW_PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  return password === repeated ? {} : { repeated: 'As senhas não são iguais.' };
}
