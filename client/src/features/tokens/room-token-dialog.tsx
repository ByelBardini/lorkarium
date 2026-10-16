import { cell } from '@lorkarium/game-core';
import { useState } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { BoardRenderer } from '@/renderer/board-renderer';
import type { TableBoardCommands } from '@/services/table-board-commands';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { TokenDialog } from './token-dialog';
import type { TokenPlayer } from './token-form';

export type RoomTokenDialogProps = Readonly<{
  campaignId: string;
  table: Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }>;
  /** `null` for "Novo token". */
  tokenId: string | null;
  renderer: BoardRenderer | null;
  commands: TableBoardCommands;
  onClose: () => void;
}>;

/** The token dialog over the confirmed board: the players of the table can control it, and a
 *  new token goes to the cell at the center of the view.
 *
 *  Example: `{dialog && <RoomTokenDialog campaignId={id} table={table} tokenId={null} renderer={renderer} commands={commands} onClose={close} />}` */
export function RoomTokenDialog(props: RoomTokenDialogProps): React.JSX.Element | null {
  const { table, tokenId } = props;
  const token = useBoard(table.board, (state) =>
    tokenId ? (state.board?.tokens.find(({ id }) => id === tokenId) ?? null) : null,
  );
  const members = useTablePresence(table.presence, (state) => state.members);
  const live = useTablePresence(table.presence, (state) => state.status === 'live');
  const [placeAt] = useState(() => props.renderer?.viewCenterCell() ?? cell(0, 0));
  if (tokenId && !token) return null;
  const players: TokenPlayer[] = members
    .filter(({ role }) => role === 'player')
    .map(({ userId, name }) => ({ userId, name }));
  return (
    <TokenDialog
      campaignId={props.campaignId}
      token={token}
      placeAt={placeAt}
      players={players}
      commands={props.commands}
      connected={live}
      onClose={props.onClose}
    />
  );
}
