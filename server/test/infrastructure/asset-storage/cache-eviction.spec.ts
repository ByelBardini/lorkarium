import { describe, expect, it } from 'vitest';
import {
  type CachedEntry,
  evictionFor,
} from '../../../src/infrastructure/asset-storage/cache-eviction';

const entry = (key: string, size: number, lastUsedAt: number): CachedEntry => ({
  key,
  size,
  lastUsedAt,
});

const FULL = [entry('a', 100, 1), entry('b', 100, 3), entry('c', 100, 2)];

describe('evictionFor', () => {
  it('evicts the least recently used entry to make room for the new object', () => {
    expect(evictionFor(FULL, 300, 100)).toStrictEqual({ kind: 'fits', evict: ['a'] });
  });

  it('evicts nothing when the total plus the new object lands exactly on the ceiling', () => {
    expect(evictionFor(FULL, 400, 100)).toStrictEqual({ kind: 'fits', evict: [] });
  });

  it('evicts in order of use until the new object fits', () => {
    expect(evictionFor(FULL, 300, 200)).toStrictEqual({ kind: 'fits', evict: ['a', 'c'] });
  });

  it('breaks a tie of use by the key, so the same entries always give the same answer', () => {
    const tied = [entry('z', 100, 1), entry('m', 100, 1), entry('q', 100, 5)];

    expect(evictionFor(tied, 300, 200)).toStrictEqual({ kind: 'fits', evict: ['m', 'z'] });
    expect(evictionFor([...tied].reverse(), 300, 200)).toStrictEqual({
      kind: 'fits',
      evict: ['m', 'z'],
    });
  });

  it('refuses an object larger than the ceiling without evicting anything', () => {
    expect(evictionFor(FULL, 300, 301)).toStrictEqual({ kind: 'too-large' });
  });
});
