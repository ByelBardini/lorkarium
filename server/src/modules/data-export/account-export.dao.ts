import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { authSessions, type AuthSessionPo } from '../auth/auth-sessions.po';
import { userTwoFactor } from '../auth/two-factor.po';
import { users, type UserPo } from '../auth/users.po';
import { badges, userBadges } from '../badges/badges.po';
import { customEmojis, type CustomEmojiPo } from '../custom-emojis/custom-emoji.po';
import { friendRequests } from '../friends/friend-requests.po';
import { friendships } from '../friends/friendships.po';
import { userBlocks } from '../friends/user-blocks.po';
import { reputationVotes, type ReputationVotePo } from '../reputation/reputation-votes.po';
import { accountSavedColors, type SavedColorPo } from '../saved-colors/saved-colors.po';

/** The columns of the account the export shows. Picked one by one, never "all but": a column
 *  added later (a secret, say) stays out until someone decides it belongs in the export. */
const EXPORTED_ACCOUNT_COLUMNS = {
  id: users.id,
  username: users.username,
  name: users.name,
  emailCipher: users.emailCipher,
  role: users.role,
  plan: users.plan,
  paidPlan: users.paidPlan,
  paidPlanUntil: users.paidPlanUntil,
  color: users.color,
  bio: users.bio,
  avatarId: users.avatarId,
  bannerId: users.bannerId,
  diceTextureId: users.diceTextureId,
  diceNumberColor: users.diceNumberColor,
  gameSystems: users.gameSystems,
  playSchedule: users.playSchedule,
  contact: users.contact,
  rollsCount: users.rollsCount,
  natural20Count: users.natural20Count,
  passwordChangedAt: users.passwordChangedAt,
  suspendedAt: users.suspendedAt,
  suspendedUntil: users.suspendedUntil,
  lastSeenAt: users.lastSeenAt,
  termsAcceptedAt: users.termsAcceptedAt,
  termsVersion: users.termsVersion,
  createdAt: users.createdAt,
} as const;
export type ExportedAccountRow = Pick<UserPo, keyof typeof EXPORTED_ACCOUNT_COLUMNS>;
/** Another account the person relates to, by its @, and since when. */
export type RelatedAccountRow = Readonly<{ username: string; at: Date }>;
export type ExportedSessionRow = Pick<
  AuthSessionPo,
  'userAgent' | 'persistent' | 'createdAt' | 'lastSeenAt' | 'expiresAt'
>;
export type GivenVoteRow = Pick<ReputationVotePo, 'value' | 'createdAt' | 'updatedAt'> &
  Readonly<{ username: string }>;
export type HeldBadgeRow = Readonly<{ name: string; description: string; grantedAt: Date }>;

/** What the export reads about the account itself, always by the session's id, plus the claim of
 *  the once-a-day export (`users.data_exported_at`).
 *
 *  Example: `await new AccountExportDao(db).accountOf(biaId) // { username: 'bia', … }` */
