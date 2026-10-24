import {
  MAX_OPEN_TABLES,
  campaignCoverDto,
  type CampaignCoverDto,
  type CampaignInfoDto,
} from '@lorkarium/contracts';
import { z } from 'zod';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  CastHandle,
  TableSessionApi,
  TableSessionHandle,
  TableSessionUpdate,
} from '@/services/table-session-api';
import { fallbackCoverOf } from '@/lib/campaign-cover';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import {
  createSceneTabsStore,
  groupTabOf,
  type CreateTabInteraction,
  type SceneTabsStore,
} from '@/stores/scene-tabs-store';
import type { TabStorage } from '@/stores/scene-tabs-storage';
import type { TableEditStore } from '@/stores/table-edit-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';

export type { TabStorage } from '@/stores/scene-tabs-storage';

export const OPEN_TABLES_STORAGE_KEY = 'lorkarium.openTables';

/** `castSceneId`: the table's cast (the campaign detail's), followed while the table is open.
 *  `cover`: the campaign's; without it (a list stored by an older tab) the id's drawing. */
export type OpenTableRef = Readonly<{
  campaignId: string;
  name: string;
  castSceneId: string;
  cover?: CampaignCoverDto;
}>;

/** An open table: its live presence, its grid tabs, its cast (the characters' anchors and the
 *  table's pieces, in the table's version), and — for the group grid's tab, which everyone has
 *  open — its confirmed board and this user's undo stack on it (kept while the table stays
 *  open). */
export type OpenTable = Omit<OpenTableRef, 'cover'> &
  Readonly<{
    /** Kept up to date by `session:campaignUpdated`, like the name. */
    cover: CampaignCoverDto;
    presence: StoreApi<TablePresenceStore>;
    board: StoreApi<BoardStore>;
    cast: StoreApi<BoardStore>;
    edits: StoreApi<TableEditStore>;
    tabs: StoreApi<SceneTabsStore>;
  }>;

export type OpenTableResult = 'opened' | 'already-open' | 'full';

/** A table the master deleted while it was open here: closed, and named for the notice. */
export type DeletedTableNotice = Readonly<{ campaignId: string; name: string }>;

export type OpenTablesState = Readonly<{
  ownerId: string | null;
  tables: readonly OpenTable[];
  sessionRefused: boolean;
  deletedNotice: DeletedTableNotice | null;
}>;

export type OpenTablesStore = OpenTablesState &
  Readonly<{
    restore: (userId: string) => void;
    open: (table: OpenTableRef) => OpenTableResult;
    close: (campaignId: string) => void;
    closeAll: () => void;
    /** This tab stood still (`true`) or moved again: every open table hears it. */
    setAway: (away: boolean) => void;
    suspendAll: () => void;
    /** The notice of a deleted table was read (or replaced by the screen). */
    dismissDeletedNotice: () => void;
  }>;

export type OpenTablesDeps = Readonly<{
  api: TableSessionApi;
  storage: TabStorage;
  /** The interaction of each grid tab (its commands, its refusal messages). */
  createInteraction: CreateTabInteraction;
}>;

// Not a network DTO: only what this tab wrote for itself, read back defensively.
const storedTablesSchema = z.object({
  userId: z.string(),
  tables: z
    .array(
      z.object({
        campaignId: z.string(),
        name: z.string(),
        castSceneId: z.string(),
        cover: campaignCoverDto.optional(),
      }),
    )
    .max(MAX_OPEN_TABLES),
});

type StoredTables = z.infer<typeof storedTablesSchema>;

type SetOpenTables = StoreApi<OpenTablesStore>['setState'];

type GetOpenTables = StoreApi<OpenTablesStore>['getState'];

/** The tables this tab keeps open, each with its live presence, at most `MAX_OPEN_TABLES`.
 *  Kept per tab in `sessionStorage`, so an F5 reopens them and closing the browser forgets them.
 *
 *  Example: `createOpenTablesStore({ api, storage: window.sessionStorage }).getState().restore(user.id)` */
