import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { isUniqueViolation } from '../../lib/postgres-error';
import { PLAN_ACCOUNT_COLUMNS } from '../auth/users.dao';
import { users, type UserPlanPo } from '../auth/users.po';
import { CustomEmojiNameTakenError } from './custom-emoji.error';
import { customEmojis, type CustomEmojiPo, type NewCustomEmojiPo } from './custom-emoji.po';

const NAME_UNIQUE = 'custom_emojis_owner_name_unique';

/** An emoji and its owner's plan, read together for the picture route. */
export type CustomEmojiWithOwnerPo = Readonly<{ emoji: CustomEmojiPo; owner: UserPlanPo }>;

/** The emojis of one account: every write is keyed by the owner, so the emoji of someone else is
 *  never renamed nor removed through it. */
export class CustomEmojisDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The emojis of the account, oldest first (the order the plan's ceiling counts in).
   *
   *  Example: `const rows = await emojis.listOf(biaId)` */
  async listOf(ownerId: string): Promise<CustomEmojiPo[]> {
    return this.db
      .select()
      .from(customEmojis)
      .where(eq(customEmojis.ownerId, ownerId))
      .orderBy(asc(customEmojis.createdAt), asc(customEmojis.id));
  }

  /** Example: `const owner = await emojis.findOwnerPlan(biaId) // { role, plan, … }` */
  async findOwnerPlan(ownerId: string): Promise<UserPlanPo | undefined> {
    const [row] = await this.db
      .select(PLAN_ACCOUNT_COLUMNS)
      .from(users)
      .where(eq(users.id, ownerId));
    return row;
  }

  /** The emoji with its owner's plan, in one query; `undefined` for an unknown id.
   *
   *  Example: `const found = await emojis.findWithOwner(emojiId)` */
  async findWithOwner(emojiId: string): Promise<CustomEmojiWithOwnerPo | undefined> {
    const [row] = await this.db
      .select({ emoji: customEmojis, owner: PLAN_ACCOUNT_COLUMNS })
      .from(customEmojis)
      .innerJoin(users, eq(users.id, customEmojis.ownerId))
      .where(eq(customEmojis.id, emojiId));
    return row;
  }

  /** Throws `CUSTOM_EMOJI_NAME_TAKEN` when the account already has the name.
   *
   *  Example: `await emojis.insert({ id, ownerId, name: 'festa', animated: false })` */
  async insert(row: NewCustomEmojiPo): Promise<CustomEmojiPo> {
    try {
      const [inserted] = await this.db.insert(customEmojis).values(row).returning();
      if (!inserted) throw new Error(`insert of custom emoji ${row.id} returned no row`);
      return inserted;
    } catch (error) {
      if (isUniqueViolation(error, NAME_UNIQUE)) throw new CustomEmojiNameTakenError(row.name);
      throw error;
    }
  }

  /** The emoji renamed; `undefined` when the account has no emoji of that id. Throws
   *  `CUSTOM_EMOJI_NAME_TAKEN` when the account already has the new name.
   *
   *  Example: `await emojis.rename(biaId, emojiId, 'festa2')` */
  async rename(ownerId: string, emojiId: string, name: string): Promise<CustomEmojiPo | undefined> {
    try {
      const [row] = await this.db
        .update(customEmojis)
        .set({ name })
        .where(and(eq(customEmojis.ownerId, ownerId), eq(customEmojis.id, emojiId)))
        .returning();
      return row;
    } catch (error) {
      if (isUniqueViolation(error, NAME_UNIQUE)) throw new CustomEmojiNameTakenError(name);
      throw error;
    }
  }

  /** The emoji taken off; `undefined` when the account has no emoji of that id.
   *
   *  Example: `const removed = await emojis.remove(biaId, emojiId)` */
  async remove(ownerId: string, emojiId: string): Promise<CustomEmojiPo | undefined> {
    const [row] = await this.db
      .delete(customEmojis)
      .where(and(eq(customEmojis.ownerId, ownerId), eq(customEmojis.id, emojiId)))
      .returning();
    return row;
  }
}
