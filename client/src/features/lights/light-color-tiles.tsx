import { LIGHT_COLOR_TONES, NEUTRAL_LIGHT_LABEL, type LightColor } from '@/lib/light-color';
import { StyleTileGroup, type StyleTile } from '@/features/drawings/style-tile-group';

type LightColorChoice = NonNullable<LightColor> | typeof NEUTRAL;

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
  /** `undefined` when the lights picked differ: no tile is checked ("vários"). */
  value: LightColor | undefined;
  onChange: (color: LightColor) => void;
}>;

/** "Cor da luz": Neutra and the seven colors of the palette as round swatches, for the lights
 *  panel and the token dialog.
 *
 *  Example: `<LightColorTiles value={color} onChange={setColor} />` */
export function LightColorTiles({ value, onChange }: LightColorTilesProps): React.JSX.Element {
  return (
    <StyleTileGroup
      legend="Cor da luz"
      value={value === undefined ? null : (value ?? NEUTRAL)}
      tiles={LIGHT_COLOR_TILES}
      onChange={(choice) => onChange(choice === NEUTRAL ? null : choice)}
      shape="round"
    />
  );
}
