import { RECOVERY_CODE_ALPHABET } from '@lorkarium/contracts';
import type { AccountRecoveryService } from '../../src/modules/account-security/account-recovery.service';
import type { AccountRecoveryTokensDao } from '../../src/modules/account-security/account-recovery-tokens.dao';
import type {
  AccountRecoveryTokenPo,
  NewAccountRecoveryTokenPo,
} from '../../src/modules/account-security/account-recovery-tokens.po';
import type { EmailChangeRequestsDao } from '../../src/modules/account-security/email-change-requests.dao';
import type {
  EmailChangeRequestPo,
  NewEmailChangeRequestPo,
} from '../../src/modules/account-security/email-change-requests.po';
import type { MailMessage, MailerPort } from '../../src/modules/account-security/mailer.port';
import type { QrCodePort } from '../../src/modules/account-security/qr-code.port';
import type { RecoveryCodePort } from '../../src/modules/account-security/recovery-code.port';

const FAKE_CREATED_AT = new Date('2026-10-01T12:00:00Z');

/** Keeps every e-mail sent, in order; `failWith` makes the next sends throw (a mail server down).
 *  Also handed to `buildApp({ mailer })` by the integration specs to read the links. */
export class MailerFake implements MailerPort {
  readonly sent: MailMessage[] = [];
  failWith: Error | null = null;

  async send(message: MailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }

  /** The messages sent to `to`, in order. */
  to(to: string): MailMessage[] {
    return this.sent.filter((message) => message.to === to);
  }

  /** The token of the last confirmation link sent to `to` (`…#token=<token>`). */
  confirmationTokenFor(to: string): string {
    const link = this.to(to)
      .map((message) => /#token=([^\s"<]+)/.exec(message.text)?.[1])
      .findLast((token) => token !== undefined);
    if (!link) throw new Error(`no confirmation link was sent to ${to}; sent: ${this.describe()}`);
    return decodeURIComponent(link);
  }

  /** The token of the last "Não fui eu" link sent to `to` (`…/account/recover#token=<token>`). */
  recoveryTokenFor(to: string): string {
    return this.lastTokenFor(to, /\/account\/recover#token=([^\s"<]+)/);
  }

  /** The token of the last link sent to `to` whose path matches `pattern` (first group). */
  lastTokenFor(to: string, pattern: RegExp): string {
    const token = this.to(to)
      .map((message) => pattern.exec(message.text)?.[1])
      .findLast((found) => found !== undefined);
    if (!token) throw new Error(`no ${pattern} link was sent to ${to}; sent: ${this.describe()}`);
    return decodeURIComponent(token);
  }

  private describe(): string {
    return JSON.stringify(this.sent.map(({ to, subject }) => ({ to, subject })));
  }
}

/** A "QR" that says what it drew: `data:image/png;base64,qr:<text>`. */
export class QrCodeFake implements QrCodePort {
  async pngDataUrl(text: string): Promise<string> {
    return `data:image/png;base64,qr:${text}`;
  }
}

/** Predictable, distinct recovery codes: `aaa22-bbbbb`, `aaa23-bbbbb`, … (valid for `recoveryCodeDto`). */
export class RecoveryCodeFake implements RecoveryCodePort {
  private drawn = 0;

  generate(): string {
    const alphabet = RECOVERY_CODE_ALPHABET;
    const high = alphabet.charAt(Math.floor(this.drawn / alphabet.length) % alphabet.length);
    const low = alphabet.charAt(this.drawn % alphabet.length);
    this.drawn += 1;
    return `aaa${high}${low}-bbbbb`;
  }
}

/** In-memory email_change_requests table, one row per user. */
export class EmailChangeRequestsDaoFake implements Pick<
  EmailChangeRequestsDao,
  'replace' | 'findById' | 'findOfUser' | 'deleteOfUser'
> {
  rows: EmailChangeRequestPo[] = [];

  async replace(request: NewEmailChangeRequestPo): Promise<void> {
    const kept = this.rows.filter((row) => row.userId !== request.userId);
    this.rows = [...kept, { createdAt: FAKE_CREATED_AT, ...request }];
  }

  async findById(requestId: string): Promise<EmailChangeRequestPo | undefined> {
    return this.rows.find((row) => row.id === requestId);
  }

  async findOfUser(userId: string): Promise<EmailChangeRequestPo | undefined> {
    return this.rows.find((row) => row.userId === userId);
  }

  async deleteOfUser(userId: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.userId !== userId);
  }
}

/** In-memory account_recovery_tokens table keyed by the token hash. */
export class AccountRecoveryTokensDaoFake implements Pick<
  AccountRecoveryTokensDao,
  'insert' | 'findById' | 'deleteById' | 'deleteAllOf'
> {
  readonly rows = new Map<string, AccountRecoveryTokenPo>();

  async insert(token: NewAccountRecoveryTokenPo): Promise<void> {
    this.rows.set(token.id, {
      emailCipher: null,
      emailIndex: null,
      createdAt: FAKE_CREATED_AT,
      ...token,
    });
  }

  async findById(tokenId: string): Promise<AccountRecoveryTokenPo | undefined> {
    return this.rows.get(tokenId);
  }

  async deleteById(tokenId: string): Promise<boolean> {
    return this.rows.delete(tokenId);
  }

  async deleteAllOf(userId: string): Promise<number> {
    const own = [...this.rows.values()].filter((row) => row.userId === userId);
    for (const row of own) this.rows.delete(row.id);
    return own.length;
  }
}

export type IssuedRecovery = Readonly<{ userId: string; kind: string; previousEmail?: string }>;

/** Issues predictable recovery links (`…/account/recover#token=recovery-1`, `-2`…) and keeps what
 *  was asked, for the services that put the link in a notice. */
export class RecoveryIssuerFake implements Pick<AccountRecoveryService, 'issue'> {
  readonly issued: IssuedRecovery[] = [];

  async issue(userId: string, kind: string, previousEmail?: string): Promise<string> {
    this.issued.push({ userId, kind, ...(previousEmail === undefined ? {} : { previousEmail }) });
    return `https://mesa.example.com/account/recover#token=recovery-${this.issued.length}`;
  }
}
