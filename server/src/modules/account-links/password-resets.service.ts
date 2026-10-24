import type {
  PasswordResetInspectResponseDto,
  PasswordResetLinkResponseDto,
} from '@lorkarium/contracts';
import type { AccountRecoveryService } from '../account-security/account-recovery.service';
import { passwordLinkMail } from '../account-security/admin-mail.mapper';
import { passwordChangedMail, recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import { toUserAccessBo } from '../auth/auth.mapper';
import type { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { linkExpiry, PASSWORD_RESET_TTL_MS, requireOtherAccount } from './account-link.bo';
import { AccountLinkInvalidError, LinkUserNotFoundError } from './account-links.error';
import { linkOf, toAccountLinkBo } from './account-links.mapper';
import type { PasswordResetsDao } from './password-resets.dao';
import type { PasswordResetPo } from './password-resets.po';

/** The DAOs the completion transaction hands out, bound to the open `tx`. */
export type ResetCompletionDaos = Readonly<{
  resets: Pick<PasswordResetsDao, 'delete'>;
  users: Pick<UsersDao, 'updatePassword'>;
  sessions: Pick<AuthSessionsDao, 'deleteAllOf'>;
}>;

export type ResetTransactionRunner = <T>(
  work: (daos: ResetCompletionDaos) => Promise<T>,
) => Promise<T>;

export type PasswordResetsDeps = Readonly<{
  resets: Pick<PasswordResetsDao, 'replace' | 'findByTokenHash'>;
  users: Pick<UsersDao, 'findById'>;
  transaction: ResetTransactionRunner;
  linkTokens: SessionTokenPort;
  hasher: PasswordHasherPort;
  cipher: DataCipherPort;
  clock: ClockPort;
  sessionEnded: SessionEndedPort;
  notices: Pick<SecurityNoticesService, 'send'>;
  /** The "Não fui eu" link of the "Sua senha foi trocada" notice. */
  recovery: Pick<AccountRecoveryService, 'issue'>;
  appPublicUrl: string;
}>;

/** The new-password link an admin sends: one hour, one per account; using it sets the password,
 *  signs every device out and tells the account. The current password works until then; 2FA stays.
 *
 *  Example: `const { link } = await passwordResets.issue(admin.id, userId)` */
export class PasswordResetsService {
  constructor(private readonly deps: PasswordResetsDeps) {}

  async issue(actorId: string, userId: string): Promise<PasswordResetLinkResponseDto> {
    requireOtherAccount(actorId, userId);
    const user = await this.deps.users.findById(userId);
    if (!user) throw new LinkUserNotFoundError(userId);
    toUserAccessBo(user).requireActive();
    const token = this.deps.linkTokens.generate();
    const now = this.deps.clock.now();
    const expiresAt = linkExpiry(now, PASSWORD_RESET_TTL_MS);
    const tokenHash = this.deps.linkTokens.hash(token);
    await this.deps.resets.replace({ userId, tokenHash, createdAt: now, expiresAt });
    const link = linkOf(this.deps.appPublicUrl, '/reset-password', token);
    await this.tellLink(user, link);
    return { link, expiresAt: expiresAt.toISOString() };
  }

  async inspect(token: string): Promise<PasswordResetInspectResponseDto> {
    const { user } = await this.liveResetOf(token);
    return { username: user.username };
  }

  async complete(token: string, newPassword: string, userAgent: string | null): Promise<void> {
    const { reset, user } = await this.liveResetOf(token);
    const passwordHash = await this.deps.hasher.hash(newPassword);
    const now = this.deps.clock.now();
    const ended = await this.deps.transaction(async (daos) => {
      if (!(await daos.resets.delete(reset.id))) throw new AccountLinkInvalidError('a used link');
      await daos.users.updatePassword(user.id, passwordHash, now);
      return daos.sessions.deleteAllOf(user.id);
    });
    for (const sessionId of ended) this.deps.sessionEnded.sessionEnded(sessionId);
    await this.tellChanged(user, { at: now, userAgent });
  }

  private async liveResetOf(
    token: string,
  ): Promise<Readonly<{ reset: PasswordResetPo; user: UserPo }>> {
    const reset = await this.deps.resets.findByTokenHash(this.deps.linkTokens.hash(token));
    if (!reset) throw new AccountLinkInvalidError('an unknown new-password token');
    toAccountLinkBo(reset).requireUsableAt(this.deps.clock.now());
    const user = await this.deps.users.findById(reset.userId);
    if (!user) throw new AccountLinkInvalidError('a link of a deleted account');
    return { reset, user };
  }

  private async tellLink(user: UserPo, link: string): Promise<void> {
    const person = recipientOf(user, this.deps.cipher);
    const validFor = { hours: PASSWORD_RESET_TTL_MS / HOUR_MS };
    const publicUrl = this.deps.appPublicUrl;
    await this.deps.notices.send(passwordLinkMail({ person, link, validFor, publicUrl }));
  }

  private async tellChanged(
    user: UserPo,
    origin: Readonly<{ at: Date; userAgent: string | null }>,
  ): Promise<void> {
    const recoveryLink = await this.deps.recovery.issue(user.id, 'revert-password-change');
    const person = recipientOf(user, this.deps.cipher);
    const publicUrl = this.deps.appPublicUrl;
    await this.deps.notices.send(passwordChangedMail({ person, origin, recoveryLink, publicUrl }));
  }
}

const HOUR_MS = 60 * 60 * 1000;
