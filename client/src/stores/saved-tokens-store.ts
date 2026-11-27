import type {
  CreateSavedTokenRequestInput,
  SavedTokenDto,
  SavedTokenFolderDto,
  UpdateSavedTokenRequestInput,
} from '@lorkarium/contracts';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  SavedTokensApi,
  SavedTokensFailure,
  SavedTokensResult,
} from '@/services/saved-tokens-api';

export type SavedTokensStore = Readonly<{
  /** `null` while the first list is on its way. */
  savedTokens: readonly SavedTokenDto[] | null;
  folders: readonly SavedTokenFolderDto[];
  loadFailure: SavedTokensFailure | null;
  /** Lists the tokens and the folders again (the panel asks once, when it opens). */
  load: () => void;
  save: (input: CreateSavedTokenRequestInput) => Promise<SavedTokensResult<SavedTokenDto>>;
  update: (
    savedTokenId: string,
    changes: UpdateSavedTokenRequestInput,
  ) => Promise<SavedTokensResult<SavedTokenDto>>;
  remove: (savedTokenId: string) => Promise<SavedTokensResult<null>>;
  createFolder: (name: string) => Promise<SavedTokensResult<SavedTokenFolderDto>>;
  renameFolder: (folderId: string, name: string) => Promise<SavedTokensResult<SavedTokenFolderDto>>;
  /** Deletes the folder; its tokens stay, out of any folder (the server's rule). */
  removeFolder: (folderId: string) => Promise<SavedTokensResult<null>>;
}>;

type SetSavedTokens = StoreApi<SavedTokensStore>['setState'];
type TokensChange = (kept: readonly SavedTokenDto[]) => readonly SavedTokenDto[];
type FoldersChange = (kept: readonly SavedTokenFolderDto[]) => readonly SavedTokenFolderDto[];

type Tracker = Readonly<{
  set: SetSavedTokens;
  /** How many confirmed changes so far: a list asked before one of them is already old. */
  count: () => number;
  tokens: (change: TokensChange) => void;
  folders: (change: FoldersChange) => void;
}>;

/** The viewer's saved tokens at one table: listed by `load`, then kept by each change the server
 *  confirmed (the list is only the owner's, so nobody else changes it).
 *
 *  Example: `const store = createSavedTokensStore(deps.savedTokens, campaignId); store.getState().load()` */
export function createSavedTokensStore(
  api: SavedTokensApi,
  campaignId: string,
): StoreApi<SavedTokensStore> {
  return createStore<SavedTokensStore>((set) => {
    const tracked = trackerOf(set);
    return {
      savedTokens: null,
      folders: [],
      loadFailure: null,
      load: () => loadInto(api, campaignId, tracked),
      ...tokenCommandsOf(api, campaignId, tracked),
      ...folderCommandsOf(api, campaignId, tracked),
    };
  });
}

function trackerOf(set: SetSavedTokens): Tracker {
  let changes = 0;
  return {
    set,
    count: () => changes,
    tokens: (change) => {
      changes += 1;
      set((state) => ({ savedTokens: change(state.savedTokens ?? []) }));
    },
    folders: (change) => {
      changes += 1;
      set((state) => ({ folders: change(state.folders) }));
    },
  };
}

function loadInto(api: SavedTokensApi, campaignId: string, tracked: Tracker): void {
  listAgainWhenOld(
    tracked,
    () => api.list(campaignId),
    (savedTokens) => ({ savedTokens }),
  );
  listAgainWhenOld(
    tracked,
    () => api.listFolders(campaignId),
    (folders) => ({ folders }),
  );
}

// A list asked before a confirmed change may miss it: that answer is dropped and asked again.
function listAgainWhenOld<T>(
  tracked: Tracker,
  list: () => Promise<SavedTokensResult<T>>,
  stateOf: (value: T) => Partial<SavedTokensStore>,
): void {
  const changesWhenAsked = tracked.count();
  void list().then((result) => {
    if (changesWhenAsked !== tracked.count()) return listAgainWhenOld(tracked, list, stateOf);
    tracked.set(result.ok ? stateOf(result.value) : { loadFailure: result.failure });
  });
}

type TokenCommands = Pick<SavedTokensStore, 'save' | 'update' | 'remove'>;

function tokenCommandsOf(api: SavedTokensApi, id: string, tracked: Tracker): TokenCommands {
  return {
    save: async (input) => {
      const result = await api.create(id, input);
      if (result.ok) tracked.tokens((kept) => [...kept, result.value]);
      return result;
    },
    update: async (savedTokenId, changes) => {
      const result = await api.update(id, savedTokenId, changes);
      if (!result.ok) return result;
      const updated = result.value;
      tracked.tokens((kept) => kept.map((saved) => (saved.id === updated.id ? updated : saved)));
      return result;
    },
    remove: async (savedTokenId) => {
      const result = await api.remove(id, savedTokenId);
      if (result.ok) tracked.tokens((kept) => kept.filter((saved) => saved.id !== savedTokenId));
      return result;
    },
  };
}

type FolderCommands = Pick<SavedTokensStore, 'createFolder' | 'renameFolder' | 'removeFolder'>;

function folderCommandsOf(api: SavedTokensApi, id: string, tracked: Tracker): FolderCommands {
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
      tracked.tokens((kept) => kept.map((saved) => releasedOf(saved, folderId)));
      return result;
    },
  };
}

function releasedOf(saved: SavedTokenDto, folderId: string): SavedTokenDto {
  return saved.folderId === folderId ? { ...saved, folderId: null } : saved;
}

/** Subscribes a component to a part of one table's saved tokens.
 *
 *  Example: `const saved = useSavedTokensStore(store, (state) => state.savedTokens)` */
export function useSavedTokensStore<T>(
  store: StoreApi<SavedTokensStore>,
  pick: (state: SavedTokensStore) => T,
): T {
  return useStore(store, pick);
}
