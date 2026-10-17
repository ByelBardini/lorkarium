import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../database/transaction';
import {
  tokenBars,
  tokenControllers,
  tokens,
  type NewTokenPo,
  type TokenBarInputPo,
  type TokenBarPo,
  type TokenFieldsPo,
  type TokenLayerPo,
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

export type TokenUpdatePo = Readonly<{
  fields: TokenFieldsPo;
  bars: readonly TokenBarInputPo[];
  controllerIds: readonly string[];
}>;

/** Tokens of a scene. Writes spanning tables (insert, update) must run on a DAO built with a `tx`. */
export class TokensDao {
  constructor(private readonly db: DatabaseExecutor) {}

  async insert(row: NewTokenRow): Promise<TokenRow> {
    const [token] = await this.db.insert(tokens).values(row.token).returning();
    if (!token) throw new Error(`insert into tokens returned no row for ${row.token.name}`);
    await this.writeBars(token.id, row.bars);
    await this.writeControllers(token.id, row.controllerIds);
    return this.rowOf(token);
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

  /** The asked tokens that are in `sceneId`, in one query; ids from elsewhere are skipped. */
  async findManyInScene(sceneId: string, tokenIds: readonly string[]): Promise<TokenRow[]> {
    if (tokenIds.length === 0) return [];
    const found = await this.db
      .select()
      .from(tokens)
      .where(and(eq(tokens.sceneId, sceneId), inArray(tokens.id, [...tokenIds])));
    return this.rowsOf(found);
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

  /** One `UPDATE` per token (a group is at most 64): run it on the DAO built with the `tx`. */
  async moveMany(moves: readonly TokenMovePo[]): Promise<void> {
    for (const { tokenId, col, row } of moves) await this.move(tokenId, col, row);
  }

  async setBarCurrent(barId: string, current: number): Promise<void> {
    await this.db.update(tokenBars).set({ current }).where(eq(tokenBars.id, barId));
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

  async delete(tokenId: string): Promise<void> {
    await this.db.delete(tokens).where(eq(tokens.id, tokenId));
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

  private async rowsOf(found: readonly TokenPo[]): Promise<TokenRow[]> {
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
