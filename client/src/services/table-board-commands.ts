import {
  BOARD_EVENTS,
  type BarChangeDto,
  type CreateTokenCommandInput,
  type DrawingShapeInput,
  type SceneGridDto,
  type SceneVisionDto,
  type TokenLayerDto,
  type TokenStyleDto,
  type UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { TokenBox } from '@lorkarium/game-core';
import { BoardCommandSender, type BoardCommandResult } from './board-command-sender';
import { RealtimeCombatCommands, type CombatCommands } from './combat-commands';
import {
  RealtimeLightCommands,
  type LightAt,
  type LightCommands,
  type LightMoveTarget,
  type LightPlacement,
  type LightColorTarget,
  type LightRangeTarget,
} from './light-commands';
import {
  RealtimeEffectAreaCommands,
  type EffectAreaCommands,
  type EffectAreaReshapeTarget,
  type EffectAreaShape,
  type EffectAreaShaped,
} from './effect-area-commands';
import type { RealtimeTransport } from './realtime-transport';
import {
  RealtimeWallCommands,
  type DoorState,
  type WallCommands,
  type WallKind,
  type WallKindOf,
  type WallEraseBox,
  type WallPosition,
  type WallPlacement,
  type WallShape,
} from './wall-commands';

export type { BoardCommandFailure, BoardCommandResult } from './board-command-sender';
export type { NewConditionDefinition } from './combat-commands';

type Envelope = 'actionId' | 'campaignId';
// The input type: a token sent without `layer` lands on `tokens`.
export type NewToken = Omit<CreateTokenCommandInput, Envelope>;
export type TokenEdit = Omit<UpdateTokenCommandDto, Envelope | 'tokenId'>;
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

/** Board commands of an open table; each answers with its ack, never throws. The confirmed
 *  change itself arrives as an event, like everyone else's.
 *
 *  Example: `const result = await boardCommands.moveToken(campaignId, tokenId, { col, row })` */
export interface TableBoardCommands
  extends CombatCommands, EffectAreaCommands, WallCommands, LightCommands {
  /** `backgroundAssetId`: an asset of the table sets the background, `null` takes it away,
   *  absent keeps it; `vision` absent keeps the scene's mode. */
  configureScene(
    campaignId: string,
    grid: SceneGridDto,
    backgroundAssetId?: string | null,
    vision?: SceneVisionDto,
  ): Promise<BoardCommandResult>;
  createToken(campaignId: string, token: NewToken): Promise<BoardCommandResult>;
  updateToken(campaignId: string, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult>;
  /** `path`: the bends around walls (absent or empty: a straight move). */
  moveToken(
    campaignId: string,
    tokenId: string,
    to: CellTarget,
    path?: readonly CellTarget[],
  ): Promise<BoardCommandResult>;
  /** A group move: all or nothing, in one version. */
  moveTokens(campaignId: string, moves: readonly TokenMoveTarget[]): Promise<BoardCommandResult>;
  /** A paste of tokens (master): all or nothing, in one version. */
  createTokens(campaignId: string, tokens: readonly NewToken[]): Promise<BoardCommandResult>;
  /** Deletes tokens (undoing a paste); `expect` is where each must still be. */
  deleteTokens(
    campaignId: string,
    tokenIds: readonly string[],
    expect?: readonly TokenPlacement[],
  ): Promise<BoardCommandResult>;
  createDrawings(
    campaignId: string,
    drawings: readonly DrawingShapeInput[],
  ): Promise<BoardCommandResult>;
  moveDrawings(
    campaignId: string,
    moves: readonly DrawingMoveTarget[],
  ): Promise<BoardCommandResult>;
  deleteDrawings(
    campaignId: string,
    drawingIds: readonly string[],
    expect?: readonly DrawingPlacement[],
  ): Promise<BoardCommandResult>;
  /** The cells a group (one token is a group of one) is dragged over, for the others to see;
   *  a `null` cell ends that token's drag with no move. Nothing is saved: the ack carries the
   *  version as it stands. */
  dragTokens(campaignId: string, drags: readonly TokenDragTarget[]): Promise<BoardCommandResult>;
  setTokenLayer(
    campaignId: string,
    tokenIds: readonly string[],
    layer: TokenLayerDto,
  ): Promise<BoardCommandResult>;
  /** Turns a group (master or controllers, tokens layer), all or nothing in one version. */
  faceTokens(campaignId: string, faces: readonly TokenFacingTarget[]): Promise<BoardCommandResult>;
  /** Sizes and origins after the handles (`token:resizeMany`); the controllers' to choose. */
  resizeTokens(
    campaignId: string,
    resizes: readonly TokenResizeTarget[],
  ): Promise<BoardCommandResult>;
  /** Changes the look of a group (master or controllers), all or nothing in one version. */
  restyleTokens(
    campaignId: string,
    tokenIds: readonly string[],
    style: TokenStyle,
  ): Promise<BoardCommandResult>;
  adjustBar(
    campaignId: string,
    tokenId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult>;
  deleteToken(campaignId: string, tokenId: string): Promise<BoardCommandResult>;
}

/** `TableBoardCommands` over the same realtime transport as the table session.
 *
 *  Example: `new RealtimeTableBoardCommands(transport, () => crypto.randomUUID())` */
export class RealtimeTableBoardCommands
  extends RealtimeCombatCommands
  implements TableBoardCommands
{
  private readonly effectAreas: EffectAreaCommands;
  private readonly walls: WallCommands;
  private readonly lights: LightCommands;

  constructor(transport: RealtimeTransport, newActionId: () => string) {
    super(new BoardCommandSender(transport, newActionId));
    this.effectAreas = new RealtimeEffectAreaCommands(this.sender);
    this.walls = new RealtimeWallCommands(this.sender);
    this.lights = new RealtimeLightCommands(this.sender);
  }

  createLights(campaignId: string, lights: readonly LightPlacement[]): Promise<BoardCommandResult> {
    return this.lights.createLights(campaignId, lights);
  }

  moveLights(campaignId: string, moves: readonly LightMoveTarget[]): Promise<BoardCommandResult> {
    return this.lights.moveLights(campaignId, moves);
  }

  setLightRanges(
    campaignId: string,
    changes: readonly LightRangeTarget[],
  ): Promise<BoardCommandResult> {
    return this.lights.setLightRanges(campaignId, changes);
  }

  setLightColors(
    campaignId: string,
    changes: readonly LightColorTarget[],
  ): Promise<BoardCommandResult> {
    return this.lights.setLightColors(campaignId, changes);
  }

  setLightsLit(
    campaignId: string,
    lightIds: readonly string[],
    lit: boolean,
  ): Promise<BoardCommandResult> {
    return this.lights.setLightsLit(campaignId, lightIds, lit);
  }

  deleteLights(
    campaignId: string,
    lightIds: readonly string[],
    expect?: readonly LightAt[],
  ): Promise<BoardCommandResult> {
    return this.lights.deleteLights(campaignId, lightIds, expect);
  }

  createWalls(campaignId: string, shapes: readonly WallShape[]): Promise<BoardCommandResult> {
    return this.walls.createWalls(campaignId, shapes);
  }

  eraseWallArea(campaignId: string, box: WallEraseBox): Promise<BoardCommandResult> {
    return this.walls.eraseWallArea(campaignId, box);
  }

  eraseWallSegment(
    campaignId: string,
    wallId: string,
    segmentIndex: number,
    expect?: WallPosition,
  ): Promise<BoardCommandResult> {
    return this.walls.eraseWallSegment(campaignId, wallId, segmentIndex, expect);
  }

  deleteWalls(
    campaignId: string,
    wallIds: readonly string[],
    expect?: readonly WallPlacement[],
  ): Promise<BoardCommandResult> {
    return this.walls.deleteWalls(campaignId, wallIds, expect);
  }

  setWallKinds(
    campaignId: string,
    wallIds: readonly string[],
    kind: WallKind,
    expect?: readonly WallKindOf[],
  ): Promise<BoardCommandResult> {
    return this.walls.setWallKinds(campaignId, wallIds, kind, expect);
  }

  setDoor(campaignId: string, wallId: string, state: DoorState): Promise<BoardCommandResult> {
    return this.walls.setDoor(campaignId, wallId, state);
  }

  createEffectAreas(
    campaignId: string,
    shapes: readonly EffectAreaShape[],
  ): Promise<BoardCommandResult> {
    return this.effectAreas.createEffectAreas(campaignId, shapes);
  }

  reshapeEffectAreas(
    campaignId: string,
    reshapes: readonly EffectAreaReshapeTarget[],
  ): Promise<BoardCommandResult> {
    return this.effectAreas.reshapeEffectAreas(campaignId, reshapes);
  }

  deleteEffectAreas(
    campaignId: string,
    effectAreaIds: readonly string[],
    expect?: readonly EffectAreaShaped[],
  ): Promise<BoardCommandResult> {
    return this.effectAreas.deleteEffectAreas(campaignId, effectAreaIds, expect);
  }

  configureScene(
    campaignId: string,
    grid: SceneGridDto,
    backgroundAssetId?: string | null,
    vision?: SceneVisionDto,
  ): Promise<BoardCommandResult> {
    const background = backgroundAssetId === undefined ? {} : { backgroundAssetId };
    const mode = vision === undefined ? {} : { vision };
    return this.send(BOARD_EVENTS.configureScene, campaignId, { ...grid, ...background, ...mode });
  }

  createToken(campaignId: string, token: NewToken): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createToken, campaignId, token);
  }

  updateToken(campaignId: string, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.updateToken, campaignId, { tokenId, ...edit });
  }

  moveToken(
    campaignId: string,
    tokenId: string,
    to: CellTarget,
    path?: readonly CellTarget[],
  ): Promise<BoardCommandResult> {
    const bends =
      path && path.length > 0 ? { path: path.map(({ col, row }) => ({ col, row })) } : {};
    return this.send(BOARD_EVENTS.moveToken, campaignId, {
      tokenId,
      col: to.col,
      row: to.row,
      ...bends,
    });
  }

  moveTokens(campaignId: string, moves: readonly TokenMoveTarget[]): Promise<BoardCommandResult> {
    const placed = moves.map(({ tokenId, col, row, expect, path }) => ({
      tokenId,
      col,
      row,
      ...(expect && { expect: { col: expect.col, row: expect.row } }),
      ...(path &&
        path.length > 0 && { path: path.map((bend) => ({ col: bend.col, row: bend.row })) }),
    }));
    return this.send(BOARD_EVENTS.moveTokens, campaignId, { moves: placed });
  }

  createTokens(campaignId: string, tokens: readonly NewToken[]): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createTokens, campaignId, { tokens: [...tokens] });
  }

  deleteTokens(
    campaignId: string,
    tokenIds: readonly string[],
    expect?: readonly TokenPlacement[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ tokenId, col, row }) => ({ tokenId, col, row })),
    };
    return this.send(BOARD_EVENTS.deleteTokens, campaignId, {
      tokenIds: [...tokenIds],
      ...precondition,
    });
  }

  createDrawings(
    campaignId: string,
    drawings: readonly DrawingShapeInput[],
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createDrawings, campaignId, { drawings: [...drawings] });
  }

  moveDrawings(
    campaignId: string,
    moves: readonly DrawingMoveTarget[],
  ): Promise<BoardCommandResult> {
    const placed = moves.map(({ drawingId, x, y, expect }) => ({
      drawingId,
      x,
      y,
      ...(expect && { expect: { x: expect.x, y: expect.y } }),
    }));
    return this.send(BOARD_EVENTS.moveDrawings, campaignId, { moves: placed });
  }

  deleteDrawings(
    campaignId: string,
    drawingIds: readonly string[],
    expect?: readonly DrawingPlacement[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ drawingId, x, y }) => ({ drawingId, x, y })),
    };
    return this.send(BOARD_EVENTS.deleteDrawings, campaignId, {
      drawingIds: [...drawingIds],
      ...precondition,
    });
  }

  dragTokens(campaignId: string, drags: readonly TokenDragTarget[]): Promise<BoardCommandResult> {
    const over = drags.map(({ tokenId, cell }) => ({
      tokenId,
      cell: cell && { col: cell.col, row: cell.row },
    }));
    return this.send(BOARD_EVENTS.dragTokens, campaignId, { drags: over });
  }

  setTokenLayer(
    campaignId: string,
    tokenIds: readonly string[],
    layer: TokenLayerDto,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.setTokenLayer, campaignId, { tokenIds: [...tokenIds], layer });
  }

  faceTokens(campaignId: string, faces: readonly TokenFacingTarget[]): Promise<BoardCommandResult> {
    const turned = faces.map(({ tokenId, facing, expect }) => ({
      tokenId,
      facing,
      ...(expect && { expect: { facing: expect.facing } }),
    }));
    return this.send(BOARD_EVENTS.faceTokens, campaignId, { faces: turned });
  }

  resizeTokens(
    campaignId: string,
    resizes: readonly TokenResizeTarget[],
  ): Promise<BoardCommandResult> {
    const boxes = resizes.map(({ tokenId, col, row, width, height, expect }) => ({
      tokenId,
      col,
      row,
      width,
      height,
      ...(expect && { expect: boxOf(expect) }),
    }));
    return this.send(BOARD_EVENTS.resizeTokens, campaignId, { resizes: boxes });
  }

  restyleTokens(
    campaignId: string,
    tokenIds: readonly string[],
    style: TokenStyle,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.restyleTokens, campaignId, {
      tokenIds: [...tokenIds],
      style: { ...style },
    });
  }

  adjustBar(
    campaignId: string,
    tokenId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.adjustBar, campaignId, { tokenId, barId, change });
  }

  deleteToken(campaignId: string, tokenId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.deleteToken, campaignId, { tokenId });
  }
}

function boxOf({ col, row, width, height }: TokenBox): TokenBox {
  return { col, row, width, height };
}
