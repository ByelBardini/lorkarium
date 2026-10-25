import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { copyRowsSql, uuidArray } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { updateManySql, type UpdatedColumn } from '../../database/update-many';
import { campaigns } from '../campaigns/campaigns.po';
import { activeConditions } from '../conditions/conditions.po';
import { scenes, type ScenePo } from '../scenes/scenes.po';
import { IS_GROUP_GRID, gridOfCampaign } from '../scenes/scenes.dao';
import { composedTokenRow } from './linked-token';
import {
  tokenBars,
  tokenControllers,
  tokens,
  type NewTokenPo,
  type TokenBarInputPo,
  type TokenBarPo,
  type BarValuesPo,
  type TokenFieldsPo,
  type TokenLayerPo,
  type TokenStylePo,
  type TokenPo,
} from './tokens.po';

/** A token with what hangs on it: bars by position, and who controls it. */
export type TokenRow = Readonly<{
  token: TokenPo;
  bars: readonly TokenBarPo[];
  controllerIds: readonly string[];
}>;

export type NewTokenRow = Readonly<{
  token: NewTokenPo;
  bars: readonly TokenBarInputPo[];
  controllerIds: readonly string[];
}>;

/** Where one token of a group lands. */
export type TokenMovePo = Readonly<{ tokenId: string; col: number; row: number }>;

/** Where one token of a group looks. */
export type TokenFacingPo = Readonly<{ tokenId: string; facing: number }>;
export type TokenBoxPo = Readonly<{
  tokenId: string;
  col: number;
  row: number;
  width: number;
  height: number;
}>;

export type TokenUpdatePo = Readonly<{
  fields: TokenFieldsPo;
  bars: readonly TokenBarInputPo[];
  controllerIds: readonly string[];
}>;

/** What a drag preview checks of one token: where it may go and who controls it. */
export type DragTokenPo = Readonly<{
  token: Pick<TokenPo, 'id' | 'layer' | 'width' | 'height' | 'hidden'>;
  controllerIds: readonly string[];
}>;

/** A token of a scene, who controls it and the anchor it is linked to, if any. */
export type TokenControlPo = Readonly<{
  tokenId: string;
  controllerIds: string[];
  anchorTokenId: string | null;
  hidden: boolean;
}>;

/** A hidden token of a scene as the veil needs it: who sees it and where its light shines from. */
export type HiddenTokenPo = Readonly<{ token: TokenPo; controllerIds: readonly string[] }>;

/** The active scene of a campaign (size and version) and the asked tokens found on it. */
export type DragGroupPo = Readonly<{
  scene: Pick<ScenePo, 'id' | 'widthCells' | 'heightCells' | 'version' | 'visibility' | 'kind'> &
    Readonly<{ isActive: boolean }>;
  tokens: readonly DragTokenPo[];
}>;

// The pairs (old_id, new_id) of a copy, joined by every table that hangs on a token.
const COPY_MAP = sql.raw('copy_map');

