import type { AuthUserDto, LoginRequestDto } from '@lorkarium/contracts';
import { AuthSessionBo, lastSeenDue } from './auth-session.bo';
import type { AuthSessionsDao } from './auth-sessions.dao';
import { USER_AGENT_MAX_LENGTH, type AuthSessionPo } from './auth-sessions.po';
import { InvalidCredentialsError, UnauthenticatedError } from './auth.error';
import { emailIndexOf, toAuthSessionBo, toAuthUserDto, toUserAccessBo } from './auth.mapper';
import type { ClockPort } from './clock.port';
import type { DataCipherPort } from './data-cipher.port';
import type { PasswordHasherPort } from './password-hasher.port';
import type { SessionEndedPort } from './session-ended.port';
import type { SessionTokenPort } from './session-token.port';
import { TwoFactorChallengeBo } from './two-factor-challenge.bo';
import type { TwoFactorChallengesDao } from './two-factor-challenges.dao';
import type { TwoFactorCheckService } from './two-factor-check.service';
import type { UserRole } from './user-access.bo';
import type { UsersDao } from './users.dao';
import type { UserPo } from './users.po';

export type AuthServiceDeps = Readonly<{
  users: Pick<UsersDao, 'findByEmailIndex' | 'findById' | 'touchLastSeen'>;
  sessions: Pick<AuthSessionsDao, 'insert' | 'findById' | 'updateExpiry' | 'delete' | 'touch'>;
  /** Whether the account asks for a second factor after the password. */
  twoFactor: Pick<TwoFactorCheckService, 'isEnabled'>;
  challenges: Pick<TwoFactorChallengesDao, 'insert'>;
  hasher: PasswordHasherPort;
  tokens: SessionTokenPort;
  clock: ClockPort;
  /** Opens the e-mail of the row and computes the blind index the login looks it up by. */
  cipher: DataCipherPort;
  /** Hash of a random secret, verified when the e-mail is unknown so both refusals cost the same time. */
  decoyHash: string;
  sessionEnded: SessionEndedPort;
}>;

export type IssuedSession = Readonly<{
  user: AuthUserDto;
  token: string;
  expiresAt: Date;
  persistent: boolean;
}>;

/** The second step of a login: the `lk_2fa` cookie carries `token`, the database only its hash. */
export type IssuedChallenge = Readonly<{ token: string; expiresAt: Date }>;

export type LoginOutcome =
  | (Readonly<{ status: 'signed-in' }> & IssuedSession)
  | Readonly<{ status: 'two-factor-required'; challenge: IssuedChallenge }>;

export type ResolvedSession = Readonly<{
  user: AuthUserDto;
  /** The hash of the cookie token: what identifies the session without carrying the secret. */
  sessionId: string;
  expiresAt: Date;
  /** Until then a reread finds the same session (renewal is not due yet); see `AuthSessionBo`. */
  recheckAt: Date;
  persistent: boolean;
  renewed: boolean;
}>;

