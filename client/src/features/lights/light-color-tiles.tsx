import type { LightPaletteDto } from '@lorkarium/contracts';
import { PaletteColorField } from '@/features/drawings/palette-color-field';
import type { StyleTile } from '@/features/drawings/style-tile-group';
import { LIGHT_COLOR_TONES, NEUTRAL_LIGHT_LABEL, type LightColor } from '@/lib/light-color';

type LightColorChoice = LightPaletteDto | typeof NEUTRAL;

// A radio needs a string: the neutral light goes by a value of its own.
const NEUTRAL = 'neutral';

// Neutral is a light, not the absence of one: a pale gold disc, never the slashed "none".
const NEUTRAL_TILE: StyleTile<LightColorChoice> = {
  value: NEUTRAL,
  label: NEUTRAL_LIGHT_LABEL,
  picture: (
    <span
      aria-hidden="true"
      className="size-full rounded-full border border-border bg-primary/40"
    />
  ),
};

const LIGHT_COLOR_TILES: readonly StyleTile<LightColorChoice>[] = [
  NEUTRAL_TILE,
  ...LIGHT_COLOR_TONES.map(({ color, label, hex }) => ({
    value: color,
    label,
    picture: (
      <span aria-hidden="true" className="size-full rounded-full" style={{ background: hex }} />
    ),
  })),
];

export type LightColorTilesProps = Readonly<{
  /** `undefined` when the lights picked differ: no tile is checked ("vários"); a hex marks the
   *  custom tile. */
  value: LightColor | undefined;
  onChange: (color: LightColor) => void;
}>;

/** "Cor da luz": Neutra, the seven colors of the palette as round swatches and the custom color
 *  tile, for the lights panel and the token dialog.
 *
 *  Example: `<LightColorTiles value={color} onChange={setColor} />` */
export function LightColorTiles({ value, onChange }: LightColorTilesProps): React.JSX.Element {
  return (
    <PaletteColorField
      legend="Cor da luz"
      value={value === undefined ? null : (value ?? NEUTRAL)}
      tiles={LIGHT_COLOR_TILES}
      onChange={(choice) => onChange(choice === NEUTRAL ? null : choice)}
    />
  );
}
