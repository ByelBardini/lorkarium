import { describe, expect, it } from 'vitest';
import { coverFor } from '@/lib/campaign-cover';

describe('coverFor', () => {
  // 'ab' → 97 * 31 + 98 = 3105: 3105 % 3 = 0, 3105 % 4 = 1.
  it('id "ab" gives variant 0 and tone 2', () => {
    expect(coverFor('ab')).toEqual({ variant: 0, tone: 2 });
  });

  // 'b' → 98: 98 % 3 = 2, 98 % 4 = 2.
  it('id "b" gives variant 2 and tone 3', () => {
    expect(coverFor('b')).toEqual({ variant: 2, tone: 3 });
  });

  it.each(['', 'x', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', '9c2f4e61-7a3b'])(
    'id "%s" gives a variant in 0..2 and a tone in 1..4',
    (id) => {
      const { variant, tone } = coverFor(id);
      expect([0, 1, 2]).toContain(variant);
      expect([1, 2, 3, 4]).toContain(tone);
    },
  );
});
