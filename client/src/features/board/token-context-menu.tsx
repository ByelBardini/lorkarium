import { tokenLayerDto, type TokenDto, type TokenLayerDto } from '@lorkarium/contracts';
import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TokenStyle } from '@/services/table-board-commands';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { LAYER_LABEL } from './board-messages';

/** Where a token was right clicked: its id and the viewport point to open the menu at. */
export type TokenMenuRequest = Readonly<{ tokenId: string; x: number; y: number }>;

export type TokenContextMenuProps = Readonly<{
  request: TokenMenuRequest;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** "Aplicar condição…": the tokens it goes to. */
  onApplyCondition: (tokenIds: readonly string[]) => void;
  /** "Imagem…": the token whose image dialog opens. */
  onChangeImage: (tokenId: string) => void;
  onClose: () => void;
}>;

const LAYER_TITLE = 'Mover para camada';
export const NEEDS_IMAGE_HINT = 'Ponha uma imagem primeiro.';

/** The right click on a token for whoever controls it: "Aplicar condição…", "Imagem…", "Borda
 *  redonda" and the flips (these act on the whole selection when the token is in it, or on that
 *  token alone); the master also gets "Mover para camada". Closing (a choice, Esc, a click away)
 *  tells `onClose`.
 *
 *  Example: `{menu && <TokenContextMenu request={menu} board={board} interaction={interaction} onApplyCondition={open} onChangeImage={openImage} onClose={() => setMenu(null)} />}` */
export function TokenContextMenu(props: TokenContextMenuProps): React.JSX.Element | null {
  const { request, board, interaction, onClose } = props;
  const nameId = useId();
  const token = useBoard(
    board,
    (state) => state.board?.tokens.find(({ id }) => id === request.tokenId) ?? null,
  );
  const layerMenu = useBoardInteraction(interaction, (state) => state.canChooseLayer);
  if (!token) return null;
  const targets = (): readonly string[] => {
    const { selectedTokenIds } = interaction.getState();
    return selectedTokenIds.includes(request.tokenId) ? selectedTokenIds : [request.tokenId];
  };
  const restyle = (style: TokenStyle): void => {
    void interaction
      .getState()
      .command((commands, campaignId) => commands.restyleTokens(campaignId, targets(), style));
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
        className="min-w-48"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <span id={nameId} className="sr-only">{`Ações de ${token.name}`}</span>
        <DropdownMenuItem onSelect={() => props.onApplyCondition(targets())}>
          Aplicar condição…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <LookItems
          token={token}
          onChangeImage={() => props.onChangeImage(token.id)}
          onRestyle={restyle}
        />
        {layerMenu && (
          <LayerItems
            token={token}
            onChoose={(layer) => void interaction.getState().setTokensLayer(targets(), layer)}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type LookItemsProps = Readonly<{
  token: TokenDto;
  onChangeImage: () => void;
  onRestyle: (style: TokenStyle) => void;
}>;

// The frame and the flips only mean something on an image: without one they wait for it.
function LookItems({ token, onChangeImage, onRestyle }: LookItemsProps): React.JSX.Element {
  const noImage = token.imageAssetId === null;
  const hintId = useId();
  const described = noImage ? hintId : undefined;
  return (
    <>
      <DropdownMenuItem onSelect={onChangeImage}>Imagem…</DropdownMenuItem>
      <DropdownMenuCheckboxItem
        checked={token.frame === 'round'}
        disabled={noImage}
        aria-describedby={described}
        onSelect={() => onRestyle({ frame: token.frame === 'round' ? 'square' : 'round' })}
      >
        Borda redonda
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={token.flipX}
        disabled={noImage}
        aria-describedby={described}
        onSelect={() => onRestyle({ flipX: !token.flipX })}
      >
        Inverter na horizontal
      </DropdownMenuCheckboxItem>
      <DropdownMenuCheckboxItem
        checked={token.flipY}
        disabled={noImage}
        aria-describedby={described}
        onSelect={() => onRestyle({ flipY: !token.flipY })}
      >
        Inverter na vertical
      </DropdownMenuCheckboxItem>
      {noImage && (
        <p id={hintId} className="px-2 py-1 text-xs text-muted-foreground">
          {NEEDS_IMAGE_HINT}
        </p>
      )}
    </>
  );
}

type LayerItemsProps = Readonly<{ token: TokenDto; onChoose: (layer: TokenLayerDto) => void }>;

function LayerItems({ token, onChoose }: LayerItemsProps): React.JSX.Element {
  const titleId = useId();
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel id={titleId}>{LAYER_TITLE}</DropdownMenuLabel>
      <DropdownMenuRadioGroup aria-labelledby={titleId} value={token.layer}>
        {tokenLayerDto.options.map((option) => (
          <DropdownMenuRadioItem key={option} value={option} onSelect={() => onChoose(option)}>
            {LAYER_LABEL[option]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
