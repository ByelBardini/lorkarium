import type { ConditionToneDto } from '@lorkarium/contracts';
import { CELL_WORLD_SIZE } from './camera';
import type { ConditionMarkView } from './token-view';

/** One icon of the strip: its center `x` in world px from the token's left edge. `rounds` only
 *  when the strip is close enough to read them; `ending` on its last round. */
export type StripIcon = ConditionMarkView &
  Readonly<{ x: number; rounds: number | null; ending: boolean }>;

/** One dot of a strip seen from afar: `offsetX` in screen px from the token's center. */
export type StripDot = Readonly<{ tone: ConditionToneDto; offsetX: number }>;

/** The conditions hanging under a token, by how big an icon would be on screen: dots from afar,
 *  icons, and icons with their rounds up close. `top` and `height` are world px from the token's
 *  top edge; `none` takes no room. */
export type ConditionStrip =
  | Readonly<{ band: 'none'; height: 0 }>
  | Readonly<{ band: 'dots'; top: number; height: number; dotSize: number; dots: StripDot[] }>
  | Readonly<{
      band: 'icons' | 'detailed';
      top: number;
      height: number;
      iconSize: number;
      icons: StripIcon[];
      /** "+N" in the last place when not all fit. */
      more: Readonly<{ count: number; x: number }> | null;
    }>;

export type ConditionStripInput = Readonly<{
  /** The token's size in world px. */
  width: number;
  height: number;
  /** Already by severity: the first ones are the ones kept. */
  conditions: readonly ConditionMarkView[];
  zoom: number;
}>;

/** The icon's radius grows with the token's side to the power 0.75: a 3×3 token gets icons about
 *  2.3 times as large, not 3; a one-cell token keeps the floor. */
const ICON_RADIUS_PER_CELL = 5.76;
const MIN_ICON_RADIUS = 6.5;
const ICON_GAP = 3;
const STRIP_GAP = 2;
// Screen px: under DOTS_BELOW_PX an icon is a smudge; from DETAIL_FROM_PX its rounds can be read.
const DOTS_BELOW_PX = 10;
const DETAIL_FROM_PX = 22;
const DOT_PX = 6;
const DOT_GAP_PX = 3;
const MAX_DOTS = 4;

/** Where the conditions of a token go, decided from its size and the zoom (pure math).
 *
 *  Example: `conditionStripOf({ width: 64, height: 64, conditions: view.conditions, zoom: 1 }).band // 'icons'` */
export function conditionStripOf(input: ConditionStripInput): ConditionStrip {
  const { width, height, zoom, conditions } = input;
  if (!(width > 0) || !(zoom > 0)) {
    throw new RangeError(
      `condition strip needs a width and a zoom above 0; got width ${width}, zoom ${zoom}`,
    );
  }
  if (conditions.length === 0) return { band: 'none', height: 0 };
  const iconSize = stripIconSize(width);
  const top = height + STRIP_GAP;
  const onScreen = iconSize * zoom;
  if (onScreen < DOTS_BELOW_PX) return dotsOf(conditions, top, zoom);
  return iconsOf(conditions, { width, top, iconSize, detailed: onScreen >= DETAIL_FROM_PX });
}

/** Example: `stripIconSize(64) // 13` */
export function stripIconSize(width: number): number {
  const side = width / CELL_WORLD_SIZE;
  return 2 * Math.max(MIN_ICON_RADIUS, ICON_RADIUS_PER_CELL * side ** 0.75);
}

function dotsOf(conditions: readonly ConditionMarkView[], top: number, zoom: number) {
  const shown = conditions.slice(0, MAX_DOTS);
  const total = shown.length * DOT_PX + (shown.length - 1) * DOT_GAP_PX;
  const dots = shown.map(({ tone }, index) => ({
    tone,
    offsetX: -total / 2 + index * (DOT_PX + DOT_GAP_PX) + DOT_PX / 2,
  }));
  return { band: 'dots', top, height: DOT_PX / zoom, dotSize: DOT_PX, dots } as const;
}

type IconLayout = Readonly<{ width: number; top: number; iconSize: number; detailed: boolean }>;

// The strip spans the token plus half an icon past each side; what does not fit becomes "+N".
function iconsOf(conditions: readonly ConditionMarkView[], layout: IconLayout) {
  const { width, top, iconSize, detailed } = layout;
  const step = iconSize + ICON_GAP;
  const places = Math.max(1, Math.floor((width + iconSize + ICON_GAP) / step));
  const kept = conditions.length <= places ? conditions : conditions.slice(0, places - 1);
  const slots = kept.length + (kept.length < conditions.length ? 1 : 0);
  const left = (width - (slots * step - ICON_GAP)) / 2 + iconSize / 2;
  const icons = kept.map((mark, index) => ({
    ...mark,
    x: left + index * step,
    rounds: detailed ? mark.remainingRounds : null,
    ending: mark.remainingRounds === 1,
  }));
  const count = conditions.length - kept.length;
  const more = count > 0 ? { count, x: left + kept.length * step } : null;
  const band = detailed ? 'detailed' : 'icons';
  return { band, top, height: iconSize, iconSize, icons, more } as const;
}
