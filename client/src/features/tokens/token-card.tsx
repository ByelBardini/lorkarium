import type { TokenBarDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { barFill, formatBarValue } from '@/lib/bar-display';
import { cellsText } from '@/lib/cells-text';
import { facingLabel } from '@/lib/facing-label';
import { cn } from '@/lib/utils';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { ConditionsEditor } from '@/features/combat/conditions-editor';
import type { BoardStore } from '@/stores/board-store';
import { BarField } from './bar-field';
import { BarTrack } from './bar-track';

export type TokenCardProps = Readonly<{
  token: TokenDto;
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  isMaster: boolean;
  onEdit: (tokenId: string) => void;
}>;

/** The open card of a token: every bar this viewer received, and the adjust field of each when
 *  the viewer controls the token (disabled while reconnecting).
 *
 *  Example: `<TokenCard token={token} interaction={interaction} isMaster={isMaster} onEdit={edit} />` */
export function TokenCard({ token, board, interaction, isMaster, onEdit }: TokenCardProps) {
  const readOnly = useBoardInteraction(interaction, (state) => state.readOnly);
  return (
    <section aria-label={`Cartão de ${token.name}`} className="flex flex-col gap-3 pt-2 pb-3 pl-10">
      <p className="text-xs text-muted-foreground">
        {cellLabel(token.col, token.row)} · {sizeLabel(token)} · Olha para o{' '}
        {facingLabel(token.facing)}
      </p>
      {token.bars.length === 0 && <p className="text-sm text-muted-foreground">Sem barras.</p>}
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
      <ConditionsEditor token={token} board={board} interaction={interaction} isMaster={isMaster} />
      {isMaster && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onEdit(token.id)}
        >
          Editar token
        </Button>
      )}
    </section>
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

// Counted from 1, as a person counts cells (the status line says it the same way).
function cellLabel(col: number, row: number): string {
  return `Coluna ${cellsText(col + 1)}, linha ${cellsText(row + 1)}`;
}

function sizeLabel({ width, height }: Pick<TokenDto, 'width' | 'height'>): string {
  return `${cellsText(width)} × ${cellsText(height)} casas`;
}
