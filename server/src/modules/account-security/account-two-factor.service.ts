import {
  RECOVERY_CODE_COUNT,
  type TwoFactorConfirmRequestDto,
  type TwoFactorSetupResponseDto,
} from '@lorkarium/contracts';
import { recoveryCodeIndexOf, toSecondFactor } from '../auth/auth.mapper';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { RecoveryCodesDao } from '../auth/recovery-codes.dao';
import type { TotpPort } from '../auth/totp.port';
import type { TwoFactorCheckService } from '../auth/two-factor-check.service';
import type { TwoFactorDao } from '../auth/two-factor.dao';
import type { UserTwoFactorPo } from '../auth/two-factor.po';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { TwoFactorStateError } from './account-security.error';
import type { CurrentPasswordService } from './current-password.service';
import type { QrCodePort } from './qr-code.port';
import type { RecoveryCodePort } from './recovery-code.port';
import { twoFactorChangedMail } from './security-mail.mapper';
import type { SecurityNoticesService } from './security-notices.service';

export type AccountTwoFactorDeps = Readonly<{
  users: Pick<UsersDao, 'findById'>;
  currentPassword: Pick<CurrentPasswordService, 'require'>;
  twoFactor: Pick<TwoFactorDao, 'findOf' | 'savePending' | 'enable' | 'delete'>;
  recoveryCodes: Pick<RecoveryCodesDao, 'replace'>;
  check: Pick<TwoFactorCheckService, 'acceptTotp' | 'verify'>;
  totp: TotpPort;
  qr: QrCodePort;
  codes: RecoveryCodePort;
  cipher: DataCipherPort;
  clock: ClockPort;
  notices: Pick<SecurityNoticesService, 'send'>;
}>;

/** Turning 2FA on (setup with the password, then the first app code), off, and new recovery
 *  codes. The secret rests sealed, the codes by blind index; the plain codes are returned once.
 *
 *  Example: `const { recoveryCodes } = await accountTwoFactor.enable(userId, '287082')` */
export class AccountTwoFactorService {
  constructor(private readonly deps: AccountTwoFactorDeps) {}

  /** A new pending secret (a setup never confirmed starts over); refused once 2FA is on. */
  async setup(userId: string, currentPassword: string): Promise<TwoFactorSetupResponseDto> {
    const row = await this.deps.currentPassword.require(userId, currentPassword);
    const existing = await this.deps.twoFactor.findOf(userId);
    if (existing?.enabledAt) throw alreadyEnabled(userId);
    const secret = this.deps.totp.generateSecret();
    const secretCipher = this.deps.cipher.seal('totp-secret', secret, userId);
    await this.deps.twoFactor.savePending(userId, secretCipher);
    const otpauthUri = this.deps.totp.uri(secret, row.username);
    return { secret, otpauthUri, qrImage: await this.deps.qr.pngDataUrl(otpauthUri) };
  }

  /** Confirms the pending secret with its first code; returns the 10 recovery codes. */
  async enable(userId: string, code: string): Promise<string[]> {
    const pending = await this.pendingOf(userId);
    const step = this.deps.check.acceptTotp(pending, code);
    const now = this.deps.clock.now();
    await this.deps.twoFactor.enable(userId, now, step);
    const codes = await this.replaceCodes(userId);
    const row = await this.deps.users.findById(userId);
    if (row) await this.notify(row, true, now);
    return codes;
  }

  async disable(userId: string, input: TwoFactorConfirmRequestDto): Promise<void> {
    const row = await this.confirmWithBothFactors(userId, input);
    await this.deps.twoFactor.delete(userId);
    await this.deps.recoveryCodes.replace(userId, []);
    await this.notify(row, false, this.deps.clock.now());
  }

  /** New recovery codes: the previous ones stop working. */
  async regenerateCodes(userId: string, input: TwoFactorConfirmRequestDto): Promise<string[]> {
    await this.confirmWithBothFactors(userId, input);
    return this.replaceCodes(userId);
  }

  private async pendingOf(userId: string): Promise<UserTwoFactorPo> {
    const row = await this.deps.twoFactor.findOf(userId);
    if (!row) throw new TwoFactorStateError('TWO_FACTOR_NOT_STARTED', userId, 'off');
    if (row.enabledAt) throw alreadyEnabled(userId);
    return row;
  }

  private async confirmWithBothFactors(
    userId: string,
    input: TwoFactorConfirmRequestDto,
  ): Promise<UserPo> {
    const row = await this.deps.currentPassword.require(userId, input.currentPassword);
    const twoFactor = await this.deps.twoFactor.findOf(userId);
    if (!twoFactor?.enabledAt) {
      throw new TwoFactorStateError(
        'TWO_FACTOR_NOT_ENABLED',
        userId,
        twoFactor ? 'pending' : 'off',
      );
    }
    await this.deps.check.verify(userId, toSecondFactor(input.code));
    return row;
  }

  private async replaceCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => this.deps.codes.generate());
    const indexes = codes.map((code) => recoveryCodeIndexOf(this.deps.cipher, code));
    await this.deps.recoveryCodes.replace(userId, indexes);
    return codes;
  }

  private async notify(row: UserPo, enabled: boolean, at: Date): Promise<void> {
    const email = this.deps.cipher.open('user-email', row.emailCipher, row.id);
    await this.deps.notices.send(twoFactorChangedMail(email, enabled, at));
  }
}

function alreadyEnabled(userId: string): TwoFactorStateError {
  return new TwoFactorStateError('TWO_FACTOR_ALREADY_ENABLED', userId, 'enabled');
}
