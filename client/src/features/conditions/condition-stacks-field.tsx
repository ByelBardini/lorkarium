import { CONDITION_STACKS_MAX } from '@lorkarium/contracts';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { digitsOnly } from '@/lib/numeric-text';
import { cn } from '@/lib/utils';
import {
  CONDITION_STACKS_MIN,
  DEFAULT_MAX_STACKS,
  maxStacksOf,
  steppedMaxStacks,
  type StacksDraft,
} from './condition-stacks';

const STACKS_RANGE_MESSAGE = `De ${CONDITION_STACKS_MIN} a ${CONDITION_STACKS_MAX}.`;

type ConditionStacksFieldProps = Readonly<{
  draft: StacksDraft;
  onChange: (draft: StacksDraft) => void;
}>;

/** Whether a condition piles up, as one box: "Acumula stacks" with its switch and, on, "Até [−] 5
 *  [+] stacks" (2 to 99; typed out of range says so). Turned on with nothing typed, it starts at
 *  5; left empty, it goes back to 99 when the field is left.
 *
 *  Example: `<ConditionStacksField draft={stacks} onChange={setStacks} />` */
export function ConditionStacksField({ draft, onChange }: ConditionStacksFieldProps) {
  const toggleId = useId();
  const hintId = useId();
  const turn = (on: boolean): void => {
    const text = on && draft.text === '' ? String(DEFAULT_MAX_STACKS) : draft.text;
    onChange({ on, text });
  };
  return (
    <div className="flex flex-col border border-input bg-card">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <label htmlFor={toggleId} className="text-[13px] text-label">
            Acumula stacks
          </label>
          <span id={hintId} className="text-xs text-muted-foreground">
            Cada nova aplicação soma 1 stack e renova a duração.
          </span>
        </div>
        <Switch
          id={toggleId}
          aria-label="Acumula (stacks)"
          aria-describedby={hintId}
          checked={draft.on}
          onCheckedChange={turn}
        />
      </div>
      {draft.on && (
        <MaxStacksStepper text={draft.text} onChange={(text) => onChange({ ...draft, text })} />
      )}
    </div>
  );
}

type MaxStacksStepperProps = Readonly<{ text: string; onChange: (text: string) => void }>;

function MaxStacksStepper({ text, onChange }: MaxStacksStepperProps): React.JSX.Element {
  const id = useId();
  const max = maxStacksOf({ on: true, text });
  const invalid = max === 'invalid';
  const step = (by: number): void => onChange(String(steppedMaxStacks(max, by)));
  return (
    <div className="flex flex-col items-center gap-1 border-t border-divider px-4 py-3">
      <div className="flex items-center justify-center gap-3 text-[13px] text-label">
        <span aria-hidden="true">Até</span>
        <div
          className={cn('flex items-center border border-input', invalid && 'border-destructive')}
        >
          <StepButton
            label="Menos um no máximo de stacks"
            disabled={max === CONDITION_STACKS_MIN}
            onClick={() => step(-1)}
          >
            <MinusIcon aria-hidden="true" />
          </StepButton>
          <input
            id={id}
            value={text}
            inputMode="numeric"
            aria-label="Máximo de stacks"
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            onChange={(event) => onChange(digitsOnly(event.target.value))}
            onBlur={() => text.trim() === '' && onChange(String(CONDITION_STACKS_MAX))}
            className="h-8 w-10 bg-transparent text-center text-sm text-foreground tabular-nums outline-none"
          />
          <StepButton
            label="Mais um no máximo de stacks"
            disabled={max === CONDITION_STACKS_MAX}
            onClick={() => step(1)}
          >
            <PlusIcon aria-hidden="true" />
          </StepButton>
        </div>
        <span aria-hidden="true">stacks</span>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          {STACKS_RANGE_MESSAGE}
        </p>
      )}
    </div>
  );
}

type StepButtonProps = Readonly<{
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>;

function StepButton({ label, disabled, onClick, children }: StepButtonProps): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-8 rounded-none text-muted-foreground hover:text-foreground"
    >
      {children}
    </Button>
  );
}
