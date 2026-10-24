import {
  BOARD_EVENTS,
  type BarChangeDto,
  type CreateTokenCommandInput,
  type DrawingShapeInput,
  type MemberCardChangesInput,
  type SceneGridDto,
  type SceneVisionDto,
  type TokenLayerDto,
  type TokenStyleDto,
  type UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { TokenBox } from '@lorkarium/game-core';
import {
  BoardCommandSender,
  type BoardCommandResult,
  type BoardScope,
} from './board-command-sender';
import { RealtimeCombatCommands, type CombatCommands } from './combat-commands';
import {
  RealtimeLightCommands,
  type LightAt,
  type LightCommands,
  type LightMoveTarget,
  type LightPlacement,
  type LightColorTarget,
  type LightConeTarget,
  type LightRangeTarget,
} from './light-commands';
import {
  RealtimeEffectAreaCommands,
  type EffectAreaCommands,
  type EffectAreaReshapeTarget,
  type EffectAreaShape,
  type EffectAreaShaped,
} from './effect-area-commands';
import { RealtimeMainTokenCommands, type MainTokenCommands } from './main-token-commands';
import { RealtimeMemberCardCommands, type MemberCardCommands } from './member-card-commands';
import {
  RealtimeTokenLinkCommands,
  type AddPlayersResult,
  type TokenLinkCommands,
} from './token-link-commands';
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

export type { BoardCommandFailure, BoardCommandResult, BoardScope } from './board-command-sender';
export type { NewConditionDefinition } from './combat-commands';
export type { AddPlayersResult } from './token-link-commands';

type Envelope = 'actionId' | 'campaignId' | 'sceneId';
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
 *  Example: `const result = await boardCommands.moveToken(scope, tokenId, { col, row })` */
export interface TableBoardCommands
  extends
    CombatCommands,
    EffectAreaCommands,
    WallCommands,
    LightCommands,
    MainTokenCommands,
    MemberCardCommands,
    TokenLinkCommands {
  /** `backgroundAssetId`: an asset of the table sets the background, `null` takes it away,
   *  absent keeps it; `vision` absent keeps the scene's mode. */
  configureScene(
    scope: BoardScope,
    grid: SceneGridDto,
    backgroundAssetId?: string | null,
    vision?: SceneVisionDto,
  ): Promise<BoardCommandResult>;
  createToken(scope: BoardScope, token: NewToken): Promise<BoardCommandResult>;
  updateToken(scope: BoardScope, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult>;
  /** `path`: the bends around walls (absent or empty: a straight move). */
  moveToken(
    scope: BoardScope,
    tokenId: string,
    to: CellTarget,
    path?: readonly CellTarget[],
  ): Promise<BoardCommandResult>;
  /** A group move: all or nothing, in one version. */
  moveTokens(scope: BoardScope, moves: readonly TokenMoveTarget[]): Promise<BoardCommandResult>;
  /** A paste of tokens (master): all or nothing, in one version. */
  createTokens(scope: BoardScope, tokens: readonly NewToken[]): Promise<BoardCommandResult>;
  /** Deletes tokens (undoing a paste); `expect` is where each must still be. */
  deleteTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    expect?: readonly TokenPlacement[],
  ): Promise<BoardCommandResult>;
  createDrawings(
    scope: BoardScope,
    drawings: readonly DrawingShapeInput[],
  ): Promise<BoardCommandResult>;
  moveDrawings(scope: BoardScope, moves: readonly DrawingMoveTarget[]): Promise<BoardCommandResult>;
  deleteDrawings(
    scope: BoardScope,
    drawingIds: readonly string[],
    expect?: readonly DrawingPlacement[],
  ): Promise<BoardCommandResult>;
  /** The cells a group (one token is a group of one) is dragged over, for the others to see;
   *  a `null` cell ends that token's drag with no move. Nothing is saved: the ack carries the
   *  version as it stands. */
  dragTokens(scope: BoardScope, drags: readonly TokenDragTarget[]): Promise<BoardCommandResult>;
  setTokenLayer(
    scope: BoardScope,
    tokenIds: readonly string[],
    layer: TokenLayerDto,
  ): Promise<BoardCommandResult>;
  /** Turns a group (master or controllers, tokens layer), all or nothing in one version. */
  faceTokens(scope: BoardScope, faces: readonly TokenFacingTarget[]): Promise<BoardCommandResult>;
  /** Sizes and origins after the handles (`token:resizeMany`); the controllers' to choose. */
  resizeTokens(
    scope: BoardScope,
    resizes: readonly TokenResizeTarget[],
  ): Promise<BoardCommandResult>;
  /** Changes the look of a group (master or controllers), all or nothing in one version. */
  restyleTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    style: TokenStyle,
  ): Promise<BoardCommandResult>;
  adjustBar(
    scope: BoardScope,
    tokenId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult>;
  deleteToken(scope: BoardScope, tokenId: string): Promise<BoardCommandResult>;
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
  private readonly mainToken: MainTokenCommands;
  private readonly memberCard: MemberCardCommands;
  private readonly tokenLink: TokenLinkCommands;

  constructor(transport: RealtimeTransport, newActionId: () => string) {
    super(new BoardCommandSender(transport, newActionId));
    this.effectAreas = new RealtimeEffectAreaCommands(this.sender);
    this.walls = new RealtimeWallCommands(this.sender);
    this.lights = new RealtimeLightCommands(this.sender);
    this.mainToken = new RealtimeMainTokenCommands(this.sender);
    this.memberCard = new RealtimeMemberCardCommands(this.sender);
    this.tokenLink = new RealtimeTokenLinkCommands(this.sender);
  }

  linkTokenToCard(
    scope: BoardScope,
    tokenId: string,
    memberId: string,
  ): Promise<BoardCommandResult> {
    return this.tokenLink.linkTokenToCard(scope, tokenId, memberId);
  }

  unlinkTokenFromCard(scope: BoardScope, tokenId: string): Promise<BoardCommandResult> {
    return this.tokenLink.unlinkTokenFromCard(scope, tokenId);
  }

  addPlayers(scope: BoardScope, center: CellTarget): Promise<AddPlayersResult> {
    return this.tokenLink.addPlayers(scope, center);
  }

  updateMemberCard(
    scope: BoardScope,
    memberId: string,
    changes: MemberCardChangesInput,
  ): Promise<BoardCommandResult> {
    return this.memberCard.updateMemberCard(scope, memberId, changes);
  }

  setMainToken(scope: BoardScope, tokenId: string, playerId?: string): Promise<BoardCommandResult> {
    return this.mainToken.setMainToken(scope, tokenId, playerId);
  }

  createLights(scope: BoardScope, lights: readonly LightPlacement[]): Promise<BoardCommandResult> {
    return this.lights.createLights(scope, lights);
  }

  moveLights(scope: BoardScope, moves: readonly LightMoveTarget[]): Promise<BoardCommandResult> {
    return this.lights.moveLights(scope, moves);
  }

  setLightRanges(
    scope: BoardScope,
    changes: readonly LightRangeTarget[],
  ): Promise<BoardCommandResult> {
    return this.lights.setLightRanges(scope, changes);
  }

  setLightColors(
    scope: BoardScope,
    changes: readonly LightColorTarget[],
  ): Promise<BoardCommandResult> {
    return this.lights.setLightColors(scope, changes);
  }

  setLightCones(
    scope: BoardScope,
    changes: readonly LightConeTarget[],
  ): Promise<BoardCommandResult> {
    return this.lights.setLightCones(scope, changes);
  }

  setLightsLit(
    scope: BoardScope,
    lightIds: readonly string[],
    lit: boolean,
  ): Promise<BoardCommandResult> {
    return this.lights.setLightsLit(scope, lightIds, lit);
  }

  deleteLights(
    scope: BoardScope,
    lightIds: readonly string[],
    expect?: readonly LightAt[],
  ): Promise<BoardCommandResult> {
    return this.lights.deleteLights(scope, lightIds, expect);
  }

  createWalls(scope: BoardScope, shapes: readonly WallShape[]): Promise<BoardCommandResult> {
    return this.walls.createWalls(scope, shapes);
  }

  eraseWallArea(scope: BoardScope, box: WallEraseBox): Promise<BoardCommandResult> {
    return this.walls.eraseWallArea(scope, box);
  }

  eraseWallSegment(
    scope: BoardScope,
    wallId: string,
    segmentIndex: number,
    expect?: WallPosition,
  ): Promise<BoardCommandResult> {
    return this.walls.eraseWallSegment(scope, wallId, segmentIndex, expect);
  }

  deleteWalls(
    scope: BoardScope,
    wallIds: readonly string[],
    expect?: readonly WallPlacement[],
  ): Promise<BoardCommandResult> {
    return this.walls.deleteWalls(scope, wallIds, expect);
  }

  setWallKinds(
    scope: BoardScope,
    wallIds: readonly string[],
    kind: WallKind,
    expect?: readonly WallKindOf[],
  ): Promise<BoardCommandResult> {
    return this.walls.setWallKinds(scope, wallIds, kind, expect);
  }

  setDoor(scope: BoardScope, wallId: string, state: DoorState): Promise<BoardCommandResult> {
    return this.walls.setDoor(scope, wallId, state);
  }

  createEffectAreas(
    scope: BoardScope,
    shapes: readonly EffectAreaShape[],
  ): Promise<BoardCommandResult> {
    return this.effectAreas.createEffectAreas(scope, shapes);
  }

  reshapeEffectAreas(
    scope: BoardScope,
    reshapes: readonly EffectAreaReshapeTarget[],
  ): Promise<BoardCommandResult> {
    return this.effectAreas.reshapeEffectAreas(scope, reshapes);
  }

  deleteEffectAreas(
    scope: BoardScope,
    effectAreaIds: readonly string[],
    expect?: readonly EffectAreaShaped[],
  ): Promise<BoardCommandResult> {
    return this.effectAreas.deleteEffectAreas(scope, effectAreaIds, expect);
  }

  configureScene(
    scope: BoardScope,
    grid: SceneGridDto,
    backgroundAssetId?: string | null,
    vision?: SceneVisionDto,
  ): Promise<BoardCommandResult> {
    const background = backgroundAssetId === undefined ? {} : { backgroundAssetId };
    const mode = vision === undefined ? {} : { vision };
    return this.send(BOARD_EVENTS.configureScene, scope, { ...grid, ...background, ...mode });
  }

  createToken(scope: BoardScope, token: NewToken): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createToken, scope, token);
  }

  updateToken(scope: BoardScope, tokenId: string, edit: TokenEdit): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.updateToken, scope, { tokenId, ...edit });
  }

  moveToken(
    scope: BoardScope,
    tokenId: string,
    to: CellTarget,
    path?: readonly CellTarget[],
  ): Promise<BoardCommandResult> {
    const bends =
      path && path.length > 0 ? { path: path.map(({ col, row }) => ({ col, row })) } : {};
    return this.send(BOARD_EVENTS.moveToken, scope, {
      tokenId,
      col: to.col,
      row: to.row,
      ...bends,
    });
  }

  moveTokens(scope: BoardScope, moves: readonly TokenMoveTarget[]): Promise<BoardCommandResult> {
    const placed = moves.map(({ tokenId, col, row, expect, path }) => ({
      tokenId,
      col,
      row,
      ...(expect && { expect: { col: expect.col, row: expect.row } }),
      ...(path &&
        path.length > 0 && { path: path.map((bend) => ({ col: bend.col, row: bend.row })) }),
    }));
    return this.send(BOARD_EVENTS.moveTokens, scope, { moves: placed });
  }

  createTokens(scope: BoardScope, tokens: readonly NewToken[]): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createTokens, scope, { tokens: [...tokens] });
  }

  deleteTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    expect?: readonly TokenPlacement[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ tokenId, col, row }) => ({ tokenId, col, row })),
    };
    return this.send(BOARD_EVENTS.deleteTokens, scope, {
      tokenIds: [...tokenIds],
      ...precondition,
    });
  }

  createDrawings(
    scope: BoardScope,
    drawings: readonly DrawingShapeInput[],
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.createDrawings, scope, { drawings: [...drawings] });
  }

  moveDrawings(
    scope: BoardScope,
    moves: readonly DrawingMoveTarget[],
  ): Promise<BoardCommandResult> {
    const placed = moves.map(({ drawingId, x, y, expect }) => ({
      drawingId,
      x,
      y,
      ...(expect && { expect: { x: expect.x, y: expect.y } }),
    }));
    return this.send(BOARD_EVENTS.moveDrawings, scope, { moves: placed });
  }

  deleteDrawings(
    scope: BoardScope,
    drawingIds: readonly string[],
    expect?: readonly DrawingPlacement[],
  ): Promise<BoardCommandResult> {
    const precondition = expect && {
      expect: expect.map(({ drawingId, x, y }) => ({ drawingId, x, y })),
    };
    return this.send(BOARD_EVENTS.deleteDrawings, scope, {
      drawingIds: [...drawingIds],
      ...precondition,
    });
  }

  dragTokens(scope: BoardScope, drags: readonly TokenDragTarget[]): Promise<BoardCommandResult> {
    const over = drags.map(({ tokenId, cell }) => ({
      tokenId,
      cell: cell && { col: cell.col, row: cell.row },
    }));
    return this.send(BOARD_EVENTS.dragTokens, scope, { drags: over });
  }

  setTokenLayer(
    scope: BoardScope,
    tokenIds: readonly string[],
    layer: TokenLayerDto,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.setTokenLayer, scope, { tokenIds: [...tokenIds], layer });
  }

  faceTokens(scope: BoardScope, faces: readonly TokenFacingTarget[]): Promise<BoardCommandResult> {
    const turned = faces.map(({ tokenId, facing, expect }) => ({
      tokenId,
      facing,
      ...(expect && { expect: { facing: expect.facing } }),
    }));
    return this.send(BOARD_EVENTS.faceTokens, scope, { faces: turned });
  }

  resizeTokens(
    scope: BoardScope,
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
    return this.send(BOARD_EVENTS.resizeTokens, scope, { resizes: boxes });
  }

  restyleTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    style: TokenStyle,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.restyleTokens, scope, {
      tokenIds: [...tokenIds],
      style: { ...style },
    });
  }

  adjustBar(
    scope: BoardScope,
    tokenId: string,
    barId: string,
    change: BarChangeDto,
  ): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.adjustBar, scope, { tokenId, barId, change });
  }

  deleteToken(scope: BoardScope, tokenId: string): Promise<BoardCommandResult> {
    return this.send(BOARD_EVENTS.deleteToken, scope, { tokenId });
  }
}

function boxOf({ col, row, width, height }: TokenBox): TokenBox {
  return { col, row, width, height };
}
