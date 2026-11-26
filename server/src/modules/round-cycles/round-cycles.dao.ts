import { and, asc, count, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { updateManySql } from '../../database/update-many';
import { campaignMembers } from '../campaigns/campaign-members.po';
import { combats } from '../combat/combat.po';
import { tokens } from '../tokens/tokens.po';
import { scenes } from '../scenes/scenes.po';
import {
  combatRoundCycles,
  roundCycleMembers,
  roundCyclePhases,
  roundCycles,
  type RoundCycleMemberPo,
  type RoundCyclePhasePo,
  type RoundCyclePo,
  type RoundCycleVisibilityValue,
} from './round-cycles.po';

/** A cycle with its phases (in order) and its members. */
export type RoundCycleRow = Readonly<{
  cycle: RoundCyclePo;
  phases: readonly RoundCyclePhasePo[];
  members: readonly RoundCycleMemberPo[];
}>;

/** A phase to write: with `id`, the phase of this cycle kept (renamed, moved); without, new. */
export type RoundCyclePhaseWrite = Readonly<{
  id?: string | undefined;
  name: string;
  imageAssetId: string | null;
}>;

export type RoundCycleMemberWrite = Omit<RoundCycleMemberPo, 'cycleId'>;

/** The whole cycle as a define or an update writes it. */
export type RoundCycleWrite = Readonly<{
  name: string;
  visibility: RoundCycleVisibilityValue;
  announce: boolean;
  holderCharacterId: string | null;
  holderTokenId: string | null;
  phases: readonly RoundCyclePhaseWrite[];
  members: readonly RoundCycleMemberWrite[];
}>;

/** Where a cycle stands in one combat, with the grid and round of that combat. */
export type CombatCycleState = Readonly<{
  combatId: string;
  cycleId: string;
  sceneId: string;
  round: number;
  currentPhaseId: string | null;
  chosenPhaseId: string | null;
}>;

/** A cycle's phase in a combat, as the start and the turn write it. */
export type CombatCyclePhase = Readonly<{ cycleId: string; currentPhaseId: string | null }>;

/** The round cycles of a table and where they stand in its combats (spec §3.16). Every read and
 *  write by cycle id is scoped by the table (§2.6). */
export class RoundCyclesDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Example: `await dao.insertCycle(campaignId, write)` */
  async insertCycle(campaignId: string, write: RoundCycleWrite): Promise<RoundCycleRow> {
    const [cycle] = await this.db
      .insert(roundCycles)
      .values({ campaignId, ...cycleFieldsOf(write) })
      .returning();
    if (!cycle) throw new Error(`insert into round_cycles returned no row for ${write.name}`);
    await this.writePhases(cycle.id, write.phases, []);
    await this.writeMembers(cycle.id, write.members);
    return this.requireRow(cycle);
  }

  /** The whole cycle replaces the saved one; `undefined` when it is not of this table.
   *
   *  Example: `await dao.replaceCycle(campaignId, cycleId, write)` */
  async replaceCycle(
    campaignId: string,
    cycleId: string,
    write: RoundCycleWrite,
  ): Promise<RoundCycleRow | undefined> {
    const [cycle] = await this.db
      .update(roundCycles)
      .set(cycleFieldsOf(write))
      .where(and(eq(roundCycles.id, cycleId), eq(roundCycles.campaignId, campaignId)))
      .returning();
    if (!cycle) return undefined;
    const saved = await this.phaseIdsOf(cycleId);
    await this.writePhases(cycleId, write.phases, saved);
    await this.db.delete(roundCycleMembers).where(eq(roundCycleMembers.cycleId, cycleId));
    await this.writeMembers(cycleId, write.members);
    return this.requireRow(cycle);
  }

  /** Example: `await dao.deleteCycle(campaignId, cycleId) // false when not of this table` */
  async deleteCycle(campaignId: string, cycleId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(roundCycles)
      .where(and(eq(roundCycles.id, cycleId), eq(roundCycles.campaignId, campaignId)))
      .returning({ id: roundCycles.id });
    return deleted.length > 0;
  }

  /** Example: `await dao.findInCampaign(campaignId, cycleId)` */
  async findInCampaign(campaignId: string, cycleId: string): Promise<RoundCycleRow | undefined> {
    const [cycle] = await this.db
      .select()
      .from(roundCycles)
      .where(and(eq(roundCycles.id, cycleId), eq(roundCycles.campaignId, campaignId)));
    return cycle ? this.requireRow(cycle) : undefined;
  }

  /** Every cycle of the table, oldest first: three reads, whatever the count.
   *
   *  Example: `await dao.listOfCampaign(campaignId)` */
  async listOfCampaign(campaignId: string): Promise<RoundCycleRow[]> {
    const found = await this.db
      .select()
      .from(roundCycles)
      .where(eq(roundCycles.campaignId, campaignId))
      .orderBy(asc(roundCycles.createdAt), asc(roundCycles.id));
    return this.rowsOf(found);
  }

  /** Example: `await dao.countOfCampaign(campaignId) // 3` */
  async countOfCampaign(campaignId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(roundCycles)
      .where(eq(roundCycles.campaignId, campaignId));
    return row?.total ?? 0;
  }

  /** The players of the table: who may be named as seer or chooser.
   *
   *  Example: `await dao.playerIdsOf(campaignId) // [lyraId, kaelId]` */
  async playerIdsOf(campaignId: string): Promise<string[]> {
    const found = await this.db
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.role, 'player')));
    return found.map(({ userId }) => userId);
  }

  /** Whether `tokenId` is a token of one of the table's grids not linked to a character (a
   *  linked one is held through its character).
   *
   *  Example: `await dao.looseTokenInCampaign(campaignId, krakenId) // true` */
  async looseTokenInCampaign(campaignId: string, tokenId: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: tokens.id })
      .from(tokens)
      .innerJoin(scenes, eq(scenes.id, tokens.sceneId))
      .where(
        and(eq(tokens.id, tokenId), eq(scenes.campaignId, campaignId), isNull(tokens.characterId)),
      );
    return found !== undefined;
  }

  /** Where each cycle stands in the table's combats, with the grid and round of each.
   *
   *  Example: `await dao.combatStatesOfCampaign(campaignId)` */
  async combatStatesOfCampaign(campaignId: string): Promise<CombatCycleState[]> {
    return this.db
      .select({
        combatId: combatRoundCycles.combatId,
        cycleId: combatRoundCycles.cycleId,
        sceneId: combats.sceneId,
        round: combats.round,
        currentPhaseId: combatRoundCycles.currentPhaseId,
        chosenPhaseId: combatRoundCycles.chosenPhaseId,
      })
      .from(combatRoundCycles)
      .innerJoin(combats, eq(combats.id, combatRoundCycles.combatId))
      .innerJoin(scenes, eq(scenes.id, combats.sceneId))
      .where(eq(scenes.campaignId, campaignId))
      .orderBy(asc(combatRoundCycles.combatId), asc(combatRoundCycles.cycleId));
  }

  /** The cycles that enter a combat, each on its phase (an entry already there stays).
   *
   *  Example: `await dao.startCycles(combatId, [{ cycleId, currentPhaseId: novaId }])` */
  async startCycles(combatId: string, entries: readonly CombatCyclePhase[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insert(combatRoundCycles)
      .values(entries.map((entry) => ({ combatId, ...entry, chosenPhaseId: null })))
      .onConflictDoNothing();
  }

  /** The phase of the next round (`null` = follow the cycle); `false` when the cycle is not in
   *  that combat.
   *
   *  Example: `await dao.setChosen(combatId, cycleId, cheiaId)` */
  async setChosen(combatId: string, cycleId: string, phaseId: string | null): Promise<boolean> {
    const changed = await this.db
      .update(combatRoundCycles)
      .set({ chosenPhaseId: phaseId })
      .where(and(eq(combatRoundCycles.combatId, combatId), eq(combatRoundCycles.cycleId, cycleId)))
      .returning({ cycleId: combatRoundCycles.cycleId });
    return changed.length > 0;
  }

  /** The new round: each cycle on its phase, every choice spent, in one `UPDATE`.
   *
   *  Example: `await dao.turnAll(combatId, [{ cycleId, currentPhaseId: crescenteId }])` */
  async turnAll(combatId: string, changes: readonly CombatCyclePhase[]): Promise<void> {
    if (changes.length === 0) return;
    await this.db.execute(
      updateManySql({
        table: combatRoundCycles,
        key: combatRoundCycles.cycleId,
        columns: [{ column: combatRoundCycles.currentPhaseId, cast: 'uuid' }],
        rows: changes.map(({ cycleId, currentPhaseId }) => [cycleId, currentPhaseId]),
        where: eq(combatRoundCycles.combatId, combatId),
        alsoSet: sql`${sql.identifier(combatRoundCycles.chosenPhaseId.name)} = NULL`,
      }),
    );
  }

  /** Example: `await dao.removeCycles(combatId, [tideId])` */
  async removeCycles(combatId: string, cycleIds: readonly string[]): Promise<void> {
    if (cycleIds.length === 0) return;
    await this.db
      .delete(combatRoundCycles)
      .where(
        and(
          eq(combatRoundCycles.combatId, combatId),
          inArray(combatRoundCycles.cycleId, [...cycleIds]),
        ),
      );
  }

  private async phaseIdsOf(cycleId: string): Promise<string[]> {
    const found = await this.db
      .select({ id: roundCyclePhases.id })
      .from(roundCyclePhases)
      .where(eq(roundCyclePhases.cycleId, cycleId));
    return found.map(({ id }) => id);
  }

  // Kept phases (by an id of this cycle) are rewritten in place; the rest are new; the saved
  // ones left out are deleted (a combat on one of them falls back to null).
  private async writePhases(
    cycleId: string,
    phases: readonly RoundCyclePhaseWrite[],
    savedIds: readonly string[],
  ): Promise<void> {
    const keptIds = phases.flatMap(({ id }) =>
      id !== undefined && savedIds.includes(id) ? [id] : [],
    );
    await this.deletePhasesBut(cycleId, keptIds);
    for (const [position, phase] of phases.entries()) {
      const values = { name: phase.name, imageAssetId: phase.imageAssetId, position };
      if (phase.id !== undefined && keptIds.includes(phase.id)) {
        await this.db.update(roundCyclePhases).set(values).where(eq(roundCyclePhases.id, phase.id));
        continue;
      }
      await this.db.insert(roundCyclePhases).values({ cycleId, ...values });
    }
  }

  private async deletePhasesBut(cycleId: string, keptIds: readonly string[]): Promise<void> {
    const ofCycle = eq(roundCyclePhases.cycleId, cycleId);
    const where =
      keptIds.length === 0 ? ofCycle : and(ofCycle, notInArray(roundCyclePhases.id, [...keptIds]));
    await this.db.delete(roundCyclePhases).where(where);
  }

  private async writeMembers(
    cycleId: string,
    members: readonly RoundCycleMemberWrite[],
  ): Promise<void> {
    if (members.length === 0) return;
    await this.db
      .insert(roundCycleMembers)
      .values(members.map((member) => ({ cycleId, ...member })));
  }

  private async requireRow(cycle: RoundCyclePo): Promise<RoundCycleRow> {
    const [row] = await this.rowsOf([cycle]);
    if (!row) throw new Error(`round cycle ${cycle.id} has no row after reading its parts`);
    return row;
  }

  private async rowsOf(found: readonly RoundCyclePo[]): Promise<RoundCycleRow[]> {
    if (found.length === 0) return [];
    const ids = found.map(({ id }) => id);
    const phases = await this.db
      .select()
      .from(roundCyclePhases)
      .where(inArray(roundCyclePhases.cycleId, ids))
      .orderBy(asc(roundCyclePhases.position));
    const members = await this.db
      .select()
      .from(roundCycleMembers)
      .where(inArray(roundCycleMembers.cycleId, ids))
      .orderBy(asc(roundCycleMembers.userId));
    return found.map((cycle) => ({
      cycle,
      phases: phases.filter(({ cycleId }) => cycleId === cycle.id),
      members: members.filter(({ cycleId }) => cycleId === cycle.id),
    }));
  }
}

type RoundCycleFieldsPo = Omit<RoundCycleWrite, 'phases' | 'members'>;

function cycleFieldsOf(write: RoundCycleWrite): RoundCycleFieldsPo {
  return {
    name: write.name,
    visibility: write.visibility,
    announce: write.announce,
    holderCharacterId: write.holderCharacterId,
    holderTokenId: write.holderTokenId,
  };
}
