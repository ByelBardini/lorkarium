import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useRevalidator } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTables, type OpenTable, type OpenTablesStore } from '@/stores/open-tables-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import type { TablePresenceState } from '@/stores/table-presence-store';

/** What the library reads of the open table: whether it is live and how many players are on. */
export type LibraryTableView = Readonly<{
  table: OpenTable | null;
  /** Commands only while the table is live; reconnecting disables every action. */
  live: boolean;
  playersOnline: number;
}>;

function useSlice<S, T>(store: StoreApi<S> | null, pick: (state: S) => T, fallback: T): T {
  const subscribe = useCallback(
    (onChange: () => void) => store?.subscribe(onChange) ?? (() => undefined),
    [store],
  );
  return useSyncExternalStore(subscribe, () => (store ? pick(store.getState()) : fallback));
}

function playersOnlineOf(state: TablePresenceState): number {
  return state.members.filter(({ online, role }) => online && role === 'player').length;
}

/** The open table of `campaignId` (the room under the library opens it), live or not.
 *
 *  Example: `const { table, live } = useLibraryTable(deps.openTables, campaign.id)` */
export function useLibraryTable(
  openTables: StoreApi<OpenTablesStore>,
  campaignId: string,
): LibraryTableView {
  const table = useOpenTables(
    openTables,
    (state) => state.tables.find((open) => open.campaignId === campaignId) ?? null,
  );
  const presence = table?.presence ?? null;
  const live = useSlice(presence, (state) => state.status === 'live', false);
  const playersOnline = useSlice(presence, playersOnlineOf, 0);
  return { table, live, playersOnline };
}

/** Reads the library again at each `library:changed` of the table (its `libraryRevision`).
 *
 *  Example: `useRevalidateOnLibraryChange(table?.tabs ?? null)` */
export function useRevalidateOnLibraryChange(tabs: StoreApi<SceneTabsStore> | null): void {
  const revision = useSlice(tabs, (state) => state.libraryRevision, 0);
  const [firstRevision] = useState(revision);
  const { revalidate } = useRevalidator();
  useEffect(() => {
    if (revision !== firstRevision) void revalidate();
  }, [revision, firstRevision, revalidate]);
}
