import type { ConditionToneDto } from '@lorkarium/contracts';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId } from 'react';
import { cn } from '@/lib/utils';

const TONES: readonly Readonly<{ value: ConditionToneDto; label: string; checked: string }>[] = [
  { value: 'benefit', label: 'Benéfica', checked: 'data-[state=checked]:text-primary' },
  { value: 'harm', label: 'Prejudicial', checked: 'data-[state=checked]:text-destructive-text' },
  {
    value: 'incapacitating',
    label: 'Incapacitante',
    checked: 'data-[state=checked]:text-destructive-text',
  },
];

/** "Natureza" of a new condition as a three-part segmented control, the checked part in the color
 *  its mark will get (and named in text, never by color alone).
 *
 *  Example: `<ConditionToneField value={tone} onChange={setTone} />` */
export function ConditionToneField({
  value,
  onChange,
}: Readonly<{
  value: ConditionToneDto;
  onChange: (tone: ConditionToneDto) => void;
}>): React.JSX.Element {
  const legendId = useId();
  return (
    <fieldset className="min-w-0 flex-1">
      <legend id={legendId} className="sr-only">
        Natureza
      </legend>
      <RadioGroupPrimitive.Root
        aria-labelledby={legendId}
        value={value}
        onValueChange={(next) => {
          const chosen = TONES.find((tone) => tone.value === next);
          if (chosen) onChange(chosen.value);
        }}
        className="flex h-9 rounded-md border border-input bg-card p-0.5"
      >
        {TONES.map((tone) => (
          <RadioGroupPrimitive.Item
            key={tone.value}
            value={tone.value}
            className={cn(
              'flex-1 rounded-sm text-[13px] text-muted-foreground outline-none hover:text-foreground',
              'focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=checked]:bg-accent',
              tone.checked,
            )}
          >
            {tone.label}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </fieldset>
  );
}
