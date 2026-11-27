import { BitmapText, Container, Graphics, type Texture } from 'pixi.js';
import { barColorNumber } from '@/lib/bar-display';
import type { TokenSideDto } from '@lorkarium/contracts';
import { facingVector } from '@lorkarium/game-core';
import type { TokenView } from './board-view';
import type { Point } from './camera';
import { PixiConditionMarks } from './pixi-condition-marks';
import { INITIALS_FONT_NAME } from './pixi-initials-font';
import { PixiTokenArt, ROUND_RADIUS_SHARE } from './pixi-token-art';
import type { PixiTextureCache } from './pixi-texture-cache';
import { PixiNameTag } from './pixi-name-tag';
import { PixiTokenLook } from './pixi-token-look';
import { barSegments, type BarTone } from './token-bar';
import { tokenWorldRect } from './token-box';
import { defeatedCross } from './token-defeated';
import { tokenLookStyle } from './token-look';

// Design system tokens (client/src/index.css): the canvas cannot read CSS variables.
const DISC_COLOR = 0x1b1f25;
const TEXT_COLOR = 0xeae5da;
const GOLD_COLOR = 0xc5a46d;
const BAR_TRACK_COLOR = 0x262b33;
const BAR_OUTLINE_COLOR = 0x15130f;
// Below zero and above the maximum need hues no bar color has: crimson and bone.
const BAR_NEGATIVE_COLOR = 0xd6455d;
const BAR_OVER_COLOR = 0xeae5da;
// The temp is a pale strip on the top half: it has to read over every other tone of the bar.
const BAR_TEMP_COLOR = 0xa9d4e6;
const BAR_TEMP_HEIGHT = 3;
const BAR_HEIGHT = 6;
const RING_COLOR: Readonly<Record<TokenSideDto, number>> = {
  ally: 0xd5d0c4,
  enemy: 0xb5654f,
  neutral: 0x8a9bb8,
};
const SILHOUETTE = { color: 0x000000, alpha: 0.9 } as const;
const DEFEATED_COLOR = BAR_NEGATIVE_COLOR;
const DEFEATED_OUTLINE = 3;

const FACING_MARK_LENGTH = 7;
const FACING_MARK_HALF_WIDTH = 5;

/** The parts of one token on the canvas and where it glides. */
export type TokenSprite = Readonly<{
  root: Container;
  /** The disc, the art and the initials: what a look fades and greys, as one. */
  face: Container;
  disc: Graphics;
  art: PixiTokenArt;
  shape: Graphics;
  label: BitmapText;
  cross: Graphics;
  look: PixiTokenLook;
  marks: PixiConditionMarks;
  /** Over the tokens of its layer: the strip and the name plate, which hang under the cell. */
  overlay: Container;
  nameTag: PixiNameTag;
}> & {
  view: TokenView;
  from: Point;
  to: Point;
  startedMs: number;
  /** How long the glide under way lasts: 150 ms, or a patrol's whole step. */
  glideMs: number;
  stripHeight: number;
};

/** One token's containers, at `at` (world px of its top-left corner), not yet in any layer nor
 *  drawn: the token layer and the spawn preview both build their tokens here.
 *
 *  Example: `const sprite = newTokenSprite(view, corner, now, textures); layer.addChild(sprite.root)` */
export function newTokenSprite(
  view: TokenView,
  at: Point,
  nowMs: number,
  textures?: Pick<PixiTextureCache, 'textureOf'>,
): TokenSprite {
  const root = new Container({ label: `token:${view.id}` });
  // One atlas for every token (`pixi-initials-font.ts`): no texture per token.
  const label = new BitmapText({
    text: '',
    style: { fontFamily: INITIALS_FONT_NAME, fill: TEXT_COLOR },
  });
  label.anchor.set(0.5);
  const parts = {
    shape: new Graphics(),
    disc: new Graphics(),
    art: new PixiTokenArt(),
    cross: new Graphics(),
    look: new PixiTokenLook(),
    face: new Container(),
    marks: new PixiConditionMarks(textures),
    nameTag: new PixiNameTag(),
    overlay: new Container(),
  };
  parts.face.addChild(parts.disc, parts.art.container, label);
  root.addChild(parts.face, parts.shape, parts.look.container, parts.cross);
  parts.overlay.addChild(parts.marks.container, parts.nameTag.container);
  root.position.set(at.x, at.y);
  parts.overlay.position.set(at.x, at.y);
  const glide = { from: at, to: at, startedMs: nowMs, glideMs: MOVE_GLIDE_MS, stripHeight: 0 };
  return { root, label, ...parts, view, ...glide };
}

const MOVE_GLIDE_MS = 150;

// The token's size in world px and the radii of its disc (an ellipse once it is stretched).
type TokenShape = Readonly<{ width: number; height: number; rx: number; ry: number }>;

function shapeOf(view: TokenView): TokenShape {
  const { width, height } = tokenWorldRect(view);
  return { width, height, rx: width * ROUND_RADIUS_SHARE, ry: height * ROUND_RADIUS_SHARE };
}

// With its image loaded the token is the image (square: no disc; round: cropped with the side
// ring); until then, or when it fails, the initials disc. The facing mark only when the view asks.
/** Draws the body of the token (face, rings, bar, facing mark, cross and look) with `texture`
 *  as its image (`null`: the initials disc).
 *
 *  Example: `drawTokenBody(sprite, cache.textureOf(url))` */
