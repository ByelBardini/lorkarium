import { isUniqueViolation } from '../../lib/postgres-error';
import type { ChangeEmailRequestDto } from '@lorkarium/contracts';
import { emailIndexOf, toSealedEmail } from '../auth/auth.mapper';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import type { UsersDao } from '../auth/users.dao';
import type { UserPo } from '../auth/users.po';
import { EmailTakenError, EmailTokenInvalidError } from './account-security.error';
import type { CurrentPasswordService } from './current-password.service';
import { EmailChangeBo, maskEmail, PendingEmailBo } from './email-change.bo';
import type { EmailChangeRequestsDao } from './email-change-requests.dao';
import type { EmailChangeRequestPo } from './email-change-requests.po';
import type { MailerPort, MailMessage } from './mailer.port';
import type { AccountRecoveryService } from './account-recovery.service';
import {
  emailChangedMail,
  emailChangeRequestedMail,
  emailConfirmationMail,
  recipientOf,
  type MailOrigin,
  type RecoveryNoticeInput,
} from './security-mail.mapper';
import type { SecurityNoticesService } from './security-notices.service';

export type EmailChangeDeps = Readonly<{
  users: Pick<UsersDao, 'findById' | 'findByEmailIndex' | 'updateEmail'>;
  currentPassword: Pick<CurrentPasswordService, 'require'>;
  requests: Pick<EmailChangeRequestsDao, 'replace' | 'findById' | 'deleteOfUser'>;
  tokens: SessionTokenPort;
  cipher: DataCipherPort;
  clock: ClockPort;
  /** The link must leave (a failure fails the request); the notices are best-effort. */
  mailer: MailerPort;
  notices: Pick<SecurityNoticesService, 'send'>;
  /** Base of the confirmation link, without a trailing slash (`APP_PUBLIC_URL`). */
  appPublicUrl: string;
  /** Issues the "Não fui eu" link of the notices to the old address. */
  recovery: Pick<AccountRecoveryService, 'issue'>;
}>;

/** E-mail change with the current password, a one-time 30-minute link to the new address and a
 *  notice to the old one; the address only changes when the link is used.
 *
 *  Example: `const { pendingEmail } = await emailChange.request(userOf(request).id, input)` */
export class EmailChangeService {
  constructor(private readonly deps: EmailChangeDeps) {}

  /** Stores the request (replacing a previous one), mails the link; returns the new e-mail masked. */
  async request(
    userId: string,
    input: ChangeEmailRequestDto,
    userAgent: string | null,
  ): Promise<string> {
    const row = await this.deps.currentPassword.require(userId, input.currentPassword);
    const now = this.deps.clock.now();
    const currentEmail = this.emailOf(row);
    const expiresAt = new EmailChangeBo({ userId, currentEmail }).requestAt(input.newEmail, now);
    await this.requireFree(input.newEmail);
    const token = this.deps.tokens.generate();
    await this.deps.requests.replace(this.requestRow(userId, input.newEmail, token, expiresAt));
    await this.deps.mailer.send(this.confirmationOf(row, input.newEmail, token));
    const masked = maskEmail(input.newEmail);
    const recoveryLink = await this.deps.recovery.issue(userId, 'cancel-email-change');
    await this.deps.notices.send(
      emailChangeRequestedMail({
        ...this.noticeBase(row, { at: now, userAgent }, recoveryLink),
        maskedNewEmail: masked,
      }),
    );
    return masked;
  }

  async cancel(userId: string): Promise<void> {
    await this.deps.requests.deleteOfUser(userId);
  }

  /** Swaps the account's e-mail for the one of the link's request, then deletes the request. */
  async confirm(token: string, userAgent: string | null): Promise<void> {
    const request = await this.deps.requests.findById(this.deps.tokens.hash(token));
    if (!request) throw new EmailTokenInvalidError('an unknown token');
    const now = this.deps.clock.now();
    new PendingEmailBo(request).requireLiveAt(now);
    const row = await this.deps.users.findById(request.userId);
    if (!row) throw new EmailTokenInvalidError('an unknown token');
    const newEmail = this.deps.cipher.open('pending-email', request.emailCipher, request.userId);
    await this.swapEmail(row.id, newEmail);
    await this.deps.requests.deleteOfUser(row.id);
    const oldEmail = this.emailOf(row);
    const recoveryLink = await this.deps.recovery.issue(row.id, 'revert-email-change', oldEmail);
    await this.deps.notices.send(
      emailChangedMail({
        ...this.noticeBase(row, { at: now, userAgent }, recoveryLink),
        maskedNewEmail: maskEmail(newEmail),
      }),
    );
  }

  // The notices go to the address the row still has: the old one.
  private noticeBase(row: UserPo, origin: MailOrigin, recoveryLink: string): RecoveryNoticeInput {
    const person = recipientOf(row, this.deps.cipher);
    return { person, origin, recoveryLink, publicUrl: this.deps.appPublicUrl };
  }

  private async requireFree(email: string): Promise<void> {
    const owner = await this.deps.users.findByEmailIndex(emailIndexOf(this.deps.cipher, email));
    if (owner) throw new EmailTakenError(email);
  }

  private async swapEmail(userId: string, email: string): Promise<void> {
    try {
      await this.deps.users.updateEmail(userId, toSealedEmail(this.deps.cipher, userId, email));
    } catch (error) {
      // Taken between the request and the click: the unique index answers, not a lookup.
      if (isUniqueViolation(error)) throw new EmailTakenError(email);
      throw error;
    }
  }

  private requestRow(
    userId: string,
    email: string,
    token: string,
    expiresAt: Date,
  ): EmailChangeRequestPo {
    return {
      id: this.deps.tokens.hash(token),
      userId,
      emailCipher: this.deps.cipher.seal('pending-email', email, userId),
      emailIndex: emailIndexOf(this.deps.cipher, email),
      expiresAt,
      createdAt: this.deps.clock.now(),
    };
  }

  private confirmationOf(row: UserPo, newEmail: string, token: string): MailMessage {
    const person = { to: newEmail, name: row.name, username: row.username };
    const publicUrl = this.deps.appPublicUrl;
    return emailConfirmationMail({ person, link: this.linkOf(token), publicUrl });
  }

  // The token rides in the fragment: it never reaches a proxy log nor a Referer.
  private linkOf(token: string): string {
    return `${this.deps.appPublicUrl}/account/email/confirm#token=${encodeURIComponent(token)}`;
  }

  private emailOf(row: UserPo): string {
    return this.deps.cipher.open('user-email', row.emailCipher, row.id);
  }
}
