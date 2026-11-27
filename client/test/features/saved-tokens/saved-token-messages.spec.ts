import { describe, expect, it } from 'vitest';
import { savedTokenDetail } from '@/features/saved-tokens/saved-token-messages';

const PV = { label: 'PV', current: 12, max: 12 };

describe('savedTokenDetail', () => {
  it('a 1×1 zombie with PV 12/12 reads its size and its first bar', () => {
    expect(savedTokenDetail({ width: 1, height: 1, bars: [PV] })).toBe('1×1 · PV 12/12');
  });

  it('a half-cell side reads with a comma, and only the first bar shows', () => {
    const mana = { label: 'Mana', current: 3, max: 5 };

    expect(savedTokenDetail({ width: 1.5, height: 2, bars: [PV, mana] })).toBe('1,5×2 · PV 12/12');
  });

  it('a token without bars reads its size alone', () => {
    expect(savedTokenDetail({ width: 3, height: 3, bars: [] })).toBe('3×3');
  });
});
