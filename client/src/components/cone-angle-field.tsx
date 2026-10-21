import { useId } from 'react';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';

export type ConeAngleFieldProps = Readonly<{
  label: string;
  value: string;
  error: string | undefined;
  hint?: string;
  onChange: (value: string) => void;
  /** Shown while empty (the lights picked differ: "vários"). */
  placeholder?: string;
  onBlur?: () => void;
}>;

/** How wide a cone opens, typed in whole degrees (360 = every side): the field of view and the
 *  beam of a token, the opening of a map light. Text, not type="number": no spinner arrows.
 *
 *  Example: `<ConeAngleField label="Campo de visão (°)" value={form.sightAngle} error={errors.sightAngle} onChange={setAngle} />` */
export function ConeAngleField(props: ConeAngleFieldProps): React.JSX.Element {
  const { label, value, error, hint, onChange } = props;
  const id = useId();
  return (
    <FormField id={id} label={label} error={error} hint={hint}>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        placeholder={props.placeholder}
        onBlur={props.onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}
