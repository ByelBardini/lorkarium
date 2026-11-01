import { and, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import { copyRowsSql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { characterBars, characterControllers } from '../characters/characters.po';
import { activeConditions } from '../conditions/conditions.po';
import type { TokenIdentityPo } from './linked-token';
import { tokenBars, tokenControllers, tokens } from './tokens.po';

// The bar columns both tables share (all but the id and the holder), in the table's order.
const sharedBarColumns: SQL = sql.join(
  Object.values(getTableColumns(characterBars))
    .map(({ name }) => name)
    .filter((name) => name !== 'id' && name !== 'character_id')
    .map((name) => sql.identifier(name)),
  sql`, `,
);

/** The writes that link a grid token to a character of the table and back. Several statements
 *  each: run them on a DAO built with the `tx`.
 *
 *  Example: `await new TokenCharacterLinkDao(tx).adopt(kaelId, lyraId)` */
export class TokenCharacterLinkDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** The token of the character already on the scene, if any (one per grid). */
  async placedOn(sceneId: string, characterId: string): Promise<{ id: string } | undefined> {
    const [placed] = await this.db
      .select({ id: tokens.id })
      .from(tokens)
      .where(and(eq(tokens.sceneId, sceneId), eq(tokens.characterId, characterId)))
      .limit(1);
    return placed;
  }

  /** The token wears the character from now on: its own bars, conditions and controllers go
   *  (it shows the character's), and so does a link to an old anchor. */
  async adopt(tokenId: string, characterId: string): Promise<void> {
    await this.dropOwnState(tokenId);
    await this.db
      .update(tokens)
      .set({ characterId, anchorTokenId: null, updatedAt: sql`now()` })
      .where(eq(tokens.id, tokenId));
  }

  /** The token stops wearing the character and keeps a copy of what it showed: the identity, the
   *  bars (new ids, same positions), the controllers and the conditions (new ids, same rounds).
   *  The character stays as it is. */
  async release(tokenId: string, characterId: string, identity: TokenIdentityPo): Promise<void> {
    await this.dropOwnState(tokenId);
    const to = sql`${tokenId}::uuid`;
    await this.db.execute(
      sql`INSERT INTO ${tokenBars} ("id", "token_id", ${sharedBarColumns}) SELECT gen_random_uuid(), ${to}, ${sharedBarColumns} FROM ${characterBars} WHERE ${characterBars.characterId} = ${characterId}`,
    );
    await this.db.execute(
      sql`INSERT INTO ${tokenControllers} ("token_id", "user_id") SELECT ${to}, "user_id" FROM ${characterControllers} WHERE ${characterControllers.characterId} = ${characterId}`,
    );
    const held = sql`FROM ${activeConditions} WHERE ${activeConditions.characterId} = ${characterId}`;
    const fresh = { id: sql`gen_random_uuid()`, tokenId: to, characterId: sql`NULL::uuid` };
    await this.db.execute(copyRowsSql(activeConditions, fresh, held));
    await this.db
      .update(tokens)
      .set({ ...identity, characterId: null, anchorTokenId: null, updatedAt: sql`now()` })
      .where(eq(tokens.id, tokenId));
  }

  private async dropOwnState(tokenId: string): Promise<void> {
    await this.db.delete(tokenBars).where(eq(tokenBars.tokenId, tokenId));
    await this.db.delete(activeConditions).where(eq(activeConditions.tokenId, tokenId));
    await this.db.delete(tokenControllers).where(eq(tokenControllers.tokenId, tokenId));
  }
}
