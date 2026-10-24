import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { playerIdsOf } from '@/lib/table-role';
import type { TablePresenceStore } from '@/stores/table-presence-store';

const NO_PLAYERS: readonly string[] = [];

/** The ids of the table's players (sorted), for the spectator's sight: given once by the room
 *  instead of threading the presence through every component that reads the sight filter. Outside
 *  a room it is empty, and only a spectator would notice. */
export const TablePlayersContext = createContext<readonly string[]>(NO_PLAYERS);

/** The players of the room around this component.
 *
 *  Example: `const players = useTablePlayers(); sightNowOf(table, interaction, players)` */
export function useTablePlayers(): readonly string[] {
  return useContext(TablePlayersContext);
}

/** The players of a table's presence, the same array while the ids stay the same: the roster
 *  changes at every absence and every profile, the players far less.
 *
 *  Example: `<TablePlayersContext value={usePlayerIdsOf(table?.presence ?? null)}>…</TablePlayersContext>` */
export function usePlayerIdsOf(presence: StoreApi<TablePresenceStore> | null): readonly string[] {
  const subscribe = useCallback(
    (onChange: () => void) => presence?.subscribe(onChange) ?? (() => undefined),
    [presence],
  );
  const key = useSyncExternalStore(subscribe, () =>
    presence ? playerIdsOf(presence.getState().members).join(',') : '',
  );
  return useMemo(() => (key === '' ? NO_PLAYERS : key.split(',')), [key]);
}
