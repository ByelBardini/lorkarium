import { describe, expect, it } from 'vitest';
import { MEMBER_COLORS } from '@lorkarium/game-core';
import { APP_DICE_LOOK } from '@/features/dice/app-dice-renderer';

describe('APP_DICE_LOOK', () => {
  it.each(MEMBER_COLORS)('the profile color %s has the hex of the board palette', (color) => {
    const expected = {
      gold: 0xe0b25c,
      steel: 0x6fa8dc,
      ember: 0xe0704f,
      moss: 0x8cc084,
      violet: 0xb39ddb,
      rose: 0xe58fb4,
      teal: 0x5cc8c0,
      bone: 0xf0e6d2,
    }[color];

    expect(APP_DICE_LOOK.colorHex[color]).toBe(expected);
  });

  it('numbers without texture take the dark or white that reads best on the profile color', () => {
    const onGold = { color: 'gold', textureId: null, numberColor: '#ff0000' } as const;

    expect(APP_DICE_LOOK.numberColorOf(onGold)).toBe('#1a1a1a');
  });

  it('a texture is fetched from the API of the same origin', () => {
    expect(APP_DICE_LOOK.textureUrlOf('3f2a')).toBe('/api/dice-textures/3f2a');
  });
});
