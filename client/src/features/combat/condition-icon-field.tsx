import {
  CONDITION_ICONS,
  type ConditionIconDto,
  type ConditionToneDto,
} from '@lorkarium/contracts';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CONDITION_ICON_ENTRIES } from '@/lib/condition-icons';
import { StyleTileGroup, type StyleTile } from '../drawings/style-tile-group';
import { ConditionMark } from './condition-marks';

/** "Ícone" of a new condition: one tile with the current mark that opens the contract's closed
 *  list in a popover (the Notion/Linear icon picker), drawn in the chosen tone so the master sees
 *  the mark the tokens will get. Picking one closes it.
 *
 *  Example: `<ConditionIconField value={icon} tone={tone} onChange={setIcon} />` */
export function ConditionIconField({
  value,
  tone,
  onChange,
}: Readonly<{
  value: ConditionIconDto;
  tone: ConditionToneDto;
  onChange: (icon: ConditionIconDto) => void;
}>): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const tiles: StyleTile<ConditionIconDto>[] = CONDITION_ICONS.map((icon) => ({
    value: icon,
    label: CONDITION_ICON_ENTRIES[icon].label,
    picture: <ConditionMark icon={icon} tone={tone} />,
  }));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Ícone: ${CONDITION_ICON_ENTRIES[value].label}`}
        title="Escolher ícone"
        className="grid size-9 shrink-0 place-items-center rounded-md border border-input bg-card outline-offset-2 hover:border-primary focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ConditionMark icon={value} tone={tone} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-70">
        <StyleTileGroup
          legend="Ícone"
          value={value}
          tiles={tiles}
          shape="grid"
          onChange={(icon) => {
            onChange(icon);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
