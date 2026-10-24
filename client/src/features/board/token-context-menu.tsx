import { tokenLayerDto, type TokenDto, type TokenLayerDto } from '@lorkarium/contracts';
import { useId, useMemo } from 'react';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  isListedIn,
  mainTokenIdOf,
  mainTokenPlayersOf,
  type MainTokenPlayer,
} from '@/lib/main-token';
import { TokenLinkItems, type CardLinkRequest } from '@/features/tokens/token-link-items';
import type { TokenStyle } from '@/services/table-board-commands';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { LAYER_LABEL } from './board-messages';

/** Where a token was right clicked: its id and the viewport point to open the menu at. */
export type TokenMenuRequest = Readonly<{ tokenId: string; x: number; y: number }>;

export type TokenContextMenuProps = Readonly<{
  request: TokenMenuRequest;
  board: StoreApi<BoardStore>;
  /** The names of the players "Tornar principal de" lists. */
  presence: StoreApi<TablePresenceStore>;
  interaction: StoreApi<BoardInteractionStore>;
  /** "Aplicar condição…": the tokens it goes to. */
  onApplyCondition: (tokenIds: readonly string[]) => void;
  /** "Imagem…": the token whose image dialog opens. */
  onChangeImage: (tokenId: string) => void;
  /** The master's "Ligar à ficha de ▸" / "Desligar da ficha": the table's cast, and where a link
   *  that needs a yes goes. Absent: no character items. */
  characters?: Readonly<{
    cast: StoreApi<BoardStore>;
    onConfirmLink: (request: CardLinkRequest) => void;
  }>;
  onClose: () => void;
}>;

const LAYER_TITLE = 'Mover para camada';
export const NEEDS_IMAGE_HINT = 'Ponha uma imagem primeiro.';

/** The right click on a token for whoever controls it: "Aplicar condição…", "Tornar principal"
 *  (only on a token the viewer is listed in the control of and that is not their main one), the
 *  master's "Tornar principal de ▸" (the players listed in its control), "Morto", "Luz acesa"
 *  (only on a token that gives off light), "Imagem…",
 *  "Borda redonda" and the flips (these act on the whole selection when the token is in it, or on that
 *  token alone); the master also gets "Ligar à ficha de ▸" / "Desligar da ficha" (with
 *  `characters`) and "Mover para camada". Closing (a choice, Esc, a click away)
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
  const canMakeMain = useBoard(board, (state) => canMakeMainToken(state.board, request.tokenId));
  const layerMenu = useBoardInteraction(interaction, (state) => state.canChooseLayer);
  const players = useMainTokenPlayers(props.board, props.presence, request.tokenId);
  if (!token) return null;
  const targets = (): readonly string[] => {
    const { selectedTokenIds } = interaction.getState();
    return selectedTokenIds.includes(request.tokenId) ? selectedTokenIds : [request.tokenId];
  };
  const restyle = (style: TokenStyle): void => {
    void interaction
      .getState()
      .command((commands, scope) => commands.restyleTokens(scope, targets(), style));
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
        {canMakeMain && (
          <DropdownMenuItem
            onSelect={() =>
              void interaction
                .getState()
                .command((commands, scope) => commands.setMainToken(scope, token.id))
            }
          >
            Tornar principal
          </DropdownMenuItem>
        )}
        {players.length > 0 && (
          <MainTokenPlayersItems
            players={players}
            onChoose={(playerId) =>
              void interaction
                .getState()
                .command((commands, scope) => commands.setMainToken(scope, token.id, playerId))
            }
          />
        )}
        {layerMenu && props.characters && (
          <TokenLinkItems
            token={token}
            cast={props.characters.cast}
            presence={props.presence}
            interaction={interaction}
            onConfirmLink={props.characters.onConfirmLink}
          />
        )}
        <DropdownMenuCheckboxItem
          checked={token.defeated}
          onSelect={() => restyle({ defeated: !token.defeated })}
        >
          Morto
        </DropdownMenuCheckboxItem>
        {token.light && token.canControl && (
          <DropdownMenuCheckboxItem
            checked={token.lightLit}
            onSelect={() => restyle({ lightLit: !token.lightLit })}
          >
            Luz acesa
          </DropdownMenuCheckboxItem>
        )}
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

// The same rule as the dock's star: listed in the control (the master's power does not count).
function canMakeMainToken(board: BoardStore['board'], tokenId: string): boolean {
  if (!board) return false;
  const token = board.tokens.find(({ id }) => id === tokenId);
  if (!token || !isListedIn(token, board.viewer.userId)) return false;
  return mainTokenIdOf(board) !== tokenId;
}

// Only the master chooses for someone else; the players listed in the control, but the master.
function useMainTokenPlayers(
  board: StoreApi<BoardStore>,
  presence: StoreApi<TablePresenceStore>,
  tokenId: string,
): readonly MainTokenPlayer[] {
  const state = useBoard(board, (current) => current.board);
  const members = useTablePresence(presence, (current) => current.members);
  return useMemo(() => {
    if (state?.viewer.role !== 'master') return [];
    return mainTokenPlayersOf(state, tokenId, members);
  }, [state, members, tokenId]);
}

type MainTokenPlayersItemsProps = Readonly<{
  players: readonly MainTokenPlayer[];
  onChoose: (playerId: string) => void;
}>;

function MainTokenPlayersItems({ players, onChoose }: MainTokenPlayersItemsProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Tornar principal de</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {players.map((player) => (
          <DropdownMenuCheckboxItem
            key={player.userId}
            checked={player.isMain}
            onSelect={() => !player.isMain && onChoose(player.userId)}
          >
            {player.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
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
