import { TwoFactorCodeInvalidError, type TwoFactorRefusal } from './auth.error';

/** Steps accepted around the current one (RFC 6238 §5.2): a phone clock a little off still works. */
export const TOTP_WINDOW_STEPS = 1;

export type TwoFactorState = Readonly<{
  userId: string;
  enabled: boolean;
  /** The last step accepted; a code of this step or an older one is a replay. */
  lastStep: number | null;
}>;

/** What is known of the recovery code typed: its row, or nothing when no code of the user has it. */
export type RecoveryCodeState = Readonly<{ usedAt: Date | null }> | undefined;

/** Accepts a second factor once: an app code inside the window and newer than the last one, or a
 *  recovery code never used.
 *
 *  Example: `const step = new TwoFactorBo(state).acceptTotp(totp.stepOf(…), totp.currentStep(now))` */
export class TwoFactorBo {
  constructor(private readonly state: TwoFactorState) {}

  requireEnabled(): void {
    if (!this.state.enabled) return this.refuse('two-factor is not enabled');
  }

  /** The step to record as the last one; refuses a code that matched no step, one outside the
   *  window and a replay. */
  acceptTotp(matchedStep: number | null, currentStep: number): number {
    if (matchedStep === null) return this.refuse('no code matches the secret');
    if (Math.abs(matchedStep - currentStep) > TOTP_WINDOW_STEPS) {
      return this.refuse('the code is outside the accepted window');
    }
    const { lastStep } = this.state;
    if (lastStep !== null && matchedStep <= lastStep)
      return this.refuse('the code was already used');
    return matchedStep;
  }

  acceptRecovery(code: RecoveryCodeState): void {
    if (code === undefined) return this.refuse('the recovery code is unknown');
    if (code.usedAt !== null) return this.refuse('the recovery code was already used');
  }

  private refuse(refusal: TwoFactorRefusal): never {
    throw new TwoFactorCodeInvalidError(this.state.userId, refusal);
  }
}
