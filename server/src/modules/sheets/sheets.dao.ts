import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor } from '../../database/transaction';
import { campaigns } from '../campaigns/campaigns.po';
import { memberCards } from '../member-cards/member-cards.po';
import { scenes, type SceneKindPo, type ScenePo } from '../scenes/scenes.po';
import { tokenControllers, tokens } from '../tokens/tokens.po';
import {
  sheetActions,
  tokenSheets,
  type NewSheetPo,
  type SheetActionPo,
  type SheetPo,
  type SheetValuesPo,
} from './sheets.po';

/** Where a token of the table stands, as the sheet's access reads it: the grid (or the cast) it
 *  is on, whether that is the group's grid, the anchor it is linked to, who controls it and the
 *  player whose character it is (the card that anchors on it). */
export type TokenPlacePo = Readonly<{
  tokenId: string;
  anchorTokenId: string | null;
  sceneId: string;
  kind: SceneKindPo;
  visibility: ScenePo['visibility'];
  isActive: boolean;
  controllerIds: readonly string[];
  memberId: string | null;
}>;

/** What a sheet write changes besides the values: an absent key stays. */
export type SheetChangesPo = Partial<
  Pick<SheetPo, 'visibility' | 'templateId' | 'name' | 'folderId' | 'tokenId'>
> &
  Pick<SheetPo, 'version' | 'updatedAt'>;

/** The sheets of a table, their receipts and the token places they hang on; every query filters
 *  by the campaign (§2.6). Run the writes on a DAO built with the `tx`. */
