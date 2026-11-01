import type { CharacterDto, TokenDto } from '@lorkarium/contracts';
import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useBoardSight } from '@/features/board/use-board-sight';
import { ConditionsEditor } from '@/features/combat/conditions-editor';
import { seenTokensOf } from '@/lib/board-sight';
import { cellsText } from '@/lib/cells-text';
import { facingLabel } from '@/lib/facing-label';
import { mainTokenIdOf } from '@/lib/main-token';
import {
  singleSelectedOf,
  useBoardInteraction,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { characterOfUser, useCharacters, type CharactersStore } from '@/stores/characters-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { BarQuickEdit } from './bar-quick-edit';
import { BarLine } from './bar-line';
import { CharacterDock } from './character-dock';
import { DockHeader } from './token-dock-header';
import { TokenDockActions } from './token-dock-actions';

export type TokenDockProps = Readonly<{
  board: StoreApi<BoardStore>;
  presence: StoreApi<TablePresenceStore>;
  /** The table's characters: with nothing selected, the viewer's own one is the fallback. */
  characters: StoreApi<CharactersStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** The token at the foot of the panel (in combat and out of it): who plays it and where, every bar
 *  received with −/+, Dano/Cura and "Máx." for whoever controls it, its conditions, and the actions
 *  (initiative, "Editar token", "Tirar do combate"). One selected token this viewer sees opens it;
 *  with none (or a group), the token of the viewer's character in this grid does, and with none
 *  of it here, the character itself (`CharacterDock`). The list above never grows.
 *
 *  Example: `<TokenDock board={board} presence={presence} interaction={interaction} isMaster onEditToken={edit} />` */
export function TokenDock(props: TokenDockProps): React.JSX.Element | null {
  const docked = useDockedToken(props);
  const members = useTablePresence(props.presence, (state) => state.members);
  if (!docked) return null;
  if (docked.kind === 'character') {
    return <CharacterDock character={docked.character} interaction={props.interaction} />;
  }
  const { token, isMain, selected } = docked;
  return (
    <section
      aria-label={selected ? 'Token selecionado' : 'Token principal'}
      // -mx-1 px-1: overflow-y-auto also clips X, and the avatar's side ring is a shadow outside it.
      className="-mx-1 flex max-h-[58%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-border px-1 pt-3"
    >
      <DockHeader
        token={token}
        isMain={isMain}
        isMaster={props.isMaster}
        members={members}
        interaction={props.interaction}
      />
      <p className="text-xs text-muted-foreground">{whereText(token)}</p>
      <DockBars token={token} interaction={props.interaction} isMaster={props.isMaster} />
      <ConditionsEditor
        token={token}
        board={props.board}
        interaction={props.interaction}
        isMaster={props.isMaster}
      />
      <TokenDockActions {...props} token={token} />
    </section>
  );
}

type DockedToken =
  | Readonly<{
      kind: 'token';
      token: TokenDto;
      isMain: boolean;
      /** It came from the selection, not from falling back to the main token. */
      selected: boolean;
    }>
  | Readonly<{ kind: 'character'; character: CharacterDto }>;

// The main token counts as a sheet only: the arrows, Q/E, Delete and the ring follow the real
// selection, so nobody moves their own token by accident.
function useDockedToken({ board, interaction, characters }: TokenDockProps): DockedToken | null {
  const state = useBoard(board, (current) => current.board);
  const sight = useBoardSight(board, interaction);
  const confirmed = useCharacters(characters, (current) => current.characters);
  const selectedId = useBoardInteraction(interaction, (current) =>
    singleSelectedOf(current.selectedTokenIds),
  );
  return useMemo(() => {
    if (!state) return null;
    const mine = characterOfUser(confirmed, state.viewer.userId);
    const seen = seenTokensOf(state, sight);
    const mainId = mainTokenIdOf(seen, mine);
    const picked = seen.find(({ id }) => id === selectedId);
    const token = picked ?? seen.find(({ id }) => id === mainId);
    if (!token) return mine && { kind: 'character', character: mine };
    const isMain = token.id === mainId;
    return { kind: 'token', token, isMain, selected: picked !== undefined };
  }, [state, sight, selectedId, confirmed]);
}

// "Coluna 5, linha 6 · 1 × 1 casas · Olha para o leste": cells counted from 1, as a person
// counts them (the status line says it the same way).
function whereText({ col, row, width, height, facing }: TokenDto): string {
  const cellAt = `Coluna ${cellsText(col + 1)}, linha ${cellsText(row + 1)}`;
  return `${cellAt} · ${cellsText(width)} × ${cellsText(height)} casas · Olha para o ${facingLabel(facing)}`;
}

type DockBarsProps = Readonly<{
  token: TokenDto;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
}>;

function DockBars({ token, interaction, isMaster }: DockBarsProps) {
  if (token.bars.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Esse token não tem barras.{isMaster && ' Dá pra criar em Editar token.'}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {token.bars.map((bar) => (
        <li key={bar.id}>
          {token.canControl ? (
            <BarQuickEdit
              target={{ tokenId: token.id }}
              bar={bar}
              name={`${bar.label} de ${token.name}`}
              interaction={interaction}
            >
              <BarLine bar={bar} withNumbers />
            </BarQuickEdit>
          ) : (
            <BarLine bar={bar} />
          )}
        </li>
      ))}
    </ul>
  );
}
