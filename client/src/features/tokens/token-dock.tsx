import type { SessionMemberDto, TokenBarDto, TokenDto } from '@lorkarium/contracts';
import { XIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { useBoardSight } from '@/features/board/use-board-sight';
import { ConditionsEditor } from '@/features/combat/conditions-editor';
import { barFill, formatBarValue } from '@/lib/bar-display';
import { seenTokensOf } from '@/lib/board-sight';
import { cellsText } from '@/lib/cells-text';
import { facingLabel } from '@/lib/facing-label';
import { playedByText } from '@/lib/played-by';
import { cn } from '@/lib/utils';
import {
  singleSelectedOf,
  useBoardInteraction,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';
import { BarField } from './bar-field';
import { BarTrack } from './bar-track';
import { TokenAvatar } from './token-avatar';
import { TokenDockActions } from './token-dock-actions';

export type TokenDockProps = Readonly<{
  board: StoreApi<BoardStore>;
  presence: StoreApi<TablePresenceStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEditToken: (tokenId: string) => void;
}>;

/** The selected token at the foot of the panel (in combat and out of it): who plays it and where,
 *  every bar received with −/+, Dano/Cura and "Máx." for whoever controls it, its conditions, and
 *  the actions (initiative, "Editar token", "Tirar do combate"). Only one selected token this
 *  viewer sees opens it; the list above never grows.
 *
 *  Example: `<TokenDock board={board} presence={presence} interaction={interaction} isMaster onEditToken={edit} />` */
export function TokenDock(props: TokenDockProps): React.JSX.Element | null {
  const token = useDockedToken(props.board, props.interaction);
  const members = useTablePresence(props.presence, (state) => state.members);
  if (!token) return null;
  return (
    <section
      aria-label="Token selecionado"
      className="flex max-h-[58%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-border pt-3"
    >
      <DockHeader token={token} members={members} interaction={props.interaction} />
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

function useDockedToken(
  board: StoreApi<BoardStore>,
  interaction: StoreApi<BoardInteractionStore>,
): TokenDto | null {
  const state = useBoard(board, (current) => current.board);
  const sight = useBoardSight(board, interaction);
  const selectedId = useBoardInteraction(interaction, (current) =>
    singleSelectedOf(current.selectedTokenIds),
  );
  return useMemo(() => {
    if (!state || !selectedId) return null;
    return seenTokensOf(state, sight).find(({ id }) => id === selectedId) ?? null;
  }, [state, sight, selectedId]);
}

type DockHeaderProps = Readonly<{
  token: TokenDto;
  members: readonly SessionMemberDto[];
  interaction: StoreApi<BoardInteractionStore>;
}>;

function DockHeader({ token, members, interaction }: DockHeaderProps) {
  return (
    <header className="flex items-center gap-3">
      <TokenAvatar token={token} />
      <span className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate font-display text-xl font-semibold">{token.name}</h3>
        <span className="truncate text-xs text-muted-foreground">{playedText(token, members)}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Fechar ficha"
        onClick={() => interaction.getState().select(null)}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </header>
  );
}

function playedText(token: TokenDto, members: readonly SessionMemberDto[]): string {
  const played = playedByText(token, members);
  return played.charAt(0).toUpperCase() + played.slice(1);
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
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
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
        <li key={bar.id} className="flex flex-col gap-1.5">
          <BarLine bar={bar} />
          {token.canControl && (
            <BarField
              tokenId={token.id}
              tokenName={token.name}
              bar={bar}
              interaction={interaction}
              disabled={readOnly}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** A bar as text and a rounded track: label, value ("−4 / 38" in the error color), the fill and,
 *  past either end, a second bar growing from the left (crimson below zero, bone above the max). */
export function BarLine({ bar }: Readonly<{ bar: TokenBarDto }>): React.JSX.Element {
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
          {formatBarValue(bar)}
        </span>
      </div>
      <BarTrack fill={fill} color={bar.color} />
    </div>
  );
}
