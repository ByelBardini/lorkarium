import type { DiceRolledDto } from '@lorkarium/contracts';
import type { AdvantageMode } from '@lorkarium/game-core';
import { LockIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import {
  breakdownOf,
  hiddenDiceText,
  naturalOf,
  rollModeOf,
  successesText,
  type DieMark,
  type PartBreakdown,
  type RollNatural,
} from '@/lib/dice-breakdown';
import { cn } from '@/lib/utils';
import type { DiceHistoryEntry } from '@/stores/dice-history-store';
import { secretRollText } from './dice-messages';
import { NATURAL_TOTAL_CLASS } from './natural-tone';
import type { RollerIdentity } from './use-roller-identity';

export type HistoryRowProps = Readonly<{
  entry: DiceHistoryEntry;
  /** The wall clock's reading: "…" until the entry's `revealAtMs`. */
  now: number;
  roller: RollerIdentity;
  /** "Rolar de novo"; `null` on someone else's roll and for who only watches. */
  onReroll: ((event: DiceRolledDto) => void) | null;
}>;

const NATURAL_TEXT: Readonly<Record<RollNatural, string>> = {
  twenty: '20 natural',
  one: '1 natural',
};

const MODE_TEXT: Readonly<Record<AdvantageMode, string>> = {
  advantage: 'com vantagem',
  disadvantage: 'com desvantagem',
};

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** One roll of the history: the roller's avatar and name, the label in gold, the time and the
 *  mode, then "…" until the dice stop and the total (gold on a natural 20, red on a 1) with the
 *  dice, the modifier and the formula below. A masters-only roll one may not see is a notice.
 *
 *  Example: `<HistoryRow entry={entry} now={now} roller={rollerOf(entry.event.rollerId)} onReroll={null} />` */
export function HistoryRow({ entry, now, roller, onReroll }: HistoryRowProps): React.JSX.Element {
  return (
    <li className="flex flex-col gap-1.5 border-b border-divider py-3 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <UserAvatar name={roller.name} color={roller.color} avatarId={roller.avatarId} size="sm" />
        <RowHeading entry={entry} name={roller.name} />
        {entry.kind === 'rolled' && (
          <RolledEnd event={entry.event} revealed={entry.revealAtMs <= now} onReroll={onReroll} />
        )}
      </div>
      {entry.kind === 'secret' ? (
        <p className="pl-9.5 text-sm text-muted-foreground">{secretRollText(roller.name)}</p>
      ) : (
        entry.revealAtMs <= now && <RollDetail event={entry.event} />
      )}
    </li>
  );
}

type HeadingProps = Readonly<{ entry: DiceHistoryEntry; name: string }>;

function RowHeading({ entry, name }: HeadingProps): React.JSX.Element {
  const label = entry.kind === 'rolled' ? entry.event.label : null;
  const mode = entry.kind === 'rolled' ? modeOf(entry.event) : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-semibold text-foreground">
        <span>{name}</span>
        {label !== null && <span aria-hidden="true"> · </span>}
        {label !== null && <span className="font-medium text-primary">{label}</span>}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        <time dateTime={entry.event.at}>{TIME_FORMAT.format(new Date(entry.event.at))}</time>
        {mode !== null && ` · ${MODE_TEXT[mode]}`}
      </span>
    </div>
  );
}

function modeOf(event: DiceRolledDto): AdvantageMode | null {
  return rollModeOf(event.parts.map((part) => part.expression));
}

type RolledEndProps = Readonly<{
  event: DiceRolledDto;
  revealed: boolean;
  onReroll: ((event: DiceRolledDto) => void) | null;
}>;

function RolledEnd({ event, revealed, onReroll }: RolledEndProps): React.JSX.Element {
  const natural = revealed ? naturalOf(event) : null;
  return (
    <>
      {event.visibility === 'masters' && (
        <span className="inline-flex items-center gap-1 text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          <LockIcon aria-hidden="true" className="size-3" />
          Só o mestre
        </span>
      )}
      <span
        data-testid="roll-total"
        className={cn(
          'font-display text-3xl leading-none font-semibold tabular-nums',
          revealed ? 'text-foreground' : 'text-muted-foreground',
          natural !== null && NATURAL_TOTAL_CLASS[natural],
        )}
      >
        {revealed ? event.total : '…'}
      </span>
      {onReroll !== null && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Rolar de novo"
          onClick={() => onReroll(event)}
        >
          <RotateCcwIcon aria-hidden="true" />
        </Button>
      )}
    </>
  );
}

function RollDetail({ event }: Readonly<{ event: DiceRolledDto }>): React.JSX.Element {
  const breakdown = breakdownOf(event);
  const natural = naturalOf(event);
  const several = breakdown.parts.length > 1;
  return (
    <div className="flex flex-col gap-1 pl-9.5">
      {breakdown.parts.map((part, index) => (
        <PartLine key={index} part={part} named={several} />
      ))}
      {breakdown.summary !== null && (
        <p className="text-xs text-muted-foreground">{breakdown.summary}</p>
      )}
      {natural !== null && (
        <p
          className={cn(
            'text-[11px] font-semibold tracking-[0.12em] uppercase',
            NATURAL_TOTAL_CLASS[natural],
          )}
        >
          {NATURAL_TEXT[natural]}
        </p>
      )}
    </div>
  );
}

type PartLineProps = Readonly<{ part: PartBreakdown; named: boolean }>;

function PartLine({ part, named }: PartLineProps): React.JSX.Element {
  const formula =
    named && part.label !== null ? `${part.label} ${part.expression}` : part.expression;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {part.dice.map((die, index) => (
        <DieChip key={index} die={die} />
      ))}
      {part.hiddenDice > 0 && (
        <span className="text-muted-foreground">{hiddenDiceText(part.hiddenDice)}</span>
      )}
      {part.modifier !== null && (
        <span className="px-0.5 font-semibold text-muted-foreground">
          {modifierText(part.modifier)}
        </span>
      )}
      {part.successes !== null && (
        <span className="text-label">{successesText(part.successes)}</span>
      )}
      <span className="ml-auto font-mono text-[11px] text-muted-foreground">{formula}</span>
    </div>
  );
}

// A typographic minus: the hyphen of "-2" reads as a dash beside the dice.
function modifierText(modifier: number): string {
  return modifier > 0 ? `+${modifier}` : `−${Math.abs(modifier)}`;
}

const DIE_STATUS_TITLE: Readonly<Record<DieMark['status'], string>> = {
  kept: 'mantido',
  dropped: 'descartado',
  exploded: 'explodiu',
  rerolled: 'rerrolado',
};

function DieChip({ die }: Readonly<{ die: DieMark }>): React.JSX.Element {
  const struck = die.status === 'dropped' || die.status === 'rerolled';
  return (
    <span
      title={`d${die.sides}: ${DIE_STATUS_TITLE[die.status]}`}
      data-status={die.status}
      data-extreme={die.extreme ?? undefined}
      className={cn(
        'inline-grid h-6 min-w-6 place-items-center rounded-sm bg-muted px-1 text-foreground tabular-nums',
        struck && 'text-muted-foreground line-through',
        die.extreme === 'max' && !struck && 'text-primary',
        die.extreme === 'min' && !struck && 'text-destructive-text',
        die.status === 'exploded' && 'border border-primary/60',
        die.success === true && 'underline decoration-primary underline-offset-2',
      )}
    >
      {die.value}
      {die.status === 'exploded' && <span aria-hidden="true">!</span>}
    </span>
  );
}
