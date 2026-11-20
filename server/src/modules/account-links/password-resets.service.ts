import type {
  PasswordResetInspectResponseDto,
  PasswordResetLinkResponseDto,
  PasswordResetRequestDto,
} from '@lorkarium/contracts';
import type { AccountRecoveryService } from '../account-security/account-recovery.service';
import { passwordLinkMail } from '../account-security/admin-mail.mapper';
import type { EmailChangeRequestsDao } from '../account-security/email-change-requests.dao';
import { passwordChangedMail, recipientOf } from '../account-security/security-mail.mapper';
import type { MailMessage } from '../account-security/mailer.port';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import { emailIndexOf, toUserAccessBo } from '../auth/auth.mapper';
import type { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import type { TwoFactorChallengesDao } from '../auth/two-factor-challenges.dao';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { PASSWORD_RESET_TTL_MS, requireOtherAccount } from './account-link.bo';
import { AccountLinkInvalidError, LinkUserNotFoundError } from './account-links.error';
import { toAccountLinkBo } from './account-links.mapper';
import { PasswordLinksService } from './password-links.service';
import type { PasswordResetsDao } from './password-resets.dao';
import type { PasswordResetPo } from './password-resets.po';
import type { HumanCheckPort } from './human-check.port';
import { mayMailPasswordLink } from './sign-up.bo';
import { foundAccountFacts, requireHuman } from './sign-up.service';

/** The DAOs the completion transaction hands out, bound to the open `tx`. */
export type ResetCompletionDaos = Readonly<{
  resets: Pick<PasswordResetsDao, 'delete'>;
  users: Pick<UsersDao, 'updatePassword'>;
  sessions: Pick<AuthSessionsDao, 'deleteAllOf'>;
  emailChanges: Pick<EmailChangeRequestsDao, 'deleteOfUser'>;
  challenges: Pick<TwoFactorChallengesDao, 'deleteAllOf'>;
}>;

export type ResetTransactionRunner = <T>(
  work: (daos: ResetCompletionDaos) => Promise<T>,
) => Promise<T>;

export type PasswordResetsDeps = Readonly<{
  resets: Pick<PasswordResetsDao, 'replace' | 'findByTokenHash' | 'findOfUser'>;
  users: Pick<UsersDao, 'findById' | 'findByEmailIndex' | 'findByUsername'>;
  /** The anti-bot check of "Esqueci minha senha" (always on, even with the sign-up closed). */
  humanCheck: HumanCheckPort;
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

/** The new-password link an admin sends or the person asks for: one hour, one per account; using
 *  it sets the password, signs every device out and tells the account. The current password works
 *  until then; 2FA stays.
 *
 *  Example: `const { link } = await passwordResets.issue(admin.id, userId)` */
export class PasswordResetsService {
  private readonly links: PasswordLinksService;

  constructor(private readonly deps: PasswordResetsDeps) {
    this.links = new PasswordLinksService(deps);
  }

  async issue(actorId: string, userId: string): Promise<PasswordResetLinkResponseDto> {
    requireOtherAccount(actorId, userId);
    const user = await this.deps.users.findById(userId);
    if (!user) throw new LinkUserNotFoundError(userId);
    toUserAccessBo(user).requireActive(this.deps.clock.now());
    const { link, expiresAt } = await this.links.issue(userId);
    await this.deps.notices.send(this.linkMail(user, link, 'admin'));
    return { link, expiresAt: expiresAt.toISOString() };
  }

  /** "Esqueci minha senha": the caller answers the same whether or not an account matched; the
   *  e-mail leaves after the reply (not awaited), so the time tells nothing either. */
  async request(input: PasswordResetRequestDto, remoteIp: string): Promise<void> {
    await requireHuman(this.deps.humanCheck, input.humanCheckToken, remoteIp);
    const user = await this.accountOf(input.identifier);
    if (!user) return;
    const now = this.deps.clock.now();
    if (!mayMailPasswordLink(await foundAccountFacts(this.deps.resets, user, now), now)) return;
    const { link } = await this.links.issue(user.id);
    void this.deps.notices.send(this.linkMail(user, link, 'self'));
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
      await daos.emailChanges.deleteOfUser(user.id);
      await daos.challenges.deleteAllOf(user.id);
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

  // The login's rule: an identifier with an @ inside is an e-mail, otherwise it is the @.
  private async accountOf(identifier: string): Promise<UserPo | undefined> {
    if (!identifier.includes('@')) return this.deps.users.findByUsername(identifier);
    return this.deps.users.findByEmailIndex(emailIndexOf(this.deps.cipher, identifier));
  }

  private linkMail(user: UserPo, link: string, requestedBy: 'admin' | 'self'): MailMessage {
    const person = recipientOf(user, this.deps.cipher);
    const validFor = { hours: PASSWORD_RESET_TTL_MS / HOUR_MS };
    const publicUrl = this.deps.appPublicUrl;
    return passwordLinkMail({ person, link, validFor, publicUrl, requestedBy });
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
