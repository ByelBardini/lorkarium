import { tokenLayerDto, type TokenLayerDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { LAYER_LABEL } from './board-messages';

/** Where the master right clicked a token: its id and the viewport point to open the menu at. */
export type TokenMenuRequest = Readonly<{ tokenId: string; x: number; y: number }>;

export type TokenContextMenuProps = Readonly<{
  request: TokenMenuRequest;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** "Aplicar condição…": the tokens it goes to. */
  onApplyCondition: (tokenIds: readonly string[]) => void;
  onClose: () => void;
}>;

const LAYER_TITLE = 'Mover para camada';

/** The master's right click on a token: "Aplicar condição…" and "Mover para camada" (the layer of
 *  that token checked). Both act on the whole selection when the token is in it, or on that token
 *  alone. Closing (a choice, Esc, a click away) tells `onClose`.
 *
 *  Example: `{menu && <TokenContextMenu request={menu} board={board} interaction={interaction} onApplyCondition={open} onClose={() => setMenu(null)} />}` */
export function TokenContextMenu(props: TokenContextMenuProps): React.JSX.Element | null {
  const { request, board, interaction, onClose } = props;
  const titleId = useId();
  const nameId = useId();
  const token = useBoard(
    board,
    (state) => state.board?.tokens.find(({ id }) => id === request.tokenId) ?? null,
  );
  if (!token) return null;
  const targets = (): readonly string[] => {
    const { selectedTokenIds } = interaction.getState();
    return selectedTokenIds.includes(request.tokenId) ? selectedTokenIds : [request.tokenId];
  };
  const choose = (chosen: TokenLayerDto): void => {
    void interaction.getState().setTokensLayer(targets(), chosen);
  };
  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed size-0"
          style={{ left: request.x, top: request.y }}
        />
      </DropdownMenuTrigger>
      {/* The trigger is only an invisible anchor at the click: the menu is named by its own text,
          and focus has nowhere to go back to (taking it back would steal it from the dialog). */}
      <DropdownMenuContent
        aria-labelledby={nameId}
        align="start"
        className="min-w-40"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <span id={nameId} className="sr-only">{`Ações de ${token.name}`}</span>
        <DropdownMenuItem onSelect={() => props.onApplyCondition(targets())}>
          Aplicar condição…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel id={titleId}>{LAYER_TITLE}</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-labelledby={titleId} value={token.layer}>
          {tokenLayerDto.options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} onSelect={() => choose(option)}>
              {LAYER_LABEL[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
