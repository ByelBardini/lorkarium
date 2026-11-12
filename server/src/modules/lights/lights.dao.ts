import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { sceneRowsCopySql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { updateManySql, type UpdatedColumn } from '../../database/update-many';
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

  /** How many lights the scene has: the ceiling check of a create, without reading them. */
  async countOfScene(sceneId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(lights)
      .where(eq(lights.sceneId, sceneId));
    return row?.total ?? 0;
  }

  /** One `UPDATE` for the group; a light of another scene in it does not move. */
  async moveMany(sceneId: string, moves: readonly LightMovePo[]): Promise<void> {
    const columns = [
      { column: lights.x, cast: 'numeric' },
      { column: lights.y, cast: 'numeric' },
    ];
    await this.updateMany(
      sceneId,
      columns,
      moves.map(({ lightId, x, y }) => [lightId, x, y]),
    );
  }

  async setRanges(sceneId: string, ranges: readonly LightRangePo[]): Promise<void> {
    const columns = [
      { column: lights.bright, cast: 'numeric' },
      { column: lights.dim, cast: 'numeric' },
    ];
    const rows = ranges.map(({ lightId, bright, dim }) => [lightId, bright, dim]);
    await this.updateMany(sceneId, columns, rows);
  }

  async setColors(sceneId: string, colors: readonly LightColorPo[]): Promise<void> {
    const columns = [{ column: lights.color, cast: 'text' }];
    await this.updateMany(
      sceneId,
      columns,
      colors.map(({ lightId, color }) => [lightId, color]),
    );
  }

  async setCones(sceneId: string, cones: readonly LightConePo[]): Promise<void> {
    const columns = [
      { column: lights.facing, cast: 'smallint' },
      { column: lights.angle, cast: 'smallint' },
    ];
    const rows = cones.map(({ lightId, facing, angle }) => [lightId, facing, angle]);
    await this.updateMany(sceneId, columns, rows);
  }

  async setLit(sceneId: string, lightIds: readonly string[], lit: boolean): Promise<void> {
    if (lightIds.length === 0) return;
    await this.db.update(lights).set({ lit }).where(this.manyInScene(sceneId, lightIds));
  }

  async deleteMany(sceneId: string, lightIds: readonly string[]): Promise<void> {
    if (lightIds.length === 0) return;
    await this.db.delete(lights).where(this.manyInScene(sceneId, lightIds));
  }

  private async updateMany(
    sceneId: string,
    columns: readonly UpdatedColumn[],
    rows: readonly (readonly unknown[])[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const where = eq(lights.sceneId, sceneId);
    await this.db.execute(updateManySql({ table: lights, key: lights.id, columns, rows, where }));
  }

  private manyInScene(sceneId: string, lightIds: readonly string[]) {
    return and(eq(lights.sceneId, sceneId), inArray(lights.id, [...lightIds]));
  }
}
