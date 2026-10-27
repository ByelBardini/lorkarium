import type { FillInstruction } from 'pixi.js';
import { Graphics, Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { AuraLook, AuraView } from '@/renderer/aura-view';
import { PixiTokenAura } from '@/renderer/pixi-token-aura';
import { AuraImagesFake, fakeAuraSource } from '../support/aura-decoding-fakes';
import { AuraEffectsFake } from '../support/aura-effect-fake';

function auraOf(look: AuraLook): AuraView {
  return { look, box: { x: -64, y: -64, width: 192, height: 192 }, corner: 64, alpha: 0.5 };
}

function fillColorsOf(aura: PixiTokenAura): number[] {
  const halo = aura.container.children.find((child) => child instanceof Graphics);
  const fills = (halo?.context.instructions ?? []).filter(
    (instruction): instruction is FillInstruction => instruction.action === 'fill',
  );
  return fills.map((fill) => fill.data.style.color);
}

describe('PixiTokenAura draws by kind', () => {
  it('a color aura is a soft halo of 4 rounded steps in its color', () => {
    const aura = new PixiTokenAura('lyra');

    aura.draw(auraOf({ kind: 'color', color: 0xb5654f }));

    expect(fillColorsOf(aura)).toEqual([0xb5654f, 0xb5654f, 0xb5654f, 0xb5654f]);
  });

  it('drawing a color after another clears the first', () => {
    const aura = new PixiTokenAura('lyra');
    aura.draw(auraOf({ kind: 'color', color: 0xb5654f }));

    aura.draw(auraOf({ kind: 'color', color: 0x7f9a7a }));

    expect(fillColorsOf(aura)).toEqual([0x7f9a7a, 0x7f9a7a, 0x7f9a7a, 0x7f9a7a]);
  });
});

describe('PixiTokenAura draws an image aura', () => {
  const RUNE = '/api/assets/rune';
  const runeAura = auraOf({ kind: 'image', url: RUNE, shape: 'square' });
  const roundRuneAura = auraOf({ kind: 'image', url: RUNE, shape: 'round' });

  function spriteOf(aura: PixiTokenAura): Sprite | undefined {
    return aura.container.children.find((child): child is Sprite => child instanceof Sprite);
  }

  it('while the image loads nothing is drawn: no halo, no sprite', () => {
    const aura = new PixiTokenAura('lyra', new AuraImagesFake());

    aura.draw(runeAura);

    expect(fillColorsOf(aura)).toEqual([]);
    expect(spriteOf(aura)?.visible ?? false).toBe(false);
  });

  it('a still image fits whole in the aura, centered, at its opacity', () => {
    const images = new AuraImagesFake();
    const rune = images.arrive(RUNE, fakeAuraSource('still', 1));
    const aura = new PixiTokenAura('lyra', images);

    aura.draw(runeAura);

    const sprite = spriteOf(aura);
    expect(sprite?.texture).toBe(rune.frames[0]?.texture);
    expect([sprite?.x, sprite?.y, sprite?.width, sprite?.height]).toEqual([-64, -16, 192, 96]);
    expect(sprite?.alpha).toBe(0.5);
    expect(aura.animated()).toBe(false);
  });

  it('a GIF animates: the tick picks the frame of its time and loops', () => {
    const images = new AuraImagesFake();
    const flames = images.arrive(RUNE, fakeAuraSource('animated', 2));
    const aura = new PixiTokenAura('lyra', images);
    aura.draw(runeAura);

    expect(aura.animated()).toBe(true);
    aura.tick(0.15);
    expect(spriteOf(aura)?.texture).toBe(flames.frames[1]?.texture);
    aura.tick(0.25);
    expect(spriteOf(aura)?.texture).toBe(flames.frames[0]?.texture);
  });

  it('a square image has no mask: its tips stay', () => {
    const images = new AuraImagesFake();
    images.arrive(RUNE, fakeAuraSource('still', 1));
    const aura = new PixiTokenAura('lyra', images);

    aura.draw(runeAura);

    expect(spriteOf(aura)?.mask ?? null).toBeNull();
  });

  it('a round image covers the circle around the token, cut by a circle mask', () => {
    const images = new AuraImagesFake();
    images.arrive(RUNE, fakeAuraSource('still', 1));
    const aura = new PixiTokenAura('lyra', images);

    aura.draw(roundRuneAura);

    const sprite = spriteOf(aura);
    expect([sprite?.x, sprite?.y, sprite?.width, sprite?.height]).toEqual([-160, -64, 384, 192]);
    const mask = sprite?.mask;
    expect(mask).toBeInstanceOf(Graphics);
    expect((mask as Graphics).getLocalBounds()).toMatchObject({ x: -64, y: -64, width: 192 });
  });

  it('a round image made square again drops the mask', () => {
    const images = new AuraImagesFake();
    images.arrive(RUNE, fakeAuraSource('still', 1));
    const aura = new PixiTokenAura('lyra', images);
    aura.draw(roundRuneAura);

    aura.draw(runeAura);

    expect(spriteOf(aura)?.mask ?? null).toBeNull();
  });

  it('turning the image aura into a color hides the image and stops animating', () => {
    const images = new AuraImagesFake();
    images.arrive(RUNE, fakeAuraSource('animated', 2));
    const aura = new PixiTokenAura('lyra', images);
    aura.draw(runeAura);

    aura.draw(auraOf({ kind: 'color', color: 0xb5654f }));

    expect(spriteOf(aura)?.visible).toBe(false);
    expect(aura.animated()).toBe(false);
  });

  it('shows the url of its image, and only an image aura shows one', () => {
    const aura = new PixiTokenAura('lyra');
    aura.draw(runeAura);
    expect([aura.shows(RUNE), aura.shows('/api/assets/other')]).toEqual([true, false]);
    aura.draw(auraOf({ kind: 'color', color: 1 }));
    expect(aura.shows(RUNE)).toBe(false);
  });
});

describe('PixiTokenAura in the world', () => {
  it('its world box is the aura around where the token stands now', () => {
    const aura = new PixiTokenAura('lyra');
    aura.draw(auraOf({ kind: 'color', color: 1 }));

    aura.container.position.set(100, 200);

    expect(aura.worldBox()).toEqual({ x: 36, y: 136, width: 192, height: 192 });
  });
});

describe('PixiTokenAura draws an effect aura by its shader', () => {
  const fire = auraOf({ kind: 'effect', effect: 'fire', tint: null });

  function auraWithEffects() {
    const effects = new AuraEffectsFake();
    return { effects, aura: new PixiTokenAura('lyra', undefined, effects.create) };
  }

  it('an effect aura is one shader quad around the token corner, in the natural tone, and no halo', () => {
    const { effects, aura } = auraWithEffects();

    aura.draw(fire);

    const [effect] = effects.created;
    expect(effect?.effect).toBe('fire');
    expect(aura.container.children).toContain(effect?.display);
    expect(effect?.updates[0]).toMatchObject({
      center: { x: 32, y: 32 },
      halfBox: [32, 32],
      radius: 64,
      opacity: 0.5,
      color: 0xff7a2a,
    });
    expect(fillColorsOf(aura)).toEqual([]);
  });

  it('a palette tint colors the effect', () => {
    const { effects, aura } = auraWithEffects();

    aura.draw(auraOf({ kind: 'effect', effect: 'fire', tint: 0x8a9bb8 }));

    expect(effects.created[0]?.updates[0]?.color).toBe(0x8a9bb8);
  });

  it('a new radius updates the same effect in place', () => {
    const { effects, aura } = auraWithEffects();
    aura.draw(fire);

    aura.draw({ ...fire, box: { x: -128, y: -128, width: 320, height: 320 }, corner: 128 });

    expect(effects.created).toHaveLength(1);
    expect(effects.created[0]?.updates.map(({ radius }) => radius)).toEqual([64, 128]);
  });

  it('another effect destroys the first and creates its own', () => {
    const { effects, aura } = auraWithEffects();
    aura.draw(fire);

    aura.draw(auraOf({ kind: 'effect', effect: 'water', tint: null }));

    expect(effects.created.map(({ effect, destroyed }) => [effect, destroyed])).toEqual([
      ['fire', true],
      ['water', false],
    ]);
  });

  it('turning into a color destroys the effect and stops animating', () => {
    const { effects, aura } = auraWithEffects();
    aura.draw(fire);

    aura.draw(auraOf({ kind: 'color', color: 0xb5654f }));

    expect(effects.created[0]?.destroyed).toBe(true);
    expect(aura.animated()).toBe(false);
  });

  it('an effect animates: the tick goes to its shader clock', () => {
    const { effects, aura } = auraWithEffects();
    aura.draw(fire);

    aura.tick(1.5);

    expect(aura.animated()).toBe(true);
    expect(effects.created[0]?.ticks).toEqual([1.5]);
  });

  it('destroying the aura destroys its effect', () => {
    const { effects, aura } = auraWithEffects();
    aura.draw(fire);

    aura.destroy();

    expect(effects.created[0]?.destroyed).toBe(true);
  });
});