/** Tokens of a scene. Writes spanning tables (insert, update) must run on a DAO built with a `tx`. */
export class TokensDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Two statements (see `insertMany`): run it on the `tx` DAO. */
  async insert(row: NewTokenRow): Promise<TokenRow> {
    const [saved] = await this.insertMany([row]);
    if (!saved) throw new Error(`insert into tokens returned no row for ${row.token.name}`);
    return saved;
  }

  /** The whole batch in two statements, whatever its size: the tokens, then their bars and
   *  controllers together. The ids are made here, so each row is matched by id and the result
   *  keeps the order sent. Run it on the `tx` DAO. */
  async insertMany(rows: readonly NewTokenRow[]): Promise<TokenRow[]> {
    if (rows.length === 0) return [];
    const withIds = rows.map((row) => ({
      ...row,
      token: { ...row.token, id: crypto.randomUUID() },
    }));
    const inserted = await this.db
      .insert(tokens)
      .values(withIds.map(({ token }) => token))
      .returning();
    const byId = new Map(inserted.map((token) => [token.id, token]));
    const saved = withIds.map((row) => savedRowOf(row, byId.get(row.token.id)));
    await this.writeHanging(saved);
    return saved;
  }

  /** Copies every token of `fromSceneId` into `toSceneId` with new ids, and what hangs on each:
   *  bars, controllers and conditions (out of any combat: `appliedRound` null). The combat and
   *  the main token choices stay behind. Runs several statements: call it on the `tx` DAO.
   *  Returns the id of each copy by the id of its original. */
  async copyScene(fromSceneId: string, toSceneId: string): Promise<ReadonlyMap<string, string>> {
    const pairs = await this.db
      .select({ oldId: tokens.id, newId: sql<string>`gen_random_uuid()` })
      .from(tokens)
      .where(eq(tokens.sceneId, fromSceneId))
      .orderBy(asc(tokens.createdAt), asc(tokens.id));
    if (pairs.length === 0) return new Map();
    const oldIds = uuidArray(pairs.map(({ oldId }) => oldId));
    const newIds = uuidArray(pairs.map(({ newId }) => newId));
    const map = sql`unnest(${oldIds}, ${newIds}) AS ${COPY_MAP}(old_id, new_id)`;
    await this.copyTokensBy(map, toSceneId);
    await this.copyHangingBy(map);
    return new Map(pairs.map(({ oldId, newId }) => [oldId, newId]));
  }

  async listOfScene(sceneId: string): Promise<TokenRow[]> {
    const found = await this.db
      .select()
      .from(tokens)
      .where(eq(tokens.sceneId, sceneId))
      .orderBy(asc(tokens.createdAt), asc(tokens.id));
    return this.rowsOf(found);
  }

  /** The token only if it is in `sceneId`: an id from another table finds nothing (§2.6). */
  async findInScene(sceneId: string, tokenId: string): Promise<TokenRow | undefined> {
    const [token] = await this.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.sceneId, sceneId), eq(tokens.id, tokenId)));
    return token && this.rowOf(token);
  }

  /** How many tokens the scene has (the ceiling of a create or paste). */
  async countOfScene(sceneId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(tokens)
      .where(eq(tokens.sceneId, sceneId));
    return row?.total ?? 0;
  }

  /** The asked tokens that are in `sceneId`, in one query; ids from elsewhere are skipped. */
  async findManyInScene(sceneId: string, tokenIds: readonly string[]): Promise<TokenRow[]> {
    if (tokenIds.length === 0) return [];
    const found = await this.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.sceneId, sceneId), inArray(tokens.id, [...tokenIds])));
    return this.rowsOf(found);
  }

  /** The drag preview in **one** query and no transaction: the active scene of `campaignId` and
   *  the asked tokens on it with their controllers; ids from elsewhere are skipped (§2.6).
   *  `undefined` only for a campaign without a scene. */
  async findDragGroup(
    campaignId: string,
    sceneId: string | undefined,
    tokenIds: readonly string[],
  ): Promise<DragGroupPo | undefined> {
    const found = await this.db
      .select(DRAG_COLUMNS)
      .from(scenes)
      .innerJoin(campaigns, eq(campaigns.id, scenes.campaignId))
      .leftJoin(tokens, and(eq(tokens.sceneId, scenes.id), inArray(tokens.id, [...tokenIds])))
      .leftJoin(tokenControllers, CONTROLLERS_OF_HOLDER)
      .where(gridOfCampaign(campaignId, sceneId))
      .groupBy(scenes.id, campaigns.id, tokens.id);
    const [first] = found;
    if (!first) return undefined;
    return { scene: first.scene, tokens: found.flatMap(dragTokenOf) };
  }

  /** Who controls each token of the scene (a linked one, by its anchor), in one query and
   *  without the bars nor the token columns: what a combat command checks. */
  async controlOfScene(sceneId: string): Promise<TokenControlPo[]> {
    return this.db
      .select({
        tokenId: tokens.id,
        controllerIds: CONTROLLER_IDS,
        anchorTokenId: tokens.anchorTokenId,
        hidden: tokens.hidden,
      })
      .from(tokens)
      .leftJoin(tokenControllers, CONTROLLERS_OF_HOLDER)
      .where(eq(tokens.sceneId, sceneId))
      .groupBy(tokens.id);
  }

  /** The hidden tokens of the scene (a linked one controlled by its anchor's controllers), in one
   *  query: what the veil of a snapshot or of the hidden lights needs. */
  async veilOfScene(sceneId: string): Promise<HiddenTokenPo[]> {
    return this.db
      .select({ token: tokens, controllerIds: CONTROLLER_IDS })
      .from(tokens)
      .leftJoin(tokenControllers, CONTROLLERS_OF_HOLDER)
      .where(and(eq(tokens.sceneId, sceneId), eq(tokens.hidden, true)))
      .groupBy(tokens.id)
      .orderBy(asc(tokens.createdAt), asc(tokens.id));
  }

  /** Hides or shows the listed tokens; one of another scene is not written (§2.6). Returns the
   *  ids written. */
  async setHidden(
    sceneId: string,
    tokenIds: readonly string[],
    hidden: boolean,
  ): Promise<string[]> {
    if (tokenIds.length === 0) return [];
    const written = await this.db
      .update(tokens)
      .set({ hidden, updatedAt: sql`now()` })
      .where(and(eq(tokens.sceneId, sceneId), inArray(tokens.id, [...tokenIds])))
      .returning({ id: tokens.id });
    return written.map(({ id }) => id);
  }

  async setLayer(tokenIds: readonly string[], layer: TokenLayerPo): Promise<void> {
    await this.db
      .update(tokens)
      .set({ layer, updatedAt: sql`now()` })
      .where(inArray(tokens.id, [...tokenIds]));
  }

  async move(tokenId: string, col: number, row: number): Promise<void> {
    await this.db
      .update(tokens)
      .set({ col, row, updatedAt: sql`now()` })
      .where(eq(tokens.id, tokenId));
  }

  /** One `UPDATE` for the group; a token of another scene in it does not move (§2.6). */
  async moveMany(sceneId: string, moves: readonly TokenMovePo[]): Promise<void> {
    const rows = moves.map(({ tokenId, col, row }) => [tokenId, col, row]);
    await this.updateInScene(sceneId, [CELL_COLUMNS.col, CELL_COLUMNS.row], rows);
  }

  /** One `UPDATE` for the group; a token of another scene in it does not turn (§2.6). */
  async faceMany(sceneId: string, faces: readonly TokenFacingPo[]): Promise<void> {
    const rows = faces.map(({ tokenId, facing }) => [tokenId, facing]);
    await this.updateInScene(sceneId, [{ column: tokens.facing, cast: 'smallint' }], rows);
  }

  /** One `UPDATE` for the group; a token of another scene in it keeps its box (§2.6). */
  async resizeMany(sceneId: string, boxes: readonly TokenBoxPo[]): Promise<void> {
    const rows = boxes.map(({ tokenId, col, row, width, height }) => [
      tokenId,
      col,
      row,
      width,
      height,
    ]);
    await this.updateInScene(sceneId, Object.values(CELL_COLUMNS), rows);
  }

  /** The same look fields (and the defeat mark) on every listed token; an absent field is not written. */
  async restyle(tokenIds: readonly string[], style: Partial<TokenStylePo>): Promise<void> {
    await this.db
      .update(tokens)
      .set({ ...style, updatedAt: sql`now()` })
      .where(inArray(tokens.id, [...tokenIds]));
  }

  async setBarValues(barId: string, { current, max }: BarValuesPo): Promise<void> {
    await this.db.update(tokenBars).set({ current, max }).where(eq(tokenBars.id, barId));
  }

  async update(tokenId: string, update: TokenUpdatePo): Promise<void> {
    await this.db
      .update(tokens)
      .set({ ...update.fields, updatedAt: sql`now()` })
      .where(eq(tokens.id, tokenId));
    await this.db.delete(tokenBars).where(eq(tokenBars.tokenId, tokenId));
    await this.writeBars(tokenId, update.bars);
    await this.db.delete(tokenControllers).where(eq(tokenControllers.tokenId, tokenId));
    await this.writeControllers(tokenId, update.controllerIds);
  }

  /** Writes only the fields given, on the token alone (its bars and controllers stay). */
  async updateFields(tokenId: string, fields: Partial<TokenFieldsPo>): Promise<void> {
    await this.db
      .update(tokens)
      .set({ ...fields, updatedAt: sql`now()` })
      .where(eq(tokens.id, tokenId));
  }

  async delete(tokenId: string): Promise<void> {
    await this.db.delete(tokens).where(eq(tokens.id, tokenId));
  }

  /** Deletes only the tokens of `sceneId`; bars, controllers and combatants go by cascade. */
  async deleteMany(sceneId: string, tokenIds: readonly string[]): Promise<void> {
    if (tokenIds.length === 0) return;
    await this.db
      .delete(tokens)
      .where(and(eq(tokens.sceneId, sceneId), inArray(tokens.id, [...tokenIds])));
  }

  /** The token of `sceneId` linked to `anchorTokenId`, if the grid has one (one at most).
   *
   *  Example: `await tokensDao.findLinkedInScene(estradaId, lyraAnchorId)` */
  async findLinkedInScene(sceneId: string, anchorTokenId: string): Promise<TokenRow | undefined> {
    const [token] = await this.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.sceneId, sceneId), eq(tokens.anchorTokenId, anchorTokenId)));
    return token && this.rowOf(token);
  }

  private async copyTokensBy(map: SQL, toSceneId: string): Promise<void> {
    const replaced = { id: sql`${COPY_MAP}.new_id`, sceneId: sql`${toSceneId}::uuid` };
    const source = sql`FROM ${tokens} JOIN ${map} ON ${tokens.id} = ${COPY_MAP}.old_id`;
    await this.db.execute(copyRowsSql(tokens, replaced, source));
  }

  private async copyHangingBy(map: SQL): Promise<void> {
    const newId = sql`${COPY_MAP}.new_id`;
    const fresh = sql`gen_random_uuid()`;
    const barsSource = sql`FROM ${tokenBars} JOIN ${map} ON ${tokenBars.tokenId} = ${COPY_MAP}.old_id`;
    await this.db.execute(copyRowsSql(tokenBars, { id: fresh, tokenId: newId }, barsSource));
    const controllers = sql`FROM ${tokenControllers} JOIN ${map} ON ${tokenControllers.tokenId} = ${COPY_MAP}.old_id`;
    await this.db.execute(copyRowsSql(tokenControllers, { tokenId: newId }, controllers));
    const conditions = sql`FROM ${activeConditions} JOIN ${map} ON ${activeConditions.tokenId} = ${COPY_MAP}.old_id`;
    const outOfCombat = { id: fresh, tokenId: newId, appliedRound: sql`NULL::integer` };
    await this.db.execute(copyRowsSql(activeConditions, outOfCombat, conditions));
  }

  private async updateInScene(
    sceneId: string,
    columns: readonly UpdatedColumn[],
    rows: readonly (readonly unknown[])[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const where = eq(tokens.sceneId, sceneId);
    const alsoSet = sql`${sql.identifier(tokens.updatedAt.name)} = now()`;
    await this.db.execute(
      updateManySql({ table: tokens, key: tokens.id, columns, rows, where, alsoSet }),
    );
  }

  // Bars and controllers of a whole batch in one statement (a data-modifying WITH).
  private async writeHanging(saved: readonly TokenRow[]): Promise<void> {
    const bars = saved.flatMap((row) => row.bars);
    const controllers = saved.flatMap(({ token, controllerIds }) =>
      controllerIds.map((userId) => ({ tokenId: token.id, userId })),
    );
    const barsInsert = bars.length > 0 ? this.db.insert(tokenBars).values(bars).getSQL() : null;
    const controllersInsert =
      controllers.length > 0 ? this.db.insert(tokenControllers).values(controllers).getSQL() : null;
    if (barsInsert && controllersInsert) {
      await this.db.execute(sql`WITH written_bars AS (${barsInsert}) ${controllersInsert}`);
      return;
    }
    const only = barsInsert ?? controllersInsert;
    if (only) await this.db.execute(only);
  }

  private async writeBars(tokenId: string, bars: readonly TokenBarInputPo[]): Promise<void> {
    if (bars.length === 0) return;
    const rows = bars.map((bar, position) => ({ ...bar, tokenId, position }));
    await this.db.insert(tokenBars).values(rows);
  }

  private async writeControllers(tokenId: string, userIds: readonly string[]): Promise<void> {
    if (userIds.length === 0) return;
    await this.db.insert(tokenControllers).values(userIds.map((userId) => ({ tokenId, userId })));
  }

  private async rowOf(token: TokenPo): Promise<TokenRow> {
    const [row] = await this.rowsOf([token]);
    if (!row) throw new Error(`token ${token.id} vanished while its bars were read`);
    return row;
  }

  // A linked token comes composed with its anchor; one more read only when some token is linked.
  private async rowsOf(found: readonly TokenPo[]): Promise<TokenRow[]> {
    const own = await this.hangingOf(found);
    const anchorIds = [...new Set(found.flatMap(({ anchorTokenId: id }) => (id ? [id] : [])))];
    if (anchorIds.length === 0) return own;
    const anchorTokens = await this.db.select().from(tokens).where(inArray(tokens.id, anchorIds));
    const anchors = new Map((await this.hangingOf(anchorTokens)).map((a) => [a.token.id, a]));
    return own.map((row) => composedTokenRow(row, anchors.get(row.token.anchorTokenId ?? '')));
  }

  private async hangingOf(found: readonly TokenPo[]): Promise<TokenRow[]> {
    if (found.length === 0) return [];
    const ids = found.map(({ id }) => id);
    const bars = await this.db
      .select()
      .from(tokenBars)
      .where(inArray(tokenBars.tokenId, ids))
      .orderBy(asc(tokenBars.position));
    const controllers = await this.db
      .select()
      .from(tokenControllers)
      .where(inArray(tokenControllers.tokenId, ids));
    return found.map((token) => ({
      token,
      bars: bars.filter((bar) => bar.tokenId === token.id),
      controllerIds: controllers.filter((c) => c.tokenId === token.id).map((c) => c.userId),
    }));
  }
}

