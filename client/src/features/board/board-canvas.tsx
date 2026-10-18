import type {
  BoardStateDto,
  DrawingDto,
  EffectAreaDto,
  TokenDto,
  WallDto,
} from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type {
  BoardIntentListener,
  BoardRenderer,
  CreateBoardRenderer,
} from '@/renderer/board-renderer';
import { buildBoardView, type BoardView } from '@/renderer/board-view';
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
import { useBoardSight } from './use-board-sight';
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
}>;

const NO_TOKENS: readonly TokenDto[] = [];
const NO_DRAWINGS: readonly DrawingDto[] = [];
const NO_EFFECT_AREAS: readonly EffectAreaDto[] = [];
const NO_WALLS: readonly WallDto[] = [];

function currentTokenOf(board: BoardStateDto | null): string | null {
  const combat = board?.combat;
  return combat?.combatants.find(({ id }) => id === combat.currentCombatantId)?.tokenId ?? null;
}

const KEYBOARD_INSTRUCTIONS =
  'Roda move o tabuleiro; Ctrl ou ⌘ com a roda aproxima; arraste com o botão direito para mover; ' +
  'W A S D movem; + e − aproximam e afastam; 0 enquadra a cena; F liga o modo foco. ' +
  '] e [ escolhem o próximo token e o anterior; as setas o movem uma casa; Enter abre o cartão; ' +
  'Esc tira a seleção.';

const MOUNT_FAILED = 'Seu navegador não conseguiu abrir o tabuleiro.';

/** Hosts the board renderer: React owns the element and the confirmed state; the renderer owns
 *  the pixels. One renderer per mount, destroyed on unmount (StrictMode mounts twice).
 *
 *  Example: `<BoardCanvas board={board} interaction={interaction} createBoardRenderer={deps.createBoardRenderer} onIntent={onIntent} onRenderer={setRenderer} />` */
export function BoardCanvas(props: BoardCanvasProps): React.JSX.Element {
  const scene = useBoard(props.board, (state) => state.board?.scene ?? null);
  const view = useBoardView(props);
  const instructionsId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const { renderer, failed } = useMountedRenderer(hostRef, props);
  useEffect(() => {
    if (renderer && view) renderer.draw(view);
  }, [renderer, view]);
  useCenterOnSelection(props, renderer);
  if (failed) return <MountFailure />;
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
}: BoardCanvasProps): BoardView | null {
  const scene = useBoard(board, (state) => state.board?.scene ?? null);
  const tokens = useBoard(board, (state) => state.board?.tokens ?? NO_TOKENS);
  const drawings = useBoard(board, (state) => state.board?.drawings ?? NO_DRAWINGS);
  const effectAreas = useBoard(board, (state) => state.board?.effectAreas ?? NO_EFFECT_AREAS);
  const walls = useBoard(board, (state) => state.board?.walls ?? NO_WALLS);
  const viewerId = useBoard(board, (state) => state.board?.viewer.userId ?? '');
  const isMaster = useBoard(board, (state) => state.board?.viewer.role === 'master');
  const currentTokenId = useBoard(board, (state) => currentTokenOf(state.board));
  const dragged = useBoard(board, (state) => state.dragged);
  const local = useLocalBoardView(interaction);
  const style = useStore(drawingStyle, useShallow(styleOf));
  const areaStyle = useStore(effectAreaStyle, useShallow(effectAreaStyleOf));
  const nextWall = useStore(wallStyle, useShallow(wallStyleOf));
  const sight = useBoardSight(board, interaction);
  return useMemo(() => {
    if (!scene) return null;
    const viewer = { userId: viewerId, isMaster };
    const extra = { tokens, drawings, viewer, currentTokenId, dragged, drawingStyle: style };
    const areas = { effectAreas, effectAreaStyle: areaStyle, wallStyle: nextWall, walls, sight };
    return buildBoardView({ scene, ...extra, ...areas, ...local });
  }, [
    scene,
    tokens,
    drawings,
    effectAreas,
    walls,
    viewerId,
    isMaster,
    currentTokenId,
    dragged,
    local,
    style,
    areaStyle,
    nextWall,
    sight,
  ]);
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
    const token = board.getState().board?.tokens.find(({ id }) => id === selectedId);
    if (token) renderer.centerOn(cell(token.col, token.row));
  }, [board, renderer, selectedId]);
}

type MountedRenderer = Readonly<{ renderer: BoardRenderer | null; failed: boolean }>;

function useMountedRenderer(
  hostRef: React.RefObject<HTMLDivElement | null>,
  { createBoardRenderer, onIntent, onRenderer }: BoardCanvasProps,
): MountedRenderer {
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  const intentRef = useRef(onIntent);
  useEffect(() => {
    intentRef.current = onIntent;
  }, [onIntent]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const created = createBoardRenderer((intent) => intentRef.current(intent));
    let alive = true;
    created.mount(host).then(
      () => alive && setRenderer(created),
      () => alive && setFailed(true),
    );
    // Destroyed even while `mount` is still pending: the adapter finishes init and then tears down.
    return () => {
      alive = false;
      created.destroy();
      setRenderer(null);
    };
  }, [createBoardRenderer, hostRef]);
  useEffect(() => onRenderer(renderer), [renderer, onRenderer]);
  return { renderer, failed };
}

function MountFailure(): React.JSX.Element {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <p role="alert" className="max-w-prose text-center text-sm text-destructive-text">
        {MOUNT_FAILED}
      </p>
    </div>
  );
}
