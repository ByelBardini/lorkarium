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

/** Where a map light was right clicked: its id and the viewport point to open the menu at. */
export type LightMenuRequest = Readonly<{ lightId: string; x: number; y: number }>;

export type LightMenuProps = Readonly<{
  request: LightMenuRequest;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  onClose: () => void;
}>;

/** The master's right click on a map light, with any tool: put it out or light it (not on the
 *  undo stack), or delete it. Closing (a choice, Esc, a click away) tells `onClose`.
 *
 *  Example: `{lightMenu && <LightMenu request={lightMenu} board={board} interaction={interaction} onClose={close} />}` */
export function LightMenu({ request, board, interaction, onClose }: LightMenuProps) {
  const nameId = useId();
  const light = useBoard(
    board,
    (state) => state.board?.lights.find(({ id }) => id === request.lightId) ?? null,
  );
  if (!light) return null;
  const local = interaction.getState();
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
          Ações da luz
        </span>
        <DropdownMenuItem onSelect={() => void local.setLightsLit([light], !light.lit)}>
          {light.lit ? 'Apagar' : 'Acender'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void local.deleteLights([light])}>
          Excluir luz
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
