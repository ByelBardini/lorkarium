import { Container, Graphics, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiTokenLayer, type TokenTextures } from '@/renderer/pixi-token-layer';
import type { TokenView } from '@/renderer/token-view';
import { PerfProbeFake } from '../support/perf-probe-fake';
import { TokenTexturesFake } from '../support/token-textures-fake';
import { goblinView } from '../support/token-view-fixtures';

const ART_X = { url: '/api/assets/x', frame: 'square', flipX: false, flipY: false } as const;
const BLINDED_X = {
  icon: 'eye-off',
  tone: 'harm',
  color: null,
  remainingRounds: null,
  stacks: null,
  imageUrl: '/api/assets/blinded',
} as const;

/** Every texture is still loading: the tokens keep their initials disc. */
class LoadingTextures implements TokenTextures {
  textureOf(): Texture | null {
    return null;
  }
}

function horde(count: number, overrides: (index: number) => Partial<TokenView> = () => ({})) {
  return Array.from({ length: count }, (_, index) =>
    goblinView({
      id: `goblin-${index}`,
      col: index % 20,
      row: Math.floor(index / 20),
      ...overrides(index),
    }),
  );
}

function layerWith(reducedMotion = false) {
  const probe = new PerfProbeFake();
  const layer = new PixiTokenLayer(() => reducedMotion, undefined, new LoadingTextures(), probe);
  return { layer, probe };
}

describe('PixiTokenLayer redraws only what changed', () => {
  it('300 tokens synced again with the same views redraw none', () => {
    const { layer, probe } = layerWith();
    layer.sync(horde(300), [], 0);
    probe.counts['token.redraw'] = 0;

    layer.sync(horde(300), [], 16);

    expect(probe.counts['token.redraw']).toBe(0);
  });

  it('one bar going down among 300 redraws that one token', () => {
    const { layer, probe } = layerWith();
    layer.sync(horde(300), [], 0);
    probe.counts['token.redraw'] = 0;
    const hurt = horde(300, (index) =>
      index === 7 ? { bar: { fraction: 0.6, state: 'normal', excess: 0, color: 'ember' } } : {},
    );

    layer.sync(hurt, [], 16);

    expect(probe.counts['token.redraw']).toBe(1);
  });

  it('the texture of X arriving redraws only the tokens that show X', () => {
    const { layer, probe } = layerWith();
    layer.sync(
      horde(10, (index) => (index < 3 ? { art: ART_X } : {})),
      [],
      0,
    );
    probe.counts['token.redraw'] = 0;

    layer.refreshArt(ART_X.url);

    expect(probe.counts['token.redraw']).toBe(3);
  });
});

describe('PixiTokenLayer draws the condition images that arrive', () => {
  function texturedBadges(container: Container, texture: Texture): number {
    return container.children.reduce((count, child) => {
      if (!(child instanceof Graphics)) return count + texturedBadges(child as Container, texture);
      const fills = child.context.instructions.filter(
        (instruction) => instruction.action === 'fill',
      );
      const textured = fills.some(
        (fill) => (fill.data as { style: { texture: Texture } }).style.texture === texture,
      );
      return count + (textured ? 1 : 0);
    }, 0);
  }

  it('the image of a condition arriving redraws the strips of the tokens that show it, and no body', () => {
    const probe = new PerfProbeFake();
    const textures = new TokenTexturesFake();
    const layer = new PixiTokenLayer(() => false, undefined, textures, probe);
    layer.sync(
      horde(10, (index) => (index < 3 ? { conditions: [BLINDED_X] } : {})),
      [],
      0,
    );
    probe.counts['token.redraw'] = 0;
    const square = textures.arrive(BLINDED_X.imageUrl);

    layer.refreshArt(BLINDED_X.imageUrl);

    expect(texturedBadges(layer.container, square)).toBe(3);
    expect(probe.counts['token.redraw']).toBe(0);
  });
});

describe('PixiTokenLayer glides only the moved tokens', () => {
  it('moving 1 of 300 redraws nothing and puts that one alone to glide', () => {
    const { layer, probe } = layerWith();
    layer.sync(horde(300), [], 0);
    probe.counts['token.redraw'] = 0;

    layer.sync(
      horde(300, (index) => (index === 0 ? { col: 5 } : {})),
      [],
      16,
    );

    expect(probe.counts['token.redraw']).toBe(0);
    expect(layer.glidingCount()).toBe(1);
  });

  it('150 ms after the move, nobody glides any more', () => {
    const { layer } = layerWith();
    layer.sync(horde(3), [], 0);
    layer.sync(
      horde(3, (index) => (index === 0 ? { col: 5 } : {})),
      [],
      16,
    );

    layer.animate(100);
    expect(layer.glidingCount()).toBe(1);
    layer.animate(16 + 150);

    expect(layer.glidingCount()).toBe(0);
  });

  it('the glide asks for a render on each step, its last included, and a still layer never does', () => {
    const { layer } = layerWith();
    layer.sync(horde(3), [], 0);
    expect(layer.animate(10)).toBe(false);
    layer.sync(
      horde(3, (index) => (index === 0 ? { col: 5 } : {})),
      [],
      16,
    );

    expect(layer.animate(100)).toBe(true);
    expect(layer.animate(16 + 150)).toBe(true);
    expect(layer.animate(16 + 300)).toBe(false);
  });

  it('with reduced motion the token jumps and never enters the glide', () => {
    const { layer } = layerWith(true);
    layer.sync(horde(3), [], 0);

    layer.sync(
      horde(3, (index) => (index === 0 ? { col: 5 } : {})),
      [],
      16,
    );

    expect(layer.glidingCount()).toBe(0);
  });
});
