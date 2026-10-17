import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import { drawings, type DrawingMovePo, type DrawingPo, type NewDrawingPo } from './drawings.po';

/** Drawings of a scene. Every read and write filters by the scene, so an id from another table
 *  finds and touches nothing (§2.6). Group writes run on the DAO built with the `tx`. */
export class DrawingsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insertMany(rows: readonly NewDrawingPo[]): Promise<DrawingPo[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(drawings)
      .values([...rows])
      .returning();
  }

  async listOfScene(sceneId: string): Promise<DrawingPo[]> {
    return this.db
      .select()
      .from(drawings)
      .where(eq(drawings.sceneId, sceneId))
      .orderBy(asc(drawings.drawOrder));
  }

  async countOfScene(sceneId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(drawings)
      .where(eq(drawings.sceneId, sceneId));
    return row?.total ?? 0;
  }

  /** The asked drawings that are in `sceneId`, in creation order; ids from elsewhere are skipped. */
  async findManyInScene(sceneId: string, drawingIds: readonly string[]): Promise<DrawingPo[]> {
    if (drawingIds.length === 0) return [];
    return this.db
      .select()
      .from(drawings)
      .where(and(eq(drawings.sceneId, sceneId), inArray(drawings.id, [...drawingIds])))
      .orderBy(asc(drawings.drawOrder));
  }

  /** One `UPDATE` per drawing (a group is at most 64): run it on the DAO built with the `tx`. */
  async moveMany(sceneId: string, moves: readonly DrawingMovePo[]): Promise<void> {
    for (const { drawingId, x, y } of moves) {
      await this.db
        .update(drawings)
        .set({ x, y })
        .where(and(eq(drawings.sceneId, sceneId), eq(drawings.id, drawingId)));
    }
  }

  async deleteMany(sceneId: string, drawingIds: readonly string[]): Promise<void> {
    if (drawingIds.length === 0) return;
    await this.db
      .delete(drawings)
      .where(and(eq(drawings.sceneId, sceneId), inArray(drawings.id, [...drawingIds])));
  }
}
