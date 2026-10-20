import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export type SegmentOption<T extends string> = Readonly<{
  value: T;
  label: string;
  /** A small mark before the label (the ring color of a side). */
  mark?: React.ReactNode;
  disabled?: boolean;
}>;

export type SegmentFieldProps<T extends string> = Readonly<{
  legend: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  /** A line under the segments, tied to the group for screen readers. */
  hint?: string;
  /** The segments share the whole width of the line. */
  fill?: boolean;
  className?: string;
}>;

/** One choice among two or three, as side-by-side segments, each of its own width or sharing the
 *  line (`fill`); a radio group: arrows move the choice. The `ChoiceField` is the circle + text version.
 *
 *  Example: `<SegmentField legend="Lado" value={side} options={SIDES} onChange={setSide} />` */
export function SegmentField<T extends string>(props: SegmentFieldProps<T>): React.JSX.Element {
  const { legend, value, options, onChange, hint } = props;
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-2.5', props.className)}>
      <span id={`${id}-legend`} className="text-[13px] text-label">
        {legend}
      </span>
      <RadioGroupPrimitive.Root
        aria-labelledby={`${id}-legend`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        onValueChange={(next) => {
          const chosen = options.find((option) => option.value === next);
          if (chosen) onChange(chosen.value);
        }}
        orientation="horizontal"
        className={cn('flex gap-2', !props.fill && 'flex-wrap')}
      >
        {options.map((option) => (
          <Segment key={option.value} option={option} fill={props.fill} />
        ))}
      </RadioGroupPrimitive.Root>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

type SegmentProps<T extends string> = Readonly<{ option: SegmentOption<T>; fill?: boolean }>;

function Segment<T extends string>({ option, fill }: SegmentProps<T>) {
  return (
    <RadioGroupPrimitive.Item
      value={option.value}
      disabled={option.disabled}
      className={cn(
        fill && 'min-w-0 flex-1',
        'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-muted-foreground outline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-muted data-[state=checked]:text-foreground motion-reduce:transition-none',
      )}
    >
      {option.mark}
      {option.label}
    </RadioGroupPrimitive.Item>
  );
}
