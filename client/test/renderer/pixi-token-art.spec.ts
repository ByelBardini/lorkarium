import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
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
