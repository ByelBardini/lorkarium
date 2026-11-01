import { eq, sql } from 'drizzle-orm';
import { copyRowsSql } from '../../database/copy-rows';
import type { DatabaseExecutor } from '../../database/transaction';
import { activeConditions } from '../conditions/conditions.po';
import type { TokenIdentityPo } from './linked-token';
import { tokenBars, tokenControllers, tokens } from './tokens.po';

/** The writes that link a token to a character's anchor and back. Several statements each: run
 *  them on a DAO built with the `tx`.
 *
 *  Example: `await new TokenAnchorsDao(tx).linkToAnchor(lyraId, anchorId)` */
export class TokenAnchorsDao {
  constructor(private readonly db: DatabaseExecutor) {}

  /** Links the token to the anchor (which still holds its conditions) and to the character it
   *  wears from now on (`null` = the card's player has none). */
  async linkToAnchor(
    tokenId: string,
    anchorTokenId: string,
    characterId: string | null,
  ): Promise<void> {
    await this.db
      .update(tokens)
      .set({ anchorTokenId, characterId, updatedAt: sql`now()` })
      .where(eq(tokens.id, tokenId));
  }

  /** Unlinks the token from its anchor and its character, writing on it the identity it showed
   *  (the character's). */
  async unlinkWith(tokenId: string, identity: TokenIdentityPo): Promise<void> {
    await this.db
      .update(tokens)
      .set({ ...identity, anchorTokenId: null, characterId: null, updatedAt: sql`now()` })
      .where(eq(tokens.id, tokenId));
  }

  /** Hands the bars, conditions and controllers of `fromTokenId` over to `toTokenId` (the new
   *  anchor of a first link). */
  async moveStateTo(fromTokenId: string, toTokenId: string): Promise<void> {
    await this.db
      .update(tokenBars)
      .set({ tokenId: toTokenId })
      .where(eq(tokenBars.tokenId, fromTokenId));
    await this.db
      .update(activeConditions)
      .set({ tokenId: toTokenId })
      .where(eq(activeConditions.tokenId, fromTokenId));
    await this.db
      .update(tokenControllers)
      .set({ tokenId: toTokenId })
      .where(eq(tokenControllers.tokenId, fromTokenId));
  }

  /** Copies the bars (new ids), conditions (new ids, same rounds) and controllers of
   *  `fromTokenId` onto `toTokenId`: a token leaving its anchor keeps what it showed. */
  async copyStateTo(fromTokenId: string, toTokenId: string): Promise<void> {
    const to = sql`${toTokenId}::uuid`;
    const fresh = { id: sql`gen_random_uuid()`, tokenId: to };
    const bars = sql`FROM ${tokenBars} WHERE ${tokenBars.tokenId} = ${fromTokenId}`;
    await this.db.execute(copyRowsSql(tokenBars, fresh, bars));
    const conditions = sql`FROM ${activeConditions} WHERE ${activeConditions.tokenId} = ${fromTokenId}`;
    await this.db.execute(copyRowsSql(activeConditions, fresh, conditions));
    const controllers = sql`FROM ${tokenControllers} WHERE ${tokenControllers.tokenId} = ${fromTokenId}`;
    await this.db.execute(copyRowsSql(tokenControllers, { tokenId: to }, controllers));
  }

  /** Drops the bars, conditions and controllers of the token: linked, it reads its anchor's. */
  async dropState(tokenId: string): Promise<void> {
    await this.db.delete(tokenBars).where(eq(tokenBars.tokenId, tokenId));
    await this.db.delete(activeConditions).where(eq(activeConditions.tokenId, tokenId));
    await this.db.delete(tokenControllers).where(eq(tokenControllers.tokenId, tokenId));
  }
}
