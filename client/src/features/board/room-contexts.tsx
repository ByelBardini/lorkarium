import type { TableTokenRights } from '@lorkarium/game-core';
import type { StoreApi } from 'zustand/vanilla';
import { useSightOutlines, type SightOutlineStore } from '@/stores/sight-outline-store';
import { TablePlayersContext } from './table-players';
import { TableSightOutlineRequestContext, TableSightOutlinesContext } from './table-sight-outlines';
import { TableTokenKeysContext } from './table-token-rights';

export type RoomContextsProps = Readonly<{
  players: readonly string[];
  tokenKeys: TableTokenRights;
  sightOutlines: StoreApi<SightOutlineStore>;
  children: React.ReactNode;
}>;

/** What the room gives every component inside it once: the table's players (the spectator's
 *  sight), the players' token keys (who creates, edits and deletes tokens) and the outlines known
 *  of the blockers (`useTableSightOutlines`), and the way to ask for others (`useAssetOutline`).
 *
 *  Example: `<RoomContexts players={players} tokenKeys={tokenKeys} sightOutlines={sightOutlines}>…</RoomContexts>` */
export function RoomContexts({ players, tokenKeys, sightOutlines, children }: RoomContextsProps) {
  const outlines = useSightOutlines(sightOutlines, (state) => state.outlines);
  const request = useSightOutlines(sightOutlines, (state) => state.request);
  return (
    <TablePlayersContext value={players}>
      <TableTokenKeysContext value={tokenKeys}>
        <TableSightOutlinesContext value={outlines}>
          <TableSightOutlineRequestContext value={request}>
            {children}
          </TableSightOutlineRequestContext>
        </TableSightOutlinesContext>
      </TableTokenKeysContext>
    </TablePlayersContext>
  );
}
