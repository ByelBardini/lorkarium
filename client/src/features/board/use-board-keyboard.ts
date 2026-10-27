import { seenTokensOf } from '@/lib/board-sight';
import type { SelectionToDelete } from './delete-selection-dialog';
import { sightNowOf } from './use-board-sight';
import { useTablePlayers } from './table-players';
import { watchesOnly } from '@/lib/table-role';
import { viewerTokenRightsOf } from '@/lib/token-rights-of-viewer';
import { useTableTokenKeys } from './table-token-rights';
import type { TableTokenRights } from '@lorkarium/game-core';
import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import { blockedPassage, cell, tokenCenter, turnFacing, type Cell } from '@lorkarium/game-core';
import { gameWallsOf } from '@/lib/wall-geometry';
import { useCallback } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { boardKeyOf, readingOrder, stepFrom, type BoardKey } from '@/lib/board-keys';
import { groupMemberOf, shiftGroup } from '@/lib/token-group';
import { singleSelectedOf, type BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import {
  NOT_YOUR_TOKEN,
  OUT_OF_SCENE,
  boardCommandFailureMessage,
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
  /** A Delete with tokens this viewer may delete: ask first, then delete them and the rest. */
  onDeleteSelection: (selection: SelectionToDelete) => void;
}>;

const STEP: Readonly<Record<'up' | 'down' | 'left' | 'right', readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** Playing without a mouse: ] and [ select one, the arrows move the selection a cell (one
 *  command, for a group too), Enter opens its card, Delete deletes the selected drawings, areas
 *  and walls (and the selected tokens this viewer may delete, after `onDeleteSelection` asks); every
 *  step is said on the status line. A spectator only selects and opens.
 *
 *  Example: `<div onKeyDown={useBoardKeyboard({ board, interaction, onOpen, onDeleteSelection })} />` */
export function useBoardKeyboard(deps: BoardKeyboardDeps): (event: React.KeyboardEvent) => void {
  const { board, interaction, onOpen, onDeleteSelection } = deps;
  const players = useTablePlayers();
  const tokenKeys = useTableTokenKeys();
  return useCallback(
    (event) => {
      const key = boardKeyOf(event);
      if (!key) return;
      event.preventDefault();
      runBoardKey(key, { board, interaction, onOpen, onDeleteSelection, players, tokenKeys });
    },
    [board, interaction, onOpen, onDeleteSelection, players, tokenKeys],
  );
}

type KeyRunDeps = BoardKeyboardDeps &
  Readonly<{ players: readonly string[]; tokenKeys: TableTokenRights }>;

// What a spectator's keys may still do: pick a token and open its card.
const LOOKING_KEYS: readonly BoardKey[] = ['next', 'previous', 'open'];

// E turns clockwise on screen (+45), Q back (−45): the facing grows clockwise.
const TURN: Readonly<Record<'turnBack' | 'turnOn', number>> = { turnBack: -45, turnOn: 45 };

function runBoardKey(key: BoardKey, deps: KeyRunDeps): void {
  const state = deps.board.getState().board;
  if (state && watchesOnly(state.viewer.role) && !LOOKING_KEYS.includes(key)) return;
  if (key === 'delete') return deleteSelectedPieces(deps);
  // The keys only reach what this viewer sees whole.
  const sight = sightNowOf(deps.board.getState(), deps.interaction.getState(), deps.players);
  const tokens = state ? seenTokensOf(state, sight) : [];
  const { selectedTokenIds } = deps.interaction.getState();
  const selected = tokens.filter(({ id }) => selectedTokenIds.includes(id));
  if (key === 'next' || key === 'previous') return selectStep(tokens, key, deps.interaction);
  const [only] = selected;
  if (!only) return;
  if (key === 'open') return deps.onOpen(only.id);
  if (key === 'turnBack' || key === 'turnOn') return turnByKey(deps, selected, TURN[key]);
  if (selected.length === 1) return moveByKey(only, STEP[key], deps);
  moveGroupByKey(deps, inSelectionOrder(selected, selectedTokenIds), STEP[key]);
}

// A Delete with tokens this viewer may delete (the master any, a player her own with the key)
// asks first and then takes them with the rest; without such tokens, the drawings, areas, walls
// and lights go at once.
function deleteSelectedPieces(deps: KeyRunDeps): void {
  const { board, interaction } = deps;
  const local = interaction.getState();
  const state = board.getState().board;
  const pick = <T extends { id: string }>(
    items: readonly T[] | undefined,
    ids: readonly string[],
  ) => (items ?? []).filter(({ id }) => ids.includes(id));
  const drawings = pick(state?.drawings, local.selectedDrawingIds);
  const effectAreas = pick(state?.effectAreas, local.selectedEffectAreaIds);
  const walls = pick(state?.walls, local.selectedWallIds);
  const lights = pick(state?.lights, local.selectedLightIds);
  const selected = pick(state?.tokens, local.selectedTokenIds);
  const rights = viewerTokenRightsOf(deps.tokenKeys, state?.viewer ?? null);
  const tokens = selected.filter((token) => rights.of(token).delete);
  if (tokens.length > 0) {
    const keptTokens = selected.length - tokens.length;
    return deps.onDeleteSelection({ tokens, keptTokens, drawings, effectAreas, walls });
  }
  if (drawings.length > 0) void local.deleteDrawings(drawings);
  if (effectAreas.length > 0) void local.deleteEffectAreas(effectAreas);
  if (walls.length > 0) void local.deleteWalls(walls);
  if (lights.length > 0) void local.deleteLights(lights);
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
  const state = deps.board.getState().board;
  const crossing = group.some((token) => {
    const landing = moves.find(({ tokenId }) => tokenId === token.id);
    return landing ? crossesWall(state, token, landing) : false;
  });
  if (crossing) return local.say(boardCommandFailureMessage('wall_blocked'));
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
  { board, interaction }: BoardKeyboardDeps,
): void {
  const local = interaction.getState();
  if (!token.canControl) return local.say(NOT_YOUR_TOKEN);
  const col = token.col + dx;
  const row = token.row + dy;
  if (col < 0 || row < 0) return local.say(OUT_OF_SCENE);
  if (crossesWall(board.getState().board, token, { col, row })) {
    return local.say(boardCommandFailureMessage('wall_blocked'));
  }
  void local.moveToken(token.id, cell(col, row), movedAnnouncement(token.name, col, row));
}

// The master passes every wall; a player's step is checked center to center, as the server does.
function crossesWall(state: BoardStateDto | null, token: TokenDto, to: Cell): boolean {
  if (!state || state.viewer.role === 'master') return false;
  const centers = [tokenCenter(token, token), tokenCenter(to, token)];
  return blockedPassage(centers, gameWallsOf(state.walls)) !== null;
}
