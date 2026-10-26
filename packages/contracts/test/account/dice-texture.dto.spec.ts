import { describe, expect, it } from 'vitest';
import { diceNumberColorDto } from '../../src/account/dice-texture.dto';

describe('diceNumberColorDto', () => {
  it('a color in capitals with spaces around is kept trimmed and in lowercase', () => {
    expect(diceNumberColorDto.parse(' #FFAA00 ')).toBe('#ffaa00');
  });

  it.each(['#fff', 'red', 'ffaa00', '#ffaa0g', '#ffaa001'])(
    '%s is refused citing the value and "expected #rrggbb"',
    (color) => {
      const result = diceNumberColorDto.safeParse(color);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(`${color.toLowerCase()}: expected #rrggbb`);
    },
  );
});
