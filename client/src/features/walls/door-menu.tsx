import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';

/** Where a door was right clicked: its id and the viewport point to open the menu at. */
export type DoorMenuRequest = Readonly<{ wallId: string; x: number; y: number }>;

export type DoorMenuProps = Readonly<{
  request: DoorMenuRequest;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  onClose: () => void;
}>;

/** The master's right click on a door: open or close it, and lock or unlock it. Closing (a
 *  choice, Esc, a click away) tells `onClose`.
 *
 *  Example: `{doorMenu && <DoorMenu request={doorMenu} board={board} interaction={interaction} onClose={close} />}` */
export function DoorMenu({ request, board, interaction, onClose }: DoorMenuProps) {
  const nameId = useId();
  const door = useBoard(
    board,
    (state) => state.board?.walls.find(({ id }) => id === request.wallId) ?? null,
  );
  if (!door || door.kind !== 'door') return null;
  const set = (state: 'open' | 'closed' | 'locked') => () =>
    void interaction.getState().setDoorState(door, state);
  const locked = door.doorState === 'locked';
  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: request.x, top: request.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        aria-labelledby={nameId}
        align="start"
        className="min-w-40"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <span id={nameId} className="sr-only">
          Porta
        </span>
        {door.doorState === 'open' ? (
          <DropdownMenuItem onSelect={set('closed')}>Fechar</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={set('open')}>Abrir</DropdownMenuItem>
        )}
        {locked ? (
          <DropdownMenuItem onSelect={set('closed')}>Destrancar</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={set('locked')}>Trancar</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
