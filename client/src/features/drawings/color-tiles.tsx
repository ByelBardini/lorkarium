import type { DrawingColorDto } from '@lorkarium/contracts';
import { DRAWING_COLORS } from '@/lib/drawing-style';
import type { StyleTile } from './style-tile-group';

/** The eight colors of the palette as round swatches: the drawings and the areas of effect pick
 *  from the same tiles. */
export const COLOR_TILES: readonly StyleTile<DrawingColorDto>[] = DRAWING_COLORS.map(
  ({ color, label, hex }) => ({
    value: color,
    label,
    picture: (
      <span aria-hidden="true" className="size-full rounded-full" style={{ background: hex }} />
    ),
  }),
);
