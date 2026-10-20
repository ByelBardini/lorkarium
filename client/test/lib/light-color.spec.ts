import { LIGHT_COLORS } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { LIGHT_COLOR_TONES, lightColorHex } from '@/lib/light-color';

describe('light color', () => {
  it('a fire light tints with 0xff6a2b', () => {
    expect(lightColorHex('fire')).toBe(0xff6a2b);
  });

  it('a neutral light has no tint', () => {
    expect(lightColorHex(null)).toBeNull();
  });

  // Written by hand: a color added to the contract without a tone here breaks this test.
  it('every color of the contract has its pt-BR name and tone, in the palette order', () => {
    expect(LIGHT_COLOR_TONES.map(({ color, label, hex }) => [color, label, hex])).toEqual([
      ['torch', 'Tocha', '#ff9f43'],
      ['candle', 'Vela', '#ffd27a'],
      ['fire', 'Fogo', '#ff6a2b'],
      ['moon', 'Lua', '#9ec3ff'],
      ['arcane', 'Arcana', '#8b7bff'],
      ['necrotic', 'Necrótica', '#7fd66b'],
      ['infernal', 'Infernal', '#ff3b3b'],
    ]);
    expect(LIGHT_COLOR_TONES.map(({ color }) => color)).toEqual([...LIGHT_COLORS]);
  });
});
