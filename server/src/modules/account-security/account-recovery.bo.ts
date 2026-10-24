import { RecoveryTokenInvalidError } from './account-security.error';

// Long enough to notice a notice after a weekend; the market uses 1 to 7 days for revert links.
export const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** When a recovery link issued at `now` stops working.
 *
 *  Example: `recoveryExpiry(new Date('2026-10-24T00:00:00Z')) // 2026-10-31T00:00:00Z` */
export function recoveryExpiry(now: Date): Date {
  return new Date(now.getTime() + RECOVERY_TTL_MS);
}

export type RecoveryKind = 'cancel-email-change' | 'revert-email-change' | 'revert-password-change';

export type RecoveryFacts = Readonly<{
  id: string;
  kind: RecoveryKind;
  hasEmail: boolean;
  expiresAt: Date;
}>;

/** One recovery link: whether it still works and whether it brings an address back.
 *
 *  Example: `new AccountRecoveryBo(facts).requireUsable(clock.now())` */
export class AccountRecoveryBo {
  constructor(private readonly facts: RecoveryFacts) {
    if (facts.kind === 'revert-email-change' && !facts.hasEmail) {
      throw new Error(
        `recovery token ${facts.id} is revert-email-change without the address to restore; expected the sealed old e-mail`,
      );
    }
  }

  get kind(): RecoveryKind {
    return this.facts.kind;
  }

  requireUsable(now: Date): void {
    if (now.getTime() < this.facts.expiresAt.getTime()) return;
    throw new RecoveryTokenInvalidError(
      `a token that expired at ${this.facts.expiresAt.toISOString()} (now ${now.toISOString()})`,
    );
  }

  restoresEmail(): boolean {
    return this.facts.kind === 'revert-email-change';
  }
}
