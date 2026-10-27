import type { AuraEffectDto, AuraImageShapeDto, TokenAuraDto } from '@lorkarium/contracts';
import { drawingColorValue } from '@/lib/drawing-style';
import { assetUrlOf } from '@/services/assets-api';
import { CELL_WORLD_SIZE } from './camera';
import { tokenWorldRect, type TokenFootprint, type WorldRect } from './token-box';
import { artBox, type ArtBox, type ArtImageSize } from './token-art';
import { HIDDEN_ALPHA } from './token-look';

/** What an aura paints: a tint, a ready-made effect (`tint: null` = its natural tone) or an
 *  image of the table, whole in the aura (`square`) or covering a circle around the token
 *  (`round`). */
export type AuraLook =
  | Readonly<{ kind: 'color'; color: number }>
  | Readonly<{ kind: 'effect'; effect: AuraEffectDto; tint: number | null }>
  | Readonly<{ kind: 'image'; url: string; shape: AuraImageShapeDto }>;

/** The aura of a token as drawn: the footprint grown by the radius (`box`, world px), with corners
 *  rounded by that radius (`corner`), at `alpha` (0–1). */
export type AuraView = Readonly<{ look: AuraLook; box: WorldRect; corner: number; alpha: number }>;

/** What the aura of a token is built from. */
export type AuraViewInput = TokenFootprint &
  Readonly<{ aura: TokenAuraDto | null; hidden: boolean }>;

/** The aura of a token: the footprint grown by the radius to every side, its corners rounded by the
 *  radius (an emanation measured from the edge), faded like the face of a hidden token. `null`
 *  without aura.
 *
 *  Example: `auraViewOf({ col: 5, row: 5, width: 1, height: 1, aura, hidden: false })?.box // { x: 192, y: 192, width: 320, height: 320 }` */
export function auraViewOf(input: AuraViewInput): AuraView | null {
  const { aura } = input;
  if (!aura) return null;
  const reach = aura.radius * CELL_WORLD_SIZE;
  const token = tokenWorldRect(input);
  const box = {
    x: token.x - reach,
    y: token.y - reach,
    width: token.width + reach * 2,
    height: token.height + reach * 2,
  };
  const alpha = (aura.opacity / 100) * (input.hidden ? HIDDEN_ALPHA : 1);
  return { look: auraLookOf(aura), box, corner: reach, alpha };
}

/** What the drawing of an aura reads, without where it stands: the same aura on a new cell keeps
 *  its key (the glide moves it), and a new key draws it again.
 *
 *  Example: `if (auraKeyOf(before.aura) !== auraKeyOf(after.aura)) aura.draw(after.aura)` */
export function auraKeyOf(view: AuraView | null): string {
  if (!view) return '';
  const { look, box, corner, alpha } = view;
  return [...Object.values(look), box.width, box.height, corner, alpha].join(' ');
}

function auraLookOf(aura: TokenAuraDto): AuraLook {
  if (aura.kind === 'color') return { kind: 'color', color: drawingColorValue(aura.color) };
  if (aura.kind === 'image') {
    return { kind: 'image', url: assetUrlOf(aura.imageAssetId), shape: aura.shape };
  }
  const tint = aura.color === null ? null : drawingColorValue(aura.color);
  return { kind: 'effect', effect: aura.effect, tint };
}

/** One rounded rectangle of the soft halo, in world px from the token's top-left corner. */
export type AuraHaloStep = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  alpha: number;
}>;

// The edge fades in over a quarter of the radius (4 to 32 px): soft at any size, never a band
// wider than the aura's own reach.
const HALO_STEPS = 4;
const HALO_BAND = { min: 4, max: 32, share: 0.25 } as const;

/** The halo as nested rounded rectangles, each inset by a step of the soft band, whose alphas
 *  stack up (one over the other) to a straight ramp: the aura's alpha from the band inwards.
 *
 *  Example: `for (const step of auraHaloOf(view)) graphics.roundRect(step.x, step.y, step.width, step.height, step.radius).fill({ color, alpha: step.alpha })` */
export function auraHaloOf(view: AuraView): AuraHaloStep[] {
  const { box, corner, alpha } = view;
  const band = Math.min(HALO_BAND.max, Math.max(HALO_BAND.min, corner * HALO_BAND.share));
  return Array.from({ length: HALO_STEPS }, (_, index) => {
    const inset = (band * index) / HALO_STEPS;
    const below = (alpha * index) / HALO_STEPS;
    const above = (alpha * (index + 1)) / HALO_STEPS;
    return {
      x: inset - corner,
      y: inset - corner,
      width: box.width - inset * 2,
      height: box.height - inset * 2,
      radius: Math.max(0, corner - inset),
      alpha: (above - below) / (1 - below),
    };
  });
}

/** Where the image of an aura sits: whole inside the aura (contain, like a square token image),
 *  centered, in world px from the token's top-left corner. A rune or a magic circle comes square
 *  with a transparent ground; a mask would cut its tips and break the GPU batch.
 *
 *  Example: `auraImageBox(view, { width: 400, height: 600 }) // { x: -74.67, y: -128, width: 213.33, height: 320 }` */
export function auraImageBox(view: AuraView, image: ArtImageSize): ArtBox {
  const circle = auraImageCircle(view);
  if (circle) return roundImageBox(circle, image);
  const { box, corner } = view;
  const fit = artBox('square', image, box);
  return { ...fit, x: fit.x - corner, y: fit.y - corner };
}

/** A circle of the aura, in world px from the token's top-left corner. */
export type AuraCircle = Readonly<{ x: number; y: number; radius: number }>;

/** The circle a round image aura covers: centered on the token, across its longer side plus the
 *  radius to each side (a 2 × 1 token gets a circle that holds it whole). `null` for any other
 *  aura.
 *
 *  Example: `auraImageCircle(view) // { x: 32, y: 32, radius: 160 } for a 1 × 1 token, 2 cells` */
export function auraImageCircle(view: AuraView): AuraCircle | null {
  if (view.look.kind !== 'image' || view.look.shape !== 'round') return null;
  const { box, corner } = view;
  const token = { width: box.width - corner * 2, height: box.height - corner * 2 };
  const radius = Math.max(token.width, token.height) / 2 + corner;
  return { x: token.width / 2, y: token.height / 2, radius };
}

// Cover: the image fills the circle's square and the mask trims what overflows it.
function roundImageBox(circle: AuraCircle, image: ArtImageSize): ArtBox {
  const side = circle.radius * 2;
  const fit = artBox('round', image, { width: side, height: side });
  return { ...fit, x: fit.x + circle.x - circle.radius, y: fit.y + circle.y - circle.radius };
}

/** The image of every image aura of the view, once: what the aura sources keep loaded.
 *
 *  Example: `auraSources.retain(auraImageUrlsOf(view.tokens))` */
export function auraImageUrlsOf(
  tokens: ReadonlyArray<Readonly<{ aura: AuraView | null }>>,
): Set<string> {
  const urls = new Set<string>();
  for (const { aura } of tokens) if (aura?.look.kind === 'image') urls.add(aura.look.url);
  return urls;
}
