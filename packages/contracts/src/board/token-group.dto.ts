import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { combatDto } from './combat.dto';
import {
  cellIndexDto,
  createTokenCommandDto,
  draggedCellDto,
  movePathDto,
  tokenDto,
  tokenLayerDto,
} from './token.dto';
import {
  strayExpectation,
  TOKEN_GROUP_MAX,
  tokenGroupOf,
  tokenIdGroupDto,
} from './token-id-group.dto';

const tokenCellDto = z.strictObject({ tokenId: z.uuid(), col: cellIndexDto, row: cellIndexDto });
export type TokenCellDto = z.infer<typeof tokenCellDto>;

/** A move as sent: `expect` is the cell the token must still be on (the undo precondition),
 *  `path` the bends around walls. */
const tokenMoveDto = tokenCellDto.extend({
  expect: z.strictObject({ col: cellIndexDto, row: cellIndexDto }).optional(),
  path: movePathDto.optional(),
});
export type TokenMoveDto = z.infer<typeof tokenMoveDto>;

/** One token of `token:createMany`: the body of `token:create` without `actionId`/`campaignId`;
 *  `combatantId` is the entry of the copied original, which the paste joins when it is still there. */
export const newTokenDto = createTokenCommandDto
  .omit({ actionId: true, campaignId: true })
  .extend({ combatantId: z.uuid().optional(), hidden: z.boolean().default(false) });
export type NewTokenDto = z.infer<typeof newTokenDto>;
export type NewTokenInput = z.input<typeof newTokenDto>;

const tokenDragDto = z.strictObject({ tokenId: z.uuid(), cell: draggedCellDto });
export type TokenDragDto = z.infer<typeof tokenDragDto>;

/** `token:moveMany` (master or a controller of every token): all or nothing, one version. A move
 *  with `expect` is refused with `STALE_UNDO` when the token is no longer there.
 *
 *  Example: `moveTokensCommandDto.parse({ actionId, campaignId, moves: [{ tokenId, col: 4, row: 2 }] })` */
export const moveTokensCommandDto = z.strictObject({
  ...boardCommandShape,
  moves: tokenGroupOf(tokenMoveDto, (move) => move.tokenId),
});
export type MoveTokensCommandDto = z.infer<typeof moveTokensCommandDto>;

/** `token:dragMany`: the cell each grouped token is being dragged over; `cell: null` ends the
 *  drag without a move. Nothing is saved and the version stays.
 *
 *  Example: `dragTokensCommandDto.parse({ actionId, campaignId, drags: [{ tokenId, cell: null }] })` */
export const dragTokensCommandDto = z.strictObject({
  ...boardCommandShape,
  drags: tokenGroupOf(tokenDragDto, (drag) => drag.tokenId),
});
export type DragTokensCommandDto = z.infer<typeof dragTokensCommandDto>;

/** `token:setLayer` (master): moves 1 to 64 tokens to one layer, all or nothing.
 *
 *  Example: `setTokenLayerCommandDto.parse({ actionId, campaignId, tokenIds: [id], layer: 'objects' })` */
export const setTokenLayerCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenIds: tokenIdGroupDto,
  layer: tokenLayerDto,
});
export type SetTokenLayerCommandDto = z.infer<typeof setTokenLayerCommandDto>;

/** `token:createMany` (master): 1 to 64 tokens (a paste), all or nothing, one version.
 *
 *  Example: `createTokensCommandDto.parse({ actionId, campaignId, tokens: [goblin, goblin] })` */
export const createTokensCommandDto = z.strictObject({
  ...boardCommandShape,
  tokens: z.array(newTokenDto).min(1).max(TOKEN_GROUP_MAX),
});
export type CreateTokensCommandDto = z.infer<typeof createTokensCommandDto>;

/** `token:deleteMany` (master): all or nothing, one version; `expect` lists the cell each token must
 *  still be on (undoing a paste), and the turn passes on as in `token:delete`.
 *
 *  Example: `deleteTokensCommandDto.parse({ actionId, campaignId, tokenIds: [id] })` */
export const deleteTokensCommandDto = z
  .strictObject({
    ...boardCommandShape,
    tokenIds: tokenIdGroupDto,
    expect: z.array(tokenCellDto).max(TOKEN_GROUP_MAX).optional(),
  })
  .superRefine((command, context) => {
    const stray = strayExpectation(
      command.tokenIds,
      (command.expect ?? []).map((expected) => expected.tokenId),
    );
    if (stray === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `token ${stray} is not being deleted; expected only ids in tokenIds`,
    });
  });
export type DeleteTokensCommandDto = z.infer<typeof deleteTokensCommandDto>;

/** `token:createdMany`: each audience gets its own redacted copy, as in `token:created`; `combat`
 *  is the combat after the copies joined the entries of their originals, or `null` with none. */
export const tokensCreatedDto = z.strictObject({
  ...boardEventShape,
  tokens: z.array(tokenDto),
  combat: combatDto.nullable(),
});
export type TokensCreatedDto = z.infer<typeof tokensCreatedDto>;

/** `combat` is the combat after the tokens left it (the turn may have passed), or `null` with none. */
export const tokensDeletedDto = z.strictObject({
  ...boardEventShape,
  tokenIds: z.array(z.uuid()),
  combat: combatDto.nullable(),
});
export type TokensDeletedDto = z.infer<typeof tokensDeletedDto>;

export const tokensMovedDto = z.strictObject({ ...boardEventShape, moves: z.array(tokenCellDto) });
export type TokensMovedDto = z.infer<typeof tokensMovedDto>;

/** `token:draggedMany`: a preview, not a confirmed change, so it carries no version (§5.5 covers
 *  the confirmed move that ends the drag). A `null` cell puts that token back where it is. */
export const tokensDraggedDto = z.strictObject({
  campaignId: z.uuid(),
  sceneId: z.uuid().optional(),
  at: z.iso.datetime(),
  drags: z.array(tokenDragDto),
});
export type TokensDraggedDto = z.infer<typeof tokensDraggedDto>;

/** `token:layerChanged`: the layer is not a secret, so the whole table gets the same event. */
export const tokenLayerChangedDto = z.strictObject({
  ...boardEventShape,
  tokenIds: z.array(z.uuid()),
  layer: tokenLayerDto,
});
export type TokenLayerChangedDto = z.infer<typeof tokenLayerChangedDto>;
