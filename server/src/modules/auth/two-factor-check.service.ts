import { TwoFactorCodeInvalidError } from './auth.error';
import { recoveryCodeIndexOf, toTwoFactorBo, type SecondFactor } from './auth.mapper';
import type { ClockPort } from './clock.port';
import type { DataCipherPort } from './data-cipher.port';
import type { RecoveryCodesDao } from './recovery-codes.dao';
import type { TotpPort } from './totp.port';
import type { TwoFactorDao } from './two-factor.dao';
import type { UserTwoFactorPo } from './two-factor.po';

export type TwoFactorCheckDeps = Readonly<{
  twoFactor: Pick<TwoFactorDao, 'findOf' | 'recordStep'>;
  recoveryCodes: Pick<RecoveryCodesDao, 'findOf' | 'use'>;
  totp: TotpPort;
  cipher: DataCipherPort;
  clock: ClockPort;
}>;

/** Checks a second factor once (the login's second step, turning 2FA off, new recovery codes):
 *  the accepted app step or recovery code is recorded, so the same code never works twice.
 *
 *  Example: `await check.verify(userId, toSecondFactor(dto.code))` */
export class TwoFactorCheckService {
  constructor(private readonly deps: TwoFactorCheckDeps) {}

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.deps.twoFactor.findOf(userId);
    return (row?.enabledAt ?? null) !== null;
  }

  /** Accepts `factor` for the enabled 2FA of `userId`; throws TWO_FACTOR_CODE_INVALID. */
  async verify(userId: string, factor: SecondFactor): Promise<void> {
    const row = await this.deps.twoFactor.findOf(userId);
    toTwoFactorBo(userId, row).requireEnabled();
    if (!row) return;
    if (factor.kind === 'totp') return this.recordTotp(row, factor.code);
    await this.useRecoveryCode(row, factor.code);
  }

  /** The step `code` matches on `row`'s secret (pending or enabled); refuses a wrong code or a
   *  replay. Recording the step is up to the caller (enabling stores it with `enabled_at`). */
  acceptTotp(row: UserTwoFactorPo, code: string): number {
    const now = this.deps.clock.now();
    const secret = this.deps.cipher.open('totp-secret', row.secretCipher, row.userId);
    const matched = this.deps.totp.stepOf(secret, code, now);
    return toTwoFactorBo(row.userId, row).acceptTotp(matched, this.deps.totp.currentStep(now));
  }

  private async recordTotp(row: UserTwoFactorPo, code: string): Promise<void> {
    const step = this.acceptTotp(row, code);
    const recorded = await this.deps.twoFactor.recordStep(row.userId, step);
    if (!recorded) throw new TwoFactorCodeInvalidError(row.userId, 'the code was already used');
  }

  private async useRecoveryCode(row: UserTwoFactorPo, code: string): Promise<void> {
    const codeIndex = recoveryCodeIndexOf(this.deps.cipher, code);
    const stored = await this.deps.recoveryCodes.findOf(row.userId, codeIndex);
    toTwoFactorBo(row.userId, row).acceptRecovery(stored);
    const used = await this.deps.recoveryCodes.use(row.userId, codeIndex, this.deps.clock.now());
    if (!used) {
      throw new TwoFactorCodeInvalidError(row.userId, 'the recovery code was already used');
    }
  }
}
