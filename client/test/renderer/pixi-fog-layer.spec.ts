import type { Container, RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { FogView } from '@/renderer/fog-view';
import { PixiFogLayer, type FogRenderer } from '@/renderer/pixi-fog-layer';

type Bake = Readonly<{ container: Container; target: RenderTexture }>;

/** The GPU without WebGL: keeps every bake (`render` into a texture) the fog asks for. */
class FogRendererFake implements FogRenderer {
  readonly bakes: Bake[] = [];

  render({ container, target }: Parameters<FogRenderer['render']>[0]): void {
    this.bakes.push({ container, target });
  }
}

const SQUARE = [
  { x: 64, y: 64 },
  { x: 192, y: 64 },
  { x: 192, y: 192 },
];

function fogOf(key: string, size = 640): FogView {
  return {
    width: size,
    height: size,
    dim: [SQUARE],
    bright: [SQUARE],
    holes: [],
    lit: { bright: [], dim: [] },
    sightLines: [],
    blockerHoles: { bright: [], dim: [] },
    key,
  };
}

function masksUnder(node: Container): number {
  const own = node.mask || (node.effects?.length ?? 0) > 0 ? 1 : 0;
  return node.children.reduce((count, child) => count + masksUnder(child), own);
}

describe('PixiFogLayer bakes the fog once per key', () => {
  it('30 renders with the same key (an animated aura) bake the two sheets once', () => {
    const fog = new PixiFogLayer();
    const renderer = new FogRendererFake();

    for (let frame = 0; frame < 30; frame += 1) fog.sync(fogOf('eye at 3,4'), renderer);

    expect(renderer.bakes).toHaveLength(2);
  });

  it('what shows on the board carries no mask: two plain sprites of the baked sheets', () => {
    const fog = new PixiFogLayer();
    const renderer = new FogRendererFake();

    fog.sync(fogOf('eye at 3,4'), renderer);

    expect(masksUnder(fog.container)).toBe(0);
    const shown = fog.container.children.map((sprite) => (sprite as { texture?: unknown }).texture);
    expect(shown).toEqual(renderer.bakes.map(({ target }) => target));
  });

  it('a new key (the eye walks) bakes the two sheets again', () => {
    const fog = new PixiFogLayer();
    const renderer = new FogRendererFake();
    fog.sync(fogOf('eye at 3,4'), renderer);

    fog.sync(fogOf('eye at 4,4'), renderer);

    expect(renderer.bakes).toHaveLength(4);
  });

  it('the openings are erased out of each sheet', () => {
    const fog = new PixiFogLayer();
    const renderer = new FogRendererFake();

    fog.sync(fogOf('eye at 3,4'), renderer);

    const erased = renderer.bakes.map(({ container }) => container.children[1]?.blendMode);
    expect(erased).toEqual(['erase', 'erase']);
  });

  it('the penumbra sheet is at 55% and the dark one, over it, opaque', () => {
    const fog = new PixiFogLayer();
    const renderer = new FogRendererFake();

    fog.sync(fogOf('eye at 3,4'), renderer);

    const alphas = renderer.bakes.map(({ container }) => {
      const sheet = container.children[0] as Container & {
        context: { instructions: { data: { style: { alpha: number } } }[] };
      };
      return sheet.context.instructions[0]?.data.style.alpha;
    });
    expect(alphas).toEqual([0.55, 1]);
  });

  it('a scene of 6400 px bakes into a texture of at most 2048 px a side', () => {
    const fog = new PixiFogLayer();
    const renderer = new FogRendererFake();

    fog.sync(fogOf('big scene', 6400), renderer);

    const sides = renderer.bakes.map(({ target }) => target.source.pixelWidth);
    expect(sides).toEqual([2048, 2048]);
  });

  it('without fog nothing is baked and the layer hides', () => {
    const fog = new PixiFogLayer();
    const renderer = new FogRendererFake();

    fog.sync(null, renderer);

    expect(renderer.bakes).toEqual([]);
    expect(fog.container.visible).toBe(false);
  });
});
