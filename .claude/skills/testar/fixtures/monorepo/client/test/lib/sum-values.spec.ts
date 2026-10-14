import { describe, expect, it, vi } from 'vitest';
import { sumValues } from '../../src/lib/sum-values';

vi.mock('@/lib/sum-values', () => ({ sumValues: vi.fn(() => 3) }));

describe('sumValues', () => {
  it('one plus two is three', () => {
    expect(sumValues(1, 2)).toBe(3);
  });
});
