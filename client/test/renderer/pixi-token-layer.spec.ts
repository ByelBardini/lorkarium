import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiTokenLayer, type TokenTextures } from '@/renderer/pixi-token-layer';
import type { TokenView } from '@/renderer/token-view';
import { AuraImagesFake, fakeAuraSource } from '../support/aura-decoding-fakes';
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
      index === 7
        ? { bar: { fraction: 0.6, state: 'normal', excess: 0, temp: 0, color: 'ember' } }
        : {},
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

const GOLD_AURA = {
  look: { kind: 'color', color: 0xc5a46d },
  box: { x: -128, y: -128, width: 320, height: 320 },
  corner: 128,
  alpha: 0.5,
} as const;

function auraOf(layer: PixiTokenLayer, id: string): Container | null {
  return layer.container.getChildByLabel(`aura:${id}`, true);
}

function tokenOf(layer: PixiTokenLayer, id: string): Container | null {
  return layer.container.getChildByLabel(`token:${id}`, true);
}

// Where a node is drawn: the child indices from the layer down to it; a lower path is drawn first.
function drawOrderOf(layer: PixiTokenLayer, node: Container | null): number[] {
  const path: number[] = [];
  for (let at = node; at && at !== layer.container; at = at.parent) {
    path.unshift(at.parent?.children.indexOf(at) ?? -1);
  }
  return path;
}

function drawnBefore(layer: PixiTokenLayer, first: Container | null, then: Container | null) {
  const a = drawOrderOf(layer, first);
  const b = drawOrderOf(layer, then);
  const at = a.findIndex((index, depth) => index !== b[depth]);
  return (a[at] ?? 0) < (b[at] ?? 0);
}

describe('PixiTokenLayer lays each aura on the floor of its layer', () => {
  const chest = goblinView({ id: 'chest', layer: 'objects', col: 9 });
  const first = goblinView({ id: 'first', col: 2 });
  const aurate = goblinView({ id: 'aurate', col: 4, aura: GOLD_AURA });

  it('the aura is under every token of its layer, even one listed before, and over the layer below', () => {
    const { layer } = layerWith();
    layer.sync([chest, first, aurate], [], 0);

    expect(drawnBefore(layer, tokenOf(layer, 'chest'), auraOf(layer, 'aurate'))).toBe(true);
    expect(drawnBefore(layer, auraOf(layer, 'aurate'), tokenOf(layer, 'first'))).toBe(true);
    expect(drawnBefore(layer, auraOf(layer, 'aurate'), tokenOf(layer, 'aurate'))).toBe(true);
  });

  it('moving the token to Objetos takes its aura to the floor of Objetos, under the chest', () => {
    const { layer } = layerWith();
    const background = goblinView({ id: 'map', layer: 'background', col: 7 });
    layer.sync([background, chest, aurate], [], 0);

    layer.sync([background, chest, { ...aurate, layer: 'objects' }], [], 16);

    expect(drawnBefore(layer, auraOf(layer, 'aurate'), tokenOf(layer, 'chest'))).toBe(true);
    expect(drawnBefore(layer, tokenOf(layer, 'map'), auraOf(layer, 'aurate'))).toBe(true);
  });

  it('the aura glides with its token, at the same place on every step', () => {
    const { layer } = layerWith();
    layer.sync([aurate], [], 0);
    layer.sync([{ ...aurate, col: 8 }], [], 16);

    layer.animate(16 + 75);

    const token = tokenOf(layer, 'aurate');
    expect(token?.x).toBeGreaterThan(4 * 64);
    expect(auraOf(layer, 'aurate')?.position).toMatchObject({ x: token?.x, y: token?.y });
  });

  it('the aura follows the token while it is dragged', () => {
    const { layer } = layerWith();
    layer.sync([aurate], [], 0);

    layer.drag('aurate', { x: 500, y: 300 });

    expect(auraOf(layer, 'aurate')?.position).toMatchObject({ x: 468, y: 268 });
  });

  it('losing the aura takes it off the floor', () => {
    const { layer } = layerWith();
    layer.sync([aurate], [], 0);

    layer.sync([{ ...aurate, aura: null }], [], 16);

    expect(auraOf(layer, 'aurate')).toBeNull();
  });

  it('the token leaving the board takes its aura along', () => {
    const { layer } = layerWith();
    layer.sync([aurate], [], 0);

    layer.sync([], [], 16);

    expect(auraOf(layer, 'aurate')).toBeNull();
  });

  it('300 auras, one changing its color, redraw that one aura and no token body', () => {
    const { layer, probe } = layerWith();
    layer.sync(
      horde(300, () => ({ aura: GOLD_AURA })),
      [],
      0,
    );
    probe.counts['token.redraw'] = 0;
    const redrawn = new Set<string>();
    for (let index = 0; index < 300; index += 1) {
      const id = `goblin-${index}`;
      for (const halo of graphicsIn(auraOf(layer, id))) {
        halo.context.on('update', () => redrawn.add(id));
      }
    }
    const moss = { ...GOLD_AURA, look: { kind: 'color', color: 0x7f9a7a } } as const;

    layer.sync(
      horde(300, (index) => ({ aura: index === 7 ? moss : GOLD_AURA })),
      [],
      16,
    );

    expect([...redrawn]).toEqual(['goblin-7']);
    expect(probe.counts['token.redraw']).toBe(0);
  });
});

function graphicsIn(node: Container | null): Graphics[] {
  if (!node) return [];
  if (node instanceof Graphics) return [node];
  return node.children.flatMap((child) => graphicsIn(child as Container));
}

describe('PixiTokenLayer draws the aura images that arrive', () => {
  it('the image of an aura arriving draws it on the tokens that show it, and no body', () => {
    const probe = new PerfProbeFake();
    const images = new AuraImagesFake();
    const layer = new PixiTokenLayer(() => false, undefined, new LoadingTextures(), probe, images);
    const rune = {
      ...GOLD_AURA,
      look: { kind: 'image', url: '/api/assets/rune', shape: 'square' },
    } as const;
    layer.sync(
      horde(4, (index) => ({ aura: index < 2 ? rune : GOLD_AURA })),
      [],
      0,
    );
    probe.counts['token.redraw'] = 0;
    images.arrive('/api/assets/rune', fakeAuraSource('animated', 2));

    layer.refreshAura('/api/assets/rune');

    const shown = horde(4).map(({ id }) =>
      (auraOf(layer, id)?.children ?? []).some((child) => child instanceof Sprite && child.visible),
    );
    expect(shown).toEqual([true, true, false, false]);
    expect(layer.animatedAuras().size).toBe(2);
    expect(probe.counts['token.redraw']).toBe(0);
  });
});
