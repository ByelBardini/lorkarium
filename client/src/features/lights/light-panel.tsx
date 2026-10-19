import { useState } from 'react';
import { RangeField } from '@/components/range-field';
import {
  parseRangeFields,
  rangeFieldsOf,
  type RangeFieldErrors,
  type RangeFields,
  type SceneDistance,
} from '@/lib/range-form';
import type { LightReach } from '@/services/light-commands';

export type LightPanelProps = Readonly<{
  /** The reach shown, in cells; `null` when the lights picked differ (the fields say "vários"). */
  reach: LightReach | null;
  /** The scene's cell, so the reach is typed in its unit ("6 m"). */
  distance: SceneDistance;
  /** A valid reach typed: in cells, to the hundredth. */
  onReach: (reach: LightReach) => void;
  /** `change` (the next light: every keystroke) or `blur` (lights picked: one command per field). */
  commit: 'change' | 'blur';
  /** Below the fields: the switch of the lights picked. */
  children?: React.ReactNode;
}>;

const LIGHT_TEXTS = { missingBright: 'Informe a luz plena.' };
const MIXED = 'vários';

/** The lights panel, floating beside the toolbar while the lights tool is on: the bright and dim
 *  range in the scene's unit, of the next light or of the lights picked. A valid reach goes to
 *  `onReach` (on each change or on leaving a field); a field out of range says so and sends nothing.
 *
 *  Example: `<LightPanel reach={reach} distance={scene} onReach={setReach} commit="change" />` */
export function LightPanel(props: LightPanelProps): React.JSX.Element {
  const { reach, distance, onReach, commit } = props;
  const [fields, setFields] = useState<RangeFields>(() => fieldsOf(reach, distance));
  const [errors, setErrors] = useState<RangeFieldErrors>({});
  const send = (typed: RangeFields): void => {
    const parsed = parseRangeFields(typed, distance, LIGHT_TEXTS);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok && parsed.range) onReach(parsed.range);
  };
  const change = (next: RangeFields): void => {
    setFields(next);
    if (commit === 'change') send(next);
  };
  const leave = commit === 'blur' ? () => send(fields) : undefined;
  const placeholder = reach ? undefined : MIXED;
  return (
    <section
      aria-label="Luz"
      className="absolute top-16 left-16 flex w-60 flex-col gap-4 rounded-lg border border-border bg-panel p-4"
    >
      <RangeField
        label={`Plena (${distance.cellUnit})`}
        value={fields.bright}
        error={errors.bright}
        distance={distance}
        placeholder={placeholder}
        onBlur={leave}
        onChange={(bright) => change({ ...fields, bright })}
      />
      <RangeField
        label={`Penumbra (${distance.cellUnit})`}
        value={fields.dim}
        error={errors.dim}
        distance={distance}
        placeholder={placeholder}
        onBlur={leave}
        onChange={(dim) => change({ ...fields, dim })}
      />
      {props.children}
    </section>
  );
}

// The panel always edits a light that is there: switched on, never "no light".
function fieldsOf(reach: LightReach | null, distance: SceneDistance): RangeFields {
  return reach ? rangeFieldsOf(reach, distance) : { on: true, bright: '', dim: '', saved: false };
}