export function createOpenTablesStore(deps: OpenTablesDeps): StoreApi<OpenTablesStore> {
  return createStore<OpenTablesStore>()((set, get) => {
    const actions = new OpenTablesActions(deps, set, get);
    return {
      ownerId: null,
      tables: [],
      sessionRefused: false,
      deletedNotice: null,
      restore: (userId) => actions.restore(userId),
      open: (table) => actions.open(table),
      close: (campaignId) => actions.close(campaignId),
      closeAll: () => actions.closeAll(),
      setAway: (away) => actions.setAway(away),
      suspendAll: () => actions.suspendAll(),
      dismissDeletedNotice: () => set({ deletedNotice: null }),
    };
  });
}

class OpenTablesActions {
  // Handles are not renderable state, so they live beside the store, not in it.
  private readonly handles = new Map<string, TableSessionHandle>();
  private readonly casts = new Map<string, CastHandle>();
  // A table opened while the tab stands still is told so at once.
  private away = false;

  constructor(
    private readonly deps: OpenTablesDeps,
    private readonly set: SetOpenTables,
    private readonly get: GetOpenTables,
  ) {}

  // Idempotent: every table already open answers already-open, and closed ones left the storage.
  restore(userId: string): void {
    const { ownerId } = this.get();
    if (ownerId !== null && ownerId !== userId) this.closeAll();
    this.set({ ownerId: userId });
    const stored = readStored(this.deps.storage);
    if (stored?.userId !== userId) return;
    for (const table of stored.tables) this.openTable(table);
  }

  open(table: OpenTableRef): OpenTableResult {
    const result = this.openTable(table);
    if (result === 'opened') writeStored(this.deps.storage, this.get());
    return result;
  }

  close(campaignId: string): void {
    const handle = this.handles.get(campaignId);
    if (!handle) return;
    this.handles.delete(campaignId);
    this.casts.delete(campaignId);
    handle.close();
    this.tableOf(campaignId)?.tabs.getState().dispose(true);
    this.set({ tables: this.get().tables.filter((table) => table.campaignId !== campaignId) });
    writeStored(this.deps.storage, this.get());
  }

  setAway(away: boolean): void {
    this.away = away;
    for (const handle of this.handles.values()) handle.setAway(away);
  }

  /** Logout: closes every table and forgets the tab's list. */
  closeAll(): void {
    for (const table of this.get().tables) table.tabs.getState().dispose(true);
    this.suspendAll();
    removeStored(this.deps.storage);
  }

  /** A refused session: closes every table but keeps the tab's list for the next `restore`. */
  suspendAll(): void {
    for (const handle of this.handles.values()) handle.close();
    for (const table of this.get().tables) table.tabs.getState().dispose(false);
    this.handles.clear();
    this.casts.clear();
    this.set({ ownerId: null, tables: [], sessionRefused: false, deletedNotice: null });
  }

  private openTable(table: OpenTableRef): OpenTableResult {
    const { tables } = this.get();
    if (tables.some(({ campaignId }) => campaignId === table.campaignId)) return 'already-open';
    if (tables.length >= MAX_OPEN_TABLES) return 'full';
    const presence = createTablePresenceStore(table.campaignId);
    const cast = createBoardStore(table.campaignId, () =>
      this.casts.get(table.campaignId)?.resync(),
    );
    const board = createBoardStore(
      table.campaignId,
      () => this.handles.get(table.campaignId)?.resync(),
      () => cast.getState().board,
    );
    const tabs = this.tabsOf(table.campaignId, board, cast);
    const edits = groupTabOf(tabs.getState()).edits;
    const cover = table.cover ?? fallbackCoverOf(table.campaignId);
    const opened: OpenTable = { ...table, cover, presence, board, cast, edits, tabs };
    this.set({ tables: [...tables, opened] });
    const stores = { presence, board, tabs };
    const listener = (update: TableSessionUpdate): void =>
      this.onUpdate(table.campaignId, stores, update);
    const handle = this.deps.api.open(table.campaignId, listener);
    this.handles.set(table.campaignId, handle);
    const followed = handle.followCast(table.castSceneId, (update) =>
      cast.getState().apply(update),
    );
    this.casts.set(table.campaignId, followed);
    if (this.away) handle.setAway(true);
    tabs.getState().restore();
    return 'opened';
  }

