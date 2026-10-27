import type { TableTokenRights } from '@lorkarium/game-core';
import { TablePlayersContext } from './table-players';
import { TableTokenKeysContext } from './table-token-rights';

export type RoomContextsProps = Readonly<{
  players: readonly string[];
  tokenKeys: TableTokenRights;
  children: React.ReactNode;
}>;

/** What the room gives every component inside it once: the table's players (the spectator's
 *  sight) and the players' token keys (who creates, edits and deletes tokens).
 *
 *  Example: `<RoomContexts players={players} tokenKeys={tokenKeys}>…</RoomContexts>` */
export function RoomContexts({ players, tokenKeys, children }: RoomContextsProps) {
  return (
    <TablePlayersContext value={players}>
      <TableTokenKeysContext value={tokenKeys}>{children}</TableTokenKeysContext>
    </TablePlayersContext>
  );
}
