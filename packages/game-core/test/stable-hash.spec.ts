import { describe, expect, it } from 'vitest';
import { stableHash } from '../src/stable-hash';

describe('stableHash', () => {
  // 'ab' → 97 * 31 + 98 = 3105.
  it('"ab" hashes to 3105', () => {
    expect(stableHash('ab')).toBe(3105);
  });

  it('an empty text hashes to 0', () => {
    expect(stableHash('')).toBe(0);
  });

  it('a long id stays an unsigned 32-bit integer', () => {
    expect(stableHash('7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01')).toBe(2853121278);
  });
});
