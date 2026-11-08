import type {
  BoardStateDto,
  DrawingDto,
  EffectAreaDto,
  TokenDto,
  LightDto,
  VeiledLightDto,
  WallDto,
} from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { useEffect, useId, useMemo, useRef } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import type {
  BoardIntentListener,
  BoardRenderer,
  CreateBoardRenderer,
} from '@/renderer/board-renderer';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
import { turnTokenIdsOf } from '@/lib/combat-entries';
import { browserClock, type InteractionClock } from '@/lib/interaction-clock';
import { posedTokenOf, shownVeiledLightsOf } from '@/lib/patrol-poses';
import {
  singleSelectedOf,
  useBoardInteraction,
  useLocalBoardView,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { styleOf, type DrawingStyleStore } from '@/stores/drawing-style-store';
import { effectAreaStyleOf, type EffectAreaStyleStore } from '@/stores/effect-area-style-store';
import { wallStyleOf, type WallStyleStore } from '@/stores/wall-style-store';
import { useTableSightOutlines } from './table-sight-outlines';
import { useBoardSight } from './use-board-sight';
import { useMountedRenderer } from './use-mounted-renderer';
import { usePatrolPoses } from './use-patrol-poses';
import { createTokenPatrolEditor, type TokenPatrolEditor } from '@/stores/token-patrol-flow';
import type { PatrolDraftView } from '@/renderer/patrol-path-view';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type BoardCanvasProps = Readonly<{
  board: StoreApi<BoardStore>;
  createBoardRenderer: CreateBoardRenderer;
  /** The local side: grid toggle, ruler, selection, the move preview and read only. */
  interaction: StoreApi<BoardInteractionStore>;
  onIntent: BoardIntentListener;
  /** The mounted renderer (or `null` while there is none), for the zoom and fit buttons. */
  onRenderer: (renderer: BoardRenderer | null) => void;
  /** Keys while the board has the focus (select, move, open); the camera keys are the renderer's. */
  onKeyDown?: (event: React.KeyboardEvent) => void;
  /** The style the sketch of the draw tool shows. */
  drawingStyle: StoreApi<DrawingStyleStore>;
  effectAreaStyle: StoreApi<EffectAreaStyleStore>;
  /** The kind and shape the walls tool sketches. */
  wallStyle: StoreApi<WallStyleStore>;
  /** The clock (ms) that counts lost WebGL contexts; `performance.now` when left out. */
  lossClock?: () => number;
  /** The timer of the patrols' steps; the browser's when left out. */
  clock?: InteractionClock;
  /** The master's patrol editor: its draft is drawn on the grid it belongs to. */
  patrolEditor?: StoreApi<TokenPatrolEditor>;
}>;

const NO_TOKENS: readonly TokenDto[] = [];
const NO_DRAWINGS: readonly DrawingDto[] = [];
const NO_EFFECT_AREAS: readonly EffectAreaDto[] = [];
const NO_WALLS: readonly WallDto[] = [];
const NO_LIGHTS: readonly LightDto[] = [];
const NO_VEILED_LIGHTS: readonly VeiledLightDto[] = [];

// A text key, not a list: a selector that hands back a new array each call loops the render.
function turnTokensKeyOf(board: BoardStateDto | null): string {
  return turnTokenIdsOf(board).join(',');
}

const KEYBOARD_INSTRUCTIONS =
  'Roda move o tabuleiro; Ctrl ou ⌘ com a roda aproxima; arraste com o botão direito para mover; ' +
  'W A S D movem; + e − aproximam e afastam; 0 enquadra a cena; F liga o modo foco. ' +
  '] e [ escolhem o próximo token e o anterior; as setas o movem uma casa; Enter abre o cartão; ' +
  'Esc tira a seleção.';

const MOUNT_FAILED = 'Seu navegador não conseguiu abrir o tabuleiro.';
const RELOAD_BOARD = 'Recarregar tabuleiro';
const MONOTONIC_CLOCK = (): number => performance.now();

/** Hosts the board renderer: React owns the element and the confirmed state; the renderer owns
 *  the pixels. One renderer per mount, destroyed on unmount (StrictMode mounts twice), rebuilt
 *  at the same camera when the GPU drops the WebGL context.
 *
 *  Example: `<BoardCanvas board={board} interaction={interaction} createBoardRenderer={deps.createBoardRenderer} onIntent={onIntent} onRenderer={setRenderer} />` */
export function BoardCanvas(props: BoardCanvasProps): React.JSX.Element {
  const scene = useBoard(props.board, (state) => state.board?.scene ?? null);
  const view = useBoardView(props);
  const instructionsId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const lossClock = props.lossClock ?? MONOTONIC_CLOCK;
  const { renderer, failed, retry } = useMountedRenderer(hostRef, { ...props, lossClock });
  useEffect(() => {
    if (renderer && view) renderer.draw(view);
  }, [renderer, view]);
  useCenterOnSelection(props, renderer);
  if (failed) return <MountFailure onRetry={retry} />;
  const label = scene
    ? `Tabuleiro: ${scene.name}, ${scene.widthCells} × ${scene.heightCells} casas`
    : 'Tabuleiro';
  return (
    <>
      <div
        ref={hostRef}
        role="application"
        aria-roledescription="tabuleiro"
        aria-label={label}
        aria-describedby={instructionsId}
        tabIndex={0}
        onKeyDown={props.onKeyDown}
        className="absolute inset-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      />
      <p id={instructionsId} className="sr-only">
        {KEYBOARD_INSTRUCTIONS}
      </p>
    </>
  );
}

function useBoardView({
  board,
  interaction,
  drawingStyle,
  effectAreaStyle,
  wallStyle,
  clock,
  patrolEditor,
}: BoardCanvasProps): BoardView | null {
  const patrolDraft = usePatrolDraft(patrolEditor, board);
  const patrols = usePatrolPoses(board, clock ?? browserClock);
  const scene = useBoard(board, (state) => state.board?.scene ?? null);
  const tokens = useBoard(board, (state) => state.board?.tokens ?? NO_TOKENS);
  const drawings = useBoard(board, (state) => state.board?.drawings ?? NO_DRAWINGS);
  const effectAreas = useBoard(board, (state) => state.board?.effectAreas ?? NO_EFFECT_AREAS);
  const walls = useBoard(board, (state) => state.board?.walls ?? NO_WALLS);
  const lights = useBoard(board, (state) => state.board?.lights ?? NO_LIGHTS);
  // Walked along with a hidden patrol: the clock mirrors the board's own list otherwise.
  const veiledLights = useBoard(board, (state) =>
    state.board ? shownVeiledLightsOf(state.board.veiledLights, state.patrol) : NO_VEILED_LIGHTS,
  );
  const viewerId = useBoard(board, (state) => state.board?.viewer.userId ?? '');
  const isMaster = useBoard(board, (state) => state.board?.viewer.role === 'master');
  const turnTokensKey = useBoard(board, (state) => turnTokensKeyOf(state.board));
  const currentTokenIds = useMemo(
    () => (turnTokensKey ? turnTokensKey.split(',') : []),
    [turnTokensKey],
  );
  const dragged = useBoard(board, (state) => state.dragged);
  const local = useLocalBoardView(interaction);
  const style = useStore(drawingStyle, useShallow(styleOf));
  const areaStyle = useStore(effectAreaStyle, useShallow(effectAreaStyleOf));
  const nextWall = useStore(wallStyle, useShallow(wallStyleOf));
  const sight = useBoardSight(board, interaction);
  const sightOutlines = useTableSightOutlines();
  return useMemo(() => {
    if (!scene) return null;
    const viewer = { userId: viewerId, isMaster };
    const extra = { tokens, drawings, viewer, currentTokenIds, dragged, patrols, patrolDraft };
    const areas = {
      effectAreas,
      effectAreaStyle: areaStyle,
      wallStyle: nextWall,
      walls,
      lights,
      veiledLights,
      sight,
      sightOutlines,
    };
    return buildBoardView({ scene, ...extra, drawingStyle: style, ...areas, ...local });
  }, [
    scene,
    tokens,
    drawings,
    effectAreas,
    walls,
    lights,
    veiledLights,
    patrols,
    patrolDraft,
    viewerId,
    isMaster,
    currentTokenIds,
    dragged,
    local,
    style,
    areaStyle,
    nextWall,
    sight,
    sightOutlines,
  ]);
}

const NO_PATROL_EDITOR: StoreApi<TokenPatrolEditor> = createTokenPatrolEditor({
  commands: { setTokenPatrol: () => Promise.resolve({ ok: false, failure: 'unexpected' }) },
  fullNotice: '',
});

// The draft of the editor, only on the grid it was drawn on (a text key would lose the cells).
function usePatrolDraft(
  editor: StoreApi<TokenPatrolEditor> | undefined,
  board: StoreApi<BoardStore>,
): PatrolDraftView | null {
  const draft = useStore(editor ?? NO_PATROL_EDITOR, (state) => state.draft);
  const sceneId = useBoard(board, (state) => state.board?.scene.id ?? null);
  return draft && draft.scope.sceneId === sceneId ? draft : null;
}

// A token picked in the panel may be off screen: bring it into view (a no-op when it is shown).
// A marquee selection is already on screen, so only a single selection centers.
function useCenterOnSelection(
  { board, interaction }: BoardCanvasProps,
  renderer: BoardRenderer | null,
): void {
  const selectedId = useBoardInteraction(interaction, (state) =>
    singleSelectedOf(state.selectedTokenIds),
  );
  useEffect(() => {
    if (!renderer || !selectedId) return;
    const state = board.getState();
    const token = state.board?.tokens.find(({ id }) => id === selectedId);
    if (!token) return;
    const shown = posedTokenOf(token, state.patrol.poses);
    renderer.centerOn(cell(shown.col, shown.row));
  }, [board, renderer, selectedId]);
}

function MountFailure({ onRetry }: Readonly<{ onRetry: () => void }>): React.JSX.Element {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="flex flex-col items-center gap-3">
        <p role="alert" className="max-w-prose text-center text-sm text-destructive-text">
          {MOUNT_FAILED}
        </p>
        <Button variant="outline" onClick={onRetry}>
          {RELOAD_BOARD}
        </Button>
      </div>
    </div>
  );
}
