import { describe, expect, it } from 'vitest';
import { fallbackCoverOf } from '@/lib/campaign-cover';

describe('fallbackCoverOf', () => {
  // 'ab' → 97 * 31 + 98 = 3105: 3105 % 3 = 0, 3105 % 4 = 1.
  it('id "ab" gives the drawn cover with drawing 0 and tone 2', () => {
    expect(fallbackCoverOf('ab')).toEqual({ kind: 'drawn', drawing: 0, tone: 2 });
  });

  // 'b' → 98: 98 % 3 = 2, 98 % 4 = 2.
  it('id "b" gives the drawn cover with drawing 2 and tone 3', () => {
    expect(fallbackCoverOf('b')).toEqual({ kind: 'drawn', drawing: 2, tone: 3 });
  });
});
