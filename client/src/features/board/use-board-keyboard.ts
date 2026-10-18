import type { TokenDto } from '@lorkarium/contracts';
import { cell, turnFacing } from '@lorkarium/game-core';
import { useCallback } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { boardKeyOf, readingOrder, stepFrom, type BoardKey } from '@/lib/board-keys';
import { groupMemberOf, shiftGroup } from '@/lib/token-group';
import { singleSelectedOf, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import {
  NOT_YOUR_TOKEN,
  OUT_OF_SCENE,
  facedAnnouncement,
  groupMovedAnnouncement,
  groupTurnedAnnouncement,
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
 *  command, for a group too), Enter opens its card, Delete deletes the selected drawings and
 *  areas of effect; every
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

// E turns clockwise on screen (+45), Q back (−45): the facing grows clockwise.
const TURN: Readonly<Record<'turnBack' | 'turnOn', number>> = { turnBack: -45, turnOn: 45 };

function runBoardKey(key: BoardKey, deps: BoardKeyboardDeps): void {
  if (key === 'delete') return deleteSelectedPieces(deps);
  const tokens = deps.board.getState().board?.tokens ?? [];
  const { selectedTokenIds } = deps.interaction.getState();
  const selected = tokens.filter(({ id }) => selectedTokenIds.includes(id));
  if (key === 'next' || key === 'previous') return selectStep(tokens, key, deps.interaction);
  const [only] = selected;
  if (!only) return;
  if (key === 'open') return deps.onOpen(only.id);
  if (key === 'turnBack' || key === 'turnOn') return turnByKey(deps, selected, TURN[key]);
  if (selected.length === 1) return moveByKey(only, STEP[key], deps.interaction);
  moveGroupByKey(deps, inSelectionOrder(selected, selectedTokenIds), STEP[key]);
}

// A token is deleted from its dialog, never by a key: Delete takes the drawings and the areas.
function deleteSelectedPieces({ board, interaction }: BoardKeyboardDeps): void {
  const { selectedDrawingIds, selectedEffectAreaIds } = interaction.getState();
  const state = board.getState().board;
  const drawings = (state?.drawings ?? []).filter(({ id }) => selectedDrawingIds.includes(id));
  const areas = (state?.effectAreas ?? []).filter(({ id }) => selectedEffectAreaIds.includes(id));
  if (drawings.length > 0) void interaction.getState().deleteDrawings(drawings);
  if (areas.length > 0) void interaction.getState().deleteEffectAreas(areas);
}

// Every selected token turns in one command; one that is not this viewer's stops all of them.
function turnByKey(deps: BoardKeyboardDeps, selected: readonly TokenDto[], delta: number): void {
  const local = deps.interaction.getState();
  if (selected.some(({ canControl }) => !canControl)) return local.say(NOT_YOUR_TOKEN);
  const turns = selected.map(({ id, facing }) => ({
    tokenId: id,
    from: facing,
    to: turnFacing(facing, delta),
  }));
  const [only] = selected;
  const announce =
    selected.length === 1 && only && turns[0]
      ? facedAnnouncement(only.name, turns[0].to)
      : groupTurnedAnnouncement(selected.length);
  void local.faceTokens(turns, announce);
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
  const members = group.map(groupMemberOf);
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
