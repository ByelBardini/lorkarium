import type { MemberColorDto } from '@lorkarium/contracts';
import { MEMBER_COLORS, type MemberColor } from '@lorkarium/game-core';
import { useId } from 'react';
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
}>;

/** "Sua cor no mapa": the 8 ping colors as round radios (a design-system exception: the circle
 *  says "pick one"), each named for the screen reader, then the tile of a custom color: a button,
 *  so the arrows stay among the fixed colors and never open its popover.
 *
 *  Example: `<ProfileColorField value={draft.values.color} onChange={(color) => draft.change({ color })} />` */
export function ProfileColorField({ value, onChange }: ProfileColorFieldProps): React.JSX.Element {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-[13px] font-medium text-label">
        Sua cor no mapa
      </span>
      <RadioGroup
        aria-labelledby={labelId}
        aria-describedby={hintId}
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
            className="size-8 border-2 border-transparent data-checked:border-foreground"
          />
        ))}
        <CustomColorTile value={value} onPick={onChange} className="size-8" scope="account" />
      </RadioGroup>
      <p id={hintId} className="text-[13px] text-placeholder">
        Pinta seu ping no mapa e suas iniciais. Sem escolha, vale a cor que o Lorkarium sorteou.
      </p>
    </div>
  );
}
