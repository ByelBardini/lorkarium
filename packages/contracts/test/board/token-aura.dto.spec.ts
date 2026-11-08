import { describe, expect, it } from 'vitest';
import { tokenAuraDto } from '../../src/board/token-aura.dto';

const TINT = { kind: 'color', radius: 2, color: 'gold', opacity: 50 } as const;
const FIRE = { kind: 'effect', radius: 2, effect: 'fire', color: null, opacity: 100 } as const;

describe('tokenAuraDto colors', () => {
  it('a tint in a custom color is accepted and kept in lowercase', () => {
    expect(tokenAuraDto.parse({ ...TINT, color: '#FF0000' })).toMatchObject({ color: '#ff0000' });
  });

  it('an effect in a custom color is accepted', () => {
    expect(tokenAuraDto.parse({ ...FIRE, color: '#336699' })).toMatchObject({ color: '#336699' });
  });

  it('an effect keeps its natural tone with a null color', () => {
    expect(tokenAuraDto.parse(FIRE)).toMatchObject({ color: null });
  });

  it('a tint without a color is refused', () => {
    expect(tokenAuraDto.safeParse({ ...TINT, color: null }).success).toBe(false);
  });

  it.each(['red', '#f00', 'url(x)'])('%s as the color of a tint is refused', (color) => {
    expect(tokenAuraDto.safeParse({ ...TINT, color }).success).toBe(false);
  });

  it.each(['red', '#f00', 'url(x)'])('%s as the color of an effect is refused', (color) => {
    expect(tokenAuraDto.safeParse({ ...FIRE, color }).success).toBe(false);
  });
});
