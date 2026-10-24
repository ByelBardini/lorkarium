import type {
  AccountSecurityDto,
  AccountSessionDto,
  ChangeEmailRequestDto,
  ChangePasswordRequestDto,
  ConfirmEmailRequestDto,
  TwoFactorConfirmRequestDto,
  TwoFactorEnableRequestDto,
  TwoFactorSetupRequestDto,
  TwoFactorSetupResponseDto,
} from '@lorkarium/contracts';
import type { AccountLoadFailure, AccountResult } from '@/services/account-failure';
import type {
  AccountRecoveryView,
  AccountSecurityApi,
  SecurityResult,
} from '@/services/account-security-api';
import { ANA } from './auth-api-fake';
import { ScriptedAnswers } from './scripted-answers';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ana's security with nothing changed yet: no pending e-mail, password from the account's start,
 *  2FA off. */
export const ANA_SECURITY: AccountSecurityDto = {
  email: ANA.email,
  passwordChangedAt: null,
  pendingEmail: null,
  twoFactor: { enabled: false, recoveryCodesLeft: 0 },
};

/** The pending 2FA secret the setup answers (a QR of one pixel is enough for the screen). */
export const TWO_FACTOR_SETUP: TwoFactorSetupResponseDto = {
  secret: 'JBSWY3DPEHPK3PXP',
  otpauthUri: 'otpauth://totp/Lorkarium:ana?secret=JBSWY3DPEHPK3PXP&issuer=Lorkarium',
  qrImage: 'data:image/png;base64,iVBORw0KGgo=',
};

/** The 10 recovery codes handed out when 2FA goes on. */
export const RECOVERY_CODES: readonly string[] = [
  'k7m2p-9qrst',
  'k7m2p-9qrsu',
  'k7m2p-9qrsv',
  'k7m2p-9qrsw',
  'k7m2p-9qrsx',
  'k7m2p-9qrsy',
  'k7m2p-9qrsz',
  'k7m2p-9qrs2',
  'k7m2p-9qrs3',
  'k7m2p-9qrs4',
];

/** The 10 codes a regeneration answers (none equal to the first ones). */
export const NEW_RECOVERY_CODES: readonly string[] = RECOVERY_CODES.map(
  (code) => `h${code.slice(1)}`,
);

/** Ana's devices at `now`: this Chrome on Windows, Safari on an iPhone 5 h ago, Firefox on Linux
 *  2 days ago. */
export function anaSessions(now: Date): AccountSessionDto[] {
  const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();
  return [
    {
      id: 'c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b',
      browser: 'firefox',
      os: 'linux',
      formFactor: 'desktop',
      createdAt: ago(9 * DAY_MS),
      lastSeenAt: ago(2 * DAY_MS),
      current: false,
    },
    {
      id: 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d',
      browser: 'chrome',
      os: 'windows',
      formFactor: 'desktop',
      createdAt: ago(DAY_MS),
      lastSeenAt: ago(0),
      current: true,
    },
    {
      id: 'b9c8d7e6-f5a4-4b3c-9d2e-1f0a9b8c7d6e',
      browser: 'safari',
      os: 'ios',
      formFactor: 'mobile',
      createdAt: ago(3 * DAY_MS),
      lastSeenAt: ago(5 * 60 * 60 * 1000),
      current: false,
    },
  ];
}

type Answers = {
  security: AccountResult<AccountSecurityDto, AccountLoadFailure>;
  sessions: AccountResult<AccountSessionDto[], AccountLoadFailure>;
  changePassword: SecurityResult<null>;
  requestEmailChange: SecurityResult<string>;
  cancelEmailChange: SecurityResult<null>;
  confirmEmail: SecurityResult<null>;
  revokeSession: SecurityResult<null>;
  revokeOtherSessions: SecurityResult<number>;
  setupTwoFactor: SecurityResult<TwoFactorSetupResponseDto>;
  enableTwoFactor: SecurityResult<string[]>;
  disableTwoFactor: SecurityResult<null>;
  regenerateRecoveryCodes: SecurityResult<string[]>;
  checkRecovery: SecurityResult<AccountRecoveryView>;
  recover: SecurityResult<null>;
};

/** What an unscripted recovery link does: undo a password change. */
export const PASSWORD_RECOVERY: AccountRecoveryView = {
  kind: 'revert-password-change',
  email: null,
};

