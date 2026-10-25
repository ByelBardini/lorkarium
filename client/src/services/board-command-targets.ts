import type {
  CreateTokenCommandInput,
  TokenStyleDto,
  UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { TokenBox } from '@lorkarium/game-core';

/** The fields every board command carries; the sender fills them in. */
export type CommandEnvelope = 'actionId' | 'campaignId' | 'sceneId';
// The input type: a token sent without `layer` lands on `tokens`.
export type NewToken = Omit<CreateTokenCommandInput, CommandEnvelope>;
export type TokenEdit = Omit<UpdateTokenCommandDto, CommandEnvelope | 'tokenId'>;
export type CellTarget = Readonly<{ col: number; row: number }>;
/** Where one token of a group lands. */
export type TokenPlacement = Readonly<{ tokenId: string; col: number; row: number }>;
/** A token move; `expect` (an undo) is the cell it must still be on, or STALE_UNDO. */
export type TokenMoveTarget = TokenPlacement &
  Readonly<{ expect?: CellTarget; path?: readonly CellTarget[] }>;
export type DrawingPosition = Readonly<{ x: number; y: number }>;
/** Where one drawing of a group is (or must still be), in fractional cells. */
export type DrawingPlacement = Readonly<{ drawingId: string }> & DrawingPosition;
/** A drawing move; `expect` (an undo) is where it must still be, or STALE_UNDO. */
export type DrawingMoveTarget = DrawingPlacement & Readonly<{ expect?: DrawingPosition }>;
/** The box one token of a group gets; `expect` (an undo) is the box it must still have. */
export type TokenResizeTarget = TokenBox & Readonly<{ tokenId: string; expect?: TokenBox }>;

/** Where one token of a group turns to; `expect` (an undo) is the facing it must still have. */
export type TokenFacingTarget = Readonly<{
  tokenId: string;
  facing: number;
  expect?: Readonly<{ facing: number }>;
}>;
/** The look fields to change on a group; an absent field stays, `imageAssetId: null` drops it. */
export type TokenStyle = TokenStyleDto;
/** The cell one token of a group is dragged over; `null` ends its drag with no move. */
export type TokenDragTarget = Readonly<{ tokenId: string; cell: CellTarget | null }>;
