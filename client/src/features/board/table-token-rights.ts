import type { CampaignInfoDto } from '@lorkarium/contracts';
import type { TableTokenRights } from '@lorkarium/game-core';
import { createContext, useContext, useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  NO_TOKEN_KEYS,
  liveTableTokenRightsOf,
  viewerTokenRightsOf,
  type ViewerTokenRights,
} from '@/lib/token-rights-of-viewer';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useOpenTables, type OpenTablesStore } from '@/stores/open-tables-store';

/** The players' token keys of the room's table, given once by the room (live by
 *  `session:campaignUpdated`). Outside a room both are off: only the master creates or edits. */
export const TableTokenKeysContext = createContext<TableTokenRights>(NO_TOKEN_KEYS);

/** The keys of the room around this component.
 *
 *  Example: `const keys = useTableTokenKeys(); roleCanCreateTokens(role, keys)` */
export function useTableTokenKeys(): TableTokenRights {
  return useContext(TableTokenKeysContext);
}

/** What the board's viewer may do with tokens, by the room's keys.
 *
 *  Example: `const rights = useViewerTokenRights(board); rights.of(token).edit` */
export function useViewerTokenRights(board: StoreApi<BoardStore>): ViewerTokenRights {
  const keys = useTableTokenKeys();
  const viewer = useBoard(board, (state) => state.board?.viewer ?? null);
  return useMemo(() => viewerTokenRightsOf(keys, viewer), [keys, viewer]);
}

/** The keys in force on the room's table: live from the open tables store once a
 *  `session:campaignUpdated` came, the route's campaign before that.
 *
 *  Example: `<TableTokenKeysContext value={useRoomTokenKeys(openTables, campaign)}>…` */
export function useRoomTokenKeys(
  openTables: StoreApi<OpenTablesStore>,
  campaign: Pick<CampaignInfoDto, 'id' | 'playersCreateTokens' | 'playersDeleteTokens'>,
): TableTokenRights {
  const live = useOpenTables(
    openTables,
    (state) => state.tables.find(({ campaignId }) => campaignId === campaign.id)?.tokenRights,
  );
  const { playersCreateTokens, playersDeleteTokens } = campaign;
  return useMemo(
    () =>
      liveTableTokenRightsOf(
        { tokenRights: live ?? null },
        { playersCreateTokens, playersDeleteTokens },
      ),
    [live, playersCreateTokens, playersDeleteTokens],
  );
}
