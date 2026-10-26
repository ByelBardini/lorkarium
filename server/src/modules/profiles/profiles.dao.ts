import { eq, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { users, type UserPo } from '../auth/users.po';

/** The columns of an account the profile shows (never the e-mail nor the password hash). */
export type ProfileRow = Pick<
  UserPo,
  | 'id'
  | 'username'
  | 'name'
  | 'color'
  | 'bio'
  | 'avatarId'
  | 'diceTextureId'
  | 'diceNumberColor'
  | 'createdAt'
>;

/** What the person may change on their own row; the @ is not here on purpose (immutable). */
export type ProfileChanges = Partial<Pick<UserPo, 'name' | 'color' | 'bio' | 'diceNumberColor'>>;

/** What a swap answers: the image the account pointed at before, read under the row lock. */
export type SwappedImage = Readonly<{ previousId: string | null }>;

// The two image columns of an account; the SQL names go into the swap as identifiers.
const IMAGE_COLUMNS = {
  avatar: { name: 'avatar_id', column: users.avatarId },
  diceTexture: { name: 'dice_texture_id', column: users.diceTextureId },
} as const;

type ImageColumn = (typeof IMAGE_COLUMNS)[keyof typeof IMAGE_COLUMNS];

const profileColumns = {
  id: users.id,
  username: users.username,
  name: users.name,
  color: users.color,
  bio: users.bio,
  avatarId: users.avatarId,
  diceTextureId: users.diceTextureId,
  diceNumberColor: users.diceNumberColor,
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
  async swapAvatar(userId: string, avatarId: string | null): Promise<SwappedImage | undefined> {
    return this.swapImage(IMAGE_COLUMNS.avatar, userId, avatarId);
  }

  /** Whether `avatarId` is the current photo of some account (a replaced one is not). */
  async isCurrentAvatar(avatarId: string): Promise<boolean> {
    return this.isCurrentImage(IMAGE_COLUMNS.avatar, avatarId);
  }

  /** The dice texture's `swapAvatar`: the same lock, on `dice_texture_id`. */
  async swapDiceTexture(
    userId: string,
    diceTextureId: string | null,
  ): Promise<SwappedImage | undefined> {
    return this.swapImage(IMAGE_COLUMNS.diceTexture, userId, diceTextureId);
  }

  /** Whether `diceTextureId` is the current dice texture of some account. */
  async isCurrentDiceTexture(diceTextureId: string): Promise<boolean> {
    return this.isCurrentImage(IMAGE_COLUMNS.diceTexture, diceTextureId);
  }

  private async swapImage(
    image: ImageColumn,
    userId: string,
    imageId: string | null,
  ): Promise<SwappedImage | undefined> {
    const column = sql.identifier(image.name);
    const result = await this.db.execute<{ previous: string | null }>(sql`
      WITH previous AS (SELECT ${column} FROM users WHERE id = ${userId} FOR UPDATE)
      UPDATE users SET ${column} = ${imageId} FROM previous WHERE users.id = ${userId}
      RETURNING previous.${column} AS previous`);
    const [row] = result.rows;
    return row ? { previousId: row.previous } : undefined;
  }

  private async isCurrentImage(image: ImageColumn, imageId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(image.column, imageId))
      .limit(1);
    return row !== undefined;
  }
}
