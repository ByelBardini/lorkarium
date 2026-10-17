import type { TokenDto } from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { useCallback } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { boardKeyOf, readingOrder, stepFrom, type BoardKey } from '@/lib/board-keys';
import { shiftGroup } from '@/lib/token-group';
import { singleSelectedOf, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import {
  NOT_YOUR_TOKEN,
  OUT_OF_SCENE,
  groupMovedAnnouncement,
  movedAnnouncement,
  selectedAnnouncement,
} from './board-messages';

export type BoardKeyboardDeps = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** Enter on a selected token: its card. */
  onOpen: (tokenId: string) => void;
}>;

const STEP: Readonly<Record<'up' | 'down' | 'left' | 'right', readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** Playing without a mouse: ] and [ select one, the arrows move the selection a cell (one
 *  command, for a group too), Enter opens its card, Delete deletes the selected drawings; every
 *  step is said on the status line.
 *
 *  Example: `<div onKeyDown={useBoardKeyboard({ board, interaction, onOpen })} />` */
export function useBoardKeyboard(deps: BoardKeyboardDeps): (event: React.KeyboardEvent) => void {
  const { board, interaction, onOpen } = deps;
  return useCallback(
    (event) => {
      const key = boardKeyOf(event);
      if (!key) return;
      event.preventDefault();
      runBoardKey(key, { board, interaction, onOpen });
    },
    [board, interaction, onOpen],
  );
}

function runBoardKey(key: BoardKey, deps: BoardKeyboardDeps): void {
  if (key === 'delete') return deleteSelectedDrawings(deps);
  const tokens = deps.board.getState().board?.tokens ?? [];
  const { selectedTokenIds } = deps.interaction.getState();
  const selected = tokens.filter(({ id }) => selectedTokenIds.includes(id));
  if (key === 'next' || key === 'previous') return selectStep(tokens, key, deps.interaction);
  const [only] = selected;
  if (!only) return;
  if (key === 'open') return deps.onOpen(only.id);
  if (selected.length === 1) return moveByKey(only, STEP[key], deps.interaction);
  moveGroupByKey(deps, inSelectionOrder(selected, selectedTokenIds), STEP[key]);
}

// A token is deleted from its dialog, never by a key: Delete only takes the drawings.
function deleteSelectedDrawings({ board, interaction }: BoardKeyboardDeps): void {
  const { selectedDrawingIds } = interaction.getState();
  const drawings = board.getState().board?.drawings ?? [];
  const selected = drawings.filter(({ id }) => selectedDrawingIds.includes(id));
  if (selected.length > 0) void interaction.getState().deleteDrawings(selected);
}

function inSelectionOrder(tokens: readonly TokenDto[], ids: readonly string[]): TokenDto[] {
  return [...tokens].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

// The whole group or nothing: one token on the edge stops all of them.
function moveGroupByKey(
  deps: BoardKeyboardDeps,
  group: readonly TokenDto[],
  [dx, dy]: readonly [number, number],
): void {
  const local = deps.interaction.getState();
  const scene = deps.board.getState().board?.scene;
  const [anchor] = group;
  if (!scene || !anchor) return;
  if (group.some(({ canControl }) => !canControl)) return local.say(NOT_YOUR_TOKEN);
  const members = group.map(({ id, col, row, size }) => ({ tokenId: id, col, row, size }));
  const to = { col: anchor.col + dx, row: anchor.row + dy };
  const moves = shiftGroup(scene, members, anchor, to);
  if (!moves) return local.say(OUT_OF_SCENE);
  void local.moveTokens(moves, groupMovedAnnouncement(moves.length));
}

function selectStep(
  tokens: readonly TokenDto[],
  direction: 'next' | 'previous',
  interaction: StoreApi<BoardInteractionStore>,
): void {
  const local = interaction.getState();
  const order = readingOrder(tokens).map(({ id }) => id);
  const current = singleSelectedOf(local.selectedTokenIds) ?? local.selectedTokenIds.at(-1);
  const nextId = stepFrom(order, current ?? null, direction);
  const token = tokens.find(({ id }) => id === nextId);
  local.select(token?.id ?? null);
  if (token) local.say(selectedAnnouncement(token.name, token.col, token.row));
}

function moveByKey(
  token: TokenDto,
  [dx, dy]: readonly [number, number],
  interaction: StoreApi<BoardInteractionStore>,
): void {
  const local = interaction.getState();
  if (!token.canControl) return local.say(NOT_YOUR_TOKEN);
  const col = token.col + dx;
  const row = token.row + dy;
  if (col < 0 || row < 0) return local.say(OUT_OF_SCENE);
  void local.moveToken(token.id, cell(col, row), movedAnnouncement(token.name, col, row));
}
