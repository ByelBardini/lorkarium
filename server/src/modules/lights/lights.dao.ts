import { and, asc, eq, inArray } from 'drizzle-orm';
import { sceneRowsCopySql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  lights,
  type LightColorPo,
  type LightConePo,
  type LightMovePo,
  type LightPo,
  type LightRangePo,
  type NewLightPo,
} from './lights.po';

/** Map lights of a scene. Every read and write filters by the scene, so an id from another table
 *  finds and touches nothing (§2.6). Group writes run on the DAO built with the `tx`. */
export class LightsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Copies every one of the lights (an unlit one stays unlit) of `fromSceneId` into `toSceneId`, with new ids and in the
   *  same order (the duplicate of a grid). */
  async copyScene(fromSceneId: string, toSceneId: string): Promise<void> {
    const copy = { table: lights, sceneId: lights.sceneId, order: lights.lightOrder };
    await this.db.execute(sceneRowsCopySql(copy, fromSceneId, toSceneId));
  }

  async insertMany(rows: readonly NewLightPo[]): Promise<LightPo[]> {
    if (rows.length === 0) return [];
    const saved = await this.db
      .insert(lights)
      .values([...rows])
      .returning();
    return saved.sort((a, b) => a.lightOrder - b.lightOrder);
  }

  async listOfScene(sceneId: string): Promise<LightPo[]> {
    return this.db
      .select()
      .from(lights)
      .where(eq(lights.sceneId, sceneId))
      .orderBy(asc(lights.lightOrder));
  }

  /** The asked lights that are in `sceneId`, in creation order; ids from elsewhere are skipped. */
  async findManyInScene(sceneId: string, lightIds: readonly string[]): Promise<LightPo[]> {
    if (lightIds.length === 0) return [];
    return this.db
      .select()
      .from(lights)
      .where(this.manyInScene(sceneId, lightIds))
      .orderBy(asc(lights.lightOrder));
  }

  /** One `UPDATE` per light (a group is at most 64): run it on the DAO built with the `tx`. */
  async moveMany(sceneId: string, moves: readonly LightMovePo[]): Promise<void> {
    for (const { lightId, x, y } of moves) {
      await this.db.update(lights).set({ x, y }).where(this.inScene(sceneId, lightId));
    }
  }

  async setRanges(sceneId: string, ranges: readonly LightRangePo[]): Promise<void> {
    for (const { lightId, bright, dim } of ranges) {
      await this.db.update(lights).set({ bright, dim }).where(this.inScene(sceneId, lightId));
    }
  }

  async setColors(sceneId: string, colors: readonly LightColorPo[]): Promise<void> {
    for (const { lightId, color } of colors) {
      await this.db.update(lights).set({ color }).where(this.inScene(sceneId, lightId));
    }
  }

  async setCones(sceneId: string, cones: readonly LightConePo[]): Promise<void> {
    for (const { lightId, facing, angle } of cones) {
      await this.db.update(lights).set({ facing, angle }).where(this.inScene(sceneId, lightId));
    }
  }

  async setLit(sceneId: string, lightIds: readonly string[], lit: boolean): Promise<void> {
    if (lightIds.length === 0) return;
    await this.db.update(lights).set({ lit }).where(this.manyInScene(sceneId, lightIds));
  }

  async deleteMany(sceneId: string, lightIds: readonly string[]): Promise<void> {
    if (lightIds.length === 0) return;
    await this.db.delete(lights).where(this.manyInScene(sceneId, lightIds));
  }

  private inScene(sceneId: string, lightId: string) {
    return and(eq(lights.sceneId, sceneId), eq(lights.id, lightId));
  }

  private manyInScene(sceneId: string, lightIds: readonly string[]) {
    return and(eq(lights.sceneId, sceneId), inArray(lights.id, [...lightIds]));
  }
}
