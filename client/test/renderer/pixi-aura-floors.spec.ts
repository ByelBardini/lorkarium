import { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { PixiAuraFloors } from '@/renderer/pixi-aura-floors';
import { AuraImagesFake, fakeAuraSource } from '../support/aura-decoding-fakes';
import { AuraEffectsFake } from '../support/aura-effect-fake';
import { goblinView } from '../support/token-view-fixtures';

const GOLD_AURA = {
  look: { kind: 'color', color: 0xc5a46d },
  box: { x: -64, y: -64, width: 192, height: 192 },
  corner: 64,
  alpha: 0.5,
} as const;

describe('PixiAuraFloors', () => {
  it('a token getting an aura puts it on the floor of its layer, at the token corner', () => {
    const floors = new PixiAuraFloors();

    floors.draw(goblinView({ layer: 'objects', aura: GOLD_AURA }), { x: 128, y: 64 });

    const [aura] = floors.floors.objects.children;
    expect(aura?.label).toBe('aura:goblin');
    expect(aura?.position).toMatchObject({ x: 128, y: 64 });
    expect(floors.floors.tokens.children).toEqual([]);
  });

  it('drawing the same token again keeps one aura, where it was', () => {
    const floors = new PixiAuraFloors();
    floors.draw(goblinView({ aura: GOLD_AURA }), { x: 0, y: 0 });
    floors.move('goblin', 320, 0);

    floors.draw(goblinView({ aura: { ...GOLD_AURA, alpha: 1 } }), { x: 0, y: 0 });

    expect(floors.floors.tokens.children).toHaveLength(1);
    expect(floors.floors.tokens.children[0]?.x).toBe(320);
  });

  it('a new layer moves the aura to that floor', () => {
    const floors = new PixiAuraFloors();
    floors.draw(goblinView({ aura: GOLD_AURA }), { x: 0, y: 0 });

    floors.changeLayer('goblin', 'background');

    expect(floors.floors.tokens.children).toEqual([]);
    expect(floors.floors.background.children[0]?.label).toBe('aura:goblin');
  });

  it('a token losing its aura takes it off the floor', () => {
    const floors = new PixiAuraFloors();
    floors.draw(goblinView({ aura: GOLD_AURA }), { x: 0, y: 0 });

    floors.draw(goblinView({ aura: null }), { x: 0, y: 0 });

    expect(floors.floors.tokens.children).toEqual([]);
  });
});

describe('PixiAuraFloors with image auras', () => {
  const RUNE = '/api/assets/rune';
  const runeAura = { ...GOLD_AURA, look: { kind: 'image', url: RUNE } } as const;

  function imageShown(floors: PixiAuraFloors, id: string): boolean {
    const aura = floors.floors.tokens.getChildByLabel(`aura:${id}`);
    return aura?.children.some((child) => child instanceof Sprite && child.visible) ?? false;
  }

  it('an image that arrives is drawn only on the auras that show it', () => {
    const images = new AuraImagesFake();
    const floors = new PixiAuraFloors(images);
    floors.draw(goblinView({ id: 'a', aura: runeAura }), { x: 0, y: 0 });
    floors.draw(goblinView({ id: 'b', aura: GOLD_AURA }), { x: 0, y: 0 });
    images.arrive(RUNE, fakeAuraSource('still', 1));

    floors.refresh(RUNE);

    expect([imageShown(floors, 'a'), imageShown(floors, 'b')]).toEqual([true, false]);
  });

  it('a GIF that arrives puts its aura among the animated ones; a still image does not', () => {
    const images = new AuraImagesFake();
    const floors = new PixiAuraFloors(images);
    const still = { ...GOLD_AURA, look: { kind: 'image', url: '/api/assets/still' } } as const;
    floors.draw(goblinView({ id: 'a', aura: runeAura }), { x: 0, y: 0 });
    floors.draw(goblinView({ id: 'b', aura: still }), { x: 0, y: 0 });
    images.arrive(RUNE, fakeAuraSource('animated', 2));
    images.arrive('/api/assets/still', fakeAuraSource('still', 1));

    floors.refresh(RUNE);
    floors.refresh('/api/assets/still');

    expect([...floors.animated()].map(({ container }) => container.label)).toEqual(['aura:a']);
  });

  it('an animated aura that loses its aura, or its token, leaves the animated ones', () => {
    const images = new AuraImagesFake();
    images.arrive(RUNE, fakeAuraSource('animated', 2));
    const floors = new PixiAuraFloors(images);
    floors.draw(goblinView({ id: 'a', aura: runeAura }), { x: 0, y: 0 });
    floors.draw(goblinView({ id: 'b', aura: runeAura }), { x: 0, y: 0 });

    floors.draw(goblinView({ id: 'a', aura: GOLD_AURA }), { x: 0, y: 0 });
    floors.remove('b');

    expect(floors.animated().size).toBe(0);
  });
});

describe('PixiAuraFloors with effect auras', () => {
  it('an effect aura is among the animated ones at once, and leaves them as a color', () => {
    const effects = new AuraEffectsFake();
    const floors = new PixiAuraFloors(undefined, effects.create);
    const fire = { ...GOLD_AURA, look: { kind: 'effect', effect: 'fire', tint: null } } as const;
    floors.draw(goblinView({ aura: fire }), { x: 0, y: 0 });

    expect(floors.animated().size).toBe(1);
    floors.draw(goblinView({ aura: GOLD_AURA }), { x: 0, y: 0 });
    expect(floors.animated().size).toBe(0);
    expect(effects.created[0]?.destroyed).toBe(true);
  });
});
