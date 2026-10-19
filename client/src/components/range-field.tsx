import { useId } from 'react';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { decimalText } from '@/lib/numeric-text';
import { rangeCellsHint, type SceneDistance } from '@/lib/range-form';

export type RangeFieldProps = Readonly<{
  label: string;
  value: string;
  error: string | undefined;
  distance: SceneDistance;
  onChange: (value: string) => void;
  /** Shown while empty (the lights picked differ: "vários"). */
  placeholder?: string;
  onBlur?: () => void;
}>;

/** One side of a range (sight or light) typed in the scene's unit, with its length in cells under
 *  it. Text, not type="number": "1,5" is typed the Brazilian way and there are no spinner arrows.
 *
 *  Example: `<RangeField label="Luz plena (m)" value={fields.bright} error={errors.bright} distance={scene} onChange={setBright} />` */
export function RangeField(props: RangeFieldProps) {
  const { label, value, error, distance, onChange } = props;
  const id = useId();
  const hint = rangeCellsHint(value, distance) ?? undefined;
  return (
    <FormField id={id} label={label} error={error} hint={hint}>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        placeholder={props.placeholder}
        onBlur={props.onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(decimalText(event.target.value))}
      />
    </FormField>
  );
}
