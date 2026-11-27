import type { SavedTokenDto } from '@lorkarium/contracts';
import type { Cell } from '@lorkarium/game-core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import { spawnedTokenOf } from '@/lib/token-copy';
import { spawnGhostOf, type SpawnGhostView } from '@/renderer/spawn-ghost';
import type { BoardScope } from '@/services/board-command-sender';
import type { BoardCommandFailure, TableBoardCommands } from '@/services/table-board-commands';

export type SpawnDeps = Readonly<{
  /** The grid its commands go to, read when each one is sent (the group grid can change). */
  scopeOf: () => BoardScope;
  commands: TableBoardCommands;
  describeRefusal: (failure: BoardCommandFailure) => string;
  /** The confirmed token goes on this user's undo stack. */
  recordEdit: (entry: EditEntry) => void;
  /** A fresh uuid for each form of the copy. */
  newId: () => string;
}>;

export type SpawnContext = Readonly<{ readOnly: boolean; say: (notice: string) => void }>;

/** A click with a saved token armed becomes one `createTokens` of it on `cell` (the same command
 *  and rules as a paste): the token shows when its event arrives; confirmed, it goes on the undo
 *  stack (by the id the server gave); refused, the status line says why. Read only sends nothing.
 *
 *  Example: `await sendSpawn(deps, zombie, cell(4, 7), { readOnly, say })` */
export async function sendSpawn(
  deps: SpawnDeps,
  saved: SavedTokenDto,
  at: Cell,
  context: SpawnContext,
): Promise<void> {
  if (context.readOnly) return;
  const token = spawnedTokenOf(saved.token, at, deps.newId);
  const result = await deps.commands.createTokens(deps.scopeOf(), [token]);
  if (!result.ok) return context.say(deps.describeRefusal(result.failure));
  const [id] = result.createdIds ?? [];
  if (id) deps.recordEdit([{ kind: 'tokensAdded', tokens: [{ id, token }] }]);
}

export type SpawnAimStore = Readonly<{
  /** The saved token a press on the board spawns, until disarmed. */
  armed: SavedTokenDto | null;
  /** Its footprint for the board's ghost (`null` with nothing armed). */
  ghost: SpawnGhostView | null;
  /** Arms `saved`; arming the one already armed disarms it. */
  arm: (saved: SavedTokenDto) => void;
  disarm: () => void;
}>;

/** The aim of the saved tokens of one visit: what the next presses on the board spawn.
 *
 *  Example: `const aim = createSpawnAimStore(); aim.getState().arm(zombie)` */
export function createSpawnAimStore(): StoreApi<SpawnAimStore> {
  return createStore<SpawnAimStore>((set, get) => ({
    armed: null,
    ghost: null,
    arm: (saved) => {
      if (get().armed?.id === saved.id) return set({ armed: null, ghost: null });
      set({ armed: saved, ghost: spawnGhostOf(saved.token) });
    },
    disarm: () => set({ armed: null, ghost: null }),
  }));
}
