import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { tokenBoxShape } from './half-cell.dto';
import { tokenGroupOf } from './token-id-group.dto';

/** Where a token stands and how much it covers after a resize. */
const tokenBoxDto = z.strictObject({ tokenId: z.uuid(), ...tokenBoxShape });
export type TokenBoxDto = z.infer<typeof tokenBoxDto>;

/** A resize as sent: `expect` is the box the token must still have (the undo precondition). */
const tokenResizeDto = tokenBoxDto.extend({ expect: z.strictObject(tokenBoxShape).optional() });
export type TokenResizeDto = z.infer<typeof tokenResizeDto>;

/** `token:resizeMany` (master, or a controller on any layer): all or nothing, one version.
 *  The left and top handles move the origin, so the box carries the position too.
 *
 *  Example: `resizeTokensCommandDto.parse({ actionId, campaignId, resizes: [{ tokenId, col: 2, row: 3, width: 3, height: 2 }] })` */
export const resizeTokensCommandDto = z.strictObject({
  ...boardCommandShape,
  resizes: tokenGroupOf(tokenResizeDto, (resize) => resize.tokenId),
});
export type ResizeTokensCommandDto = z.infer<typeof resizeTokensCommandDto>;

/** `token:resizedMany`: the size is not a secret, so the whole table gets the same event. */
export const tokensResizedDto = z.strictObject({
  ...boardEventShape,
  resizes: z.array(tokenBoxDto),
});
export type TokensResizedDto = z.infer<typeof tokensResizedDto>;
