import type { ActiveConditionDto } from '@lorkarium/contracts';
import { MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { paletteColorAt } from '@/lib/condition-colors';
import { shownStacksOf, stacksText } from '@/lib/condition-stacks';
import { cn } from '@/lib/utils';
import { roundsLeftText } from './combat-view';
import { ConditionMark } from './condition-marks';

// The one shape the design system allows besides the radio: a 4px tag, so a condition reads at a
// glance in a crowded line (docs/context/client/design-system.md, exceptions).
const TAG =
  'inline-flex h-6 max-w-full items-center gap-1 rounded-sm border px-1.5 text-xs text-foreground';

const TONE_TAG: Readonly<Record<ActiveConditionDto['tone'], string>> = {
  benefit: 'border-primary/45',
  harm: 'border-destructive/60',
  incapacitating: 'border-destructive bg-destructive/15',
};

type TagLook = Readonly<{ className: string; style?: React.CSSProperties }>;

// A color of the master's paints the border (full and with the low fill on an incapacitating
// one, its tone's emphasis); Tailwind cannot build a class from a runtime color.
function tagLookOf({ tone, color }: ActiveConditionDto): TagLook {
  if (color === null) return { className: TONE_TAG[tone] };
  if (tone !== 'incapacitating')
    return { className: '', style: { borderColor: paletteColorAt(color, 0.6) } };
  const style = {
    borderColor: paletteColorAt(color, 1),
    backgroundColor: paletteColorAt(color, 0.15),
  };
  return { className: '', style };
}

/** The conditions of a token as tags: mark, name, the stacks of a stacking one ("×3") and the
 *  rounds left ("∞" without limit), read as "Envenenado, 3 stacks, 2 rodadas". Nothing when there
 *  is none.
 *
 *  Example: `<ConditionTags owner="Kael" conditions={kael.conditions} />` */
export function ConditionTags({
  owner,
  conditions,
}: Readonly<{ owner: string; conditions: readonly ActiveConditionDto[] }>) {
  if (conditions.length === 0) return null;
  return (
    <ul aria-label={`Condições de ${owner}`} className="flex flex-wrap gap-1">
      {conditions.map((condition) => {
        const look = tagLookOf(condition);
        return (
          <li key={condition.id} className={cn(TAG, look.className)} style={look.style}>
            <TagMark condition={condition} />
            <ConditionName condition={condition} />
            <ConditionStacksMark stacks={shownStacksOf(condition)} />
            <RoundsMark rounds={condition.remainingRounds} />
          </li>
        );
      })}
    </ul>
  );
}

/** One condition as its tag shows on a token, alone: the preview of the settings' editor.
 *
 *  Example: `<ConditionTagPreview condition={{ ...values, id, conditionId: id, remainingRounds: 2 }} />` */
export function ConditionTagPreview({ condition }: Readonly<{ condition: ActiveConditionDto }>) {
  const look = tagLookOf(condition);
  return (
    <span className={cn(TAG, look.className)} style={look.style}>
      <TagMark condition={condition} />
      <ConditionName condition={condition} />
      <ConditionStacksMark stacks={shownStacksOf(condition)} />
      <RoundsMark rounds={condition.remainingRounds} />
    </span>
  );
}

export type EditableConditionTagProps = Readonly<{
  condition: ActiveConditionDto;
  disabled: boolean;
  /** The rounds left after − or + (never below 1: "Remover" takes it off). */
  onRounds: (rounds: number) => void;
  /** The stacks after − or + of a stacking condition (1 up to its `maxStacks`). */
  onStacks: (stacks: number) => void;
  onRemove: () => void;
}>;

/** A condition in the token's detail: on a stacking one, − and + change the stacks (1 up to its
 *  `maxStacks`); − and + change the rounds left (not without a limit, and − stops at 1), × removes
 *  it.
 *
 *  Example: `<EditableConditionTag condition={poisoned} disabled={false} onRounds={set} onStacks={pile} onRemove={remove} />` */
export function EditableConditionTag(props: EditableConditionTagProps) {
  const { condition, disabled } = props;
  const look = tagLookOf(condition);
  return (
    <li className={cn(TAG, 'h-7 pr-0.5', look.className)} style={look.style}>
      <TagMark condition={condition} />
      <ConditionName condition={condition} />
      <StacksControls {...props} />
      <RoundsControls {...props} />
      <TagButton label={`Remover ${condition.name}`} disabled={disabled} onClick={props.onRemove}>
        <XIcon aria-hidden="true" />
      </TagButton>
    </li>
  );
}

function TagMark({ condition }: Readonly<{ condition: ActiveConditionDto }>) {
  return (
    <ConditionMark
      icon={condition.icon}
      tone={condition.tone}
      color={condition.color}
      imageAssetId={condition.imageAssetId}
    />
  );
}

function StacksControls({ condition, disabled, onStacks }: EditableConditionTagProps) {
  const { maxStacks, stacks, name } = condition;
  if (maxStacks === null) return null;
  return (
    <>
      <TagButton
        label={`Menos um stack de ${name}`}
        disabled={disabled || stacks <= 1}
        onClick={() => onStacks(stacks - 1)}
      >
        <MinusIcon aria-hidden="true" />
      </TagButton>
      <ConditionStacksMark stacks={stacks} />
      <TagButton
        label={`Mais um stack de ${name}`}
        disabled={disabled || stacks >= maxStacks}
        onClick={() => onStacks(stacks + 1)}
      >
        <PlusIcon aria-hidden="true" />
      </TagButton>
    </>
  );
}

function RoundsControls({ condition, disabled, onRounds }: EditableConditionTagProps) {
  const rounds = condition.remainingRounds;
  if (rounds === null) return <RoundsMark rounds={rounds} />;
  return (
    <>
      <TagButton
        label={`Menos uma rodada de ${condition.name}`}
        disabled={disabled || rounds <= 1}
        onClick={() => onRounds(rounds - 1)}
      >
        <MinusIcon aria-hidden="true" />
      </TagButton>
      <RoundsMark rounds={rounds} />
      <TagButton
        label={`Mais uma rodada de ${condition.name}`}
        disabled={disabled}
        onClick={() => onRounds(rounds + 1)}
      >
        <PlusIcon aria-hidden="true" />
      </TagButton>
    </>
  );
}

/** The name of a condition; with a description, the name also opens it as a tooltip, by the
 *  pointer or by the keyboard focus (Radix ties it by `aria-describedby` while open). */
function ConditionName({ condition }: Readonly<{ condition: ActiveConditionDto }>) {
  if (condition.description === '') return <span className="truncate">{condition.name}</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="truncate rounded-sm underline decoration-muted-foreground decoration-dotted underline-offset-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {condition.name}
          </span>
        </TooltipTrigger>
        <TooltipContent className="whitespace-pre-line">{condition.description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** "×3" on a stacking condition, read as ", 3 stacks"; nothing on one that does not stack
 *  (`shownStacksOf` gives `null`).
 *
 *  Example: `<ConditionStacksMark stacks={shownStacksOf(condition)} className="ml-1" />` */
export function ConditionStacksMark({
  stacks,
  className,
}: Readonly<{ stacks: number | null; className?: string }>) {
  if (stacks === null) return null;
  return (
    <span className={cn('shrink-0 font-semibold tabular-nums', className)}>
      <span aria-hidden="true">{`×${stacks}`}</span>
      <span className="sr-only">{`, ${stacksText(stacks)}`}</span>
    </span>
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
