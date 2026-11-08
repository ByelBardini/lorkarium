import { useId } from 'react';
import { RangeField } from '@/components/range-field';
import { Switch } from '@/components/ui/switch';
import type { RangeFieldErrors, SceneDistance } from '@/lib/range-form';

/** The two fields of a range as typed, both measured from the token. */
export type ReachTyped = Readonly<{ bright: string; dim: string }>;

export type ReachSectionProps = Readonly<{
  icon: React.ReactNode;
  /** The name of the switch and of the group ("Enxerga no escuro", "Emite luz"). */
  title: string;
  hint: string;
  on: boolean;
  onSwitch: (on: boolean) => void;
  range: ReachTyped;
  errors: RangeFieldErrors;
  distance: SceneDistance;
  onRange: (range: ReachTyped) => void;
  /** A line under the fields, only while on. */
  note?: string;
  /** More of the reach under the fields, only while on (the color of a light). */
  children?: React.ReactNode;
}>;

/** One reach of a token, its vision in the dark or its light: a switch with its title and hint
 *  and, while on, "Plena até" and "Penumbra até" in the unit of the scene, each with its length in
 *  cells.
 *
 *  Example: `<ReachSection icon={<Eye />} title="Enxerga no escuro" hint={hint} on={sees} onSwitch={setSees} range={range} errors={errors} distance={scene} onRange={setRange} />` */
export function ReachSection(props: ReachSectionProps): React.JSX.Element {
  const { icon, title, hint, on, onSwitch, range, errors, distance, onRange } = props;
  return (
    <SwitchedSection icon={icon} title={title} hint={hint} on={on} onSwitch={onSwitch}>
      <div className="grid grid-cols-2 gap-3">
        <RangeField
          label={`Plena até (${distance.cellUnit})`}
          value={range.bright}
          error={errors.bright}
          distance={distance}
          onChange={(bright) => onRange({ ...range, bright })}
        />
        <RangeField
          label={`Penumbra até (${distance.cellUnit})`}
          value={range.dim}
          error={errors.dim}
          distance={distance}
          onChange={(dim) => onRange({ ...range, dim })}
        />
      </div>
      {props.note && <p className="text-xs text-muted-foreground">{props.note}</p>}
      {props.children}
    </SwitchedSection>
  );
}

export type SwitchedSectionProps = Readonly<{
  icon: React.ReactNode;
  /** The name of the switch and of the group. */
  title: string;
  hint: string;
  on: boolean;
  onSwitch: (on: boolean) => void;
  /** Under the switch, only while on. */
  children?: React.ReactNode;
}>;

/** A setting of the token that a switch turns on: a group with its icon, title, hint and switch
 *  of the same name and, while on, what it opens.
 *
 *  Example: `<SwitchedSection icon={<EyeOff />} title="Bloqueia a visão" hint={hint} on={on} onSwitch={setOn} />` */
export function SwitchedSection(props: SwitchedSectionProps): React.JSX.Element {
  const { title, on } = props;
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-lg border border-divider bg-background p-4 sm:p-5"
    >
      <div className="flex items-center gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
          {props.icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={`${id}-title`} className="text-[15px] font-semibold">
            {title}
          </span>
          <span className="text-[13px] text-muted-foreground">{props.hint}</span>
        </div>
        <Switch aria-labelledby={`${id}-title`} checked={on} onCheckedChange={props.onSwitch} />
      </div>
      {on && props.children && (
        <div className="flex flex-col gap-3 empty:hidden sm:pl-[54px]">{props.children}</div>
      )}
    </div>
  );
}
