import type { WallDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import {
  TOO_MANY_TABLES_MESSAGE,
  sessionFailureMessage,
} from '@/features/campaigns/campaign-messages';
import type { OpenTableView } from '@/features/sessions/use-open-table';
import type { BoardIntent, BoardRenderer, CreateBoardRenderer } from '@/renderer/board-renderer';
import { selectionMoveOf } from '@/lib/selection-move';
import { shapeBox } from '@/lib/drawing-geometry';
import { gameWallOf } from '@/lib/wall-geometry';
import { groupMemberOf } from '@/lib/token-group';
import type { BoardInteractionStore, DragGroup } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { styleOf, type DrawingStyleStore } from '@/stores/drawing-style-store';
import type { EffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { wallStyleOf, type WallStyleStore } from '@/stores/wall-style-store';
import type { LightColorStore } from '@/stores/light-color-store';
import type { LightReachStore } from '@/stores/light-reach-store';
import { routeLightIntent } from '@/features/lights/light-intents';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { DrawingsSummary } from '@/features/drawings/drawings-summary';
import { routeEffectAreaIntent } from '@/features/effect-areas/effect-area-intents';
import { EffectAreasSummary } from '@/features/effect-areas/effect-areas-summary';
import { BoardCanvas } from './board-canvas';
import type { TokenMenuRequest } from './token-context-menu';
import type { TokenHoverRequest } from './use-token-hover';
import type { DoorMenuRequest } from '@/features/walls/door-menu';
import type { LightMenuRequest } from '@/features/lights/light-menu';
import {
  BOARD_LOAD_FAILED,
  facedAnnouncement,
  resizedAnnouncement,
  OUT_OF_SCENE,
  movedAnnouncement,
  tokensMovedAnnouncement,
} from './board-messages';
import type { SelectionToDelete } from './delete-selection-dialog';
import { useBoardKeyboard } from './use-board-keyboard';

export type BoardAreaProps = Readonly<{
  view: OpenTableView;
  interaction: StoreApi<BoardInteractionStore>;
  createBoardRenderer: CreateBoardRenderer;
  onRenderer: (renderer: BoardRenderer | null) => void;
  /** Enter on a selected token: show its card. */
  onOpenToken: (tokenId: string) => void;
  /** The master's Delete with tokens selected: open the confirmation. */
  onDeleteSelection: (selection: SelectionToDelete) => void;
  /** A short right click on a token (master): open "Mover para camada" there. */
  onTokenMenu: (request: TokenMenuRequest) => void;
  /** The pointer rests on a token (its card may show) or left it, or a token is dragged (`null`). */
  onTokenHover: (request: TokenHoverRequest | null) => void;
  /** A short right click on a door (master): open the door menu there. */
  onDoorMenu: (request: DoorMenuRequest) => void;
  /** A short right click on a map light (master): open the light menu there. */
  onLightMenu: (request: LightMenuRequest) => void;
  /** The style a finished sketch is drawn with. */
  drawingStyle: StoreApi<DrawingStyleStore>;
  /** The style the area tool draws with. */
  effectAreaStyle: StoreApi<EffectAreaStyleStore>;
  /** The kind and shape the walls tool draws. */
  wallStyle: StoreApi<WallStyleStore>;
  /** The reach the lights tool puts. */
  lightReach: StoreApi<LightReachStore>;
  /** The color the lights tool puts. */
  lightColor: StoreApi<LightColorStore>;
}>;

/** What fills the room behind the floating UI: the canvas once the board is ready, or why not.
 *
 *  Example: `<BoardArea view={view} interaction={interaction} createBoardRenderer={create} onRenderer={setRenderer} />` */
export function BoardArea({ view, ...canvas }: BoardAreaProps): React.JSX.Element | null {
  if (view.kind === 'full') return <BoardAlert message={TOO_MANY_TABLES_MESSAGE} />;
  return <OpenBoard presence={view.presence} board={view.board} {...canvas} />;
}

type OpenBoardProps = Omit<BoardAreaProps, 'view'> &
  Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }>;

function OpenBoard({ presence, board, ...canvas }: OpenBoardProps): React.JSX.Element | null {
  const sessionFailure = useTablePresence(presence, (state) => state.failure);
  const status = useBoard(board, (state) => state.status);
  if (sessionFailure && sessionFailure !== 'unauthenticated') {
    return <BoardAlert message={sessionFailureMessage(sessionFailure)} />;
  }
  if (status === 'failed') {
    return <BoardAlert message={BOARD_LOAD_FAILED} onRetry={() => board.getState().retry()} />;
  }
  if (status === 'loading') return null;
  return (
    <>
      <EffectAreasSummary board={board} presence={presence} />
      <InteractiveCanvas board={board} {...canvas} />
    </>
  );
}

function InteractiveCanvas({
  board,
  interaction,
  createBoardRenderer,
  onRenderer,
  onOpenToken,
  onDeleteSelection,
  onTokenMenu,
  onTokenHover,
  onDoorMenu,
  onLightMenu,
  drawingStyle,
  effectAreaStyle,
  wallStyle,
  lightReach,
  lightColor,
}: Omit<OpenBoardProps, 'presence'>): React.JSX.Element {
  const onKeyDown = useBoardKeyboard({
    board,
    interaction,
    onOpen: onOpenToken,
    onDeleteSelection,
  });
  return (
    <>
      <DrawingsSummary board={board} />
      <BoardCanvas
        board={board}
        interaction={interaction}
        drawingStyle={drawingStyle}
        effectAreaStyle={effectAreaStyle}
        wallStyle={wallStyle}
        createBoardRenderer={createBoardRenderer}
        onIntent={(intent) => {
          if (intent.kind === 'tokenHovered') return onTokenHover(hoverRequestOf(intent));
          if (intent.kind === 'tokenDragged') onTokenHover(null);
          if (intent.kind === 'tokenMenuRequested') {
            return onTokenMenu({ tokenId: intent.tokenId, x: intent.x, y: intent.y });
          }
          if (intent.kind === 'doorMenuRequested') {
            return onDoorMenu({ wallId: intent.wallId, x: intent.x, y: intent.y });
          }
          if (intent.kind === 'lightMenuRequested') {
            return onLightMenu({ lightId: intent.lightId, x: intent.x, y: intent.y });
          }
          if (routeLightIntent({ board, interaction, lightReach, lightColor }, intent)) return;
          routeIntent({ board, interaction, drawingStyle, wallStyle }, intent);
        }}
        onRenderer={onRenderer}
        onKeyDown={onKeyDown}
      />
    </>
  );
}

// The renderer says "no token" with both fields null; the room only needs one or the other.
function hoverRequestOf(
  intent: Extract<BoardIntent, { kind: 'tokenHovered' }>,
): TokenHoverRequest | null {
  const { tokenId, rect } = intent;
  return tokenId && rect ? { tokenId, rect } : null;
}

type IntentStores = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
}>;