  private onUpdate(campaignId: string, stores: TableStores, update: TableSessionUpdate): void {
    if (update.kind === 'campaignDeleted') return this.closeDeleted(campaignId);
    if (update.kind === 'campaignUpdated') this.retitle(update.event.campaign);
    applyUpdate(this.set, stores, update);
  }

  // The server already took this socket out of the room; closing only forgets the table here.
  private closeDeleted(campaignId: string): void {
    const table = this.tableOf(campaignId);
    if (!table) return;
    this.close(campaignId);
    this.set({ deletedNotice: { campaignId, name: table.name } });
  }

  private retitle(campaign: CampaignInfoDto): void {
    const tables = this.get().tables.map((table) =>
      table.campaignId === campaign.id
        ? { ...table, name: campaign.name, cover: campaign.cover }
        : table,
    );
    this.set({ tables });
    writeStored(this.deps.storage, this.get());
  }

  private tabsOf(
    campaignId: string,
    groupBoard: StoreApi<BoardStore>,
    cast: StoreApi<BoardStore>,
  ): StoreApi<SceneTabsStore> {
    return createSceneTabsStore({
      campaignId,
      groupBoard,
      cast,
      watch: (sceneId, listener) => this.handleOf(campaignId).watch(sceneId, listener),
      storage: this.deps.storage,
      createInteraction: this.deps.createInteraction,
    });
  }

  // The tabs open their watches only after the table's handle exists (the restore comes last).
  private handleOf(campaignId: string): TableSessionHandle {
    const handle = this.handles.get(campaignId);
    if (!handle) throw new Error(`table ${campaignId} has no session handle; open it first`);
    return handle;
  }

  private tableOf(campaignId: string): OpenTable | undefined {
    return this.get().tables.find((table) => table.campaignId === campaignId);
  }
}

/** React view of a slice of the open tables (re-renders when the slice changes).
 *
 *  Example: `const tables = useOpenTables(openTables, (state) => state.tables)` */
export function useOpenTables<T>(
  store: StoreApi<OpenTablesStore>,
  selector: (state: OpenTablesStore) => T,
): T {
  return useStore(store, selector);
}

type TableStores = Readonly<{
  presence: StoreApi<TablePresenceStore>;
  board: StoreApi<BoardStore>;
  tabs: StoreApi<SceneTabsStore>;
}>;

function applyUpdate(set: SetOpenTables, stores: TableStores, update: TableSessionUpdate): void {
  stores.presence.getState().apply(update);
  stores.board.getState().apply(update);
  stores.tabs.getState().apply(update);
  const refused = update.kind === 'failed' || update.kind === 'boardFailed';
  if (refused && update.failure === 'unauthenticated') set({ sessionRefused: true });
}

// Private mode or blocked site data throws on access: the list then lives only in memory.
function readStored(storage: TabStorage): StoredTables | null {
  try {
    const raw = storage.getItem(OPEN_TABLES_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = storedTablesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeStored(storage: TabStorage, state: OpenTablesState): void {
  if (state.ownerId === null) return;
  const tables = state.tables.map(({ campaignId, name, castSceneId, cover }) => ({
    campaignId,
    name,
    castSceneId,
    cover,
  }));
  try {
    storage.setItem(OPEN_TABLES_STORAGE_KEY, JSON.stringify({ userId: state.ownerId, tables }));
  } catch {
    // Keeps working in memory for this visit.
  }
}

function removeStored(storage: TabStorage): void {
  try {
    storage.removeItem(OPEN_TABLES_STORAGE_KEY);
  } catch {
    // Nothing was stored to begin with.
  }
}
