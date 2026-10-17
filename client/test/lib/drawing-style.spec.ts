import { describe, expect, it } from 'vitest';
import { DRAWING_COLORS, drawingColorValue, strokeWorldPx } from '@/lib/drawing-style';

describe('drawingColorValue', () => {
  it.each([
    ['gold', 0xc5a46d],
    ['ember', 0xb5654f],
    ['bone', 0xeae5da],
  ] as const)('%s is the canvas number of its hex', (color, value) => {
    expect(drawingColorValue(color)).toBe(value);
  });

  it('the palette has the eight colors of the contract, each named in pt-BR', () => {
    expect(DRAWING_COLORS.map(({ color, label }) => [color, label])).toEqual([
      ['gold', 'Ouro'],
      ['steel', 'Aço'],
      ['ember', 'Brasa'],
      ['moss', 'Musgo'],
      ['ash', 'Cinza'],
      ['ink', 'Tinta'],
      ['bone', 'Osso'],
      ['violet', 'Violeta'],
    ]);
  });
});

describe('strokeWorldPx', () => {
  it.each([
    ['thin', 2],
    ['medium', 4],
    ['thick', 8],
  ] as const)('a %s line is %s world px wide', (width, px) => {
    expect(strokeWorldPx(width)).toBe(px);
  });
});
