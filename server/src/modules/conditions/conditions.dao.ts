import { and, asc, countDistinct, eq, gt, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { scenes } from '../scenes/scenes.po';
import { tokens } from '../tokens/tokens.po';
import {
  activeConditions,
  conditionDefinitions,
  type ConditionDefinitionPo,
  type NewConditionDefinition,
} from './conditions.po';

/** An active condition with the name, tone, icon, look, color, description and stack cap of its
 *  definition. */
export type ActiveConditionRow = Readonly<{
  id: string;
  tokenId: string;
  conditionId: string;
  name: string;
  tone: ConditionDefinitionPo['tone'];
  icon: ConditionDefinitionPo['icon'];
  look: ConditionDefinitionPo['look'];
  color: ConditionDefinitionPo['color'];
  description: string;
  maxStacks: number | null;
  imageAssetId: string | null;
  stacks: number;
  remainingRounds: number | null;
  appliedRound: number | null;
}>;

/** How long an applied condition lasts: `null` rounds = until removed; `null` round = out of combat. */
export type ConditionDuration = Readonly<{
  remainingRounds: number | null;
  appliedRound: number | null;
}>;

// Every read here is filtered by token_id, so it is never null in a row: a character's conditions
// (token_id null, 0075) are not read by this DAO yet.
const heldTokenId = sql<string>`${activeConditions.tokenId}`;

const activeRowColumns = {
  id: activeConditions.id,
  tokenId: heldTokenId,
  conditionId: activeConditions.conditionId,
  name: conditionDefinitions.name,
  tone: conditionDefinitions.tone,
  icon: conditionDefinitions.icon,
  look: conditionDefinitions.look,
  color: conditionDefinitions.color,
  description: conditionDefinitions.description,
  maxStacks: conditionDefinitions.maxStacks,
  imageAssetId: conditionDefinitions.imageAssetId,
  stacks: activeConditions.stacks,
  remainingRounds: activeConditions.remainingRounds,
  appliedRound: activeConditions.appliedRound,
};

/** Condition definitions of a campaign and the conditions active on its tokens. */
export class ConditionsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The rows saved, in no particular order. */
  async insertDefinitions(
    campaignId: string,
    list: readonly NewConditionDefinition[],
  ): Promise<ConditionDefinitionPo[]> {
    if (list.length === 0) return [];
    return this.db
      .insert(conditionDefinitions)
      .values(list.map((d) => ({ ...d, campaignId })))
      .returning();
  }

  async insertDefinition(
    campaignId: string,
    definition: NewConditionDefinition,
  ): Promise<ConditionDefinitionPo> {
    const [row] = await this.db
      .insert(conditionDefinitions)
      .values({ ...definition, campaignId })
      .returning();
    if (!row)
      throw new Error(`insert into condition_definitions returned no row for ${definition.name}`);
    return row;
  }

  async listDefinitions(campaignId: string): Promise<ConditionDefinitionPo[]> {
    return this.db
      .select()
      .from(conditionDefinitions)
      .where(eq(conditionDefinitions.campaignId, campaignId))
      .orderBy(asc(conditionDefinitions.tone), asc(conditionDefinitions.name));
  }

  /** Only a definition of `campaignId`: an id from another table finds nothing (§2.6). */
  async findDefinitionInCampaign(
    campaignId: string,
    conditionId: string,
  ): Promise<ConditionDefinitionPo | undefined> {
    const [row] = await this.db
      .select()
      .from(conditionDefinitions)
      .where(
        and(
          eq(conditionDefinitions.campaignId, campaignId),
          eq(conditionDefinitions.id, conditionId),
        ),
      );
    return row;
  }

  async findDefinitionByName(
    campaignId: string,
    name: string,
  ): Promise<ConditionDefinitionPo | undefined> {
    const [row] = await this.db
      .select()
      .from(conditionDefinitions)
      .where(
        and(
          eq(conditionDefinitions.campaignId, campaignId),
          sql`lower(${conditionDefinitions.name}) = lower(${name})`,
        ),
      );
    return row;
  }

  /** The whole definition replaced; `undefined` when `conditionId` is not of `campaignId` (§2.6).
   *  A name another definition has (any case) breaks the unique index: check it first. */
  async updateDefinition(
    campaignId: string,
    conditionId: string,
    fields: NewConditionDefinition,
  ): Promise<ConditionDefinitionPo | undefined> {
    const [row] = await this.db
      .update(conditionDefinitions)
      .set(fields)
      .where(this.definitionOf(campaignId, conditionId))
      .returning();
    return row;
  }

  /** `false` when `conditionId` is not of `campaignId`; the active ones go by the cascade. */
  async deleteDefinition(campaignId: string, conditionId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(conditionDefinitions)
      .where(this.definitionOf(campaignId, conditionId))
      .returning({ id: conditionDefinitions.id });
    return deleted.length > 0;
  }

  /** How many tokens of the campaign hold the condition, on every grid and the cast. */
  async countActiveOf(campaignId: string, conditionId: string): Promise<number> {
    const [row] = await this.db
      .select({ tokens: countDistinct(activeConditions.tokenId) })
      .from(activeConditions)
      .innerJoin(tokens, eq(tokens.id, activeConditions.tokenId))
      .innerJoin(scenes, eq(scenes.id, tokens.sceneId))
      .where(and(eq(scenes.campaignId, campaignId), eq(activeConditions.conditionId, conditionId)));
    return row?.tokens ?? 0;
  }

  /** Puts the condition on the token with `stacks` (what the BO decided); applying it again
   *  replaces the duration and the stacks. */
  async apply(
    tokenId: string,
    conditionId: string,
    duration: ConditionDuration,
    stacks = 1,
  ): Promise<ActiveConditionRow> {
    const [saved] = await this.db
      .insert(activeConditions)
      .values({ tokenId, conditionId, ...duration, stacks })
      .onConflictDoUpdate({
        target: [activeConditions.tokenId, activeConditions.conditionId],
        set: { ...duration, stacks, appliedAt: sql`now()` },
      })
      .returning({ id: activeConditions.id });
    if (!saved) throw new Error(`apply of ${conditionId} on ${tokenId} returned no row`);
    const [row] = await this.activeRows(eq(activeConditions.id, saved.id));
    if (!row) throw new Error(`active condition ${saved.id} vanished right after it was saved`);
    return row;
  }

  /** `false` when the active condition is not on that token. */
  async remove(tokenId: string, activeConditionId: string): Promise<boolean> {
    const removed = await this.db
      .delete(activeConditions)
      .where(and(eq(activeConditions.tokenId, tokenId), eq(activeConditions.id, activeConditionId)))
      .returning({ id: activeConditions.id });
    return removed.length > 0;
  }

  /** Only the rounds left change (the applied round stays); `undefined` when the condition is not
   *  on that token. */
  async setRounds(
    tokenId: string,
    activeConditionId: string,
    remainingRounds: number | null,
  ): Promise<ActiveConditionRow | undefined> {
    const changed = await this.db
      .update(activeConditions)
      .set({ remainingRounds })
      .where(and(eq(activeConditions.tokenId, tokenId), eq(activeConditions.id, activeConditionId)))
      .returning({ id: activeConditions.id });
    if (changed.length === 0) return undefined;
    const [row] = await this.activeRows(eq(activeConditions.id, activeConditionId));
    return row;
  }

  /** The stacks each listed token already has of the condition, in one query; a token without
   *  it is missing from the map.
   *
   *  Example: `(await dao.stacksOf([tokenId], conditionId)).get(tokenId) ?? null` */
  async stacksOf(
    tokenIds: readonly string[],
    conditionId: string,
  ): Promise<ReadonlyMap<string, number>> {
    if (tokenIds.length === 0) return new Map();
    const rows = await this.db
      .select({ tokenId: heldTokenId, stacks: activeConditions.stacks })
      .from(activeConditions)
      .where(
        and(
          eq(activeConditions.conditionId, conditionId),
          inArray(activeConditions.tokenId, [...tokenIds]),
        ),
      );
    return new Map(rows.map((row) => [row.tokenId, row.stacks]));
  }

  /** `undefined` when the active condition is not on that token. */
  async findActiveOnToken(
    tokenId: string,
    activeConditionId: string,
  ): Promise<ActiveConditionRow | undefined> {
    const [row] = await this.activeRows(this.activeOn(tokenId, activeConditionId));
    return row;
  }

  /** Only the stacks change (rounds and applied round stay); `undefined` when the condition is
   *  not on that token. */
  async setStacks(
    tokenId: string,
    activeConditionId: string,
    stacks: number,
  ): Promise<ActiveConditionRow | undefined> {
    const changed = await this.db
      .update(activeConditions)
      .set({ stacks })
      .where(this.activeOn(tokenId, activeConditionId))
      .returning({ id: activeConditions.id });
    if (changed.length === 0) return undefined;
    const [row] = await this.activeRows(eq(activeConditions.id, activeConditionId));
    return row;
  }

  /** Every active condition of the definition above `ceiling` comes down to it, in one `UPDATE`
   *  (its `maxStacks` was lowered or taken away). */
  async capStacks(conditionId: string, ceiling: number): Promise<void> {
    await this.db
      .update(activeConditions)
      .set({ stacks: ceiling })
      .where(
        and(eq(activeConditions.conditionId, conditionId), gt(activeConditions.stacks, ceiling)),
      );
  }

  async listOfTokens(tokenIds: readonly string[]): Promise<ActiveConditionRow[]> {
    if (tokenIds.length === 0) return [];
    return this.activeRows(inArray(activeConditions.tokenId, [...tokenIds]));
  }

  /** One round off each listed condition, in one `UPDATE` (the end of a turn). */
  async decrementRemaining(activeConditionIds: readonly string[]): Promise<void> {
    if (activeConditionIds.length === 0) return;
    await this.db
      .update(activeConditions)
      .set({ remainingRounds: sql`${activeConditions.remainingRounds} - 1` })
      .where(inArray(activeConditions.id, [...activeConditionIds]));
  }

  async deleteActive(activeConditionIds: readonly string[]): Promise<void> {
    if (activeConditionIds.length === 0) return;
    await this.db
      .delete(activeConditions)
      .where(inArray(activeConditions.id, [...activeConditionIds]));
  }

  private definitionOf(campaignId: string, conditionId: string): ReturnType<typeof and> {
    return and(
      eq(conditionDefinitions.campaignId, campaignId),
      eq(conditionDefinitions.id, conditionId),
    );
  }

  private activeOn(tokenId: string, activeConditionId: string): ReturnType<typeof and> {
    return and(eq(activeConditions.tokenId, tokenId), eq(activeConditions.id, activeConditionId));
  }

  private activeRows(
    where: ReturnType<typeof eq> | ReturnType<typeof and>,
  ): Promise<ActiveConditionRow[]> {
    return this.db
      .select(activeRowColumns)
      .from(activeConditions)
      .innerJoin(conditionDefinitions, eq(conditionDefinitions.id, activeConditions.conditionId))
      .where(where)
      .orderBy(asc(activeConditions.appliedAt), asc(conditionDefinitions.name));
  }
}
