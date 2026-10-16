import { useLocation, useNavigate } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import type { OpenTablesStore } from '@/stores/open-tables-store';

/** "Sair da mesa": closes the table for this tab (the others see the person leave at once); the
 *  person stays a member. Leaving the table on screen goes to the home first.
 *
 *  Example: `const leaveTable = useLeaveTable(deps.openTables); void leaveTable(campaign.id)` */
export function useLeaveTable(
  openTables: StoreApi<OpenTablesStore>,
): (campaignId: string) => Promise<void> {
  const location = useLocation();
  const navigate = useNavigate();
  return async (campaignId) => {
    // Home first: the table screen, still mounted, would show a table no longer open.
    if (location.pathname === `/campaigns/${campaignId}/table`) await navigate('/');
    openTables.getState().close(campaignId);
  };
}
