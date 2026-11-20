import type {
  AdminDirectoryResponseDto,
  AdminInvitationDto,
  AdminUserDto,
  UserDeletionCheckDto,
} from '@lorkarium/contracts';
import type { InvitationsDao } from '../account-links/invitations.dao';
import type { PasswordResetsDao } from '../account-links/password-resets.dao';
import { accessRestoredMail, promotedToAdminMail } from '../account-security/admin-mail.mapper';
import { recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import type { StorageDeletionsDao } from '../assets/storage-deletions.dao';
import type { AuthSessionsDao } from '../auth/auth-sessions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { FeedbackAttachmentsDao } from '../feedback/feedback-attachments.dao';
import type { SessionEndedPort } from '../auth/session-ended.port';
import type { UserPo } from '../auth/users.po';
import type { CampaignChangedPort } from '../campaigns/campaign-changed.port';
import type { CampaignMembersDao, RevokedAdminSeat } from '../campaigns/campaign-members.dao';
import type { ProfileChangedPort } from '../profiles/profile-changed.port';
import { avatarKeyOf, bannerKeyOf, diceTextureKeyOf } from '../profiles/profiles.mapper';
import type { OwnerLimitsPort } from './owner-limits.port';
import type { RevokedSeatsPort } from './revoked-seats.port';
import { deletionVerdict, requireOtherAccount } from './user-admin.bo';
import type { AccountSanctionsDao } from '../sanctions/account-sanctions.dao';
import type { BannedEmailIndexesDao } from '../sanctions/banned-email-indexes.dao';
import type { AccountListingRow, UserAdminDao } from './user-admin.dao';
import { OwnsSharedCampaignsError, UserNotFoundError } from './user-admin.error';
import { toAdminUserDto, toDeletionCheckDto } from './user-admin.mapper';

/** The DAOs a backoffice transaction hands out, bound to the open `tx`. */
export type UserAdminWriteDaos = Readonly<{
  accounts: Pick<
    UserAdminDao,
    | 'findAccount'
    | 'setRole'
    | 'setPlan'
    | 'setSuspendedAt'
    | 'lockOwnedCampaigns'
    | 'storageKeysOfOwnedCampaigns'
    | 'delete'
  >;
  sessions: Pick<AuthSessionsDao, 'deleteAllOf'>;
  passwordResets: Pick<PasswordResetsDao, 'deleteOfUser'>;
  invitations: Pick<InvitationsDao, 'deleteAdminRoleIssuedBy'>;
  adminSeats: Pick<CampaignMembersDao, 'revokeAdminSeatsOf'>;
  /** The objects of a deleted account (its images and its tables' files) wait here, on the same `tx`. */
  deletions: Pick<StorageDeletionsDao, 'enqueue'>;
  /** A deletion for a violation keeps the e-mail's blind index, on the same `tx`. */
  bannedEmails: Pick<BannedEmailIndexesDao, 'ban'>;
  /** The screenshots the account sent with a bug report or a suggestion (they go by cascade). */
  feedbackShots: Pick<FeedbackAttachmentsDao, 'storageKeysOfUploader'>;
  /** "Reativar acesso" also lifts a ban's pending deletion. */
  scheduledBans: Pick<AccountSanctionsDao, 'cancelDeletionsOf'>;
}>;

/** A deletion that is a measure (a ban): the e-mail's index is kept so it is not invited again. */
export type AccountBan = Readonly<{ bannedAt: Date }>;

/** How an account goes: `ban` keeps the e-mail's index; `includeSharedCampaigns` lets the deletion
 *  take the tables the account owns with other members (agreed with the person first). */
export type AccountDeletionOptions = Readonly<{
  ban: AccountBan | null;
  includeSharedCampaigns: boolean;
}>;

const PLAIN_DELETION: AccountDeletionOptions = { ban: null, includeSharedCampaigns: false };

type DeletionOutcome = Readonly<{ ended: string[]; sharedCampaignIds: string[] }>;

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
  /** Forgets the memberships of a deleted account and of the tables that went with it. */
  memberships: Readonly<{ forgetUser(userId: string): void; forgetCampaign(id: string): void }>;
  /** The live session: the members of a shared table that went with its owner leave it. */
  tables: Pick<CampaignChangedPort, 'campaignDeleted'>;
  /** The tables hear about the seats an account lost with the admin role, after the commit. */
  juggernauts: RevokedSeatsPort;
  /** Every live table of the account hears its new seals (`session:memberUpdated`). */
  profiles: ProfileChangedPort;
  /** Every live table the account owns hears its new limits (`session:campaignUpdated`). */
  ownedTables: OwnerLimitsPort;
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
    const { before, after, revoked } = await this.deps.transaction(async (daos) => {
      const found = await this.requireAccount(daos.accounts, userId);
      await daos.accounts.setRole(userId, role);
      const revoked = role === 'admin' ? [] : await this.revokeAdminAuthority(daos, userId);
      return { before: found, after: { ...found, role }, revoked };
    });
    if (before.role !== 'admin' && role === 'admin') await this.tellPromoted(after);
    if (revoked.length > 0) await this.deps.juggernauts.announceRevoked(userId, revoked);
    if (before.role !== role) await this.tellSealAndLimits(userId);
    return toAdminUserDto(after, this.deps.cipher);
  }

  /** Sets the master plan; the admin may change their own (it gives no power: the admin has no
   *  plan limit). After the commit the live tables hear the seal and, those it owns, the limits.
   *
   *  Example: `await userAdmin.changePlan(biaId, 'lenda')` */
  async changePlan(userId: string, plan: UserPo['plan']): Promise<AdminUserDto> {
    const { before, after } = await this.deps.transaction(async ({ accounts }) => {
      const found = await this.requireAccount(accounts, userId);
      await accounts.setPlan(userId, plan);
      return { before: found, after: { ...found, plan } };
    });
    if (before.plan !== plan) await this.tellSealAndLimits(userId);
    return toAdminUserDto(after, this.deps.cipher);
  }

  // The role and the plan both pick the seal and the limits (an admin has no plan limit).
  private async tellSealAndLimits(userId: string): Promise<void> {
    await this.deps.profiles.profileChanged(userId);
    await this.deps.ownedTables.ownerLimitsChanged(userId);
  }

  // In the role's transaction: nothing the admin role gave can outlive a committed demotion.
  private async revokeAdminAuthority(
    daos: UserAdminWriteDaos,
    userId: string,
  ): Promise<RevokedAdminSeat[]> {
    await daos.invitations.deleteAdminRoleIssuedBy(userId);
    return daos.adminSeats.revokeAdminSeatsOf(userId);
  }

  // Suspending is a measure with a rule and reasons: the sanctions module does it.

  /** Lifts a suspension early (and its end, and a ban's pending deletion). Idempotent: an active
   *  account stays as it is. */
  async reactivate(actor: AdminActor, userId: string): Promise<AdminUserDto> {
    requireOtherAccount(actor.id, userId, 'reactivate');
    const outcome = await this.deps.transaction(async ({ accounts, scheduledBans }) => {
      const found = await this.requireAccount(accounts, userId);
      if (found.suspendedAt === null) return { row: found, changed: false };
      await accounts.setSuspendedAt(userId, null);
      await scheduledBans.cancelDeletionsOf(userId);
      return { row: { ...found, suspendedAt: null, suspendedUntil: null }, changed: true };
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

  /** An admin deletes another account (`options`: see `AccountDeletionOptions`). */
  async delete(
    actor: AdminActor,
    userId: string,
    options: AccountDeletionOptions = PLAIN_DELETION,
  ): Promise<void> {
    requireOtherAccount(actor.id, userId, 'delete');
    await this.executeDeletion(userId, options);
  }

  /** The deletion itself, with no admin at the keyboard: the hourly sweep runs a due ban through
   *  it. A ban keeps the e-mail's index in the same transaction; the shared tables that go along
   *  are told to their members after the commit.
   *
   *  Example: `await userAdmin.executeDeletion(caioId, { ban: { bannedAt: now }, includeSharedCampaigns: false })` */
  async executeDeletion(userId: string, options: AccountDeletionOptions): Promise<void> {
    const outcome = await this.deps.transaction((daos) => this.deleteIn(daos, userId, options));
    for (const sessionId of outcome.ended) this.deps.sessionEnded.sessionEnded(sessionId);
    this.deps.memberships.forgetUser(userId);
    for (const campaignId of outcome.sharedCampaignIds) {
      this.deps.memberships.forgetCampaign(campaignId);
      await this.deps.tables.campaignDeleted(campaignId);
    }
  }

  private async deleteIn(
    daos: UserAdminWriteDaos,
    userId: string,
    options: AccountDeletionOptions,
  ): Promise<DeletionOutcome> {
    const found = await this.requireAccount(daos.accounts, userId);
    const owned = await daos.accounts.lockOwnedCampaigns(userId);
    const verdict = deletionVerdict(owned);
    if (verdict.kind === 'blocked' && !options.includeSharedCampaigns)
      throw new OwnsSharedCampaignsError(userId, verdict.blockingCampaigns);
    if (options.ban) await daos.bannedEmails.ban(found.emailIndex, options.ban.bannedAt);
    // Read under the lock, before the cascade takes the rows: an upload in flight finished first.
    const tableKeys = await daos.accounts.storageKeysOfOwnedCampaigns(userId);
    const shotKeys = await daos.feedbackShots.storageKeysOfUploader(userId);
    await daos.deletions.enqueue([...tableKeys, ...accountImageKeysOf(found), ...shotKeys]);
    const ended = await daos.sessions.deleteAllOf(userId);
    // Before the row goes: its foreign key would null who issued them.
    await daos.invitations.deleteAdminRoleIssuedBy(userId);
    await daos.accounts.delete(userId);
    const shared = owned.filter((campaign) => campaign.otherMembers > 0);
    return { ended, sharedCampaignIds: shared.map((campaign) => campaign.id) };
  }

  private async requireAccount(
    accounts: Pick<UserAdminDao, 'findAccount'>,
    userId: string,
  ): Promise<AccountListingRow> {
    const found = await accounts.findAccount(userId);
    if (!found) throw new UserNotFoundError(userId);
    return found;
  }

  private async tellAccount(row: UserPo, mail: typeof accessRestoredMail): Promise<void> {
    const person = recipientOf(row, this.deps.cipher);
    await this.deps.notices.send(mail({ person, publicUrl: this.deps.appPublicUrl }));
  }

  private async tellPromoted(row: UserPo): Promise<void> {
    const person = recipientOf(row, this.deps.cipher);
    const publicUrl = this.deps.appPublicUrl;
    await this.deps.notices.send(promotedToAdminMail({ person, publicUrl }));
  }
}

// The photo, the dice texture and the banner of the account, each only when it has one.
function accountImageKeysOf(row: UserPo): string[] {
  const keys: string[] = [];
  if (row.avatarId) keys.push(avatarKeyOf(row.avatarId));
  if (row.diceTextureId) keys.push(diceTextureKeyOf(row.diceTextureId));
  if (row.bannerId) keys.push(bannerKeyOf(row.bannerId));
  return keys;
}
