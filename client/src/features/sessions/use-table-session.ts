import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { loginPathFor } from '@/app/route-access';
import type { TableSessionApi } from '@/services/table-session-api';
import type { SessionStore } from '@/stores/session-store';
import {
  createTablePresenceStore,
  useTablePresence,
  type TablePresenceStore,
} from '@/stores/table-presence-store';

/** Enters the live session of a table for as long as the screen is mounted: one presence store
 *  per visit, `open` on mount and `close` on unmount. A session the server stopped accepting
 *  signs out and goes to the login, coming back here after it.
 *
 *  Example: `const presence = useTableSession(campaign.id, deps.tableSessionApi, deps.sessionStore)` */
export function useTableSession(
  campaignId: string,
  api: TableSessionApi,
  sessionStore: StoreApi<SessionStore>,
): StoreApi<TablePresenceStore> {
  const [store] = useState(() => createTablePresenceStore(campaignId));
  useEffect(() => {
    const handle = api.open(campaignId, store.getState().apply);
    return () => handle.close();
  }, [api, campaignId, store]);
  useSignOutWhenRefused(store, sessionStore);
  return store;
}

function useSignOutWhenRefused(
  store: StoreApi<TablePresenceStore>,
  sessionStore: StoreApi<SessionStore>,
): void {
  const failure = useTablePresence(store, (state) => state.failure);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (failure !== 'unauthenticated') return;
    sessionStore.getState().signedOut();
    const here = new URL(`${location.pathname}${location.search}`, window.location.origin);
    void navigate(loginPathFor(here), { replace: true });
  }, [failure, location.pathname, location.search, navigate, sessionStore]);
}
