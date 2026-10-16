import { MAX_OPEN_TABLES, type CampaignDetailDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';

export type OpenTableView =
  Readonly<{ kind: 'open'; presence: StoreApi<TablePresenceStore> }> | Readonly<{ kind: 'full' }>;

/** Opens the table among the tab's open tables while its screen is shown, and leaves it open
 *  after: the presence belongs to the tab, not to the screen. With `MAX_OPEN_TABLES` already
 *  open it waits, and opens on its own once a slot frees up.
 *
 *  Example: `const view = useOpenTable(campaign, deps.openTables)` */
export function useOpenTable(
  campaign: Pick<CampaignDetailDto, 'id' | 'name'>,
  openTables: StoreApi<OpenTablesStore>,
): OpenTableView {
  // Until the effect opens it, the panel reads this one: connecting, nobody listed.
  const [pending] = useState(() => createTablePresenceStore(campaign.id));
  const presence = useOpenTables(openTables, (state) => presenceOf(state, campaign.id));
  const isFull = useOpenTables(
    openTables,
    (state) => !presenceOf(state, campaign.id) && state.tables.length >= MAX_OPEN_TABLES,
  );
  // Reruns only when a slot frees up, so closing this very table does not reopen it.
  useEffect(() => {
    if (!isFull) openTables.getState().open({ campaignId: campaign.id, name: campaign.name });
  }, [campaign.id, campaign.name, isFull, openTables]);
  if (isFull) return { kind: 'full' };
  return { kind: 'open', presence: presence ?? pending };
}

function presenceOf(
  state: OpenTablesStore,
  campaignId: string,
): StoreApi<TablePresenceStore> | null {
  return state.tables.find((table) => table.campaignId === campaignId)?.presence ?? null;
}
