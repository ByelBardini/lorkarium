import type { AccountRecoveryCheckResponseDto, AccountRecoveryKindDto } from '@lorkarium/contracts';
import { isUniqueViolation } from '../../lib/postgres-error';
import { toSealedEmail } from '../auth/auth.mapper';
import type { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { PasswordHasherPort } from '../auth/password-hasher.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { SessionTokenPort } from '../auth/session-token.port';
import type { TwoFactorChallengesDao } from '../auth/two-factor-challenges.dao';
import type { UsersDao } from '../auth/users.dao';
import { recoveryExpiry } from './account-recovery.bo';
import type { AccountRecoveryTokensDao } from './account-recovery-tokens.dao';
import type { AccountRecoveryTokenPo } from './account-recovery-tokens.po';
import { toAccountRecoveryBo } from './account-security.mapper';
import { EmailTakenError, RecoveryTokenInvalidError } from './account-security.error';
import { maskEmail } from './email-change.bo';
import type { EmailChangeRequestsDao } from './email-change-requests.dao';

/** The DAOs a recovery transaction hands out, bound to the open `tx`. */
export type RecoveryWriteDaos = Readonly<{
  tokens: Pick<AccountRecoveryTokensDao, 'deleteById' | 'deleteAllOf'>;
  users: Pick<UsersDao, 'findByEmailIndex' | 'updateEmail' | 'updatePassword'>;
  emailChanges: Pick<EmailChangeRequestsDao, 'deleteOfUser'>;
  sessions: Pick<AuthSessionsDao, 'deleteAllOf'>;
  challenges: Pick<TwoFactorChallengesDao, 'deleteAllOf'>;
}>;

export type RecoveryTransactionRunner = <T>(
  work: (daos: RecoveryWriteDaos) => Promise<T>,
) => Promise<T>;

export type AccountRecoveryDeps = Readonly<{
  tokens: Pick<AccountRecoveryTokensDao, 'insert' | 'findById'>;
  emailChanges: Pick<EmailChangeRequestsDao, 'findOfUser'>;
  transaction: RecoveryTransactionRunner;
  linkTokens: SessionTokenPort;
  hasher: PasswordHasherPort;
  cipher: DataCipherPort;
  clock: ClockPort;
  sessionEnded: SessionEndedPort;
  /** Base of the recovery link, without a trailing slash (`APP_PUBLIC_URL`). */
  appPublicUrl: string;
}>;

/** "Não fui eu": the links of the security notices. Using one undoes what happened (the pending
 *  e-mail change, the finished one or the password), sets a new password and signs every device
 *  out, all in one transaction; every other link of the account dies with it. 2FA is untouched.
 *
 *  Example: `const link = await recovery.issue(userId, 'revert-password-change')` */
export class AccountRecoveryService {
  constructor(private readonly deps: AccountRecoveryDeps) {}

  /** A 7-day link; a revert keeps `previousEmail`, sealed, to bring it back. */
  async issue(
    userId: string,
    kind: AccountRecoveryKindDto,
    previousEmail?: string,
  ): Promise<string> {
    const token = this.deps.linkTokens.generate();
    const now = this.deps.clock.now();
    await this.deps.tokens.insert({
      id: this.deps.linkTokens.hash(token),
      userId,
      kind,
      ...(previousEmail === undefined
        ? {}
        : toSealedEmail(this.deps.cipher, userId, previousEmail)),
      expiresAt: recoveryExpiry(now),
      createdAt: now,
    });
    return `${this.deps.appPublicUrl}/account/recover#token=${encodeURIComponent(token)}`;
  }

  /** What the link will do, with the address masked; refused when unknown, used or expired. */
  async check(token: string): Promise<AccountRecoveryCheckResponseDto['recovery']> {
    const row = await this.liveTokenOf(token);
    return { kind: row.kind, email: await this.maskedEmailOf(row) };
  }

  async recover(token: string, newPassword: string): Promise<void> {
    const row = await this.liveTokenOf(token);
    // Argon2 takes ~100 ms: outside the transaction, which then holds its locks briefly.
    const passwordHash = await this.deps.hasher.hash(newPassword);
    const ended = await this.deps.transaction((daos) => this.undo(daos, row, passwordHash));
    for (const sessionId of ended) this.deps.sessionEnded.sessionEnded(sessionId);
  }

  private async undo(
    daos: RecoveryWriteDaos,
    row: AccountRecoveryTokenPo,
    passwordHash: string,
  ): Promise<string[]> {
    // The delete is the claim: a concurrent use of the same link finds nothing to delete.
    if (!(await daos.tokens.deleteById(row.id)))
      throw new RecoveryTokenInvalidError('a used token');
    if (toAccountRecoveryBo(row).restoresEmail()) await this.restoreEmail(daos, row);
    await daos.emailChanges.deleteOfUser(row.userId);
    await daos.users.updatePassword(row.userId, passwordHash, this.deps.clock.now());
    const ended = await daos.sessions.deleteAllOf(row.userId);
    await daos.challenges.deleteAllOf(row.userId);
    await daos.tokens.deleteAllOf(row.userId);
    return ended;
  }

  private async restoreEmail(daos: RecoveryWriteDaos, row: AccountRecoveryTokenPo): Promise<void> {
    const sealed = { emailCipher: row.emailCipher ?? '', emailIndex: row.emailIndex ?? '' };
    const owner = await daos.users.findByEmailIndex(sealed.emailIndex);
    if (owner && owner.id !== row.userId) throw new EmailTakenError(this.previousEmailOf(row));
    try {
      await daos.users.updateEmail(row.userId, sealed);
    } catch (error) {
      if (isUniqueViolation(error)) throw new EmailTakenError(this.previousEmailOf(row));
      throw error;
    }
  }

  private async liveTokenOf(token: string): Promise<AccountRecoveryTokenPo> {
    const row = await this.deps.tokens.findById(this.deps.linkTokens.hash(token));
    if (!row) throw new RecoveryTokenInvalidError('an unknown token');
    toAccountRecoveryBo(row).requireUsable(this.deps.clock.now());
    return row;
  }

  private async maskedEmailOf(row: AccountRecoveryTokenPo): Promise<string | null> {
    if (row.kind === 'revert-email-change') return maskEmail(this.previousEmailOf(row));
    if (row.kind === 'revert-password-change') return null;
    const pending = await this.deps.emailChanges.findOfUser(row.userId);
    if (!pending) return null;
    return maskEmail(this.deps.cipher.open('pending-email', pending.emailCipher, row.userId));
  }

  private previousEmailOf(row: AccountRecoveryTokenPo): string {
    return this.deps.cipher.open('user-email', row.emailCipher ?? '', row.userId);
  }
}
