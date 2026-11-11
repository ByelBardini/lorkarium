import {
  Container,
  generateTextureMatrix,
  Graphics,
  Matrix,
  Point,
  Sprite,
  Texture,
  TextureSource,
  type FillStyle,
  type GraphicsPath,
} from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiTokenArt } from '@/renderer/pixi-token-art';

const TOKEN_64 = { width: 64, height: 64 };
const ROUND = { url: '/api/assets/a', frame: 'round', flipX: false, flipY: false } as const;
const SQUARE = { ...ROUND, frame: 'square' } as const;

function portrait(): Texture {
  return new Texture({ source: new TextureSource({ width: 400, height: 600 }) });
}

function masksUnder(node: Container): number {
  const own = node.mask ? 1 : 0;
  return node.children.reduce((count, child) => count + masksUnder(child), own);
}

type TextureFill = { style: { texture: Texture; matrix?: { a: number; d: number } } };

function textureFillsOf(node: Container): TextureFill[] {
  const own =
    node instanceof Graphics
      ? node.context.instructions
          .filter((instruction) => instruction.action === 'fill')
          .map((instruction) => instruction.data as TextureFill)
      : [];
  return node.children.reduce((fills, child) => [...fills, ...textureFillsOf(child)], own);
}

type FillInstruction = { style: FillStyle; path: GraphicsPath };

// The texture coordinates Pixi gives the corners and the center of the round frame's bounds,
// through its own fill matrix: 0..1 is the image once; outside it the `repeat` tiles it (#83).
function roundFillUvs(art: PixiTokenArt, texture: Texture): { center: Point; corners: Point[] } {
  const round = art.container.children.find((child) => child instanceof Graphics);
  const fill = round?.context.instructions.find((step) => step.action === 'fill');
  const { style, path } = fill?.data as FillInstruction;
  expect(style.texture).toBe(texture);
  const shape = path.shapePath.shapePrimitives[0]?.shape;
  if (!shape) throw new Error(`expected one shape in the round fill, got ${String(shape)}`);
  const uv = generateTextureMatrix(new Matrix(), style, shape);
  const box = shape.getBounds();
  const at = (x: number, y: number): Point => uv.apply(new Point(x, y));
  return {
    center: at(box.x + box.width / 2, box.y + box.height / 2),
    corners: [
      at(box.left, box.top),
      at(box.right, box.top),
      at(box.left, box.bottom),
      at(box.right, box.bottom),
    ],
  };
}

describe('PixiTokenArt crops the round frame without a mask', () => {
  it('a round image leaves no mask anywhere in its graph', () => {
    const art = new PixiTokenArt();

    art.draw(ROUND, portrait(), TOKEN_64, 0);

    expect(masksUnder(art.container)).toBe(0);
  });

  it('a round image is an ellipse filled with its texture', () => {
    const art = new PixiTokenArt();
    const texture = portrait();

    art.draw(ROUND, texture, TOKEN_64, 0);

    const fills = textureFillsOf(art.container).filter((fill) => fill.style.texture === texture);
    expect(fills).toHaveLength(1);
  });

  it('the round fill covers the token: a 400 × 600 image scales by 0.16 on both axes', () => {
    const art = new PixiTokenArt();
    const texture = portrait();

    art.draw(ROUND, texture, TOKEN_64, 0);

    const [fill] = textureFillsOf(art.container).filter((f) => f.style.texture === texture);
    expect(fill?.style.matrix?.a).toBeCloseTo(0.16, 5);
    expect(fill?.style.matrix?.d).toBeCloseTo(0.16, 5);
  });

  it.each([
    ['upright', ROUND],
    ['flipped on both axes', { ...ROUND, flipX: true, flipY: true }],
  ])('the round fill (%s) samples the image once, its center at the ellipse center', (_, frame) => {
    const art = new PixiTokenArt();
    const texture = portrait();

    art.draw(frame, texture, TOKEN_64, 0);

    const uvs = roundFillUvs(art, texture);
    expect(uvs.center.x).toBeCloseTo(0.5, 5);
    expect(uvs.center.y).toBeCloseTo(0.5, 5);
    for (const corner of uvs.corners) {
      expect(corner.x).toBeGreaterThanOrEqual(-1e-9);
      expect(corner.x).toBeLessThanOrEqual(1 + 1e-9);
      expect(corner.y).toBeGreaterThanOrEqual(-1e-9);
      expect(corner.y).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('a round image flipped on x mirrors its fill', () => {
    const art = new PixiTokenArt();
    const texture = portrait();

    art.draw({ ...ROUND, flipX: true }, texture, TOKEN_64, 0);

    const [fill] = textureFillsOf(art.container).filter((f) => f.style.texture === texture);
    expect(fill?.style.matrix?.a).toBeCloseTo(-0.16, 5);
    expect(fill?.style.matrix?.d).toBeCloseTo(0.16, 5);
  });

  it('facing 90 turns the art a quarter, around the token center', () => {
    const art = new PixiTokenArt();

    art.draw(ROUND, portrait(), TOKEN_64, 90);

    expect(art.container.rotation).toBeCloseTo(Math.PI / 2, 5);
    expect(art.container.position).toMatchObject({ x: 32, y: 32 });
  });

  it('a square image is the sprite fitted whole, flipped on y, with no texture fill', () => {
    const art = new PixiTokenArt();
    const texture = portrait();

    art.draw({ ...SQUARE, flipY: true }, texture, TOKEN_64, 0);

    const sprite = art.container.children.find((child) => child instanceof Sprite);
    expect(sprite?.visible).toBe(true);
    expect(sprite?.scale.x).toBeCloseTo(42.6667 / 400, 4);
    expect(sprite?.scale.y).toBeCloseTo(-64 / 600, 4);
    expect(textureFillsOf(art.container).some((f) => f.style.texture === texture)).toBe(false);
  });

  it('without a texture yet the art hides itself', () => {
    const art = new PixiTokenArt();

    art.draw(ROUND, null, TOKEN_64, 0);

    expect(art.container.visible).toBe(false);
  });
});
