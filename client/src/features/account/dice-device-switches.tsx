import { useId } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDicePreferences, type DicePreferencesStore } from '@/stores/dice-preferences-store';

type DeviceSwitchProps = Readonly<{
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}>;

function DeviceSwitch(props: DeviceSwitchProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex max-w-md items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id} className="text-[13px] font-medium text-label">
          {props.label}
        </Label>
        <p id={`${id}-hint`} className="text-[13px] text-placeholder">
          {props.hint}
        </p>
      </div>
      <Switch
        id={id}
        checked={props.checked}
        aria-describedby={`${id}-hint`}
        onCheckedChange={props.onCheckedChange}
      />
    </div>
  );
}

export type DiceDeviceSwitchesProps = Readonly<{
  dicePreferences: StoreApi<DicePreferencesStore>;
}>;

/** "Dados 3D" and "Som dos dados" in "Minha conta": whether this device rolls the dice over the
 *  window and plays their knocks. Both are kept on the device, not in the profile, so they change
 *  at once, outside the bar of changes. With 3D off, three.js never loads and the result still
 *  waits the same time.
 *
 *  Example: `<DiceDeviceSwitches dicePreferences={deps.dicePreferences} />` */
export function DiceDeviceSwitches({
  dicePreferences,
}: DiceDeviceSwitchesProps): React.JSX.Element {
  const threeD = useDicePreferences(dicePreferences, (state) => state.threeD);
  const sound = useDicePreferences(dicePreferences, (state) => state.sound);
  return (
    <div className="flex flex-col gap-4">
      <DeviceSwitch
        label="Dados 3D"
        hint="Os dados rolam sobre a tela. Vale só neste aparelho; desligado, o resultado aparece no mesmo tempo."
        checked={threeD}
        onCheckedChange={(checked) => dicePreferences.getState().setThreeD(checked)}
      />
      <DeviceSwitch
        label="Som dos dados"
        hint="Cada batida dos dados na mesa faz barulho. Vale só neste aparelho."
        checked={sound}
        onCheckedChange={(checked) => dicePreferences.getState().setSound(checked)}
      />
    </div>
  );
}