type RoutedStores = IntentStores &
  Readonly<{ drawingStyle: StoreApi<DrawingStyleStore>; wallStyle: StoreApi<WallStyleStore> }>;

// Dragging and dropping a token are commands (a preview, then the move); the rest is local state.
function routeIntent(
  { board, interaction, drawingStyle, wallStyle }: RoutedStores,
  intent: BoardIntent,
): void {
  const local = interaction.getState();
  if (intent.kind === 'sketchFinished' && local.tool === 'walls') {
    return finishWall({ board, interaction }, intent, wallStyle);
  }
  if (intent.kind === 'sketchFinished') {
    return void local.finishSketch(intent, styleOf(drawingStyle.getState()));
  }
  if (routeEffectAreaIntent({ board, interaction }, intent)) return;
  if (intent.kind === 'drawingsDropped') return dropDrawings({ board, interaction }, intent);
  if (intent.kind === 'wallErased') {
    const wall = board.getState().board?.walls.find(({ id }) => id === intent.wallId);
    return void (wall && local.eraseWall(wall, intent.segmentIndex));
  }
  if (intent.kind === 'doorPressed') {
    const door = board.getState().board?.walls.find(({ id }) => id === intent.wallId);
    return void (door && local.toggleDoor(door));
  }
  if (intent.kind === 'tokenDragged') {
    const group = dragGroupOf({ board, interaction }, intent.tokenId);
    if (group) local.dragOver(intent.tokenId, intent.origin, intent.cell, group);
    return;
  }
  if (intent.kind === 'tokenDragCancelled') return local.cancelDrag();
  if (intent.kind === 'tokenFacingPreviewed') {
    return local.previewFacing(intent.tokenId, intent.facing);
  }
  if (intent.kind === 'tokenFaced') return faceByHandle({ board, interaction }, intent);
  if (intent.kind === 'tokenResizePreviewed') {
    return local.previewResize(intent.tokenId, intent.box);
  }
  if (intent.kind === 'tokenResized') return resizeByHandle({ board, interaction }, intent);
  if (intent.kind !== 'tokenDropped') return local.pointer(intent);
  void local.dropToken(
    intent.tokenId,
    intent.cell,
    dropAnnouncement({ board, interaction }, intent),
  );
}