/** An `AccountSecurityApi` that keeps the account like the server would: a change of password,
 *  e-mail, session or 2FA shows in the next `security`/`sessions`. Any method can be scripted. */
export class AccountSecurityApiFake implements AccountSecurityApi {
  currentSecurity: AccountSecurityDto = ANA_SECURITY;
  currentSessions: AccountSessionDto[];
  readonly answers = new ScriptedAnswers<Answers>();

  constructor(private readonly now: Date) {
    this.currentSessions = anaSessions(now);
  }

  security(): Promise<Answers['security']> {
    return this.answers.reply('security', undefined, () => ok(this.currentSecurity));
  }

  sessions(): Promise<Answers['sessions']> {
    return this.answers.reply('sessions', undefined, () => ok(this.currentSessions));
  }

  changePassword(input: ChangePasswordRequestDto): Promise<Answers['changePassword']> {
    return this.answers.reply('changePassword', input, () => {
      this.currentSecurity = { ...this.currentSecurity, passwordChangedAt: this.now.toISOString() };
      this.currentSessions = this.currentSessions.filter((session) => session.current);
      return ok(null);
    });
  }

  requestEmailChange(input: ChangeEmailRequestDto): Promise<Answers['requestEmailChange']> {
    return this.answers.reply('requestEmailChange', input, () => {
      const pendingEmail = maskEmail(input.newEmail);
      this.currentSecurity = { ...this.currentSecurity, pendingEmail };
      return ok(pendingEmail);
    });
  }

  cancelEmailChange(): Promise<Answers['cancelEmailChange']> {
    return this.answers.reply('cancelEmailChange', undefined, () => {
      this.currentSecurity = { ...this.currentSecurity, pendingEmail: null };
      return ok(null);
    });
  }

  confirmEmail(input: ConfirmEmailRequestDto): Promise<Answers['confirmEmail']> {
    return this.answers.reply('confirmEmail', input, () => ok(null));
  }

  checkRecovery(token: string): Promise<Answers['checkRecovery']> {
    return this.answers.reply('checkRecovery', token, () => ok(PASSWORD_RECOVERY));
  }

  recover(token: string, newPassword: string): Promise<Answers['recover']> {
    return this.answers.reply('recover', { token, newPassword }, () => ok(null));
  }

  revokeSession(sessionId: string): Promise<Answers['revokeSession']> {
    return this.answers.reply('revokeSession', sessionId, () => {
      this.currentSessions = this.currentSessions.filter((session) => session.id !== sessionId);
      return ok(null);
    });
  }

  revokeOtherSessions(): Promise<Answers['revokeOtherSessions']> {
    return this.answers.reply('revokeOtherSessions', undefined, () => {
      const kept = this.currentSessions.filter((session) => session.current);
      const revoked = this.currentSessions.length - kept.length;
      this.currentSessions = kept;
      return ok(revoked);
    });
  }

  setupTwoFactor(input: TwoFactorSetupRequestDto): Promise<Answers['setupTwoFactor']> {
    return this.answers.reply('setupTwoFactor', input, () => ok(TWO_FACTOR_SETUP));
  }

  enableTwoFactor(input: TwoFactorEnableRequestDto): Promise<Answers['enableTwoFactor']> {
    return this.answers.reply('enableTwoFactor', input, () =>
      this.codesHandedOut([...RECOVERY_CODES]),
    );
  }

  disableTwoFactor(input: TwoFactorConfirmRequestDto): Promise<Answers['disableTwoFactor']> {
    return this.answers.reply('disableTwoFactor', input, () => {
      this.currentSecurity = {
        ...this.currentSecurity,
        twoFactor: { enabled: false, recoveryCodesLeft: 0 },
      };
      return ok(null);
    });
  }

  regenerateRecoveryCodes(
    input: TwoFactorConfirmRequestDto,
  ): Promise<Answers['regenerateRecoveryCodes']> {
    return this.answers.reply('regenerateRecoveryCodes', input, () =>
      this.codesHandedOut([...NEW_RECOVERY_CODES]),
    );
  }

  private codesHandedOut(codes: string[]): { ok: true; value: string[] } {
    this.currentSecurity = {
      ...this.currentSecurity,
      twoFactor: { enabled: true, recoveryCodesLeft: codes.length },
    };
    return ok(codes);
  }
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.charAt(0)}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
