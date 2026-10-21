import type { ActiveConditionDto } from '@lorkarium/contracts';
import { MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { roundsLeftText } from './combat-view';
import { ConditionMark } from './condition-marks';

// The one shape the design system allows besides the radio: a 4px tag, so a condition reads at a
// glance in a crowded line (docs/context/client/design-system.md, exceptions).
const TAG =
  'inline-flex h-6 max-w-full items-center gap-1 rounded-sm border px-1.5 text-xs text-foreground';

function toneOf(condition: ActiveConditionDto): string {
  return condition.tone === 'benefit' ? 'border-primary/45' : 'border-destructive/60';
}

/** The conditions of a token as tags: mark, name and the rounds left ("∞" without limit), read as
 *  "Envenenado, 2 rodadas". Nothing when there is none.
 *
 *  Example: `<ConditionTags owner="Kael" conditions={kael.conditions} />` */
export function ConditionTags({
  owner,
  conditions,
}: Readonly<{ owner: string; conditions: readonly ActiveConditionDto[] }>) {
  if (conditions.length === 0) return null;
  return (
    <ul aria-label={`Condições de ${owner}`} className="flex flex-wrap gap-1">
      {conditions.map((condition) => (
        <li key={condition.id} className={cn(TAG, toneOf(condition))}>
          <ConditionMark icon={condition.icon} tone={condition.tone} />
          <span className="truncate">{condition.name}</span>
          <RoundsMark rounds={condition.remainingRounds} />
        </li>
      ))}
    </ul>
  );
}

export type EditableConditionTagProps = Readonly<{
  condition: ActiveConditionDto;
  disabled: boolean;
  /** The rounds left after − or + (never below 1: "Remover" takes it off). */
  onRounds: (rounds: number) => void;
  onRemove: () => void;
}>;

/** A condition in the token's detail: − and + change the rounds left (not without a limit, and −
 *  stops at 1), × removes it.
 *
 *  Example: `<EditableConditionTag condition={poisoned} disabled={false} onRounds={set} onRemove={remove} />` */
export function EditableConditionTag(props: EditableConditionTagProps) {
  const { condition, disabled } = props;
  const rounds = condition.remainingRounds;
  return (
    <li className={cn(TAG, 'h-7 pr-0.5', toneOf(condition))}>
      <ConditionMark icon={condition.icon} tone={condition.tone} />
      <span className="truncate">{condition.name}</span>
      {rounds !== null && (
        <TagButton
          label={`Menos uma rodada de ${condition.name}`}
          disabled={disabled || rounds <= 1}
          onClick={() => props.onRounds(rounds - 1)}
        >
          <MinusIcon aria-hidden="true" />
        </TagButton>
      )}
      <RoundsMark rounds={rounds} />
      {rounds !== null && (
        <TagButton
          label={`Mais uma rodada de ${condition.name}`}
          disabled={disabled}
          onClick={() => props.onRounds(rounds + 1)}
        >
          <PlusIcon aria-hidden="true" />
        </TagButton>
      )}
      <TagButton label={`Remover ${condition.name}`} disabled={disabled} onClick={props.onRemove}>
        <XIcon aria-hidden="true" />
      </TagButton>
    </li>
  );
}

function RoundsMark({ rounds }: Readonly<{ rounds: number | null }>) {
  return (
    <span className="shrink-0 text-muted-foreground tabular-nums">
      <span aria-hidden="true">{rounds === null ? '∞' : rounds}</span>
      <span className="sr-only">{`, ${roundsLeftText(rounds)}`}</span>
    </span>
  );
}

type TagButtonProps = Readonly<{
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>;

function TagButton({ label, disabled, onClick, children }: TagButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="size-5 text-muted-foreground hover:text-foreground"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