// A wall glues to the walls already on the confirmed board.
function finishWall(
  { board, interaction }: IntentStores,
  sketch: Extract<BoardIntent, { kind: 'sketchFinished' }>,
  wallStyle: StoreApi<WallStyleStore>,
): void {
  const state = board.getState().board;
  if (!state) return;
  const { widthCells, heightCells } = state.scene;
  const scene = { widthCells, heightCells };
  const local = interaction.getState();
  if (local.wallMode === 'eraseArea') return eraseUnder(local, state.walls, sketch);
  const style = wallStyleOf(wallStyle.getState());
  void local.finishWall(sketch, { style, walls: state.walls, scene });
}

// The eraser box runs from the first sample to the last, like a rectangle of the draw tool.
function eraseUnder(
  local: BoardInteractionStore,
  walls: readonly WallDto[],
  { points, snap }: Extract<BoardIntent, { kind: 'sketchFinished' }>,
): void {
  const first = points[0];
  const last = points.at(-1);
  const box = first && last ? shapeBox(first, last, snap) : null;
  if (box) void local.eraseWallArea(walls, box);
}

// Released where it already looked (or over its center), the handle turns nothing.
function faceByHandle(
  { board, interaction }: IntentStores,
  intent: Extract<BoardIntent, { kind: 'tokenFaced' }>,
): void {
  const local = interaction.getState();
  const token = board.getState().board?.tokens.find(({ id }) => id === intent.tokenId);
  if (!token || token.facing === intent.facing) return local.previewFacing(intent.tokenId, null);
  const turn = { tokenId: token.id, from: token.facing, to: intent.facing };
  void local.faceTokens([turn], facedAnnouncement(token.name, intent.facing));
}

// Released on the box it already had, the handles resize nothing.
function resizeByHandle(
  { board, interaction }: IntentStores,
  intent: Extract<BoardIntent, { kind: 'tokenResized' }>,
): void {
  const local = interaction.getState();
  const token = board.getState().board?.tokens.find(({ id }) => id === intent.tokenId);
  const { col, row, width, height } = intent.box;
  const same = token?.col === col && token.row === row;
  if (!token || (same && token.width === width && token.height === height)) {
    return local.previewResize(intent.tokenId, null);
  }
  const from = { col: token.col, row: token.row, width: token.width, height: token.height };
  const resize = { tokenId: token.id, from, to: intent.box };
  void local.resizeTokens([resize], resizedAnnouncement(token.name, intent.box));
}

// The drawings and areas dragged carry the tokens selected with them; past the edge, nothing moves.
function dropDrawings(
  { board, interaction }: IntentStores,
  intent: Extract<BoardIntent, { kind: 'drawingsDropped' }>,
): void {
  const state = board.getState().board;
  const local = interaction.getState();
  if (!state) return;
  const { selectedTokenIds, activeLayer } = local;
  const { drawingIds, effectAreaIds, dx, dy } = intent;
  const drop = { drawingIds, effectAreaIds, dx, dy, selectedTokenIds, activeLayer };
  const move = selectionMoveOf(state, drop);
  if (!move) return local.say(OUT_OF_SCENE);
  void local.moveSelection(move);
}

// The token picked up carries the selection it is in: the members this viewer may move.
function dragGroupOf({ board, interaction }: IntentStores, anchorId: string): DragGroup | null {
  const state = board.getState().board;
  if (!state) return null;
  const { selectedTokenIds, activeLayer } = interaction.getState();
  const grouped = selectedTokenIds.includes(anchorId) ? selectedTokenIds : [anchorId];
  const movable = (id: string): boolean => {
    const token = state.tokens.find((candidate) => candidate.id === id);
    return id === anchorId || (!!token && token.canControl && token.layer === activeLayer);
  };
  const ids = [anchorId, ...grouped.filter((id) => id !== anchorId && movable(id))];
  const members = ids.flatMap((id) => {
    const token = state.tokens.find((candidate) => candidate.id === id);
    return token ? [groupMemberOf(token)] : [];
  });
  const { widthCells, heightCells } = state.scene;
  // The master passes every wall; a player's token is stopped by them.
  const walls = state.viewer.role === 'master' ? undefined : state.walls.map(gameWallOf);
  return { members, scene: { widthCells, heightCells }, walls };
}

function dropAnnouncement(
  { board, interaction }: IntentStores,
  intent: Extract<BoardIntent, { kind: 'tokenDropped' }>,
): string | undefined {
  const members = interaction.getState().drag?.members.length ?? 1;
  if (members > 1) return tokensMovedAnnouncement(members);
  const token = board.getState().board?.tokens.find(({ id }) => id === intent.tokenId);
  if (!token || !intent.cell) return undefined;
  return movedAnnouncement(token.name, intent.cell.col, intent.cell.row);
}

type BoardAlertProps = Readonly<{ message: string; onRetry?: () => void }>;

function BoardAlert({ message, onRetry }: BoardAlertProps): React.JSX.Element {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
      <p role="alert" className="max-w-prose text-center text-sm text-destructive-text">
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
