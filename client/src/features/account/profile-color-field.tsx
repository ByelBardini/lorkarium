import type { MemberColorDto } from '@lorkarium/contracts';
import { MEMBER_COLORS, type MemberColor } from '@lorkarium/game-core';
import { CustomColorTile } from '@/components/color-picker/custom-color-tile';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { memberColorCss } from '@/lib/member-color';

const COLOR_NAME: Readonly<Record<MemberColor, string>> = {
  gold: 'Ouro',
  steel: 'Aço',
  ember: 'Brasa',
  moss: 'Musgo',
  violet: 'Violeta',
  rose: 'Rosa',
  teal: 'Verde-água',
  bone: 'Osso',
};

export type ProfileColorFieldProps = Readonly<{
  value: MemberColorDto;
  onChange: (color: MemberColorDto) => void;
  /** The id of the element naming the group ("Sua cor no mapa") and of its explanation. */
  labelledBy: string;
  describedBy: string;
}>;

/** "Sua cor no mapa": the 8 ping colors as round radios (a design-system exception: the circle
 *  says "pick one"), each named for the screen reader, then the tile of a custom color: a button,
 *  so the arrows stay among the fixed colors and never open its popover. The name and the hint
 *  come from the row around it.
 *
 *  Example: `<ProfileColorField value={draft.values.color} onChange={(color) => draft.change({ color })} labelledBy={titleId} describedBy={hintId} />` */
export function ProfileColorField(props: ProfileColorFieldProps): React.JSX.Element {
  const { value, onChange } = props;
  return (
    <RadioGroup
      aria-labelledby={props.labelledBy}
      aria-describedby={props.describedBy}
      value={value}
      onValueChange={(next) => {
        const color = MEMBER_COLORS.find((candidate) => candidate === next);
        if (color) onChange(color);
      }}
      className="flex flex-wrap gap-3"
    >
      {MEMBER_COLORS.map((color) => (
        <RadioGroupItem
          key={color}
          value={color}
          aria-label={COLOR_NAME[color]}
          style={{ backgroundColor: memberColorCss(color) }}
          className="size-9 border-2 border-transparent data-checked:border-foreground"
        />
      ))}
      <CustomColorTile value={value} onPick={onChange} className="size-9" scope="account" />
    </RadioGroup>
  );
}
