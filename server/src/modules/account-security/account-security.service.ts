import type { AccountSecurityDto, ChangePasswordRequestDto } from '@lorkarium/contracts';
import type { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { RecoveryCodesDao } from '../auth/recovery-codes.dao';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { TwoFactorDao } from '../auth/two-factor.dao';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { toAccountSecurityDto } from './account-security.mapper';
import type { CurrentPasswordService } from './current-password.service';
import { maskEmail, PendingEmailBo } from './email-change.bo';
import type { EmailChangeRequestsDao } from './email-change-requests.dao';
import type { AccountRecoveryService } from './account-recovery.service';
import { passwordChangedMail, recipientOf } from './security-mail.mapper';
import type { SecurityNoticesService } from './security-notices.service';

export type AccountSecurityDeps = Readonly<{
  users: Pick<UsersDao, 'findById' | 'updatePassword'>;
  currentPassword: Pick<CurrentPasswordService, 'require'>;
  hasher: PasswordHasherPort;
  sessions: Pick<AuthSessionsDao, 'deleteOthersOf'>;
  sessionEnded: SessionEndedPort;
  emailChanges: Pick<EmailChangeRequestsDao, 'findOfUser'>;
  twoFactor: Pick<TwoFactorDao, 'findOf'>;
  recoveryCodes: Pick<RecoveryCodesDao, 'countUnused'>;
  cipher: DataCipherPort;
  clock: ClockPort;
  notices: Pick<SecurityNoticesService, 'send'>;
  /** Issues the "Não fui eu" link of the notice. */
  recovery: Pick<AccountRecoveryService, 'issue'>;
  appPublicUrl: string;
}>;

/** The "Conta e segurança" section and the password change.
 *
 *  Example: `await accountSecurity.changePassword(userOf(request).id, sessionIdOf(request), input)` */
export class AccountSecurityService {
  constructor(private readonly deps: AccountSecurityDeps) {}

  async overview(userId: string): Promise<AccountSecurityDto> {
    const row = await this.deps.users.findById(userId);
    if (!row) throw new Error(`user ${userId} passed the auth guard but has no row`);
    const twoFactor = await this.deps.twoFactor.findOf(userId);
    return toAccountSecurityDto({
      email: this.emailOf(row),
      passwordChangedAt: row.passwordChangedAt,
      pendingEmail: await this.pendingEmailOf(userId),
      twoFactorEnabled: (twoFactor?.enabledAt ?? null) !== null,
      recoveryCodesLeft: twoFactor?.enabledAt
        ? await this.deps.recoveryCodes.countUnused(userId)
        : 0,
    });
  }

  /** Checks the current password, stores the new hash and ends every other session (their
   *  connections drop); the current session stays. Then the "if this was not you" notice. */
  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordRequestDto,
    userAgent: string | null,
  ): Promise<void> {
    const row = await this.deps.currentPassword.require(userId, input.currentPassword);
    const now = this.deps.clock.now();
    const passwordHash = await this.deps.hasher.hash(input.newPassword);
    await this.deps.users.updatePassword(userId, passwordHash, now);
    const ended = await this.deps.sessions.deleteOthersOf(userId, currentSessionId);
    for (const sessionId of ended) this.deps.sessionEnded.sessionEnded(sessionId);
    const recoveryLink = await this.deps.recovery.issue(userId, 'revert-password-change');
    const person = recipientOf(row, this.deps.cipher);
    const origin = { at: now, userAgent };
    const publicUrl = this.deps.appPublicUrl;
    await this.deps.notices.send(passwordChangedMail({ person, origin, recoveryLink, publicUrl }));
  }

  private async pendingEmailOf(userId: string): Promise<string | null> {
    const pending = await this.deps.emailChanges.findOfUser(userId);
    if (!pending || new PendingEmailBo(pending).isExpiredAt(this.deps.clock.now())) return null;
    return maskEmail(this.deps.cipher.open('pending-email', pending.emailCipher, userId));
  }

  private emailOf(row: UserPo): string {
    return this.deps.cipher.open('user-email', row.emailCipher, row.id);
  }
}
