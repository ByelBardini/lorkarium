import type { SavedTokenDto } from '@lorkarium/contracts';
import type { Cell, SceneSize } from '@lorkarium/game-core';
import type { Point } from '@/renderer/camera';
import { dropCellOf } from '@/renderer/token-drag';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardScope } from '@/services/board-command-sender';
import type { SavedTokensApi } from '@/services/saved-tokens-api';
import type { TableBoardCommands } from '@/services/table-board-commands';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { createSavedTokensStore, type SavedTokensStore } from '@/stores/saved-tokens-store';
import { createSpawnAimStore, sendSpawn, type SpawnAimStore } from '@/stores/spawn-aim-flow';
import type { TableEditStore } from '@/stores/table-edit-store';
import { tokenCommandFailureMessage } from '@/features/board/board-messages';

export type RoomSpawnDeps = Readonly<{
  campaignId: string;
  api: SavedTokensApi;
  commands: TableBoardCommands;
  interaction: StoreApi<BoardInteractionStore>;
  /** The undo stack of the grid shown (`null` before the table opens). */
  edits: StoreApi<TableEditStore> | null;
  scopeOf: () => BoardScope;
  /** The size of the grid shown (`null` before it opens): a drop off it spawns nothing. */
  sceneOf: () => SceneSize | null;
  newId?: () => string;
}>;

export type RoomSpawn = Readonly<{
  /** The viewer's saved tokens at this table (the panel lists them, the token menu saves). */
  list: StoreApi<SavedTokensStore>;
  aim: StoreApi<SpawnAimStore>;
  /** A press on the board with a saved token armed: spawn it there. */
  spawnAt: (at: Cell) => void;
  /** A saved token dragged from the panel and dropped at a world point: spawn it centered there. */
  dropAt: (savedTokenId: string, world: Point) => void;
}>;

/** The spawn of saved tokens in a room visit: one aim for the room; each press on the board puts
 *  the armed token there through `token:createMany` (the paste's command and rules), and Esc
 *  disarms it.
 *
 *  Example: `const spawn = useRoomSpawn({ campaignId, api, commands, interaction, edits, scopeOf })` */
export function useRoomSpawn(deps: RoomSpawnDeps): RoomSpawn {
  const { commands, interaction, edits, scopeOf } = deps;
  const newId = deps.newId ?? randomId;
  const [aim] = useState(createSpawnAimStore);
  const [list] = useState(() => createSavedTokensStore(deps.api, deps.campaignId));
  useDisarmOnEscape(aim);
  const spawn = useCallback(
    (saved: SavedTokenDto, at: Cell) => {
      const state = interaction.getState();
      const recordEdit = (entry: Parameters<TableEditStore['record']>[0]) =>
        edits?.getState().record(entry);
      const spawnDeps = { scopeOf, commands, describeRefusal, recordEdit, newId };
      void sendSpawn(spawnDeps, saved, at, { readOnly: state.readOnly, say: state.say });
    },
    [commands, edits, interaction, newId, scopeOf],
  );
  const spawnAt = useCallback(
    (at: Cell) => {
      const armed = aim.getState().armed;
      if (armed) spawn(armed, at);
    },
    [aim, spawn],
  );
  const dropAt = useCallback(
    (savedTokenId: string, world: Point) => {
      const saved = list.getState().savedTokens?.find(({ id }) => id === savedTokenId);
      const scene = deps.sceneOf();
      const landing = saved && scene ? dropCellOf(scene, saved.token, world) : null;
      if (saved && landing) spawn(saved, landing);
    },
    [deps, list, spawn],
  );
  return { list, aim, spawnAt, dropAt };
}

const describeRefusal = tokenCommandFailureMessage;

function randomId(): string {
  return crypto.randomUUID();
}

function useDisarmOnEscape(aim: StoreApi<SpawnAimStore>): void {
  const armed = useStore(aim, (state) => state.armed !== null);
  useEffect(() => {
    if (!armed) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') aim.getState().disarm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aim, armed]);
}
