import type {
  PasswordResetRequestDto,
  SignUpRequestDto,
  SignUpSettingsDto,
} from '@lorkarium/contracts';
import type { SignUpApi, SignUpResult } from '@/services/sign-up-api';
import { ScriptedAnswers } from './scripted-answers';

/** The site key a test scripts when it wants the Turnstile widget on screen. */
export const TEST_SITE_KEY = '1x00000000000000000000AA';

type Answers = {
  settings: SignUpResult<SignUpSettingsDto>;
  requestSignUp: SignUpResult<null>;
  requestPasswordReset: SignUpResult<null>;
};

/** Unless scripted: registration open, no site key (the dev server without Turnstile, so the
 *  forms send `skipped`), and every request answered with the same 202. */
export class SignUpApiFake implements SignUpApi {
  readonly answers = new ScriptedAnswers<Answers>();

  settings(): Promise<Answers['settings']> {
    return this.answers.reply('settings', null, () => ({
      ok: true,
      value: { registrationOpen: true, humanCheckSiteKey: null },
    }));
  }

  requestSignUp(input: SignUpRequestDto): Promise<Answers['requestSignUp']> {
    return this.answers.reply('requestSignUp', input, () => ({ ok: true, value: null }));
  }

  requestPasswordReset(input: PasswordResetRequestDto): Promise<Answers['requestPasswordReset']> {
    return this.answers.reply('requestPasswordReset', input, () => ({ ok: true, value: null }));
  }

  /** Scripts the settings with the given site key (the widget appears). */
  withSiteKey(siteKey: string = TEST_SITE_KEY): this {
    this.answers.answer('settings', {
      ok: true,
      value: { registrationOpen: true, humanCheckSiteKey: siteKey },
    });
    return this;
  }
}
