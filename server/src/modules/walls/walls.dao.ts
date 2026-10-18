import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { walls, type NewWallPo, type WallKindPo, type WallMovePo, type WallPo } from './walls.po';

type DoorStatePo = NonNullable<WallPo['doorState']>;

/** Walls of a scene. Every read and write filters by the scene, so an id from another table
 *  finds and touches nothing (§2.6). Group writes run on the DAO built with the `tx`. */
export class WallsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insertMany(rows: readonly NewWallPo[]): Promise<WallPo[]> {
    if (rows.length === 0) return [];
    const saved = await this.db
      .insert(walls)
      .values([...rows])
      .returning();
    return saved.sort((a, b) => a.wallOrder - b.wallOrder);
  }

  async listOfScene(sceneId: string): Promise<WallPo[]> {
    return this.db
      .select()
      .from(walls)
      .where(eq(walls.sceneId, sceneId))
      .orderBy(asc(walls.wallOrder));
  }

  /** The asked walls that are in `sceneId`, in creation order; ids from elsewhere are skipped. */
  async findManyInScene(sceneId: string, wallIds: readonly string[]): Promise<WallPo[]> {
    if (wallIds.length === 0) return [];
    return this.db
      .select()
      .from(walls)
      .where(and(eq(walls.sceneId, sceneId), inArray(walls.id, [...wallIds])))
      .orderBy(asc(walls.wallOrder));
  }

  /** One `UPDATE` per wall (a group is at most 64): run it on the DAO built with the `tx`. */
  async moveMany(sceneId: string, moves: readonly WallMovePo[]): Promise<void> {
    for (const { wallId, x, y } of moves) {
      await this.db.update(walls).set({ x, y }).where(this.inScene(sceneId, wallId));
    }
  }

  /** The kind and door state go together, so the door CHECK holds after each `UPDATE`. */
  async setKinds(sceneId: string, kinds: readonly WallKindPo[]): Promise<void> {
    for (const { wallId, kind, doorState } of kinds) {
      await this.db.update(walls).set({ kind, doorState }).where(this.inScene(sceneId, wallId));
    }
  }

  async setDoor(sceneId: string, wallId: string, state: DoorStatePo): Promise<void> {
    await this.db.update(walls).set({ doorState: state }).where(this.inScene(sceneId, wallId));
  }

  async deleteMany(sceneId: string, wallIds: readonly string[]): Promise<void> {
    if (wallIds.length === 0) return;
    await this.db
      .delete(walls)
      .where(and(eq(walls.sceneId, sceneId), inArray(walls.id, [...wallIds])));
  }

  private inScene(sceneId: string, wallId: string) {
    return and(eq(walls.sceneId, sceneId), eq(walls.id, wallId));
  }
}
