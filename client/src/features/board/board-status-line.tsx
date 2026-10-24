import type { StoreApi } from 'zustand/vanilla';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { watchesOnly } from '@/lib/table-role';
import { connectionStatusLine, NO_EYES, NO_PLAYER_EYES, PREVIEW_BLIND } from './board-messages';
import type { BoardSight } from '@/lib/board-sight';
import { useBoardSight } from './use-board-sight';

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
  const sight = useBoardSight(table.board, interaction);
  const watching = useBoard(table.board, (state) =>
    watchesOnly(state.board?.viewer.role ?? 'player'),
  );
  const blind = blindLineOf(sight, watching);
  return connectionStatusLine(presence, board) || (board === 'ready' ? (notice ?? blind) : '');
}

// Why nothing shows: no eye of one's own (a spectator has the players' instead), or the master's
// preview with nothing selected.
function blindLineOf(sight: BoardSight, watching: boolean): string {
  if (sight.noEyes) return watching ? NO_PLAYER_EYES : NO_EYES;
  return sight.previewBlind ? PREVIEW_BLIND : '';
}
