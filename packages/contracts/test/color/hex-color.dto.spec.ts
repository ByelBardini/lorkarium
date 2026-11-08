import { describe, expect, it } from 'vitest';
import { hexColorDto, isHexColor, paletteOrHexDto } from '../../src/color/hex-color.dto';

describe('hexColorDto', () => {
  it('lowercases an uppercase color', () => {
    expect(hexColorDto.parse('#FFAA00')).toBe('#ffaa00');
  });

  it('trims the spaces around a color', () => {
    expect(hexColorDto.parse(' #abcdef ')).toBe('#abcdef');
  });

  it.each(['#fff', 'ffaa00', '#ffaa00;x', 'url(x)', 'red'])('refuses %s', (typed) => {
    expect(hexColorDto.safeParse(typed).success).toBe(false);
  });

  it('names the received value and the expected shape when refusing', () => {
    const refused = hexColorDto.safeParse('url(x)');
    expect(refused.error?.issues[0]?.message).toBe('url(x): expected #rrggbb');
  });
});

describe('paletteOrHexDto', () => {
  const toneDto = paletteOrHexDto(['gold', 'steel']);

  it('keeps a palette name as it is', () => {
    expect(toneDto.parse('gold')).toBe('gold');
  });

  it('normalizes a custom color', () => {
    expect(toneDto.parse('#ABCDEF')).toBe('#abcdef');
  });

  it.each(['red', '#fff', 'url(x)', ''])('refuses %s, in neither the palette nor hex', (typed) => {
    expect(toneDto.safeParse(typed).success).toBe(false);
  });
});

describe('isHexColor', () => {
  it('recognizes a normalized color', () => {
    expect(isHexColor('#aabbcc')).toBe(true);
  });

  it.each(['gold', '#AABBCC', '#abc', ' #aabbcc'])(
    'rejects %s, which is not normalized',
    (text) => {
      expect(isHexColor(text)).toBe(false);
    },
  );
});
