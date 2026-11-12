import { isHexColor, type HexColorDto } from '@lorkarium/contracts';
import type { CustomColorScope } from '@/components/color-picker/custom-color-locks';
import { CustomColorTile } from '@/components/color-picker/custom-color-tile';
import { StyleTileGroup, type StyleTile } from './style-tile-group';

export type PaletteColorFieldProps<T extends string> = Readonly<{
  legend: string;
  /** A name of the palette checks its radio; a hex marks the custom tile; `null` marks nothing. */
  value: T | HexColorDto | null;
  tiles: readonly StyleTile<T>[];
  onChange: (value: T | HexColorDto) => void;
  /** Turns off the whole field, the custom tile included. */
  disabled?: boolean;
  /** Turns off only the custom tile (a fixed "Nenhum" can still be the one choice). */
  customDisabled?: boolean;
  hint?: string;
  legendHidden?: boolean;
  /** The background the color will be read on: the panel warns when it reads badly. */
  legibleOn?: HexColorDto;
  /** Whose plan offers the custom tile: the table's (its content) by default; `null` = always
   *  (a map place, which only takes a hex). */
  customScope?: CustomColorScope | null;
}>;

/** The round swatches of a palette followed by the tile that opens the custom color picker.
 *
 *  Example: `<PaletteColorField legend="Cor" value={color} tiles={COLOR_TILES} onChange={setColor} />` */
export function PaletteColorField<T extends string>({
  value,
  onChange,
  disabled,
  customDisabled,
  legibleOn,
  customScope = 'table',
  ...row
}: PaletteColorFieldProps<T>): React.JSX.Element {
  return (
    <StyleTileGroup
      {...row}
      shape="round"
      disabled={disabled}
      value={value !== null && isHexColor(value) ? null : value}
      onChange={onChange}
      trailing={
        <CustomColorTile
          value={value}
          onPick={onChange}
          disabled={disabled === true || customDisabled === true}
          legibleOn={legibleOn}
          scope={customScope ?? undefined}
        />
      }
    />
  );
}
