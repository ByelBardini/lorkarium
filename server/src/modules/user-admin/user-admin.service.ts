import type {
  AdminDirectoryResponseDto,
  AdminInvitationDto,
  AdminUserDto,
  UserDeletionCheckDto,
} from '@lorkarium/contracts';
import type { PasswordResetsDao } from '../account-links/password-resets.dao';
import {
  accessRestoredMail,
  accessSuspendedMail,
  promotedToAdminMail,
} from '../account-security/admin-mail.mapper';
import { recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import type { AssetStoragePort } from '../assets/asset-storage.port';
import type { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { UserPo } from '../auth/users.po';
import { avatarKeyOf, diceTextureKeyOf } from '../profiles/profiles.mapper';
import { deletionVerdict, requireOtherAccount } from './user-admin.bo';
import type { AccountListingRow, UserAdminDao } from './user-admin.dao';
import { OwnsSharedCampaignsError, UserNotFoundError } from './user-admin.error';
import { toAdminUserDto, toDeletionCheckDto } from './user-admin.mapper';

/** The DAOs a backoffice transaction hands out, bound to the open `tx`. */
export type UserAdminWriteDaos = Readonly<{
  accounts: Pick<
    UserAdminDao,
    'findAccount' | 'setRole' | 'setSuspendedAt' | 'lockOwnedCampaigns' | 'delete'
  >;
  sessions: Pick<AuthSessionsDao, 'deleteAllOf'>;
  passwordResets: Pick<PasswordResetsDao, 'deleteOfUser'>;
}>;

export type UserAdminTransactionRunner = <T>(
  work: (daos: UserAdminWriteDaos) => Promise<T>,
) => Promise<T>;

/** Who acts: the admin of the session (never the payload). */
export type AdminActor = Readonly<{ id: string; name: string }>;

export type UserAdminDeps = Readonly<{
  accounts: Pick<UserAdminDao, 'listAccounts' | 'findAccount' | 'lockOwnedCampaigns'>;
  invitations: Readonly<{ listPending(): Promise<AdminInvitationDto[]> }>;
  transaction: UserAdminTransactionRunner;
  sessionEnded: SessionEndedPort;
  /** Forgets every membership of a deleted account (`CachedMemberships.forgetUser`). */
  memberships: Readonly<{ forgetUser(userId: string): void }>;
  storage: Pick<AssetStoragePort, 'remove'>;
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  clock: ClockPort;
  appPublicUrl: string;
}>;

/** The backoffice over the accounts: list, role, suspend and reactivate, and delete. Every
 *  action is on another account; signing out and forgetting happen after the commit.
 *
 *  Example: `await userAdmin.suspend({ id: admin.id, name: admin.name }, targetId)` */
export class UserAdminService {
  constructor(private readonly deps: UserAdminDeps) {}

  async directory(): Promise<AdminDirectoryResponseDto> {
    const [rows, invitations] = await Promise.all([
      this.deps.accounts.listAccounts(),
      this.deps.invitations.listPending(),
    ]);
    return { users: rows.map((row) => toAdminUserDto(row, this.deps.cipher)), invitations };
  }

  async changeRole(actor: AdminActor, userId: string, role: UserPo['role']): Promise<AdminUserDto> {
    requireOtherAccount(actor.id, userId, 'change the role of');
    const { before, after } = await this.deps.transaction(async ({ accounts }) => {
      const found = await this.requireAccount(accounts, userId);
      await accounts.setRole(userId, role);
      return { before: found, after: { ...found, role } };
    });
    if (before.role !== 'admin' && role === 'admin') await this.tellPromoted(after);
    return toAdminUserDto(after, this.deps.cipher);
  }

  /** Idempotent: suspending a suspended account changes nothing and tells nobody. */
  async suspend(actor: AdminActor, userId: string): Promise<AdminUserDto> {
    requireOtherAccount(actor.id, userId, 'suspend');
    const now = this.deps.clock.now();
    const outcome = await this.deps.transaction(async (daos) => {
      const found = await this.requireAccount(daos.accounts, userId);
      if (found.suspendedAt !== null) return { row: found, ended: null };
      await daos.accounts.setSuspendedAt(userId, now);
      const ended = await daos.sessions.deleteAllOf(userId);
      await daos.passwordResets.deleteOfUser(userId);
      return { row: { ...found, suspendedAt: now }, ended };
    });
    if (outcome.ended) {
      for (const sessionId of outcome.ended) this.deps.sessionEnded.sessionEnded(sessionId);
      await this.tellAccount(outcome.row, accessSuspendedMail);
    }
    return toAdminUserDto(outcome.row, this.deps.cipher);
  }

  /** Idempotent: an active account stays as it is. */
  async reactivate(actor: AdminActor, userId: string): Promise<AdminUserDto> {
    requireOtherAccount(actor.id, userId, 'reactivate');
    const outcome = await this.deps.transaction(async ({ accounts }) => {
      const found = await this.requireAccount(accounts, userId);
      if (found.suspendedAt === null) return { row: found, changed: false };
      await accounts.setSuspendedAt(userId, null);
      return { row: { ...found, suspendedAt: null }, changed: true };
    });
    if (outcome.changed) await this.tellAccount(outcome.row, accessRestoredMail);
    return toAdminUserDto(outcome.row, this.deps.cipher);
  }

  /** What deleting would take: the tables that block it, or how many go with it. */
  async deletionCheck(actor: AdminActor, userId: string): Promise<UserDeletionCheckDto> {
    requireOtherAccount(actor.id, userId, 'delete');
    await this.requireAccount(this.deps.accounts, userId);
    const owned = await this.deps.accounts.lockOwnedCampaigns(userId);
    return toDeletionCheckDto(deletionVerdict(owned));
  }

  async delete(actor: AdminActor, userId: string): Promise<void> {
    requireOtherAccount(actor.id, userId, 'delete');
    const { row, ended } = await this.deps.transaction(async (daos) => {
      const found = await this.requireAccount(daos.accounts, userId);
      const verdict = deletionVerdict(await daos.accounts.lockOwnedCampaigns(userId));
      if (verdict.kind === 'blocked')
        throw new OwnsSharedCampaignsError(userId, verdict.blockingCampaigns);
      const sessions = await daos.sessions.deleteAllOf(userId);
      await daos.accounts.delete(userId);
      return { row: found, ended: sessions };
    });
    for (const sessionId of ended) this.deps.sessionEnded.sessionEnded(sessionId);
    this.deps.memberships.forgetUser(userId);
    if (row.avatarId) await this.deps.storage.remove(avatarKeyOf(row.avatarId));
    if (row.diceTextureId) await this.deps.storage.remove(diceTextureKeyOf(row.diceTextureId));
  }

  private async requireAccount(
    accounts: Pick<UserAdminDao, 'findAccount'>,
    userId: string,
  ): Promise<AccountListingRow> {
    const found = await accounts.findAccount(userId);
    if (!found) throw new UserNotFoundError(userId);
    return found;
  }

  private async tellAccount(
    row: UserPo,
    mail: typeof accessSuspendedMail | typeof accessRestoredMail,
  ): Promise<void> {
    const person = recipientOf(row, this.deps.cipher);
    await this.deps.notices.send(mail({ person, publicUrl: this.deps.appPublicUrl }));
  }

  private async tellPromoted(row: UserPo): Promise<void> {
    const person = recipientOf(row, this.deps.cipher);
    const publicUrl = this.deps.appPublicUrl;
    await this.deps.notices.send(promotedToAdminMail({ person, publicUrl }));
  }
}
