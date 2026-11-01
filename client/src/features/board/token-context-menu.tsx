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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TokenSheetItems } from '@/features/sheets/token-sheet-items';
import { TokenLinkItems, type CharacterLinkRequest } from '@/features/tokens/token-link-items';
import type { TokenStyle } from '@/services/table-board-commands';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import type { CharactersStore } from '@/stores/characters-store';
import { LAYER_LABEL } from './board-messages';
import { useViewerTokenRights } from './table-token-rights';
import { TokenFormItems } from './token-form-items';
import { TokenHiddenItems } from './token-hidden-items';

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
  /** "Aura…" (whoever controls the token): the token whose aura dialog opens. */
  onChangeAura: (tokenId: string) => void;
  /** "Trocar forma ▸ Editar formas…": the token whose dialog opens on the Formas tab. */
  onEditForms?: (tokenId: string) => void;
  /** "Editar token…" (whoever may edit the token): the token whose dialog opens. Absent: no such item. */
  onEditToken?: (tokenId: string) => void;
  /** The master's "Ligar a personagem ▸" / "Desligar do personagem": the table's characters,
   *  and where a link that needs a yes goes. Absent: no character items. */
  characters?: Readonly<{
    store: StoreApi<CharactersStore>;
    onConfirmLink: (request: CharacterLinkRequest) => void;
  }>;
  onClose: () => void;
}>;

const LAYER_TITLE = 'Mover para camada';
export const EDIT_TOKEN_LABEL = 'Editar token…';
export const NEEDS_IMAGE_HINT = 'Ponha uma imagem primeiro.';

/** The right click on a token for whoever controls it: "Editar token…" (that token alone, for
 *  whoever may edit it, with `onEditToken`), "Aplicar condição…", "Morto", "Luz acesa"
 *  (only on a token that gives off light), "Aura…" (that token alone, for whoever controls it),
 *  "Tirar aura" (the targets with an aura that the viewer controls, at once), "Trocar forma ▸"
 *  (that token alone, with forms, for whoever controls it), "Imagem…",
 *  "Borda redonda" and the flips (these act on the whole selection when the token is in it, or on that
 *  token alone); the master also gets "Ligar a personagem ▸" / "Desligar do personagem" (with
 *  `characters`), "Tornar invisível" / "Tornar visível" and "Mover para camada". Closing (a choice, Esc, a click away)
 *  tells `onClose`. Under a `SheetRoomProvider`, "Abrir ficha" (or "Fichas ▸") and the master's "Nova ficha ▸"
 *  (`TokenSheetItems`) come after the character items.
 *
 *  Example: `{menu && <TokenContextMenu request={menu} board={board} interaction={interaction} onApplyCondition={open} onChangeImage={openImage} onChangeAura={openAura} onClose={() => setMenu(null)} />}` */
export function TokenContextMenu(props: TokenContextMenuProps): React.JSX.Element | null {
  const { request, board, interaction, onClose } = props;
  const nameId = useId();
  const token = useBoard(
    board,
    (state) => state.board?.tokens.find(({ id }) => id === request.tokenId) ?? null,
  );
  const layerMenu = useBoardInteraction(interaction, (state) => state.canChooseLayer);
  const hiding = useHidingTargets(board, interaction, request.tokenId);
  const unaura = useAuraTargets(board, interaction, request.tokenId);
  if (!token) return null;
  const targets = (): readonly string[] =>
    targetIdsOf(interaction.getState().selectedTokenIds, request.tokenId);
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
        <EditTokenItem token={token} board={board} onEditToken={props.onEditToken} />
        <DropdownMenuItem onSelect={() => props.onApplyCondition(targets())}>
          Aplicar condição…
        </DropdownMenuItem>
        {layerMenu && props.characters && (
          <TokenLinkItems
            token={token}
            board={board}
            characters={props.characters.store}
            interaction={interaction}
            onConfirmLink={props.characters.onConfirmLink}
          />
        )}
        <TokenSheetItems token={token} name={token.name} isMaster={layerMenu} />
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
        {hiding.length > 0 && <TokenHiddenItems targets={hiding} interaction={interaction} />}
        <DropdownMenuSeparator />
        {token.canControl && (
          <DropdownMenuItem onSelect={() => props.onChangeAura(token.id)}>Aura…</DropdownMenuItem>
        )}
        {unaura.length > 0 && (
          <DropdownMenuItem
            onSelect={() =>
              void interaction
                .getState()
                .command((commands, scope) => commands.restyleTokens(scope, unaura, { aura: null }))
            }
          >
            Tirar aura
          </DropdownMenuItem>
        )}
        <TokenFormItems
          token={token}
          board={board}
          interaction={interaction}
          onEditForms={props.onEditForms}
        />
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

type EditTokenItemProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  onEditToken: TokenContextMenuProps['onEditToken'];
}>;

// The same rule as the dock's "Editar token" (`of(token).edit`).
function EditTokenItem({
  token,
  board,
  onEditToken,
}: EditTokenItemProps): React.JSX.Element | null {
  const rights = useViewerTokenRights(board);
  if (!onEditToken || !rights.of(token).edit) return null;
  return (
    <>
      <DropdownMenuItem onSelect={() => onEditToken(token.id)}>{EDIT_TOKEN_LABEL}</DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}

// Every item acts on the selection when the token is in it, or on that token alone.
function targetIdsOf(selected: readonly string[], tokenId: string): readonly string[] {
  return selected.includes(tokenId) ? selected : [tokenId];
}

// Only the master hides, the menu's targets (`targetIdsOf`).
function useHidingTargets(
  board: StoreApi<BoardStore>,
  interaction: StoreApi<BoardInteractionStore>,
  tokenId: string,
): readonly TokenDto[] {
  const state = useBoard(board, (current) => current.board);
  const selected = useBoardInteraction(interaction, (current) => current.selectedTokenIds);
  return useMemo(() => {
    if (state?.viewer.role !== 'master') return [];
    const ids = targetIdsOf(selected, tokenId);
    return state.tokens.filter(({ id }) => ids.includes(id));
  }, [state, selected, tokenId]);
}

// The menu's targets (`targetIdsOf`) that have an aura to take away and that the viewer controls:
// the server refuses the whole restyle if one is not theirs.
function useAuraTargets(
  board: StoreApi<BoardStore>,
  interaction: StoreApi<BoardInteractionStore>,
  tokenId: string,
): readonly string[] {
  const tokens = useBoard(board, (current) => current.board?.tokens);
  const selected = useBoardInteraction(interaction, (current) => current.selectedTokenIds);
  return useMemo(() => {
    const ids = targetIdsOf(selected, tokenId);
    const wearing = (tokens ?? []).filter(({ id, aura, canControl }) => {
      return ids.includes(id) && aura !== null && canControl;
    });
    return wearing.map(({ id }) => id);
  }, [tokens, selected, tokenId]);
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
