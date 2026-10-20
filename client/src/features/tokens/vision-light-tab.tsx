import { REACH_MAX } from '@lorkarium/contracts';
import { EyeIcon, FlameIcon } from 'lucide-react';
import { cellsText } from '@/lib/cells-text';
import type { SceneDistance } from '@/lib/sight-form';
import { ReachSection } from './reach-section';
import { lightSwitchedOn, type TokenFormErrors, type TokenFormValues } from './token-form-state';
import { DARKVISION_HINT, LIGHT_HINT, PENUMBRA_HINT, SEES_IN_DARK_HINT } from './token-messages';

export type VisionLightTabProps = Readonly<{
  form: TokenFormValues;
  errors: TokenFormErrors;
  /** The scene's cell: the reaches are typed in its unit. */
  distance: SceneDistance;
  onChange: (form: TokenFormValues) => void;
}>;

/** "Visão e luz" of the token dialog: "Enxerga no escuro" (on in a new token, 9 / 18 m) and
 *  "Emite luz" (off; switching it on fills the torch), both read from the token.
 *
 *  Example: `<VisionLightTab form={form} errors={errors} distance={scene} onChange={setForm} />` */
export function VisionLightTab(props: VisionLightTabProps): React.JSX.Element {
  const { form, errors, distance, onChange } = props;
  const { sight, light } = form;
  return (
    <div className="flex flex-col gap-3.5">
      <ReachSection
        icon={<EyeIcon aria-hidden="true" className="size-5 text-chart-2" />}
        title="Enxerga no escuro"
        hint={sight.sees ? SEES_IN_DARK_HINT : DARKVISION_HINT}
        on={sight.sees}
        onSwitch={(sees) => onChange({ ...form, sight: { ...sight, sees } })}
        range={sight}
        errors={errors.sight ?? {}}
        distance={distance}
        onRange={(range) => onChange({ ...form, sight: { ...sight, ...range } })}
        note={PENUMBRA_HINT}
      />
      <ReachSection
        icon={<FlameIcon aria-hidden="true" className="size-5 text-primary" />}
        title="Emite luz"
        hint={LIGHT_HINT}
        on={light.on}
        onSwitch={(on) =>
          onChange(on ? lightSwitchedOn(form, distance) : { ...form, light: { ...light, on } })
        }
        range={light}
        errors={errors.light ?? {}}
        distance={distance}
        onRange={(range) => onChange({ ...form, light: { ...light, ...range } })}
      />
      <p className="text-xs text-placeholder">{unitNote(distance)}</p>
    </div>
  );
}

function unitNote({ cellDistance, cellUnit }: SceneDistance): string {
  const cell = `1 casa = ${cellsText(cellDistance)} ${cellUnit}`;
  return `Distâncias na unidade da cena · ${cell} · até ${REACH_MAX} casas`;
}
