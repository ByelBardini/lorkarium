import type { StoreApi } from 'zustand/vanilla';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { BoardToolbar, type BoardToolbarProps } from './board-toolbar';

export type RoomToolbarProps = Omit<BoardToolbarProps, 'sightOn' | 'members'> &
  Readonly<{
    board: StoreApi<BoardStore> | null;
    presence: StoreApi<TablePresenceStore> | null;
  }>;

/** The room's toolbar: before the table opens it has no scene to preview; once it does, Escuro
 *  and Luz do dia give the master "Ver como os selecionados".
 *
 *  Example: `<RoomToolbar board={table.board} presence={table.presence} interaction={interaction} renderer={renderer} role={role} … />` */
export function RoomToolbar({ board, presence, ...toolbar }: RoomToolbarProps): React.JSX.Element {
  if (!board || !presence) return <BoardToolbar {...toolbar} />;
  return <TableToolbar board={board} presence={presence} {...toolbar} />;
}

function TableToolbar({
  board,
  presence,
  ...toolbar
}: Omit<BoardToolbarProps, 'sightOn' | 'members'> &
  Readonly<{ board: StoreApi<BoardStore>; presence: StoreApi<TablePresenceStore> }>) {
  const vision = useBoard(board, (state) => state.board?.scene.vision);
  const members = useTablePresence(presence, (state) => state.members);
  const sightOn = vision === 'dark' || vision === 'daylight';
  return <BoardToolbar {...toolbar} members={members} sightOn={sightOn} />;
}