/** Login, session lookup with sliding expiry, and logout.
 *
 *  Example: `const resolved = await authService.resolveSession(request.cookies.lk_session)` */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  /** The password step: a session, or a challenge when the account has 2FA on (no session yet).
   *  `userAgent` is kept on the session, cut to USER_AGENT_MAX_LENGTH. */
  async login(input: LoginRequestDto, userAgent?: string): Promise<LoginOutcome> {
    const row = await this.deps.users.findByEmailIndex(emailIndexOf(this.deps.cipher, input.email));
    const matches = await this.deps.hasher.verify(
      row?.passwordHash ?? this.deps.decoyHash,
      input.password,
    );
    if (!row || !matches) throw new InvalidCredentialsError(input.email);
    toUserAccessBo(row).requireActive();
    if (await this.deps.twoFactor.isEnabled(row.id)) {
      return { status: 'two-factor-required', challenge: await this.challenge(row, input) };
    }
    return { status: 'signed-in', ...(await this.startSession(row, input.rememberMe, userAgent)) };
  }

  /** Issues a login session for `row` (after the password, the second factor or an accepted
   *  invitation); refused for a suspended account. */
  async startSession(row: UserPo, persistent: boolean, userAgent?: string): Promise<IssuedSession> {
    toUserAccessBo(row).requireActive();
    const token = this.deps.tokens.generate();
    const now = this.deps.clock.now();
    const terms = AuthSessionBo.startedAt(now, persistent);
    const id = this.deps.tokens.hash(token);
    const agent = userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null;
    const device = { userAgent: agent, lastSeenAt: now };
    await this.deps.sessions.insert({ id, userId: row.id, ...device, ...terms });
    await this.deps.users.touchLastSeen(row.id, now);
    return { user: toAuthUserDto(row, this.deps.cipher), token, ...terms };
  }

  async resolveSession(token: string | undefined): Promise<ResolvedSession | null> {
    const resolved = await this.resolveRows(token);
    return resolved && toResolvedSession(resolved, this.deps.cipher);
  }

  /** The session of `token` when its account holds `required`; throws UNAUTHENTICATED or FORBIDDEN_ROLE. */
  async authorize(token: string | undefined, required: UserRole): Promise<ResolvedSession> {
    const resolved = await this.resolveRows(token);
    if (!resolved)
      throw new UnauthenticatedError(token ? 'an unknown or expired session' : 'no session cookie');
    toUserAccessBo(resolved.user).requireRole(required);
    return toResolvedSession(resolved, this.deps.cipher);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const sessionId = this.deps.tokens.hash(token);
    await this.deps.sessions.delete(sessionId);
    this.deps.sessionEnded.sessionEnded(sessionId);
  }

  private async resolveRows(token: string | undefined): Promise<ResolvedRows | null> {
    if (!token) return null;
    const session = await this.deps.sessions.findById(this.deps.tokens.hash(token));
    if (!session) return null;
    const now = this.deps.clock.now();
    if (toAuthSessionBo(session).isExpiredAt(now)) {
      await this.deps.sessions.delete(session.id);
      return null;
    }
    const user = await this.deps.users.findById(session.userId);
    if (!user) return null;
    // Defense in depth: the suspension already deleted the sessions, a race may leave one.
    if (user.suspendedAt !== null) {
      await this.deps.sessions.delete(session.id);
      return null;
    }
    await this.touchIfDue(session, now);
    return { user, session, expiresAt: await this.renewIfDue(session, now) };
  }

  private async challenge(row: UserPo, input: LoginRequestDto): Promise<IssuedChallenge> {
    const token = this.deps.tokens.generate();
    const expiresAt = TwoFactorChallengeBo.expiresAfter(this.deps.clock.now());
    const id = this.deps.tokens.hash(token);
    await this.deps.challenges.insert({
      id,
      userId: row.id,
      persistent: input.rememberMe,
      expiresAt,
    });
    return { token, expiresAt };
  }

  // In steps (LAST_SEEN_STEP_MS): one write per request would cost every route a query.
  private async touchIfDue(session: AuthSessionPo, now: Date): Promise<void> {
    if (!lastSeenDue(session.lastSeenAt, now)) return;
    await this.deps.sessions.touch(session.id, now);
    await this.deps.users.touchLastSeen(session.userId, now);
  }

  private async renewIfDue(session: AuthSessionPo, now: Date): Promise<Date> {
    const renewal = toAuthSessionBo(session).renewalAt(now);
    if (renewal === null) return session.expiresAt;
    await this.deps.sessions.updateExpiry(session.id, renewal);
    return renewal;
  }
}

type ResolvedRows = Readonly<{ user: UserPo; session: AuthSessionPo; expiresAt: Date }>;

function toResolvedSession(
  { user, session, expiresAt }: ResolvedRows,
  cipher: DataCipherPort,
): ResolvedSession {
  return {
    user: toAuthUserDto(user, cipher),
    sessionId: session.id,
    expiresAt,
    recheckAt: toAuthSessionBo({ ...session, expiresAt }).recheckAt(),
    persistent: session.persistent,
    renewed: expiresAt !== session.expiresAt,
  };
}
