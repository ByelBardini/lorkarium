import { describe, expect, it } from 'vitest';
import {
  SAVED_COLORS_LIMIT_CODE,
  SAVED_COLORS_MAX,
  saveColorRequestDto,
  savedColorParamsDto,
  savedColorsResponseDto,
} from '../../src/account/saved-colors.dto';

describe('savedColorParamsDto', () => {
  it('turns the hex of the URL, which has no #, into the stored color', () => {
    expect(savedColorParamsDto.parse({ color: 'aabbcc' })).toEqual({ color: '#aabbcc' });
  });

  it('keeps the color in lowercase whatever the case of the URL', () => {
    expect(savedColorParamsDto.parse({ color: 'AABBCC' })).toEqual({ color: '#aabbcc' });
  });

  it.each(['#aabbcc', 'xyz123', 'abc', 'aabbccdd', ''])('refuses %j as the color', (color) => {
    expect(savedColorParamsDto.safeParse({ color }).success).toBe(false);
  });

  it('cites the received value and the expected shape when it refuses', () => {
    const refused = savedColorParamsDto.safeParse({ color: 'xyz123' });

    expect(refused.error?.issues[0]?.message).toContain('xyz123');
    expect(refused.error?.issues[0]?.message).toContain('rrggbb');
  });
});

describe('saveColorRequestDto', () => {
  it('normalizes the color to save', () => {
    expect(saveColorRequestDto.parse({ color: '#FFAA00' })).toEqual({ color: '#ffaa00' });
  });

  it.each(['#fff', 'url(x)', 'gold'])('refuses %j as the color', (color) => {
    expect(saveColorRequestDto.safeParse({ color }).success).toBe(false);
  });

  it('refuses a field beyond the color, so a forged owner never gets through', () => {
    const forged = { color: '#ffaa00', userId: '7f0c1f7a-2b1e-4c8e-9a51-0d5e6f7a8b9c' };

    expect(saveColorRequestDto.safeParse(forged).success).toBe(false);
  });
});

describe('savedColorsResponseDto', () => {
  it('accepts the list of normalized colors', () => {
    expect(savedColorsResponseDto.parse({ colors: ['#aabbcc'] })).toEqual({ colors: ['#aabbcc'] });
  });

  it('refuses a list longer than the limit of the account', () => {
    const tooMany = Array.from({ length: SAVED_COLORS_MAX + 1 }, () => '#aabbcc');

    expect(savedColorsResponseDto.safeParse({ colors: tooMany }).success).toBe(false);
  });
});

describe('the limit of the saved colors', () => {
  it('fits four rows of six and has its own error code', () => {
    expect(SAVED_COLORS_MAX).toBe(24);
    expect(SAVED_COLORS_LIMIT_CODE).toBe('SAVED_COLORS_LIMIT');
  });
});
