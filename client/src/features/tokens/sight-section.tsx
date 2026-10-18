import { useId } from 'react';
import { FormField } from '@/components/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { decimalText } from '@/lib/numeric-text';
import {
  sightCellsHint,
  type SceneDistance,
  type SightFieldErrors,
  type SightFields,
} from '@/lib/sight-form';

export type SightSectionProps = Readonly<{
  fields: SightFields;
  errors: SightFieldErrors;
  /** The scene's cell, so the ranges are typed in its unit ("18 m"). */
  distance: SceneDistance;
  onChange: (fields: SightFields) => void;
}>;

export const PENUMBRA_HINT = 'Na penumbra, vê o mapa, mas não vê tokens.';

/** "Visão" of a token: whether it sees, how far fully ("Visão plena") and how much more in
 *  silhouettes ("Penumbra"), in the scene's unit, each with its length in cells under it.
 *
 *  Example: `<SightSection fields={form.sight} errors={errors.sight ?? {}} distance={scene} onChange={setSight} />` */
export function SightSection({ fields, errors, distance, onChange }: SightSectionProps) {
  const seesId = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-[13px] text-label">Visão</legend>
      <div className="flex items-center gap-3">
        <Checkbox
          id={seesId}
          checked={fields.sees}
          onCheckedChange={(checked) => onChange({ ...fields, sees: checked === true })}
        />
        <Label htmlFor={seesId} className="text-sm text-foreground">
          Enxerga
        </Label>
      </div>
      {fields.sees && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <RangeField
              label={`Visão plena (${distance.cellUnit})`}
              value={fields.bright}
              error={errors.bright}
              distance={distance}
              onChange={(bright) => onChange({ ...fields, bright })}
            />
            <RangeField
              label={`Penumbra (${distance.cellUnit})`}
              value={fields.dim}
              error={errors.dim}
              distance={distance}
              onChange={(dim) => onChange({ ...fields, dim })}
            />
          </div>
          <p className="text-xs text-muted-foreground">{PENUMBRA_HINT}</p>
        </>
      )}
    </fieldset>
  );
}

type RangeFieldProps = Readonly<{
  label: string;
  value: string;
  error: string | undefined;
  distance: SceneDistance;
  onChange: (value: string) => void;
}>;

// Text, not type="number": "1,5" is typed the Brazilian way and there are no spinner arrows.
function RangeField({ label, value, error, distance, onChange }: RangeFieldProps) {
  const id = useId();
  const hint = sightCellsHint(value, distance) ?? undefined;
  return (
    <FormField id={id} label={label} error={error} hint={hint}>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(decimalText(event.target.value))}
      />
    </FormField>
  );
}
