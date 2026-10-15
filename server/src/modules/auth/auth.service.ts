import type { AuthUserDto, LoginRequestDto } from '@lorkarium/contracts';
import { AuthSessionBo } from './auth-session.bo';
import type { AuthSessionsDao } from './auth-sessions.dao';
import type { AuthSessionPo } from './auth-sessions.po';
import { InvalidCredentialsError, UnauthenticatedError } from './auth.error';
import { toAuthSessionBo, toAuthUserDto, toUserAccessBo } from './auth.mapper';
import type { ClockPort } from './clock.port';
import type { PasswordHasherPort } from './password-hasher.port';
import type { SessionTokenPort } from './session-token.port';
import type { UserRole } from './user-access.bo';
import type { UsersDao } from './users.dao';
import type { UserPo } from './users.po';

export type AuthServiceDeps = Readonly<{
  users: Pick<UsersDao, 'findByEmail' | 'findById'>;
  sessions: Pick<AuthSessionsDao, 'insert' | 'findById' | 'updateExpiry' | 'delete'>;
  hasher: PasswordHasherPort;
  tokens: SessionTokenPort;
  clock: ClockPort;
  /** Hash of a random secret, verified when the e-mail is unknown so both refusals cost the same time. */
  decoyHash: string;
}>;

export type IssuedSession = Readonly<{
  user: AuthUserDto;
  token: string;
  expiresAt: Date;
  persistent: boolean;
}>;

export type ResolvedSession = Readonly<{
  user: AuthUserDto;
  expiresAt: Date;
  persistent: boolean;
  renewed: boolean;
}>;

/** Login, session lookup with sliding expiry, and logout.
 *
 *  Example: `const resolved = await authService.resolveSession(request.cookies.lk_session)` */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async login(input: LoginRequestDto): Promise<IssuedSession> {
    const row = await this.deps.users.findByEmail(input.email);
    const matches = await this.deps.hasher.verify(
      row?.passwordHash ?? this.deps.decoyHash,
      input.password,
    );
    if (!row || !matches) throw new InvalidCredentialsError(input.email);
    const token = this.deps.tokens.generate();
    const terms = AuthSessionBo.startedAt(this.deps.clock.now(), input.rememberMe);
    await this.deps.sessions.insert({ id: this.deps.tokens.hash(token), userId: row.id, ...terms });
    return { user: toAuthUserDto(row), token, ...terms };
  }

  async resolveSession(token: string | undefined): Promise<ResolvedSession | null> {
    const resolved = await this.resolveRows(token);
    return resolved && toResolvedSession(resolved);
  }

  /** The session of `token` when its account holds `required`; throws UNAUTHENTICATED or FORBIDDEN_ROLE. */
  async authorize(token: string | undefined, required: UserRole): Promise<ResolvedSession> {
    const resolved = await this.resolveRows(token);
    if (!resolved)
      throw new UnauthenticatedError(token ? 'an unknown or expired session' : 'no session cookie');
    toUserAccessBo(resolved.user).requireRole(required);
    return toResolvedSession(resolved);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.deps.sessions.delete(this.deps.tokens.hash(token));
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
    return { user, session, expiresAt: await this.renewIfDue(session, now) };
  }

  private async renewIfDue(session: AuthSessionPo, now: Date): Promise<Date> {
    const renewal = toAuthSessionBo(session).renewalAt(now);
    if (renewal === null) return session.expiresAt;
    await this.deps.sessions.updateExpiry(session.id, renewal);
    return renewal;
  }
}

type ResolvedRows = Readonly<{ user: UserPo; session: AuthSessionPo; expiresAt: Date }>;

function toResolvedSession({ user, session, expiresAt }: ResolvedRows): ResolvedSession {
  return {
    user: toAuthUserDto(user),
    expiresAt,
    persistent: session.persistent,
    renewed: expiresAt !== session.expiresAt,
  };
}
