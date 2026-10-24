import type {
  AcceptInvitationRequestDto,
  AuthUserDto,
  InvitationInspectResponseDto,
} from '@lorkarium/contracts';
import type { AccountLinksApi, AccountLinksResult } from '@/services/account-links-api';
import { ScriptedAnswers } from './scripted-answers';

/** The account an accepted invitation creates, unless scripted: Marina, nickname = @. */
export const MARINA: AuthUserDto = {
  id: '6b5a4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d',
  username: 'marina',
  name: 'marina',
  email: 'marina@exemplo.com',
  role: 'user',
  color: 'violet',
  avatarId: null,
};

type Answers = {
  inspectInvitation: AccountLinksResult<InvitationInspectResponseDto>;
  acceptInvitation: AccountLinksResult<AuthUserDto>;
  inspectPasswordReset: AccountLinksResult<string>;
  completePasswordReset: AccountLinksResult<null>;
};

/** Every link works unless scripted: the invitation is Marina's, the new password Bia's. */
export class AccountLinksApiFake implements AccountLinksApi {
  readonly answers = new ScriptedAnswers<Answers>();

  inspectInvitation(token: string): Promise<Answers['inspectInvitation']> {
    return this.answers.reply('inspectInvitation', token, () =>
      ok({ email: 'marina@exemplo.com', suggestedUsername: 'marina' }),
    );
  }

  acceptInvitation(input: AcceptInvitationRequestDto): Promise<Answers['acceptInvitation']> {
    return this.answers.reply('acceptInvitation', input, () =>
      ok({ ...MARINA, username: input.username, name: input.username }),
    );
  }

  inspectPasswordReset(token: string): Promise<Answers['inspectPasswordReset']> {
    return this.answers.reply('inspectPasswordReset', token, () => ok('biaflor'));
  }

  completePasswordReset(
    token: string,
    newPassword: string,
  ): Promise<Answers['completePasswordReset']> {
    return this.answers.reply('completePasswordReset', { token, newPassword }, () => ok(null));
  }
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}
