import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CycleBadge as CycleBadgeView, CyclePhaseView } from '@/lib/round-cycle-view';
import { CycleNextPicker } from './cycle-next-picker';
import { CyclePhaseImage } from './cycle-phase-image';

export type CycleBadgeProps = Readonly<{
  badge: CycleBadgeView;
  /** Sends the pick; answers whether the server confirmed it (a refusal keeps the list open). */
  onPick: (phaseId: string | null) => Promise<boolean>;
}>;

/** One cycle on top of the board: the phase of this round, the cycle and round, and the next
 *  phase — a button that opens "Fase da rodada N" for who may choose.
 *
 *  Example: `<CycleBadge badge={badge} onPick={(phaseId) => choose(badge.cycleId, phaseId)} />` */
export function CycleBadge({ badge, onPick }: CycleBadgeProps): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={badge.name}
      className="pointer-events-auto flex items-center gap-3 rounded-md border border-input bg-card py-1.5 pr-2 pl-1.5 shadow-lg"
    >
      {badge.current && <CyclePhaseImage phase={badge.current} className="size-11" />}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">
          {badge.name} · rodada {badge.round}
        </span>
        <span className="font-display text-xl leading-none font-semibold">
          {badge.current?.name ?? '—'}
        </span>
      </div>
      {badge.next && <span aria-hidden="true" className="h-9 w-px bg-divider" />}
      {badge.next && <NextPhase badge={badge} next={badge.next} onPick={onPick} />}
    </div>
  );
}

type NextPhaseProps = CycleBadgeProps & Readonly<{ next: CyclePhaseView }>;

function NextPhase({ badge, next, onPick }: NextPhaseProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = badge.chosen ? 'Próxima · escolhida' : 'Próxima';
  const face = <NextFace label={label} next={next} chosen={badge.chosen} />;
  if (!badge.canChoose) return <span className="flex items-center gap-2">{face}</span>;
  const pick = async (phaseId: string | null): Promise<void> => {
    setBusy(true);
    const confirmed = await onPick(phaseId);
    setBusy(false);
    if (confirmed) setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${label}: ${next.name}`}
        className="flex min-h-11 items-center gap-2 rounded-md border border-input bg-muted px-2 hover:bg-accent"
      >
        {face}
        <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent aria-label={`Fase da rodada ${badge.round + 1}`} role="dialog">
        <CycleNextPicker
          round={badge.round + 1}
          options={badge.options}
          onPick={pick}
          busy={busy}
        />
      </PopoverContent>
    </Popover>
  );
}

type NextFaceProps = Readonly<{ label: string; next: CyclePhaseView; chosen: boolean }>;

function NextFace({ label, next, chosen }: NextFaceProps): React.JSX.Element {
  return (
    <>
      <CyclePhaseImage phase={next} className="size-6" />
      <span className="flex flex-col items-start">
        <span className={chosen ? 'text-xs text-primary' : 'text-xs text-muted-foreground'}>
          {label}
        </span>
        <span className="text-sm font-semibold">{next.name}</span>
      </span>
    </>
  );
}
