import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { combatantTokens, combatants, combats, type CombatPo, type CombatantPo } from './combat.po';

/** An initiative entry with the tokens linked to it (the order of `tokenIds` is not meaningful). */
export type CombatantRow = CombatantPo & Readonly<{ tokenIds: readonly string[] }>;

/** A combat with its entries, in order of entry (the turn order is the game-core's). */
export type CombatRow = Readonly<{ combat: CombatPo; combatants: readonly CombatantRow[] }>;

/** An entry to create: the master's name (or `null`) and its tokens; the initiative starts empty. */
export type NewCombatant = Readonly<{ name: string | null; tokenIds: readonly string[] }>;

export type TieOrderChange = Readonly<{ combatantId: string; tieOrder: number }>;

/** The combat of a scene. Multi-table writes run on a DAO built with the `tx`. */
export class CombatDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async start(sceneId: string, entries: readonly NewCombatant[]): Promise<CombatRow> {
    const [combat] = await this.db.insert(combats).values({ sceneId }).returning();
    if (!combat) throw new Error(`insert into combats returned no row for scene ${sceneId}`);
    await this.addCombatants(combat.id, entries);
    return this.rowOf(combat);
  }

  async findOfScene(sceneId: string): Promise<CombatRow | undefined> {
    const [combat] = await this.db.select().from(combats).where(eq(combats.sceneId, sceneId));
    return combat && this.rowOf(combat);
  }

  /** The entries enter after the ones already there, in the order sent; returns their ids. */
  async addCombatants(combatId: string, entries: readonly NewCombatant[]): Promise<string[]> {
    if (entries.length === 0) return [];
    const present = await this.db
      .select({ tieOrder: combatants.tieOrder })
      .from(combatants)
      .where(eq(combatants.combatId, combatId));
    const first = Math.max(-1, ...present.map(({ tieOrder }) => tieOrder)) + 1;
    const rows = entries.map(({ name }, index) => ({ combatId, name, tieOrder: first + index }));
    const created = await this.db
      .insert(combatants)
      .values(rows)
      .returning({ id: combatants.id, tieOrder: combatants.tieOrder });
    const ids = [...created].sort((a, b) => a.tieOrder - b.tieOrder).map(({ id }) => id);
    for (const [index, id] of ids.entries())
      await this.linkTokens(id, entries[index]?.tokenIds ?? []);
    return ids;
  }

  /** The tokens join `combatantId`, leaving whatever entry they were in. */
  async linkTokens(combatantId: string, tokenIds: readonly string[]): Promise<void> {
    if (tokenIds.length === 0) return;
    await this.db
      .insert(combatantTokens)
      .values(tokenIds.map((tokenId) => ({ tokenId, combatantId })))
      .onConflictDoUpdate({ target: combatantTokens.tokenId, set: { combatantId } });
  }

  async unlinkTokens(tokenIds: readonly string[]): Promise<void> {
    if (tokenIds.length === 0) return;
    await this.db.delete(combatantTokens).where(inArray(combatantTokens.tokenId, [...tokenIds]));
  }

  /** Only entries of `combatId` go; their links follow by cascade. */
  async removeCombatants(combatId: string, combatantIds: readonly string[]): Promise<void> {
    if (combatantIds.length === 0) return;
    await this.db
      .delete(combatants)
      .where(and(eq(combatants.combatId, combatId), inArray(combatants.id, [...combatantIds])));
  }

  async rename(combatantId: string, name: string): Promise<void> {
    await this.db.update(combatants).set({ name }).where(eq(combatants.id, combatantId));
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
    const links = await this.linksOf(listed.map(({ id }) => id));
    const entries = listed.map((entry) => ({ ...entry, tokenIds: links.get(entry.id) ?? [] }));
    return { combat, combatants: entries };
  }

  private async linksOf(combatantIds: readonly string[]): Promise<Map<string, string[]>> {
    const byEntry = new Map<string, string[]>();
    if (combatantIds.length === 0) return byEntry;
    const links = await this.db
      .select()
      .from(combatantTokens)
      .where(inArray(combatantTokens.combatantId, [...combatantIds]));
    for (const { combatantId, tokenId } of links) {
      byEntry.set(combatantId, [...(byEntry.get(combatantId) ?? []), tokenId]);
    }
    return byEntry;
  }
}
