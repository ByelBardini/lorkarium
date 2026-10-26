import { useId } from 'react';
import {
  TRAY_DICE_SIDES,
  addDie,
  removeDie,
  trayDieCountsOf,
  type DiceTray,
} from '@/lib/dice-tray';
import { cn } from '@/lib/utils';
import { DieGlyph } from './die-glyph';

export type TrayDiceGridProps = Readonly<{ tray: DiceTray; onTray: (tray: DiceTray) => void }>;

/** The seven die buttons of the tray (d4 … d%): a click adds one, the gold count says how many
 *  are on the tray (read from its text, so typed dice count too) and the "−" takes one off.
 *
 *  Example: `<TrayDiceGrid tray={tray} onTray={setTray} />` */
export function TrayDiceGrid({ tray, onTray }: TrayDiceGridProps): React.JSX.Element {
  const counts = trayDieCountsOf(tray);
  return (
    <div role="group" aria-label="Dados" className="grid grid-cols-7 gap-1.5 pt-1.5">
      {TRAY_DICE_SIDES.map((sides) => (
        <DieCell
          key={sides}
          sides={sides}
          count={counts.get(sides) ?? 0}
          onAdd={() => onTray(addDie(tray, sides))}
          onRemove={() => onTray(removeDie(tray, sides))}
        />
      ))}
    </div>
  );
}

type DieCellProps = Readonly<{
  sides: number;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}>;

function DieCell({ sides, count, onAdd, onRemove }: DieCellProps): React.JSX.Element {
  const id = useId();
  const inTray = count > 0;
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Adicionar d${sides}`}
        aria-describedby={inTray ? `${id}-count` : undefined}
        data-in-tray={inTray ? 'true' : undefined}
        onClick={onAdd}
        className={cn(
          'flex h-16 w-full flex-col items-center justify-center gap-1 rounded-md border border-input bg-card text-muted-foreground outline-offset-2 transition-colors hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
          inTray && 'border-primary bg-primary/8 text-primary hover:text-primary',
        )}
      >
        <DieGlyph sides={sides} />
        <span className="text-[11px] font-bold">{sides === 100 ? 'd%' : `d${sides}`}</span>
      </button>
      {inTray && <DieCount id={`${id}-count`} sides={sides} count={count} onRemove={onRemove} />}
    </div>
  );
}

type DieCountProps = Readonly<{ id: string; sides: number; count: number; onRemove: () => void }>;

function DieCount({ id, sides, count, onRemove }: DieCountProps): React.JSX.Element {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-1.5 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-primary px-1 text-[11px] font-bold text-primary-foreground tabular-nums"
      >
        {count}
      </span>
      <span id={id} className="sr-only">
        {count} na bandeja
      </span>
      <button
        type="button"
        aria-label={`Tirar um d${sides}`}
        onClick={onRemove}
        className="absolute -right-1 -bottom-1.5 flex size-6 items-center justify-center rounded-sm border border-input bg-muted text-sm text-muted-foreground outline-offset-2 transition-colors hover:border-destructive hover:text-destructive-text focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        −
      </button>
    </>
  );
}