export function drawTokenBody(sprite: TokenSprite, texture: Texture | null): void {
  const { disc, art, shape, label, view } = sprite;
  const box = shapeOf(view);
  if (view.silhouette) return drawSilhouette(sprite, box, texture);
  const center = { x: box.width / 2, y: box.height / 2 };
  const image = texture && view.art;
  const square = Boolean(image && view.art?.frame === 'square');
  disc.clear();
  if (!image) disc.ellipse(center.x, center.y, box.rx, box.ry).fill(DISC_COLOR);
  art.draw(view.art, texture, box, view.facing);
  art.shade(null);
  shape.clear();
  if (!square)
    shape
      .ellipse(center.x, center.y, box.rx, box.ry)
      .stroke({ width: 3, color: RING_COLOR[view.ring] });
  drawOutlines(shape, view, box, square);
  drawBar(shape, view, box);
  if (view.facingMark) drawFacingMark(shape, view.facing, box);
  label.visible = !image;
  label.text = view.initials;
  const fontSize = Math.round(Math.min(box.width, box.height) * 0.3);
  label.style.fontSize = fontSize;
  label.position.set(center.x, center.y);
  drawDefeated(sprite, box, square);
}

// The rings and the bar stay bright: they are about the table, not about the token's face. The
// face fades (and greys) by the defeat, the looks and being hidden together, so the cross still
// reads first.
function drawDefeated(sprite: TokenSprite, box: TokenShape, square = false): void {
  const { face, cross, view } = sprite;
  sprite.look.draw(face, tokenLookStyle(view), { ...box, square });
  cross.clear();
  if (!view.defeated) return;
  const { strokes, width } = defeatedCross(box);
  for (const [color, stroke] of [
    [BAR_OUTLINE_COLOR, width + DEFEATED_OUTLINE],
    [DEFEATED_COLOR, width],
  ] as const) {
    for (const [from, to] of strokes) cross.moveTo(from.x, from.y).lineTo(to.x, to.y);
    cross.stroke({ width: stroke, color, cap: 'round' });
  }
}

// In the penumbra: the image painted black (a cut-out PNG keeps its outline) or, without one
// loaded, a black shape of the footprint; nothing that tells who it is beyond the shape.
function drawSilhouette(sprite: TokenSprite, box: TokenShape, texture: Texture | null): void {
  const { disc, art, shape, label, view } = sprite;
  const image = texture && view.art;
  disc.clear();
  art.draw(view.art, texture, box, view.facing);
  art.shade(SILHOUETTE);
  shape.clear();
  label.visible = false;
  if (image) return drawDefeated(sprite, box);
  if (view.silhouette === 'square') disc.rect(0, 0, box.width, box.height);
  else disc.ellipse(box.width / 2, box.height / 2, box.rx, box.ry);
  disc.fill(SILHOUETTE);
  drawDefeated(sprite, box);
}

// The turn and selection rings follow the token's outline: a square image gets square ones.
function drawOutlines(shape: Graphics, view: TokenView, box: TokenShape, square: boolean): void {
  const outline = (gap: number, width: number): void => {
    if (square) shape.rect(-gap, -gap, box.width + gap * 2, box.height + gap * 2);
    else shape.ellipse(box.width / 2, box.height / 2, box.rx + gap, box.ry + gap);
    shape.stroke({ width, color: GOLD_COLOR });
  };
  if (view.onTurn) outline(9, 4);
  if (view.selected) outline(5, 2);
}

// A small triangle on the border pointing where the token looks; it stays when nothing turns.
function drawFacingMark(shape: Graphics, facing: number, box: TokenShape): void {
  const ahead = facingVector(facing);
  const side = { x: -ahead.y, y: ahead.x };
  const base = { x: box.width / 2 + ahead.x * box.rx, y: box.height / 2 + ahead.y * box.ry };
  const tip = {
    x: base.x + ahead.x * FACING_MARK_LENGTH,
    y: base.y + ahead.y * FACING_MARK_LENGTH,
  };
  shape
    .poly([
      tip.x,
      tip.y,
      base.x + side.x * FACING_MARK_HALF_WIDTH,
      base.y + side.y * FACING_MARK_HALF_WIDTH,
      base.x - side.x * FACING_MARK_HALF_WIDTH,
      base.y - side.y * FACING_MARK_HALF_WIDTH,
    ])
    .fill(GOLD_COLOR);
}

function drawBar(shape: Graphics, view: TokenView, box: TokenShape): void {
  if (!view.bar) return;
  const width = box.width * 0.8;
  const left = (box.width - width) / 2;
  const top = box.height - BAR_HEIGHT - 3;
  const tones: Readonly<Record<BarTone, number>> = {
    track: BAR_TRACK_COLOR,
    fill: barColorNumber(view.bar.color),
    negative: BAR_NEGATIVE_COLOR,
    over: BAR_OVER_COLOR,
    temp: BAR_TEMP_COLOR,
  };
  shape
    .roundRect(left - 1, top - 1, width + 2, BAR_HEIGHT + 2, BAR_HEIGHT / 2 + 1)
    .fill(BAR_OUTLINE_COLOR);
  for (const segment of barSegments(view.bar, width)) {
    const height = segment.tone === 'temp' ? BAR_TEMP_HEIGHT : BAR_HEIGHT;
    const radius = Math.min(height, segment.width) / 2;
    shape
      .roundRect(left + segment.left, top, segment.width, height, radius)
      .fill(tones[segment.tone]);
  }
}