// A linked token is controlled by whoever controls its anchor.
const CONTROLLERS_OF_HOLDER = eq(
  tokenControllers.tokenId,
  sql`coalesce(${tokens.anchorTokenId}, ${tokens.id})`,
);

// The controllers of the grouped token, `{}` for none (the LEFT JOIN gives one null row then).
const CONTROLLER_IDS = sql<
  string[]
>`coalesce(array_agg(${tokenControllers.userId}::text) filter (where ${tokenControllers.userId} is not null), '{}')`;

const DRAG_COLUMNS = {
  scene: {
    id: scenes.id,
    widthCells: scenes.widthCells,
    heightCells: scenes.heightCells,
    version: scenes.version,
    visibility: scenes.visibility,
    kind: scenes.kind,
    isActive: IS_GROUP_GRID,
  },
  tokenId: tokens.id,
  layer: tokens.layer,
  width: tokens.width,
  height: tokens.height,
  hidden: tokens.hidden,
  controllerIds: CONTROLLER_IDS,
};

type DragColumnsRow = Readonly<{
  tokenId: string | null;
  layer: TokenPo['layer'] | null;
  width: number | null;
  height: number | null;
  hidden: boolean | null;
  controllerIds: string[];
}>;

// The scene comes once per token row; a scene with none of the tokens still comes, with nulls.
function dragTokenOf(row: DragColumnsRow): DragTokenPo[] {
  const { tokenId: id, layer, width, height, controllerIds } = row;
  if (id === null || layer === null || width === null || height === null) return [];
  return [{ token: { id, layer, width, height, hidden: row.hidden ?? false }, controllerIds }];
}

const CELL_COLUMNS = {
  col: { column: tokens.col, cast: 'double precision' },
  row: { column: tokens.row, cast: 'double precision' },
  width: { column: tokens.width, cast: 'double precision' },
  height: { column: tokens.height, cast: 'double precision' },
} as const satisfies Record<string, UpdatedColumn>;

const BAR_DISPLAY_DEFAULT = 'number';

// The row as saved: the token Postgres returned and the bars as written (ids made here).
function savedRowOf(
  row: NewTokenRow & { token: { id: string } },
  token: TokenPo | undefined,
): TokenRow {
  if (!token) throw new Error(`insert into tokens returned no row for ${row.token.id}`);
  const bars: TokenBarPo[] = row.bars.map((bar, position) => ({
    ...bar,
    display: bar.display ?? BAR_DISPLAY_DEFAULT,
    id: crypto.randomUUID(),
    tokenId: token.id,
    position,
  }));
  return { token, bars, controllerIds: [...row.controllerIds] };
}
