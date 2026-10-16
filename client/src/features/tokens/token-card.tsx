import type { TokenBarDto, TokenDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { Button } from '@/components/ui/button';
import { barFill, barToneVar, formatBarValue } from '@/lib/bar-display';
import { cn } from '@/lib/utils';
import { useBoardInteraction, type BoardInteractionStore } from '@/stores/board-interaction-store';
import { ConditionsEditor } from '@/features/combat/conditions-editor';
import type { BoardStore } from '@/stores/board-store';
import { BarField } from './bar-field';

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
      <p className="text-xs text-muted-foreground">{cellLabel(token.col, token.row)}</p>
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

/** A bar as text and a thin track: label, value ("−4 / 38" in the error color) and the fill. */
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
      <span aria-hidden="true" className="relative h-1 bg-divider">
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: `${fill.fraction * 100}%`, background: barToneVar(bar.color) }}
        />
        {fill.state === 'negative' && (
          <span className="absolute inset-y-0 left-0 w-0.5 bg-destructive" />
        )}
      </span>
    </div>
  );
}

// Counted from 1, as a person counts cells (the status line says it the same way).
function cellLabel(col: number, row: number): string {
  return `Coluna ${col + 1}, linha ${row + 1}`;
}
