import { MAX_OPEN_TABLES, type CampaignDetailDto } from '@lorkarium/contracts';
import { useEffect, useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useOpenTables, type OpenTable, type OpenTablesStore } from '@/stores/open-tables-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import type { SceneTabsStore } from '@/stores/scene-tabs-store';
import { createTableEditStore, type TableEditStore } from '@/stores/table-edit-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';

export type OpenTableView =
  | Readonly<{
      kind: 'open';
      presence: StoreApi<TablePresenceStore>;
      board: StoreApi<BoardStore>;
      /** The table's cast: the characters' anchors, the cards and the conditions defined. */
      cast: StoreApi<BoardStore>;
      edits: StoreApi<TableEditStore>;
      /** The grid tabs; `null` until the table actually opens. */
      tabs: StoreApi<SceneTabsStore> | null;
    }>
  | Readonly<{ kind: 'full' }>;

/** Opens the table among the tab's open tables while its screen is shown, and leaves it open
 *  after: the presence belongs to the tab, not to the screen. With `MAX_OPEN_TABLES` already
 *  open it waits, and opens on its own once a slot frees up.
 *
 *  Example: `const view = useOpenTable(campaign, deps.openTables)` */
export function useOpenTable(
  campaign: Pick<CampaignDetailDto, 'id' | 'name' | 'castSceneId' | 'cover'>,
  openTables: StoreApi<OpenTablesStore>,
): OpenTableView {
  // Until the effect opens it, the room reads these: connecting, nobody listed, board loading.
  const [pending] = useState(() => ({
    presence: createTablePresenceStore(campaign.id),
    board: createBoardStore(campaign.id, () => undefined),
    cast: createBoardStore(campaign.id, () => undefined),
    edits: createTableEditStore(campaign.id),
  }));
  const table = useOpenTables(openTables, (state) => tableOf(state, campaign.id));
  const isFull = useOpenTables(
    openTables,
    (state) => !tableOf(state, campaign.id) && state.tables.length >= MAX_OPEN_TABLES,
  );
  // Reruns only when a slot frees up, so closing this very table does not reopen it.
  const { id: campaignId, name, castSceneId, cover } = campaign;
  useEffect(() => {
    if (!isFull) openTables.getState().open({ campaignId, name, castSceneId, cover });
  }, [campaignId, name, castSceneId, cover, isFull, openTables]);
  if (isFull) return { kind: 'full' };
  if (table) {
    const { presence, board, cast, edits, tabs } = table;
    return { kind: 'open', presence, board, cast, edits, tabs };
  }
  return { kind: 'open', ...pending, tabs: null };
}

function tableOf(state: OpenTablesStore, campaignId: string): OpenTable | null {
  return state.tables.find((table) => table.campaignId === campaignId) ?? null;
}
