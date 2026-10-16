import type { TokenDto } from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { useCallback } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { boardKeyOf, readingOrder, stepFrom, type BoardKey } from '@/lib/board-keys';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import {
  NOT_YOUR_TOKEN,
  OUT_OF_SCENE,
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

/** Playing without a mouse: ] and [ select, the arrows move the selection a cell (a command),
 *  Enter opens its card; every step is said on the status line.
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
  const tokens = deps.board.getState().board?.tokens ?? [];
  const local = deps.interaction.getState();
  const selected = tokens.find(({ id }) => id === local.selectedTokenId) ?? null;
  if (key === 'next' || key === 'previous') return selectStep(tokens, key, deps.interaction);
  if (!selected) return;
  if (key === 'open') return deps.onOpen(selected.id);
  moveByKey(selected, STEP[key], deps.interaction);
}

function selectStep(
  tokens: readonly TokenDto[],
  direction: 'next' | 'previous',
  interaction: StoreApi<BoardInteractionStore>,
): void {
  const local = interaction.getState();
  const order = readingOrder(tokens).map(({ id }) => id);
  const nextId = stepFrom(order, local.selectedTokenId, direction);
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
