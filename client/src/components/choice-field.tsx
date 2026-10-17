import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export type ChoiceOption<T extends string> = Readonly<{
  value: T;
  label: string;
  /** A color shown beside the label (a bar color); never the only way the choice is told. */
  swatch?: string;
}>;

export type ChoiceFieldProps<T extends string> = Readonly<{
  legend: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  /** The whole group off, with `hint` saying why. */
  disabled?: boolean;
  /** A line under the group, tied to it for screen readers. */
  hint?: string;
}>;

/** A labelled radio group laid out in a row: one choice among a few, each named in text.
 *
 *  Example: `<ChoiceField legend="Lado" value={side} options={SIDES} onChange={setSide} />` */
export function ChoiceField<T extends string>({
  legend,
  value,
  options,
  onChange,
  disabled,
  hint,
}: ChoiceFieldProps<T>): React.JSX.Element {
  const groupId = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend id={`${groupId}-legend`} className="mb-2 text-[13px] text-label">
        {legend}
      </legend>
      <RadioGroup
        aria-labelledby={`${groupId}-legend`}
        aria-describedby={hint ? `${groupId}-hint` : undefined}
        disabled={disabled}
        value={value}
        onValueChange={(next) => {
          const chosen = options.find((option) => option.value === next);
          if (chosen) onChange(chosen.value);
        }}
        className="flex flex-wrap gap-x-4 gap-y-2"
      >
        {options.map((option) => (
          <ChoiceItem key={option.value} id={`${groupId}-${option.value}`} option={option} />
        ))}
      </RadioGroup>
      {hint && (
        <p id={`${groupId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </fieldset>
  );
}

function ChoiceItem<T extends string>({
  id,
  option,
}: Readonly<{ id: string; option: ChoiceOption<T> }>): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={id} value={option.value} />
      <Label
        htmlFor={id}
        className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground"
      >
        {option.swatch && (
          <span aria-hidden="true" className="size-2" style={{ background: option.swatch }} />
        )}
        {option.label}
      </Label>
    </div>
  );
}
