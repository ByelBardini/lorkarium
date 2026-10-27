import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';

/** A table the server closed (its master deleted it, or the person left it) takes them out of its screens (the room, the detail) to
 *  the home; the store already closed it and keeps the notice the shell shows.
 *
 *  Example: `useLeaveDeletedTable(deps.openTables)` */
export function useLeaveDeletedTable(openTables: StoreApi<OpenTablesStore>): void {
  const notice = useOpenTables(openTables, (state) => state.deletedNotice);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!notice || !isUnder(pathname, `/campaigns/${notice.campaignId}`)) return;
    void navigate('/', { replace: true });
  }, [notice, pathname, navigate]);
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}
