import type { TokenBarDto, TokenDto } from '@lorkarium/contracts';
import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useBoardSight } from '@/features/board/use-board-sight';
import { ConditionsEditor } from '@/features/combat/conditions-editor';
import { barFill, formatBarValue } from '@/lib/bar-display';
import { seenTokensOf } from '@/lib/board-sight';
import { cellsText } from '@/lib/cells-text';
import { facingLabel } from '@/lib/facing-label';
import { mainTokenIdOf } from '@/lib/main-token';
import { cn } from '@/lib/utils';
import {
  singleSelectedOf,
  useBoardInteraction,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { BarQuickEdit } from './bar-quick-edit';
import { BarTrack } from './bar-track';
import { DockHeader } from './token-dock-header';
import { TokenDockActions } from './token-dock-actions';

export type TokenDockProps = Readonly<{
  board: StoreApi<BoardStore>;
  presence: StoreApi<TablePresenceStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** The token at the foot of the panel (in combat and out of it): who plays it and where, every bar
 *  received with −/+, Dano/Cura and "Máx." for whoever controls it, its conditions, and the actions
 *  (initiative, "Editar token", "Tirar do combate"). One selected token this viewer sees opens it;
 *  with none (or a group), the viewer's main token does. The list above never grows.
 *
 *  Example: `<TokenDock board={board} presence={presence} interaction={interaction} isMaster onEditToken={edit} />` */
export function TokenDock(props: TokenDockProps): React.JSX.Element | null {
  const docked = useDockedToken(props.board, props.interaction);
  const members = useTablePresence(props.presence, (state) => state.members);
  if (!docked) return null;
  const { token, isMain, selected, viewerId } = docked;
  return (
    <section
      aria-label={selected ? 'Token selecionado' : 'Token principal'}
      className="flex max-h-[58%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-border pt-3"
    >
      <DockHeader
        token={token}
        isMain={isMain}
        viewerId={viewerId}
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

type DockedToken = Readonly<{
  token: TokenDto;
  isMain: boolean;
  /** It came from the selection, not from falling back to the main token. */
  selected: boolean;
  viewerId: string;
}>;

// The main token counts as a sheet only: the arrows, Q/E, Delete and the ring follow the real
// selection, so nobody moves their own token by accident.
function useDockedToken(
  board: StoreApi<BoardStore>,
  interaction: StoreApi<BoardInteractionStore>,
): DockedToken | null {
  const state = useBoard(board, (current) => current.board);
  const sight = useBoardSight(board, interaction);
  const selectedId = useBoardInteraction(interaction, (current) =>
    singleSelectedOf(current.selectedTokenIds),
  );
  return useMemo(() => {
    if (!state) return null;
    const seen = seenTokensOf(state, sight);
    const mainId = mainTokenIdOf(state);
    const picked = seen.find(({ id }) => id === selectedId);
    const token = picked ?? seen.find(({ id }) => id === mainId);
    if (!token) return null;
    const viewerId = state.viewer.userId;
    return { token, isMain: token.id === mainId, selected: picked !== undefined, viewerId };
  }, [state, sight, selectedId]);
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
              tokenId={token.id}
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

/** A bar as text and a rounded track: label, value ("−4 / 38" in the error color), the fill and,
 *  past either end, a second bar growing from the left (crimson below zero, bone above the max). */
export function BarLine({
  bar,
  withNumbers = false,
}: Readonly<{ bar: TokenBarDto; withNumbers?: boolean }>): React.JSX.Element {
  const fill = barFill(bar);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-label">{bar.label}</span>
        <span
          className={cn(
            'tabular-nums',
            fill.state === 'negative' ? 'text-destructive-text' : 'text-foreground',
          )}
        >
          {formatBarValue(bar, { withNumbers })}
        </span>
      </div>
      <BarTrack fill={fill} color={bar.color} />
    </div>
  );
}
