import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { RangeFieldErrors, RangeFields, SceneDistance } from '@/lib/range-form';
import { RangeField } from '@/components/range-field';

export type LightSectionProps = Readonly<{
  fields: RangeFields;
  errors: RangeFieldErrors;
  /** The scene's cell, so the ranges are typed in its unit ("6 m"). */
  distance: SceneDistance;
  onChange: (fields: RangeFields) => void;
}>;

/** "Luz" of a token: whether it gives off light ("Emite luz", the torch it carries), how far fully
 *  ("Luz plena") and how much half-light more ("Penumbra"), in the scene's unit. Whoever controls
 *  the token lights it and puts it out from its menu.
 *
 *  Example: `<LightSection fields={form.light} errors={errors.light ?? {}} distance={scene} onChange={setLight} />` */
export function LightSection({ fields, errors, distance, onChange }: LightSectionProps) {
  const emitsId = useId();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-[13px] text-label">Luz</legend>
      <div className="flex items-center gap-3">
        <Checkbox
          id={emitsId}
          checked={fields.on}
          onCheckedChange={(checked) => onChange({ ...fields, on: checked === true })}
        />
        <Label htmlFor={emitsId} className="text-sm text-foreground">
          Emite luz
        </Label>
      </div>
      {fields.on && (
        <div className="grid grid-cols-2 gap-4">
          <RangeField
            label={`Luz plena (${distance.cellUnit})`}
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
      )}
    </fieldset>
  );
}
