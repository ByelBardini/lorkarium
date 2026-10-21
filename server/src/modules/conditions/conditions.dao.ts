import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  activeConditions,
  conditionDefinitions,
  type ConditionDefinitionPo,
  type NewConditionDefinition,
} from './conditions.po';

/** An active condition with the name, tone and icon of its definition. */
export type ActiveConditionRow = Readonly<{
  id: string;
  tokenId: string;
  conditionId: string;
  name: string;
  tone: ConditionDefinitionPo['tone'];
  icon: ConditionDefinitionPo['icon'];
  remainingRounds: number | null;
  appliedRound: number | null;
}>;

/** How long an applied condition lasts: `null` rounds = until removed; `null` round = out of combat. */
export type ConditionDuration = Readonly<{
  remainingRounds: number | null;
  appliedRound: number | null;
}>;

const activeRowColumns = {
  id: activeConditions.id,
  tokenId: activeConditions.tokenId,
  conditionId: activeConditions.conditionId,
  name: conditionDefinitions.name,
  tone: conditionDefinitions.tone,
  icon: conditionDefinitions.icon,
  remainingRounds: activeConditions.remainingRounds,
  appliedRound: activeConditions.appliedRound,
};

/** Condition definitions of a campaign and the conditions active on its tokens. */
export class ConditionsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insertDefinitions(
    campaignId: string,
    list: readonly NewConditionDefinition[],
  ): Promise<void> {
    if (list.length === 0) return;
    await this.db.insert(conditionDefinitions).values(list.map((d) => ({ ...d, campaignId })));
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

  /** Puts the condition on the token; applying it again replaces the duration. */
  async apply(
    tokenId: string,
    conditionId: string,
    duration: ConditionDuration,
  ): Promise<ActiveConditionRow> {
    const [saved] = await this.db
      .insert(activeConditions)
      .values({ tokenId, conditionId, ...duration })
      .onConflictDoUpdate({
        target: [activeConditions.tokenId, activeConditions.conditionId],
        set: { ...duration, appliedAt: sql`now()` },
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

  async listOfTokens(tokenIds: readonly string[]): Promise<ActiveConditionRow[]> {
    if (tokenIds.length === 0) return [];
    return this.activeRows(inArray(activeConditions.tokenId, [...tokenIds]));
  }

  async setRemaining(activeConditionId: string, remainingRounds: number): Promise<void> {
    await this.db
      .update(activeConditions)
      .set({ remainingRounds })
      .where(eq(activeConditions.id, activeConditionId));
  }

  async deleteActive(activeConditionIds: readonly string[]): Promise<void> {
    if (activeConditionIds.length === 0) return;
    await this.db
      .delete(activeConditions)
      .where(inArray(activeConditions.id, [...activeConditionIds]));
  }

  private activeRows(where: ReturnType<typeof eq>): Promise<ActiveConditionRow[]> {
    return this.db
      .select(activeRowColumns)
      .from(activeConditions)
      .innerJoin(conditionDefinitions, eq(conditionDefinitions.id, activeConditions.conditionId))
      .where(where)
      .orderBy(asc(activeConditions.appliedAt), asc(conditionDefinitions.name));
  }
}
