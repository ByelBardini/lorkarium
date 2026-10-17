import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { cellIndexDto, draggedCellDto, tokenLayerDto } from './token.dto';
import { tokenGroupOf, tokenIdGroupDto } from './token-id-group.dto';

const tokenCellDto = z.strictObject({ tokenId: z.uuid(), col: cellIndexDto, row: cellIndexDto });
export type TokenCellDto = z.infer<typeof tokenCellDto>;

const tokenDragDto = z.strictObject({ tokenId: z.uuid(), cell: draggedCellDto });
export type TokenDragDto = z.infer<typeof tokenDragDto>;

/** `token:moveMany` (master or a controller of every token): all or nothing, one version.
 *
 *  Example: `moveTokensCommandDto.parse({ actionId, campaignId, moves: [{ tokenId, col: 4, row: 2 }] })` */
export const moveTokensCommandDto = z.strictObject({
  ...boardCommandShape,
  moves: tokenGroupOf(tokenCellDto, (move) => move.tokenId),
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

export const tokensMovedDto = z.strictObject({ ...boardEventShape, moves: z.array(tokenCellDto) });
export type TokensMovedDto = z.infer<typeof tokensMovedDto>;

/** `token:draggedMany`: a preview, not a confirmed change, so it carries no version (§5.5 covers
 *  the confirmed move that ends the drag). A `null` cell puts that token back where it is. */
export const tokensDraggedDto = z.strictObject({
  campaignId: z.uuid(),
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
