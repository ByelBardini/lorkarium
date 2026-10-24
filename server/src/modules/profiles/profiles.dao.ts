import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users, type UserPo } from '../auth/users.po';

/** The columns of an account the profile shows (never the e-mail nor the password hash). */
export type ProfileRow = Pick<
  UserPo,
  'id' | 'username' | 'name' | 'color' | 'bio' | 'avatarId' | 'createdAt'
>;

/** What the person may change on their own row; the @ is not here on purpose (immutable). */
export type ProfileChanges = Partial<Pick<UserPo, 'name' | 'color' | 'bio'>>;

const profileColumns = {
  id: users.id,
  username: users.username,
  name: users.name,
  color: users.color,
  bio: users.bio,
  avatarId: users.avatarId,
  createdAt: users.createdAt,
};

/** Reads and writes the profile columns of `users` (the auth table, as `campaign-members.dao`
 *  reads it); every call is about one account, the one of the session. */
export class ProfilesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async findById(userId: string): Promise<ProfileRow | undefined> {
    const [row] = await this.db.select(profileColumns).from(users).where(eq(users.id, userId));
    return row;
  }

  async update(userId: string, changes: ProfileChanges): Promise<ProfileRow | undefined> {
    const [row] = await this.db
      .update(users)
      .set(changes)
      .where(eq(users.id, userId))
      .returning(profileColumns);
    return row;
  }

  /** Points the account at `avatarId` (or none) and returns the photo it had, read under the row
   *  lock: two sends at once never both see the same previous photo (one of them would leak).
   *  `undefined` when the account does not exist. */
  async swapAvatar(
    userId: string,
    avatarId: string | null,
  ): Promise<Readonly<{ previousAvatarId: string | null }> | undefined> {
    const result = await this.db.execute<{ previous: string | null }>(sql`
      WITH previous AS (SELECT avatar_id FROM users WHERE id = ${userId} FOR UPDATE)
      UPDATE users SET avatar_id = ${avatarId} FROM previous WHERE users.id = ${userId}
      RETURNING previous.avatar_id AS previous`);
    const [row] = result.rows;
    return row ? { previousAvatarId: row.previous } : undefined;
  }

  /** Whether `avatarId` is the current photo of some account (a replaced one is not). */
  async isCurrentAvatar(avatarId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.avatarId, avatarId))
      .limit(1);
    return row !== undefined;
  }
}
