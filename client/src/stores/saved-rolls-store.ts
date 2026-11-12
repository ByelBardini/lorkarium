import type {
  CreateSavedRollRequestDto,
  SavedRollDto,
  SavedRollFolderDto,
} from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  SavedRollsApi,
  SavedRollsFailure,
  SavedRollsResult,
} from '@/services/saved-rolls-api';

export type SavedRollsStore = Readonly<{
  /** `null` while the first list is on its way. */
  rolls: readonly SavedRollDto[] | null;
  /** Empty until the folders arrive: the rolls show meanwhile, out of any folder they are in. */
  folders: readonly SavedRollFolderDto[];
  loadFailure: SavedRollsFailure | null;
  /** Lists the rolls and the folders again (each screen that shows them asks once, on mount). */
  load: () => void;
  create: (input: CreateSavedRollRequestDto) => Promise<SavedRollsResult<SavedRollDto>>;
  remove: (savedRollId: string) => Promise<SavedRollsResult<null>>;
  /** Puts the roll in a folder; `null` takes it out of any. */
  move: (savedRollId: string, folderId: string | null) => Promise<SavedRollsResult<SavedRollDto>>;
  createFolder: (name: string) => Promise<SavedRollsResult<SavedRollFolderDto>>;
  renameFolder: (folderId: string, name: string) => Promise<SavedRollsResult<SavedRollFolderDto>>;
  /** Deletes the folder; its rolls stay, out of any folder (the server's rule). */
  removeFolder: (folderId: string) => Promise<SavedRollsResult<null>>;
}>;

type SetSavedRolls = StoreApi<SavedRollsStore>['setState'];
type RollsChange = (rolls: readonly SavedRollDto[]) => readonly SavedRollDto[];
type FoldersChange = (folders: readonly SavedRollFolderDto[]) => readonly SavedRollFolderDto[];

// One list per api and table, shared by every screen that shows it: the "Dados" tab and the chat
// composer are mounted together (the chat drawer stays open beside the panel), and a roll saved
// in one has to be a command in the other at once. Keyed by the injected api, so each test's fake
// starts empty.
const SHARED = new WeakMap<SavedRollsApi, Map<string, StoreApi<SavedRollsStore>>>();

/** The viewer's saved rolls at one table, the same store for everyone asking with the same api.
 *
 *  Example: `savedRollsStoreOf(deps.savedRolls, campaignId).getState().load()` */
export function savedRollsStoreOf(
  api: SavedRollsApi,
  campaignId: string,
): StoreApi<SavedRollsStore> {
  const byTable = SHARED.get(api) ?? new Map<string, StoreApi<SavedRollsStore>>();
  SHARED.set(api, byTable);
  const known = byTable.get(campaignId);
  if (known) return known;
  const created = createSavedRollsStore(api, campaignId);
  byTable.set(campaignId, created);
  return created;
}

/** The saved rolls of one table: listed by `load`, then kept by each change the server confirmed
 *  (the list is only the owner's, so nobody else changes it).
 *
 *  Example: `const store = createSavedRollsStore(api, campaignId); store.getState().load()` */
export function createSavedRollsStore(
  api: SavedRollsApi,
  campaignId: string,
): StoreApi<SavedRollsStore> {
  return createStore<SavedRollsStore>((set) => {
    const tracked = changesTrackerOf(set);
    return {
      rolls: null,
      folders: [],
      loadFailure: null,
      load: () => loadInto(api, campaignId, tracked),
      ...rollCommandsOf(api, campaignId, tracked),
      ...folderCommandsOf(api, campaignId, tracked),
    };
  });
}

type ChangesTracker = Readonly<{
  set: SetSavedRolls;
  /** How many confirmed changes so far: a list asked before one of them is already old. */
  count: () => number;
  rolls: (change: RollsChange) => void;
  folders: (change: FoldersChange) => void;
}>;

function changesTrackerOf(set: SetSavedRolls): ChangesTracker {
  let changes = 0;
  return {
    set,
    count: () => changes,
    rolls: (change) => {
      changes += 1;
      set((state) => ({ rolls: change(state.rolls ?? []) }));
    },
    folders: (change) => {
      changes += 1;
      set((state) => ({ folders: change(state.folders) }));
    },
  };
}

function loadInto(api: SavedRollsApi, campaignId: string, tracked: ChangesTracker): void {
  listAgainWhenOld(
    tracked,
    () => api.list(campaignId),
    (rolls) => ({ rolls }),
  );
  listAgainWhenOld(
    tracked,
    () => api.listFolders(campaignId),
    (folders) => ({ folders }),
  );
}

// A list asked before a confirmed change may miss it: that answer is dropped and asked again.
function listAgainWhenOld<T>(
  tracked: ChangesTracker,
  list: () => Promise<SavedRollsResult<T>>,
  stateOf: (value: T) => Partial<SavedRollsStore>,
): void {
  const changesWhenAsked = tracked.count();
  void list().then((result) => {
    if (changesWhenAsked !== tracked.count()) return listAgainWhenOld(tracked, list, stateOf);
    tracked.set(result.ok ? stateOf(result.value) : { loadFailure: result.failure });
  });
}

type RollCommands = Pick<SavedRollsStore, 'create' | 'remove' | 'move'>;

function rollCommandsOf(api: SavedRollsApi, id: string, tracked: ChangesTracker): RollCommands {
  return {
    create: async (input) => {
      const result = await api.create(id, input);
      if (result.ok) tracked.rolls((kept) => [...kept, result.value]);
      return result;
    },
    remove: async (savedRollId) => {
      const result = await api.remove(id, savedRollId);
      if (result.ok) tracked.rolls((kept) => kept.filter((roll) => roll.id !== savedRollId));
      return result;
    },
    move: async (savedRollId, folderId) => {
      const result = await api.update(id, savedRollId, { folderId });
      if (!result.ok) return result;
      const moved = result.value;
      tracked.rolls((kept) => kept.map((roll) => (roll.id === moved.id ? moved : roll)));
      return result;
    },
  };
}

type FolderCommands = Pick<SavedRollsStore, 'createFolder' | 'renameFolder' | 'removeFolder'>;

function folderCommandsOf(api: SavedRollsApi, id: string, tracked: ChangesTracker): FolderCommands {
  return {
    createFolder: async (name) => {
      const result = await api.createFolder(id, name);
      if (result.ok) tracked.folders((kept) => [...kept, result.value]);
      return result;
    },
    renameFolder: async (folderId, name) => {
      const result = await api.renameFolder(id, folderId, name);
      if (!result.ok) return result;
      const renamed = result.value;
      tracked.folders((kept) => kept.map((folder) => (folder.id === folderId ? renamed : folder)));
      return result;
    },
    removeFolder: async (folderId) => {
      const result = await api.removeFolder(id, folderId);
      if (!result.ok) return result;
      tracked.folders((kept) => kept.filter((folder) => folder.id !== folderId));
      tracked.rolls((kept) => kept.map((roll) => releasedRollOf(roll, folderId)));
      return result;
    },
  };
}

function releasedRollOf(roll: SavedRollDto, folderId: string): SavedRollDto {
  return roll.folderId === folderId ? { ...roll, folderId: null } : roll;
}

/** Subscribes a component to a part of one table's saved rolls.
 *
 *  Example: `const rolls = useSavedRollsStore(store, (state) => state.rolls)` */
export function useSavedRollsStore<T>(
  store: StoreApi<SavedRollsStore>,
  pick: (state: SavedRollsStore) => T,
): T {
  return useStore(store, pick);
}
