import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { SceneDistance, SightFieldErrors, SightFields } from '@/lib/sight-form';
import { RangeField } from '@/components/range-field';

export type SightSectionProps = Readonly<{
  fields: SightFields;
  errors: SightFieldErrors;
  /** The scene's cell, so the ranges are typed in its unit ("18 m"). */
  distance: SceneDistance;
  onChange: (fields: SightFields) => void;
}>;

export const PENUMBRA_HINT = 'Na penumbra, vê o mapa, mas não vê tokens.';
export const DARKVISION_HINT = 'Sem isso, o token vê só onde há luz.';

/** "Visão" of a token: whether it sees in the dark ("Enxerga no escuro"), how far fully ("Visão
 *  plena") and how much more in silhouettes ("Penumbra"), in the scene's unit, each with its
 *  length in cells under it. Without it, the token still sees whatever is lit.
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
          Enxerga no escuro
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">{DARKVISION_HINT}</p>
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
