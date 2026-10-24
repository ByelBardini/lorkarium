import type { BoardStateDto } from '@lorkarium/contracts';
import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  boardSightOf,
  poseShapingIdsOf,
  sightWithMovedOf,
  type BoardSight,
} from '@/lib/board-sight';
import type { TokenLanding } from '@/lib/light-sources';
import { shownCellsOf } from '@/lib/shown-cells';
import {
  useBoardInteraction,
  type BoardInteractionState,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore, type BoardStoreState } from '@/stores/board-store';

const CLEAR_SIGHT: BoardSight = {
  active: false,
  mode: 'off',
  levels: new Map(),
  eyes: [],
  eyeTokenIds: [],
  noEyes: false,
  seenDoorIds: null,
  previewBlind: false,
};

/** The master's "Ver como os selecionados": the selected tokens are the eyes; `null` when off.
 *
 *  Example: `boardSightOf(board, { previewEyeIds: previewEyeIdsOf(interaction.getState()) })` */
export function previewEyeIdsOf(
  state: Pick<BoardInteractionState, 'sightPreview' | 'selectedTokenIds'>,
): readonly string[] | null {
  return state.sightPreview ? state.selectedTokenIds : null;
}

/** The part of a table's board store the filter reads: the confirmed board and other people's
 *  drags. */
export type SightTable = Pick<BoardStoreState, 'board' | 'dragged'>;

/** The part of the interaction the filter reads: the master's preview, this viewer's drag and the
 *  move waiting for the server. */
export type SightInteraction = Pick<
  BoardInteractionState,
  'sightPreview' | 'selectedTokenIds' | 'drag' | 'preview' | 'facingPreview'
>;

/** What this viewer sees of the board right now, for code outside React (the keys).
 *
 *  Example: `seenTokensOf(board, sightNowOf(board.getState(), interaction.getState()))` */
export function sightNowOf(table: SightTable, interaction: SightInteraction): BoardSight {
  if (!table.board) return CLEAR_SIGHT;
  const { drag, preview, facingPreview } = interaction;
  const { dragged, board } = table;
  const landing = shownCellsOf({ dragged, drag, preview, facingPreview, tokens: board.tokens });
  return rememberedSightOf(table.board, previewEyeIdsOf(interaction), landing);
}

/** What the filter reads of the board: a drawing, a presence or a version bump hand a new board
 *  with these same parts, and the filter is not worked out again. */
type SightParts = Readonly<{
  vision: BoardStateDto['scene']['vision'];
  viewer: string;
  tokens: BoardStateDto['tokens'];
  walls: BoardStateDto['walls'];
  lights: BoardStateDto['lights'];
  previewKey: string;
}>;

type RememberedSight = Readonly<{
  parts: SightParts;
  /** Where the eyes and the lit tokens show: any change there redoes the whole filter. */
  shapingKey: string;
  landing: TokenLanding;
  sight: BoardSight;
}>;

// Six components and the keys ask for the sight, and a drag asks again at every cell: the last
// computation is kept, so each change is computed once and every consumer gets the same instance.
// A drag of a token that is nobody's eye and carries no light only works its own level out again.
let lastSight: RememberedSight | null = null;

function rememberedSightOf(
  board: BoardStateDto,
  previewEyeIds: readonly string[] | null,
  landing: TokenLanding,
): BoardSight {
  const parts = partsOf(board, previewEyeIds);
  const shapingKey = poseKeyOf(landing, poseShapingIdsOf(board, previewEyeIds));
  const last = lastSight;
  if (last && sameParts(last.parts, parts) && last.shapingKey === shapingKey) {
    const moved = movedIdsOf(last.landing, landing);
    if (moved.length === 0) return last.sight;
    const sight = sightWithMovedOf(last.sight, board, { previewEyeIds, landing }, moved);
    lastSight = { parts, shapingKey, landing, sight };
    return sight;
  }
  const sight = boardSightOf(board, { previewEyeIds, landing });
  lastSight = { parts, shapingKey, landing, sight };
  return sight;
}

function partsOf(board: BoardStateDto, previewEyeIds: readonly string[] | null): SightParts {
  const { scene, viewer, tokens, walls, lights } = board;
  const previewKey = JSON.stringify(previewEyeIds);
  return {
    vision: scene.vision,
    viewer: `${viewer.userId}:${viewer.role}`,
    tokens,
    walls,
    lights,
    previewKey,
  };
}

function sameParts(a: SightParts, b: SightParts): boolean {
  return (
    a.vision === b.vision &&
    a.viewer === b.viewer &&
    a.tokens === b.tokens &&
    a.walls === b.walls &&
    a.lights === b.lights &&
    a.previewKey === b.previewKey
  );
}

function poseKeyOf(landing: TokenLanding, ids: ReadonlySet<string>): string {
  const shaping = [...landing].filter(([id]) => ids.has(id));
  return JSON.stringify(shaping.sort(([a], [b]) => a.localeCompare(b)));
}

function movedIdsOf(before: TokenLanding, after: TokenLanding): string[] {
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids].filter((id) => {
    const was = before.get(id);
    const now = after.get(id);
    return was?.col !== now?.col || was?.row !== now?.row || was?.facing !== now?.facing;
  });
}

/** The sight filter of the room, recomputed when the confirmed board, a drag (this viewer's, the
 *  move waiting for the server or other people's), a turn before the ack or the master's preview
 *  changes: the one filter
 *  the canvas, the list "Na cena" and the keys go through.
 *
 *  Example: `const sight = useBoardSight(board, interaction)` */
export function useBoardSight(
  board: StoreApi<BoardStore>,
  interaction: StoreApi<BoardInteractionStore>,
): BoardSight {
  const state = useBoard(board, (current) => current.board);
  const dragged = useBoard(board, (current) => current.dragged);
  const sightPreview = useBoardInteraction(interaction, (current) => current.sightPreview);
  const selectedTokenIds = useBoardInteraction(interaction, (current) => current.selectedTokenIds);
  const drag = useBoardInteraction(interaction, (current) => current.drag);
  const preview = useBoardInteraction(interaction, (current) => current.preview);
  const facingPreview = useBoardInteraction(interaction, (current) => current.facingPreview);
  return useMemo(
    () =>
      sightNowOf(
        { board: state, dragged },
        { sightPreview, selectedTokenIds, drag, preview, facingPreview },
      ),
    [state, dragged, sightPreview, selectedTokenIds, drag, preview, facingPreview],
  );
}
