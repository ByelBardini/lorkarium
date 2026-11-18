import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';

export type SegmentedOption<T extends string> = Readonly<{
  value: T;
  label: string;
  /** A short note after the label, in the accent ("-20%"). */
  note?: string;
  /** What the note says to a screen reader ("até 20% de desconto"). */
  noteLabel?: string;
}>;

export type SegmentedChoiceProps<T extends string> = Readonly<{
  legend: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}>;

/** A joined segmented control for the billing choices (period, payment): one track, the chosen
 *  segment lifted to the card surface; a radio group, arrows move the choice.
 *
 *  Example: `<SegmentedChoice legend="Período" value={period} options={PERIODS} onChange={setPeriod} />` */
export function SegmentedChoice<T extends string>(
  props: SegmentedChoiceProps<T>,
): React.JSX.Element {
  const legendId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span
        id={legendId}
        className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        {props.legend}
      </span>
      <RadioGroupPrimitive.Root
        aria-labelledby={legendId}
        value={props.value}
        orientation="horizontal"
        onValueChange={(next) => {
          const chosen = props.options.find((option) => option.value === next);
          if (chosen) props.onChange(chosen.value);
        }}
        className="inline-flex gap-0.5 self-start rounded-md border border-border bg-background p-1"
      >
        {props.options.map((option) => (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className="inline-flex h-9 items-center gap-2 rounded-sm px-4 text-sm font-semibold text-muted-foreground outline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=checked]:bg-card data-[state=checked]:text-foreground"
          >
            {option.label}
            {option.note && (
              <>
                <span aria-hidden="true" className="text-xs font-bold text-primary">
                  {option.note}
                </span>
                <span className="sr-only">, {option.noteLabel ?? option.note}</span>
              </>
            )}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
