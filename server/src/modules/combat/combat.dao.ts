import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { combatants, combats, type CombatPo, type CombatantPo } from './combat.po';

/** A combat with its combatants, in order of entry (the turn order is the game-core's). */
export type CombatRow = Readonly<{ combat: CombatPo; combatants: readonly CombatantPo[] }>;

export type TieOrderChange = Readonly<{ combatantId: string; tieOrder: number }>;

/** The combat of a scene. Multi-table writes run on a DAO built with the `tx`. */
export class CombatDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async start(sceneId: string, tokenIds: readonly string[]): Promise<CombatRow> {
    const [combat] = await this.db.insert(combats).values({ sceneId }).returning();
    if (!combat) throw new Error(`insert into combats returned no row for scene ${sceneId}`);
    await this.addCombatants(combat.id, tokenIds);
    return this.rowOf(combat);
  }

  async findOfScene(sceneId: string): Promise<CombatRow | undefined> {
    const [combat] = await this.db.select().from(combats).where(eq(combats.sceneId, sceneId));
    return combat && this.rowOf(combat);
  }

  /** New combatants enter after the ones already there; a token already in is skipped. */
  async addCombatants(combatId: string, tokenIds: readonly string[]): Promise<void> {
    const present = await this.db
      .select({ tokenId: combatants.tokenId, tieOrder: combatants.tieOrder })
      .from(combatants)
      .where(eq(combatants.combatId, combatId));
    const newcomers = tokenIds.filter((id) => !present.some(({ tokenId }) => tokenId === id));
    if (newcomers.length === 0) return;
    const first = Math.max(-1, ...present.map(({ tieOrder }) => tieOrder)) + 1;
    const rows = newcomers.map((tokenId, index) => ({
      combatId,
      tokenId,
      tieOrder: first + index,
    }));
    await this.db.insert(combatants).values(rows);
  }

  async removeCombatant(combatId: string, combatantId: string): Promise<void> {
    await this.db
      .delete(combatants)
      .where(and(eq(combatants.combatId, combatId), eq(combatants.id, combatantId)));
  }

  async setInitiative(combatantId: string, initiative: number | null): Promise<void> {
    await this.db.update(combatants).set({ initiative }).where(eq(combatants.id, combatantId));
  }

  async setTieOrders(changes: readonly TieOrderChange[]): Promise<void> {
    for (const { combatantId, tieOrder } of changes) {
      await this.db.update(combatants).set({ tieOrder }).where(eq(combatants.id, combatantId));
    }
  }

  async setTurn(combatId: string, round: number, currentCombatantId: string | null): Promise<void> {
    await this.db
      .update(combats)
      .set({ round, currentCombatantId })
      .where(eq(combats.id, combatId));
  }

  async end(combatId: string): Promise<void> {
    await this.db.delete(combats).where(eq(combats.id, combatId));
  }

  private async rowOf(combat: CombatPo): Promise<CombatRow> {
    const listed = await this.db
      .select()
      .from(combatants)
      .where(eq(combatants.combatId, combat.id))
      .orderBy(asc(combatants.tieOrder));
    return { combat, combatants: listed };
  }
}
