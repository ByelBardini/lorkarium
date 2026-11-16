import { and, asc, eq, getTableColumns, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { updateManySql } from '../../database/update-many';
import { badges, userBadges, type BadgePo } from './badges.po';

/** A catalog row with how many accounts hold it. */
export type BadgeCatalogRow = BadgePo & Readonly<{ holders: number }>;

/** What a catalog check under lock needs: the id and whether it has an image. */
export type LockedBadgeRow = Pick<BadgePo, 'id' | 'imageId'>;

/** The texts an admin creates or edits; the position is the DAO's. */
export type BadgeTexts = Pick<BadgePo, 'name' | 'description'>;

/** The image the badge had before a swap (`null`: none). */
export type SwappedBadgeImage = Readonly<{ previousId: string | null }>;

const holdersSql = sql<number>`(SELECT count(*)::int FROM ${userBadges} WHERE ${userBadges.badgeId} = ${badges.id})`;

const catalogColumns = { ...getTableColumns(badges), holders: holdersSql };

/** The badge catalog, its order and the grants to accounts.
 *
 *  Example: `await new BadgesDao(db).listCatalog() // in position order, with holders` */
export class BadgesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Example: `(await badges.listCatalog())[0].position // 0` */
  async listCatalog(): Promise<BadgeCatalogRow[]> {
    return this.db.select(catalogColumns).from(badges).orderBy(asc(badges.position));
  }

  /** Example: `(await badges.findById(badgeId))?.holders // 3` */
  async findById(badgeId: string): Promise<BadgeCatalogRow | undefined> {
    const [row] = await this.db.select(catalogColumns).from(badges).where(eq(badges.id, badgeId));
    return row;
  }

  /** Puts the new badge last, without an image. Two inserts at once may pick the same position:
   *  the deferred unique refuses the second at commit.
   *
   *  Example: `await badges.insert({ name: 'Veterano', description: 'Jogou 100 sessões' })` */
  async insert(texts: BadgeTexts): Promise<BadgePo> {
    const last = sql<number>`(SELECT coalesce(max(${badges.position}) + 1, 0) FROM ${badges})`;
    const [row] = await this.db
      .insert(badges)
      .values({ ...texts, position: last })
      .returning();
    if (!row) throw new Error(`Badge "${texts.name}" was not inserted: expected one row back`);
    return row;
  }

  /** Example: `await badges.update(badgeId, { name: 'Lenda' }) // undefined when unknown` */
  async update(badgeId: string, changes: Partial<BadgeTexts>): Promise<BadgePo | undefined> {
    const [row] = await this.db
      .update(badges)
      .set(changes)
      .where(eq(badges.id, badgeId))
      .returning();
    return row;
  }

  /** Points the badge at `imageId` and answers the previous one, read under `FOR UPDATE` in the
   *  same statement: two sends at once never see the same previous image.
   *
   *  Example: `(await badges.swapImage(badgeId, newId))?.previousId // the old one, or null` */
  async swapImage(badgeId: string, imageId: string): Promise<SwappedBadgeImage | undefined> {
    const result = await this.db.execute<{ previous: string | null }>(sql`
      WITH previous AS (SELECT image_id FROM badges WHERE id = ${badgeId} FOR UPDATE)
      UPDATE badges SET image_id = ${imageId} FROM previous WHERE badges.id = ${badgeId}
      RETURNING previous.image_id AS previous`);
    const [row] = result.rows;
    return row ? { previousId: row.previous } : undefined;
  }

  /** Example: `await badges.isCurrentImage(imageId) // false once replaced` */
  async isCurrentImage(imageId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: badges.id })
      .from(badges)
      .where(eq(badges.imageId, imageId));
    return row !== undefined;
  }

  /** Every badge, in order, locked until the transaction ends: a reorder or a grant checks the
   *  catalog while nobody deletes from it. Call it on a DAO built with the `tx`.
   *
   *  Example: `(await new BadgesDao(tx).lockCatalog()).map((badge) => badge.id)` */
  async lockCatalog(): Promise<LockedBadgeRow[]> {
    return this.db
      .select({ id: badges.id, imageId: badges.imageId })
      .from(badges)
      .orderBy(asc(badges.position))
      .for('update');
  }

  /** Writes positions 0, 1, 2… in the order of `badgeIds`, in one statement (the deferred unique
   *  lets two badges swap).
   *
   *  Example: `await badges.reorder([thirdId, firstId, secondId])` */
  async reorder(badgeIds: readonly string[]): Promise<void> {
    if (badgeIds.length === 0) return;
    await this.db.execute(
      updateManySql({
        table: badges,
        key: badges.id,
        columns: [{ column: badges.position, cast: 'integer' }],
        rows: badgeIds.map((id, position) => [id, position]),
        where: sql`true`,
      }),
    );
  }

  /** Deletes the badge (its grants go by cascade); answers its image, or `undefined` when unknown.
   *
   *  Example: `(await badges.delete(badgeId))?.imageId // the object to remove` */
  async delete(badgeId: string): Promise<Pick<BadgePo, 'imageId'> | undefined> {
    const [row] = await this.db
      .delete(badges)
      .where(eq(badges.id, badgeId))
      .returning({ imageId: badges.imageId });
    return row;
  }

  /** The ids the account holds, image or not, in catalog order.
   *
   *  Example: `await badges.grantIdsOf(biaId) // [veteranoId]` */
  async grantIdsOf(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: badges.id })
      .from(userBadges)
      .innerJoin(badges, eq(badges.id, userBadges.badgeId))
      .where(eq(userBadges.userId, userId))
      .orderBy(asc(badges.position));
    return rows.map((row) => row.id);
  }

  /** Leaves the account with exactly `badgeIds` (a kept grant keeps its date). Two statements:
   *  call it on a DAO built with the `tx`.
   *
   *  Example: `await new BadgesDao(tx).replaceGrants(biaId, [veteranoId])` */
  async replaceGrants(userId: string, badgeIds: readonly string[]): Promise<void> {
    const dropped =
      badgeIds.length === 0 ? undefined : notInArray(userBadges.badgeId, [...badgeIds]);
    await this.db.delete(userBadges).where(and(eq(userBadges.userId, userId), dropped));
    if (badgeIds.length === 0) return;
    const rows = badgeIds.map((badgeId) => ({ userId, badgeId }));
    await this.db.insert(userBadges).values(rows).onConflictDoNothing();
  }

  /** The badges the account shows: only those with an image, in catalog order.
   *
   *  Example: `(await badges.badgesOfAccount(biaId)).map((badge) => badge.name)` */
  async badgesOfAccount(userId: string): Promise<BadgePo[]> {
    return this.db
      .select(getTableColumns(badges))
      .from(userBadges)
      .innerJoin(badges, eq(badges.id, userBadges.badgeId))
      .where(and(eq(userBadges.userId, userId), isNotNull(badges.imageId)))
      .orderBy(asc(badges.position));
  }
}
