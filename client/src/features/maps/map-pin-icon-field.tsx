import { MAP_PIN_ICONS, type MapPinIconDto } from '@lorkarium/contracts';
import { Button } from '@/components/ui/button';
import { MAP_PIN_ICON_CHOICES } from './map-pin-icons';

export type MapPinIconFieldProps = Readonly<{
  value: MapPinIconDto;
  disabled: boolean;
  onChoose: (icon: MapPinIconDto) => void;
}>;

/** The icon of a pin, among the ones the contract lists.
 *
 *  Example: `<MapPinIconField value={region.icon} disabled={false} onChoose={save} />` */
export function MapPinIconField({
  value,
  disabled,
  onChoose,
}: MapPinIconFieldProps): React.JSX.Element {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Ícone</legend>
      <div className="grid grid-cols-8 gap-1">
        {MAP_PIN_ICONS.map((icon) => (
          <PinIconChoice
            key={icon}
            icon={icon}
            chosen={icon === value}
            disabled={disabled}
            onChoose={onChoose}
          />
        ))}
      </div>
    </fieldset>
  );
}

function PinIconChoice({
  icon,
  chosen,
  disabled,
  onChoose,
}: Readonly<{
  icon: MapPinIconDto;
  chosen: boolean;
  disabled: boolean;
  onChoose: (icon: MapPinIconDto) => void;
}>): React.JSX.Element {
  const { label, Icon } = MAP_PIN_ICON_CHOICES[icon];
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={chosen ? 'secondary' : 'ghost'}
      aria-label={label}
      aria-pressed={chosen}
      title={label}
      disabled={disabled}
      onClick={() => onChoose(icon)}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
