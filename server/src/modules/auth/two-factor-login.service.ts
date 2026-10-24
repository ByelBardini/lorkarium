import { TwoFactorChallengeExpiredError, TwoFactorCodeInvalidError } from './auth.error';
import { toTwoFactorChallengeBo, type SecondFactor } from './auth.mapper';
import type { AuthService, IssuedSession } from './auth.service';
import type { ClockPort } from './clock.port';
import type { SessionTokenPort } from './session-token.port';
import { TwoFactorChallengeBo } from './two-factor-challenge.bo';
import type { TwoFactorChallengesDao } from './two-factor-challenges.dao';
import type { TwoFactorChallengePo } from './two-factor-challenges.po';
import type { TwoFactorCheckService } from './two-factor-check.service';
import type { UsersDao } from './users.dao';

export type TwoFactorLoginDeps = Readonly<{
  challenges: Pick<TwoFactorChallengesDao, 'findById' | 'recordFailure' | 'delete'>;
  users: Pick<UsersDao, 'findById'>;
  check: Pick<TwoFactorCheckService, 'verify'>;
  sessions: Pick<AuthService, 'startSession'>;
  tokens: SessionTokenPort;
  clock: ClockPort;
}>;

/** The second step of a login: the code (or a recovery code) for the challenge of the `lk_2fa`
 *  cookie becomes a session; the 5th wrong code deletes the challenge.
 *
 *  Example: `await twoFactorLogin.complete(request.cookies.lk_2fa, toSecondFactor('123456'))` */
export class TwoFactorLoginService {
  constructor(private readonly deps: TwoFactorLoginDeps) {}

  async complete(
    challengeToken: string | undefined,
    factor: SecondFactor,
    userAgent?: string,
  ): Promise<IssuedSession> {
    const challenge = await this.liveChallenge(challengeToken);
    await this.verifyCountingFailures(challenge, factor);
    await this.deps.challenges.delete(challenge.id);
    const user = await this.deps.users.findById(challenge.userId);
    if (!user) throw new TwoFactorChallengeExpiredError('an unknown challenge');
    return this.deps.sessions.startSession(user, challenge.persistent, userAgent);
  }

  private async liveChallenge(token: string | undefined): Promise<TwoFactorChallengePo> {
    if (!token) throw new TwoFactorChallengeExpiredError('no challenge cookie');
    const challenge = await this.deps.challenges.findById(this.deps.tokens.hash(token));
    if (!challenge) throw new TwoFactorChallengeExpiredError('an unknown challenge');
    if (!toTwoFactorChallengeBo(challenge).isExpiredAt(this.deps.clock.now())) return challenge;
    await this.deps.challenges.delete(challenge.id);
    throw new TwoFactorChallengeExpiredError('an expired challenge');
  }

  private async verifyCountingFailures(
    challenge: TwoFactorChallengePo,
    factor: SecondFactor,
  ): Promise<void> {
    try {
      await this.deps.check.verify(challenge.userId, factor);
    } catch (error) {
      if (!(error instanceof TwoFactorCodeInvalidError)) throw error;
      const failures = await this.deps.challenges.recordFailure(challenge.id);
      const exhausted = TwoFactorChallengeBo.isExhausted(failures);
      if (exhausted) await this.deps.challenges.delete(challenge.id);
      throw error;
    }
  }
}
