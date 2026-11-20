import { SparklesIcon } from 'lucide-react';
import { RangeField } from '@/components/range-field';
import { featureGate } from '@/features/plans/plan-gate';
import { usePlanLimits } from '@/features/plans/use-plan-limits';
import type { MagicSightFields } from '@/lib/magic-sight-form';
import type { SceneDistance } from '@/lib/range-form';
import { SwitchedSection } from './reach-section';
import { MAGIC_SIGHT_HINT } from './token-messages';

export type MagicSightSectionProps = Readonly<{
  fields: MagicSightFields;
  error: string | undefined;
  distance: SceneDistance;
  onChange: (fields: MagicSightFields) => void;
}>;

/** "Visão mágica" of the token dialog: the switch and, while on, "Até" in the unit of the scene.
 *  Past the table's plan the switch is locked, but a token that already sees the invisible may
 *  still turn it off.
 *
 *  Example: `<MagicSightSection fields={form.magicSight} error={errors.magicSight} distance={scene} onChange={setMagic} />` */
export function MagicSightSection(props: MagicSightSectionProps): React.JSX.Element {
  const { fields, distance, onChange } = props;
  const gate = featureGate(usePlanLimits().table, (limits) => limits.magicSight);
  const locked = !gate.open && !fields.on;
  return (
    <SwitchedSection
      icon={<SparklesIcon aria-hidden="true" className="size-5 text-chart-4" />}
      title="Visão mágica"
      hint={locked ? gate.hint : MAGIC_SIGHT_HINT}
      disabled={locked}
      on={fields.on}
      onSwitch={(on) => onChange({ ...fields, on })}
    >
      <RangeField
        label={`Até (${distance.cellUnit})`}
        value={fields.reach}
        error={props.error}
        distance={distance}
        onChange={(reach) => onChange({ ...fields, reach })}
      />
    </SwitchedSection>
  );
}
