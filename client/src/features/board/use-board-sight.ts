import type { BoardStateDto } from '@lorkarium/contracts';
import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { boardSightOf, type BoardSight } from '@/lib/board-sight';
import {
  useBoardInteraction,
  type BoardInteractionState,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';

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

/** What this viewer sees of the confirmed board right now, for code outside React (the keys).
 *
 *  Example: `seenTokensOf(board, sightNowOf(state, interaction.getState()))` */
export function sightNowOf(
  board: BoardStateDto | null,
  interaction: Pick<BoardInteractionState, 'sightPreview' | 'selectedTokenIds'>,
): BoardSight {
  return board ? boardSightOf(board, { previewEyeIds: previewEyeIdsOf(interaction) }) : CLEAR_SIGHT;
}

/** The sight filter of the room, recomputed when the confirmed board (each event) or the master's
 *  preview changes: the one filter the canvas, the list "Na cena" and the keys go through.
 *
 *  Example: `const sight = useBoardSight(board, interaction)` */
export function useBoardSight(
  board: StoreApi<BoardStore>,
  interaction: StoreApi<BoardInteractionStore>,
): BoardSight {
  const state = useBoard(board, (current) => current.board);
  const preview = useBoardInteraction(interaction, (current) => current.sightPreview);
  const selected = useBoardInteraction(interaction, (current) => current.selectedTokenIds);
  return useMemo(
    () => sightNowOf(state, { sightPreview: preview, selectedTokenIds: selected }),
    [state, preview, selected],
  );
}
