import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CycleOption } from '@/lib/round-cycle-view';
import { CyclePhaseImage } from './cycle-phase-image';

export type CycleNextPickerProps = Readonly<{
  /** The round the pick is for (the current one + 1). */
  round: number;
  options: readonly CycleOption[];
  /** `null` = follow the cycle (the phase it goes to anyway). */
  onPick: (phaseId: string | null) => void;
  busy: boolean;
}>;

const TAG_TEXT = { current: 'repetir a atual', follows: 'segue o ciclo' } as const;

/** "Fase da rodada N": every phase of the cycle as a button; the one the next round plays is
 *  pressed. Picking the phase the cycle goes to anyway clears the choice.
 *
 *  Example: `<CycleNextPicker round={4} options={badge.options} onPick={pick} busy={false} />` */
export function CycleNextPicker({ round, options, onPick, busy }: CycleNextPickerProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="px-1.5 pb-1 text-xs text-muted-foreground">Fase da rodada {round}</span>
      {options.map((option) => (
        <button
          key={option.phaseId}
          type="button"
          aria-pressed={option.isNext}
          disabled={busy}
          onClick={() => onPick(option.tag === 'follows' ? null : option.phaseId)}
          className={cn(
            'flex min-h-11 items-center gap-2.5 rounded-md border px-2 py-1.5 text-left text-sm',
            option.isNext ? 'border-primary bg-muted' : 'border-transparent hover:bg-muted',
          )}
        >
          <CyclePhaseImage phase={option} className="size-7" />
          <span className="flex-1">{option.name}</span>
          {option.tag && (
            <span className="text-xs text-muted-foreground">{TAG_TEXT[option.tag]}</span>
          )}
          {option.isNext && <CheckIcon aria-hidden="true" className="size-4 text-primary" />}
        </button>
      ))}
      <span className="mt-1 border-t border-divider px-1.5 pt-2 text-xs text-muted-foreground">
        O ciclo segue a partir da fase escolhida.
      </span>
    </div>
  );
}
