import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { sceneRowsCopySql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { updateManySql } from '../../database/update-many';
import {
  effectAreas,
  type EffectAreaPo,
  type EffectAreaReshapePo,
  type NewEffectAreaPo,
} from './effect-areas.po';

// In the order `reshapeMany` lays each row out.
const SHAPE_COLUMNS = [
  { column: effectAreas.kind, cast: 'effect_area_kind' },
  ...[effectAreas.x, effectAreas.y, effectAreas.width, effectAreas.height].map((column) => ({
    column,
    cast: 'numeric',
  })),
  { column: effectAreas.reach, cast: 'numeric' },
  { column: effectAreas.facing, cast: 'smallint' },
  { column: effectAreas.color, cast: 'text' },
];

/** Areas of effect of a scene. Every read and write filters by the scene, so an id from another
 *  table finds and touches nothing (§2.6). Group writes run on the DAO built with the `tx`. */
export class EffectAreasDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Copies every one of the areas of effect (each keeps its author) of `fromSceneId` into `toSceneId`, with new ids and in the
   *  same order (the duplicate of a grid). */
  async copyScene(fromSceneId: string, toSceneId: string): Promise<void> {
    const copy = { table: effectAreas, sceneId: effectAreas.sceneId, order: effectAreas.areaOrder };
    await this.db.execute(sceneRowsCopySql(copy, fromSceneId, toSceneId));
  }

  async insertMany(rows: readonly NewEffectAreaPo[]): Promise<EffectAreaPo[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(effectAreas)
      .values([...rows])
      .returning();
  }

  async listOfScene(sceneId: string): Promise<EffectAreaPo[]> {
    return this.db
      .select()
      .from(effectAreas)
      .where(eq(effectAreas.sceneId, sceneId))
      .orderBy(asc(effectAreas.areaOrder));
  }

  async countOfScene(sceneId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(effectAreas)
      .where(eq(effectAreas.sceneId, sceneId));
    return row?.total ?? 0;
  }

  /** The asked areas that are in `sceneId`, in creation order; ids from elsewhere are skipped. */
  async findManyInScene(sceneId: string, ids: readonly string[]): Promise<EffectAreaPo[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(effectAreas)
      .where(and(eq(effectAreas.sceneId, sceneId), inArray(effectAreas.id, [...ids])))
      .orderBy(asc(effectAreas.areaOrder));
  }

  /** One `UPDATE` for the group; an area of another scene in it does not change. */
  async reshapeMany(sceneId: string, reshapes: readonly EffectAreaReshapePo[]): Promise<void> {
    if (reshapes.length === 0) return;
    const rows = reshapes.map(({ effectAreaId, shape }) => [
      effectAreaId,
      ...[shape.kind, shape.x, shape.y, shape.width, shape.height],
      ...[shape.reach, shape.facing, shape.color],
    ]);
    const where = eq(effectAreas.sceneId, sceneId);
    const update = { table: effectAreas, key: effectAreas.id, columns: SHAPE_COLUMNS, rows, where };
    await this.db.execute(updateManySql(update));
  }

  async deleteMany(sceneId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .delete(effectAreas)
      .where(and(eq(effectAreas.sceneId, sceneId), inArray(effectAreas.id, [...ids])));
  }
}
