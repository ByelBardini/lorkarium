import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { loginPathFor } from '@/app/route-access';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';
import type { SessionStore } from '@/stores/session-store';

/** A session the server stopped accepting at any open table signs out and goes to the login,
 *  coming back to the current screen after it. The tab's list is kept, so the next sign-in of
 *  the same person reopens those tables.
 *
 *  Example: `useSignOutWhenRefused(deps.openTables, deps.sessionStore)` */
export function useSignOutWhenRefused(
  openTables: StoreApi<OpenTablesStore>,
  sessionStore: StoreApi<SessionStore>,
): void {
  const refused = useOpenTables(openTables, (state) => state.sessionRefused);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!refused) return;
    sessionStore.getState().signedOut();
    const here = new URL(`${location.pathname}${location.search}`, window.location.origin);
    const leaveForLogin = async (): Promise<void> => {
      await navigate(loginPathFor(here), { replace: true });
      // After the navigation: a table screen still mounted would reopen what is suspended.
      openTables.getState().suspendAll();
    };
    void leaveForLogin();
  }, [refused, location.pathname, location.search, navigate, openTables, sessionStore]);
}
