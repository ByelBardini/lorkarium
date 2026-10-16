import { MAX_OPEN_TABLES } from '@lorkarium/contracts';
import { z } from 'zod';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  TableSessionApi,
  TableSessionHandle,
  TableSessionUpdate,
} from '@/services/table-session-api';
import type { KeyValueStorage } from '@/stores/rail-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';

export const OPEN_TABLES_STORAGE_KEY = 'lorkarium.openTables';

/** `sessionStorage` as this store uses it; injected so tests and blocked storage work. */
export type TabStorage = KeyValueStorage & Pick<Storage, 'removeItem'>;

export type OpenTableRef = Readonly<{ campaignId: string; name: string }>;

export type OpenTable = OpenTableRef & Readonly<{ presence: StoreApi<TablePresenceStore> }>;

export type OpenTableResult = 'opened' | 'already-open' | 'full';

export type OpenTablesState = Readonly<{
  ownerId: string | null;
  tables: readonly OpenTable[];
  sessionRefused: boolean;
}>;

export type OpenTablesStore = OpenTablesState &
  Readonly<{
    restore: (userId: string) => void;
    open: (table: OpenTableRef) => OpenTableResult;
    close: (campaignId: string) => void;
    closeAll: () => void;
    suspendAll: () => void;
  }>;

export type OpenTablesDeps = Readonly<{ api: TableSessionApi; storage: TabStorage }>;

// Not a network DTO: only what this tab wrote for itself, read back defensively.
const storedTablesSchema = z.object({
  userId: z.string(),
  tables: z.array(z.object({ campaignId: z.string(), name: z.string() })).max(MAX_OPEN_TABLES),
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
      restore: (userId) => actions.restore(userId),
      open: (table) => actions.open(table),
      close: (campaignId) => actions.close(campaignId),
      closeAll: () => actions.closeAll(),
      suspendAll: () => actions.suspendAll(),
    };
  });
}

class OpenTablesActions {
  // Handles are not renderable state, so they live beside the store, not in it.
  private readonly handles = new Map<string, TableSessionHandle>();

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
    handle.close();
    this.set({ tables: this.get().tables.filter((table) => table.campaignId !== campaignId) });
    writeStored(this.deps.storage, this.get());
  }

  /** Logout: closes every table and forgets the tab's list. */
  closeAll(): void {
    this.suspendAll();
    removeStored(this.deps.storage);
  }

  /** A refused session: closes every table but keeps the tab's list for the next `restore`. */
  suspendAll(): void {
    for (const handle of this.handles.values()) handle.close();
    this.handles.clear();
    this.set({ ownerId: null, tables: [], sessionRefused: false });
  }

  private openTable(table: OpenTableRef): OpenTableResult {
    const { tables } = this.get();
    if (tables.some(({ campaignId }) => campaignId === table.campaignId)) return 'already-open';
    if (tables.length >= MAX_OPEN_TABLES) return 'full';
    const presence = createTablePresenceStore(table.campaignId);
    this.set({ tables: [...tables, { ...table, presence }] });
    const listener = (update: TableSessionUpdate): void => applyUpdate(this.set, presence, update);
    this.handles.set(table.campaignId, this.deps.api.open(table.campaignId, listener));
    return 'opened';
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

function applyUpdate(
  set: SetOpenTables,
  presence: StoreApi<TablePresenceStore>,
  update: TableSessionUpdate,
): void {
  presence.getState().apply(update);
  if (update.kind === 'failed' && update.failure === 'unauthenticated') {
    set({ sessionRefused: true });
  }
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
  const tables = state.tables.map(({ campaignId, name }) => ({ campaignId, name }));
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
