import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import {
  TOO_MANY_TABLES_MESSAGE,
  sessionFailureMessage,
} from '@/features/campaigns/campaign-messages';
import type { OpenTableView } from '@/features/sessions/use-open-table';
import type { BoardIntent, BoardRenderer, CreateBoardRenderer } from '@/renderer/board-renderer';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { BoardCanvas } from './board-canvas';
import { BOARD_LOAD_FAILED, movedAnnouncement } from './board-messages';
import { useBoardKeyboard } from './use-board-keyboard';

export type BoardAreaProps = Readonly<{
  view: OpenTableView;
  interaction: StoreApi<BoardInteractionStore>;
  createBoardRenderer: CreateBoardRenderer;
  onRenderer: (renderer: BoardRenderer | null) => void;
  /** Enter on a selected token: show its card. */
  onOpenToken: (tokenId: string) => void;
}>;

/** What fills the room behind the floating UI: the canvas once the board is ready, or why not.
 *
 *  Example: `<BoardArea view={view} interaction={interaction} createBoardRenderer={create} onRenderer={setRenderer} />` */
export function BoardArea({ view, ...canvas }: BoardAreaProps): React.JSX.Element | null {
  if (view.kind === 'full') return <BoardAlert message={TOO_MANY_TABLES_MESSAGE} />;
  return <OpenBoard presence={view.presence} board={view.board} {...canvas} />;
}

type OpenBoardProps = Omit<BoardAreaProps, 'view'> &
  Readonly<{ presence: StoreApi<TablePresenceStore>; board: StoreApi<BoardStore> }>;

function OpenBoard({ presence, board, ...canvas }: OpenBoardProps): React.JSX.Element | null {
  const sessionFailure = useTablePresence(presence, (state) => state.failure);
  const status = useBoard(board, (state) => state.status);
  if (sessionFailure && sessionFailure !== 'unauthenticated') {
    return <BoardAlert message={sessionFailureMessage(sessionFailure)} />;
  }
  if (status === 'failed') {
    return <BoardAlert message={BOARD_LOAD_FAILED} onRetry={() => board.getState().retry()} />;
  }
  if (status === 'loading') return null;
  return <InteractiveCanvas board={board} {...canvas} />;
}

function InteractiveCanvas({
  board,
  interaction,
  createBoardRenderer,
  onRenderer,
  onOpenToken,
}: Omit<OpenBoardProps, 'presence'>): React.JSX.Element {
  const onKeyDown = useBoardKeyboard({ board, interaction, onOpen: onOpenToken });
  return (
    <BoardCanvas
      board={board}
      interaction={interaction}
      createBoardRenderer={createBoardRenderer}
      onIntent={(intent) => routeIntent({ board, interaction }, intent)}
      onRenderer={onRenderer}
      onKeyDown={onKeyDown}
    />
  );
}

type IntentStores = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
}>;

// Dragging and dropping a token are commands (a preview, then the move); the rest is local state.
function routeIntent({ board, interaction }: IntentStores, intent: BoardIntent): void {
  const local = interaction.getState();
  if (intent.kind === 'tokenDragged') {
    return local.dragOver(intent.tokenId, intent.origin, intent.cell);
  }
  if (intent.kind === 'tokenDragCancelled') return local.cancelDrag();
  if (intent.kind !== 'tokenDropped') return local.pointer(intent);
  const token = board.getState().board?.tokens.find(({ id }) => id === intent.tokenId);
  const announce =
    token && intent.cell && movedAnnouncement(token.name, intent.cell.col, intent.cell.row);
  void local.dropToken(intent.tokenId, intent.cell, announce ?? undefined);
}

type BoardAlertProps = Readonly<{ message: string; onRetry?: () => void }>;

function BoardAlert({ message, onRetry }: BoardAlertProps): React.JSX.Element {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
      <p role="alert" className="max-w-prose text-center text-sm text-destructive-text">
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
