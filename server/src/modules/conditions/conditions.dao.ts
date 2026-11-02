import { and, asc, countDistinct, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { characters } from '../characters/characters.po';
import { scenes } from '../scenes/scenes.po';
import { tokens } from '../tokens/tokens.po';
import {
  activeConditions,
  conditionDefinitions,
  holderIdOf,
  holderIdOfRow,
  type ConditionDefinitionPo,
  type ConditionHolder,
  type NewConditionDefinition,
} from './conditions.po';

/** An active condition with the name, tone, icon, look, color, description and stack cap of its
 *  definition. Exactly one of `tokenId` and `characterId` is set: its holder. */
export type ActiveConditionRow = Readonly<{
  id: string;
  tokenId: string | null;
  characterId: string | null;
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

const HOLDER_COLUMNS = {
  tokenId: activeConditions.tokenId,
  characterId: activeConditions.characterId,
};

const activeRowColumns = {
  id: activeConditions.id,
  ...HOLDER_COLUMNS,
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

/** Condition definitions of a campaign and the conditions active on its tokens and characters. */
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

  /** How many holders of the campaign have the condition: the tokens of every grid
   *  and the characters (one each, however many grids show it). */
  async countActiveOf(campaignId: string, conditionId: string): Promise<number> {
    const holder = sql`coalesce(${activeConditions.tokenId}, ${activeConditions.characterId})`;
    const ofCampaign = or(eq(scenes.campaignId, campaignId), eq(characters.campaignId, campaignId));
    const [row] = await this.db
      .select({ holders: countDistinct(holder) })
      .from(activeConditions)
      .leftJoin(tokens, eq(tokens.id, activeConditions.tokenId))
      .leftJoin(scenes, eq(scenes.id, tokens.sceneId))
      .leftJoin(characters, eq(characters.id, activeConditions.characterId))
      .where(and(eq(activeConditions.conditionId, conditionId), ofCampaign));
    return row?.holders ?? 0;
  }

  /** Puts the condition on the holder with `stacks` (what the BO decided); applying it again
   *  replaces the duration and the stacks.
   *
   *  Example: `await dao.apply({ characterId: lyraId }, envenenadoId, { remainingRounds: 2, appliedRound: 1 })` */
  async apply(
    holder: ConditionHolder,
    conditionId: string,
    duration: ConditionDuration,
    stacks = 1,
  ): Promise<ActiveConditionRow> {
    const [saved] = await this.db
      .insert(activeConditions)
      .values({ ...holder, conditionId, ...duration, stacks })
      .onConflictDoUpdate({
        target: [holderColumnOf(holder), activeConditions.conditionId],
        set: { ...duration, stacks, appliedAt: sql`now()` },
      })
      .returning({ id: activeConditions.id });
    if (!saved) throw new Error(`apply of ${conditionId} on ${holderIdOf(holder)} returned no row`);
    const [row] = await this.activeRows(eq(activeConditions.id, saved.id));
    if (!row) throw new Error(`active condition ${saved.id} vanished right after it was saved`);
    return row;
  }

  /** `false` when the active condition is not on that holder. */
  async remove(holder: ConditionHolder, activeConditionId: string): Promise<boolean> {
    const removed = await this.db
      .delete(activeConditions)
      .where(activeOn(holder, activeConditionId))
      .returning({ id: activeConditions.id });
    return removed.length > 0;
  }

  /** Only the rounds left change (the applied round stays); `undefined` when the condition is not
   *  on that holder. */
  async setRounds(
    holder: ConditionHolder,
    activeConditionId: string,
    remainingRounds: number | null,
  ): Promise<ActiveConditionRow | undefined> {
    const changed = await this.db
      .update(activeConditions)
      .set({ remainingRounds })
      .where(activeOn(holder, activeConditionId))
      .returning({ id: activeConditions.id });
    if (changed.length === 0) return undefined;
    const [row] = await this.activeRows(eq(activeConditions.id, activeConditionId));
    return row;
  }

  /** The stacks each listed holder already has of the condition, in one query, by the holder's id
   *  (`holderIdOf`); a holder without it is missing from the map.
   *
   *  Example: `(await dao.stacksOf([{ tokenId }], conditionId)).get(tokenId) ?? null` */
  async stacksOf(
    holders: readonly ConditionHolder[],
    conditionId: string,
  ): Promise<ReadonlyMap<string, number>> {
    const held = heldByAny(holders);
    if (!held) return new Map();
    const rows = await this.db
      .select({ ...HOLDER_COLUMNS, stacks: activeConditions.stacks })
      .from(activeConditions)
      .where(and(eq(activeConditions.conditionId, conditionId), held));
    return new Map(rows.map((row) => [holderIdOfRow(row), row.stacks]));
  }

  /** `undefined` when the active condition is not on that holder. */
  async findActiveOf(
    holder: ConditionHolder,
    activeConditionId: string,
  ): Promise<ActiveConditionRow | undefined> {
    const [row] = await this.activeRows(activeOn(holder, activeConditionId));
    return row;
  }

  /** Only the stacks change (rounds and applied round stay); `undefined` when the condition is
   *  not on that holder. */
  async setStacks(
    holder: ConditionHolder,
    activeConditionId: string,
    stacks: number,
  ): Promise<ActiveConditionRow | undefined> {
    const changed = await this.db
      .update(activeConditions)
      .set({ stacks })
      .where(activeOn(holder, activeConditionId))
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
    return this.listOfHolders(tokenIds.map((tokenId) => ({ tokenId })));
  }

  async listOfCharacters(characterIds: readonly string[]): Promise<ActiveConditionRow[]> {
    return this.listOfHolders(characterIds.map((characterId) => ({ characterId })));
  }

  /** The conditions of tokens and characters together, in one query (a grid shows both). No
   *  holder, no query.
   *
   *  Example: `await dao.listOfHolders([{ tokenId: kaelId }, { characterId: lyraId }])` */
  async listOfHolders(holders: readonly ConditionHolder[]): Promise<ActiveConditionRow[]> {
    const held = heldByAny(holders);
    if (!held) return [];
    return this.activeRows(held);
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

  private activeRows(where: SQL | undefined): Promise<ActiveConditionRow[]> {
    return this.db
      .select(activeRowColumns)
      .from(activeConditions)
      .innerJoin(conditionDefinitions, eq(conditionDefinitions.id, activeConditions.conditionId))
      .where(where)
      .orderBy(asc(activeConditions.appliedAt), asc(conditionDefinitions.name));
  }
}

type HolderColumn = typeof activeConditions.tokenId | typeof activeConditions.characterId;

function holderColumnOf(holder: ConditionHolder): HolderColumn {
  return 'tokenId' in holder ? activeConditions.tokenId : activeConditions.characterId;
}

function activeOn(holder: ConditionHolder, activeConditionId: string): SQL | undefined {
  return and(
    eq(holderColumnOf(holder), holderIdOf(holder)),
    eq(activeConditions.id, activeConditionId),
  );
}

// One `IN` per kind of holder; nothing listed → `undefined` (the caller reads nothing).
function heldByAny(holders: readonly ConditionHolder[]): SQL | undefined {
  const tokenIds = holders.flatMap((holder) => ('tokenId' in holder ? [holder.tokenId] : []));
  const characterIds = holders.flatMap((h) => ('characterId' in h ? [h.characterId] : []));
  const parts: SQL[] = [];
  if (tokenIds.length > 0) parts.push(inArray(activeConditions.tokenId, tokenIds));
  if (characterIds.length > 0) parts.push(inArray(activeConditions.characterId, characterIds));
  if (parts.length === 0) return undefined;
  return or(...parts);
}