export class SheetsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async find(campaignId: string, sheetId: string): Promise<SheetPo | undefined> {
    const [row] = await this.db.select().from(tokenSheets).where(this.oneOf(campaignId, sheetId));
    return row;
  }

  /** The sheets a token holds, in creation order. */
  async listOfToken(campaignId: string, tokenId: string): Promise<SheetPo[]> {
    const where = and(eq(tokenSheets.campaignId, campaignId), eq(tokenSheets.tokenId, tokenId));
    return this.db.select().from(tokenSheets).where(where).orderBy(asc(tokenSheets.createdAt));
  }

  /** Every sheet of the table, in creation order (the library). */
  async listOfCampaign(campaignId: string): Promise<SheetPo[]> {
    return this.db
      .select()
      .from(tokenSheets)
      .where(eq(tokenSheets.campaignId, campaignId))
      .orderBy(asc(tokenSheets.createdAt));
  }

  /** Every sheet of the template, held or not. */
  async countOfTemplate(campaignId: string, templateId: string): Promise<number> {
    const where = and(
      eq(tokenSheets.campaignId, campaignId),
      eq(tokenSheets.templateId, templateId),
    );
    const [row] = await this.db.select({ total: count() }).from(tokenSheets).where(where);
    return row?.total ?? 0;
  }

  async insert(input: NewSheetPo): Promise<SheetPo> {
    const [saved] = await this.db.insert(tokenSheets).values(input).returning();
    if (!saved) throw new Error(`Sheet ${input.name} of campaign ${input.campaignId} not inserted`);
    return saved;
  }

  /** One statement: each key of `set` replaces the stored one, each of `removed` goes, so two
   *  writers of different keys both stay; the version goes up by one. */
  async patchValues(
    campaignId: string,
    sheetId: string,
    change: Readonly<{ set: SheetValuesPo; removed: readonly string[]; updatedAt: Date }>,
  ): Promise<SheetPo> {
    const removed = sql`ARRAY[${sql.join(
      change.removed.map((key) => sql`${key}`),
      sql`, `,
    )}]::text[]`;
    return this.updateOne(campaignId, sheetId, {
      values: sql`(${tokenSheets.values} || ${JSON.stringify(change.set)}::jsonb) - ${removed}`,
      version: sql`${tokenSheets.version} + 1`,
      updatedAt: change.updatedAt,
    });
  }

  async update(campaignId: string, sheetId: string, changes: SheetChangesPo): Promise<SheetPo> {
    return this.updateOne(campaignId, sheetId, changes);
  }

  async delete(campaignId: string, sheetId: string): Promise<void> {
    await this.db.delete(tokenSheets).where(this.oneOf(campaignId, sheetId));
  }

  /** A deleted folder's sheets go up to its parent, without a new version: nothing the frame
   *  shows changed. Run it in the folder's transaction. */
  async moveFromFolder(
    campaignId: string,
    folderId: string,
    parentId: string | null,
  ): Promise<void> {
    await this.db
      .update(tokenSheets)
      .set({ folderId: parentId, updatedAt: sql`now()` })
      .where(and(eq(tokenSheets.campaignId, campaignId), eq(tokenSheets.folderId, folderId)));
  }

  /** The token only if it stands on a scene of the table; another table's is `undefined`. */
  async placeOf(campaignId: string, tokenId: string): Promise<TokenPlacePo | undefined> {
    const [found] = await this.placesOf(campaignId, [tokenId]);
    return found;
  }

  /** The places of the tokens of the table among `tokenIds` (others are left out), in two
   *  queries whatever their number. */
  async placesOf(campaignId: string, tokenIds: readonly string[]): Promise<TokenPlacePo[]> {
    if (tokenIds.length === 0) return [];
    const found = await this.db
      .select({
        tokenId: tokens.id,
        anchorTokenId: tokens.anchorTokenId,
        sceneId: scenes.id,
        kind: scenes.kind,
        visibility: scenes.visibility,
        isActive: sql<boolean>`coalesce(${campaigns.activeSceneId} = ${scenes.id}, false)`,
        memberId: memberCards.userId,
      })
      .from(tokens)
      .innerJoin(scenes, eq(scenes.id, tokens.sceneId))
      .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
      .leftJoin(memberCards, cardAnchoredOn(campaignId))
      .where(and(inArray(tokens.id, [...tokenIds]), eq(scenes.campaignId, campaignId)));
    const controllers = await this.controllersOf(found.map(({ tokenId }) => tokenId));
    return found.map((place) => ({
      ...place,
      controllerIds: controllers.filter((row) => row.tokenId === place.tokenId).map(userIdOf),
    }));
  }

  async action(
    campaignId: string,
    userId: string,
    actionId: string,
  ): Promise<SheetActionPo | undefined> {
    const [row] = await this.db
      .select()
      .from(sheetActions)
      .where(
        and(
          eq(sheetActions.campaignId, campaignId),
          eq(sheetActions.userId, userId),
          eq(sheetActions.actionId, actionId),
        ),
      );
    return row;
  }

  async recordAction(input: SheetActionPo): Promise<void> {
    await this.db.insert(sheetActions).values(input);
  }

  private async controllersOf(
    tokenIds: readonly string[],
  ): Promise<Readonly<{ tokenId: string; userId: string }>[]> {
    if (tokenIds.length === 0) return [];
    return this.db
      .select({ tokenId: tokenControllers.tokenId, userId: tokenControllers.userId })
      .from(tokenControllers)
      .where(inArray(tokenControllers.tokenId, [...tokenIds]));
  }

  private oneOf(campaignId: string, sheetId: string): SQL | undefined {
    return and(eq(tokenSheets.campaignId, campaignId), eq(tokenSheets.id, sheetId));
  }

  private async updateOne(
    campaignId: string,
    sheetId: string,
    changes: PgUpdateSetSource<typeof tokenSheets>,
  ): Promise<SheetPo> {
    const [saved] = await this.db
      .update(tokenSheets)
      .set(changes)
      .where(this.oneOf(campaignId, sheetId))
      .returning();
    if (!saved) throw new Error(`Sheet ${sheetId} of campaign ${campaignId} was not updated`);
    return saved;
  }
}

function cardAnchoredOn(campaignId: string): SQL | undefined {
  return and(eq(memberCards.campaignId, campaignId), eq(memberCards.anchorTokenId, tokens.id));
}

function userIdOf({ userId }: Readonly<{ userId: string }>): string {
  return userId;
}
