import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  effectAreas,
  type EffectAreaPo,
  type EffectAreaReshapePo,
  type NewEffectAreaPo,
} from './effect-areas.po';

/** Areas of effect of a scene. Every read and write filters by the scene, so an id from another
 *  table finds and touches nothing (§2.6). Group writes run on the DAO built with the `tx`. */
export class EffectAreasDao {
  constructor(private readonly db: DatabaseExecutor) {}

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

  /** One `UPDATE` per area (a group is at most 64): run it on the DAO built with the `tx`. */
  async reshapeMany(sceneId: string, reshapes: readonly EffectAreaReshapePo[]): Promise<void> {
    for (const { effectAreaId, shape } of reshapes) {
      await this.db
        .update(effectAreas)
        .set(shape)
        .where(and(eq(effectAreas.sceneId, sceneId), eq(effectAreas.id, effectAreaId)));
    }
  }

  async deleteMany(sceneId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .delete(effectAreas)
      .where(and(eq(effectAreas.sceneId, sceneId), inArray(effectAreas.id, [...ids])));
  }
}