export class AccountExportDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Example: `await accounts.accountOf(biaId) // undefined once the account is gone` */
  async accountOf(userId: string): Promise<ExportedAccountRow | undefined> {
    const [row] = await this.db
      .select(EXPORTED_ACCOUNT_COLUMNS)
      .from(users)
      .where(eq(users.id, userId));
    return row;
  }

  /** Example: `await accounts.lastExportOf(biaId) // null before the first export` */
  async lastExportOf(userId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: users.dataExportedAt })
      .from(users)
      .where(eq(users.id, userId));
    return row?.at ?? null;
  }

  /** Marks the export at `now` only if the last one is not newer than `latestAllowed`; `false`
   *  when another export got there first (the conditional UPDATE serializes the two).
   *
   *  Example: `await accounts.claimExport(biaId, now, dayAgo) // true` */
  async claimExport(userId: string, now: Date, latestAllowed: Date): Promise<boolean> {
    const due = or(isNull(users.dataExportedAt), lte(users.dataExportedAt, latestAllowed));
    const claimed = await this.db
      .update(users)
      .set({ dataExportedAt: now })
      .where(and(eq(users.id, userId), due))
      .returning({ id: users.id });
    return claimed.length > 0;
  }

  /** Example: `await accounts.twoFactorEnabledAt(biaId) // null without an active 2FA` */
  async twoFactorEnabledAt(userId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: userTwoFactor.enabledAt })
      .from(userTwoFactor)
      .where(eq(userTwoFactor.userId, userId));
    return row?.at ?? null;
  }

  /** The signed-in devices; never the session id (the hash of the cookie). */
  async sessionsOf(userId: string): Promise<ExportedSessionRow[]> {
    const { userAgent, persistent, createdAt, lastSeenAt, expiresAt } = authSessions;
    return this.db
      .select({ userAgent, persistent, createdAt, lastSeenAt, expiresAt })
      .from(authSessions)
      .where(eq(authSessions.userId, userId))
      .orderBy(desc(authSessions.lastSeenAt));
  }

  async savedColorsOf(userId: string): Promise<SavedColorPo[]> {
    return this.db
      .select()
      .from(accountSavedColors)
      .where(eq(accountSavedColors.userId, userId))
      .orderBy(desc(accountSavedColors.createdAt));
  }

  /** The account's own emojis, oldest first.
   *
   *  Example: `const rows = await accounts.customEmojisOf(biaId)` */
  async customEmojisOf(userId: string): Promise<CustomEmojiPo[]> {
    return this.db
      .select()
      .from(customEmojis)
      .where(eq(customEmojis.ownerId, userId))
      .orderBy(asc(customEmojis.createdAt), asc(customEmojis.id));
  }

  /** The @ of each friend: the pair is stored once, in canonical order, so either side is "me". */
  async friendsOf(userId: string): Promise<RelatedAccountRow[]> {
    const other = sql`CASE WHEN ${friendships.userLow} = ${userId} THEN ${friendships.userHigh} ELSE ${friendships.userLow} END`;
    return this.db
      .select({ username: users.username, at: friendships.createdAt })
      .from(friendships)
      .innerJoin(users, eq(users.id, other))
      .where(or(eq(friendships.userLow, userId), eq(friendships.userHigh, userId)))
      .orderBy(asc(users.username));
  }

  async requestsSentBy(userId: string): Promise<RelatedAccountRow[]> {
    return this.db
      .select({ username: users.username, at: friendRequests.createdAt })
      .from(friendRequests)
      .innerJoin(users, eq(users.id, friendRequests.toUserId))
      .where(eq(friendRequests.fromUserId, userId))
      .orderBy(desc(friendRequests.createdAt));
  }

  async requestsReceivedBy(userId: string): Promise<RelatedAccountRow[]> {
    return this.db
      .select({ username: users.username, at: friendRequests.createdAt })
      .from(friendRequests)
      .innerJoin(users, eq(users.id, friendRequests.fromUserId))
      .where(eq(friendRequests.toUserId, userId))
      .orderBy(desc(friendRequests.createdAt));
  }

  /** Only the blocks the person made: who blocked them is the other account's decision. */
  async blocksBy(userId: string): Promise<RelatedAccountRow[]> {
    return this.db
      .select({ username: users.username, at: userBlocks.createdAt })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, userId))
      .orderBy(desc(userBlocks.createdAt));
  }

  /** The votes the person gave; the ones received are someone else's and leave only as a sum. */
  async votesGivenBy(userId: string): Promise<GivenVoteRow[]> {
    const { value, createdAt, updatedAt } = reputationVotes;
    return this.db
      .select({ username: users.username, value, createdAt, updatedAt })
      .from(reputationVotes)
      .innerJoin(users, eq(users.id, reputationVotes.targetId))
      .where(eq(reputationVotes.voterId, userId))
      .orderBy(desc(reputationVotes.updatedAt));
  }

  async badgesOf(userId: string): Promise<HeldBadgeRow[]> {
    return this.db
      .select({
        name: badges.name,
        description: badges.description,
        grantedAt: userBadges.grantedAt,
      })
      .from(userBadges)
      .innerJoin(badges, eq(badges.id, userBadges.badgeId))
      .where(eq(userBadges.userId, userId))
      .orderBy(asc(badges.position));
  }
}
