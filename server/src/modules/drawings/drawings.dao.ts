import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { sceneRowsCopySql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { updateManySql } from '../../database/update-many';
import { drawings, type DrawingMovePo, type DrawingPo, type NewDrawingPo } from './drawings.po';

/** Drawings of a scene. Every read and write filters by the scene, so an id from another table
 *  finds and touches nothing (§2.6). Group writes run on the DAO built with the `tx`. */
export class DrawingsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Copies every one of the drawings (each keeps its author) of `fromSceneId` into `toSceneId`, with new ids and in the
   *  same order (the duplicate of a grid). */
  async copyScene(fromSceneId: string, toSceneId: string): Promise<void> {
    const copy = { table: drawings, sceneId: drawings.sceneId, order: drawings.drawOrder };
    await this.db.execute(sceneRowsCopySql(copy, fromSceneId, toSceneId));
  }

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
  /** One `UPDATE` for the group; a drawing of another scene in it does not move. */
  async moveMany(sceneId: string, moves: readonly DrawingMovePo[]): Promise<void> {
    if (moves.length === 0) return;
    const columns = [
      { column: drawings.x, cast: 'numeric' },
      { column: drawings.y, cast: 'numeric' },
    ];
    const rows = moves.map(({ drawingId, x, y }) => [drawingId, x, y]);
    const where = eq(drawings.sceneId, sceneId);
    await this.db.execute(
      updateManySql({ table: drawings, key: drawings.id, columns, rows, where }),
    );
  }

  async deleteMany(sceneId: string, drawingIds: readonly string[]): Promise<void> {
    if (drawingIds.length === 0) return;
    await this.db
      .delete(drawings)
      .where(and(eq(drawings.sceneId, sceneId), inArray(drawings.id, [...drawingIds])));
  }
}
