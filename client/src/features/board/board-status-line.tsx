import type { StoreApi } from 'zustand/vanilla';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { connectionStatusLine } from './board-messages';

export type BoardStatusLineTable = Readonly<{
  presence: StoreApi<TablePresenceStore>;
  board: StoreApi<BoardStore>;
}>;

export type BoardStatusLineProps = Readonly<{
  table: BoardStatusLineTable | null;
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** The one polite voice of the room: the connection while it is not live, then the tool hint
 *  or why the server refused a command.
 *
 *  Example: `<BoardStatusLine table={{ presence, board }} interaction={interaction} />` */
export function BoardStatusLine({ table, interaction }: BoardStatusLineProps): React.JSX.Element {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-label="Status do tabuleiro"
      className="pointer-events-none absolute bottom-3 left-3 bg-panel px-2 py-1 text-xs text-muted-foreground empty:hidden"
    >
      {table ? <StatusText table={table} interaction={interaction} /> : null}
    </p>
  );
}

type StatusTextProps = Readonly<{
  table: BoardStatusLineTable;
  interaction: StoreApi<BoardInteractionStore>;
}>;

function StatusText({ table, interaction }: StatusTextProps): string {
  const presence = useTablePresence(table.presence, (state) => state.status);
  const board = useBoard(table.board, (state) => state.status);
  const notice = useBoardInteraction(interaction, (state) => state.notice);
  return connectionStatusLine(presence, board) || (board === 'ready' ? (notice ?? '') : '');
}
