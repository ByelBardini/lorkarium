import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { SettingsRow } from './settings-row';

export type DeviceSwitchProps = Readonly<{
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}>;

/** One row of "Minha conta" for a choice kept on this device (not in the profile): the title,
 *  the hint as its description and the `Switch`, changed at once, outside the bar of changes.
 *
 *  Example: `<DeviceSwitch label="Som do chat" hint="…" checked={sound} onCheckedChange={setSound} />` */
export function DeviceSwitch(props: DeviceSwitchProps): React.JSX.Element {
  const id = useId();
  return (
    <SettingsRow
      title={props.label}
      titleFor={id}
      description={props.hint}
      descriptionId={`${id}-hint`}
    >
      <Switch
        id={id}
        checked={props.checked}
        aria-describedby={`${id}-hint`}
        onCheckedChange={props.onCheckedChange}
        className="self-start"
      />
    </SettingsRow>
  );
}
