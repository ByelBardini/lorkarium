/** How long the second step of a login waits for the code. */
export const TWO_FACTOR_CHALLENGE_MS = 5 * 60 * 1000;

/** Wrong codes a challenge takes; the last one deletes it and the login starts over. */
export const TWO_FACTOR_CHALLENGE_MAX_FAILURES = 5;

export type TwoFactorChallengeState = Readonly<{ expiresAt: Date; failures: number }>;

/** Deadline and attempts of the second step of a login.
 *
 *  Example: `TwoFactorChallengeBo.expiresAfter(clock.now()) // now + 5 min` */
export class TwoFactorChallengeBo {
  constructor(private readonly state: TwoFactorChallengeState) {}

  static expiresAfter(now: Date): Date {
    return new Date(now.getTime() + TWO_FACTOR_CHALLENGE_MS);
  }

  isExpiredAt(now: Date): boolean {
    return now.getTime() >= this.state.expiresAt.getTime();
  }

  /** Whether `failures` (counting the one just made) used up the challenge. */
  static isExhausted(failures: number): boolean {
    return failures >= TWO_FACTOR_CHALLENGE_MAX_FAILURES;
  }
}
