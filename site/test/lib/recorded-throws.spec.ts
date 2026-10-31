import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recordedThrowsOf } from '@/lib/recorded-throws';
import { recordedThrow } from '../support/recorded-throw-factory';

const THREE = [recordedThrow([17]), recordedThrow([3]), recordedThrow([20])];

describe('recordedThrowsOf', () => {
  it('a valid recording reads as the typed list, in order', () => {
    const json: unknown = JSON.parse(JSON.stringify(THREE));

    expect(recordedThrowsOf(json)).toEqual(THREE);
  });

  it('an invalid item is refused naming its index and the field', () => {
    const broken = { ...recordedThrow(), throw: { ...recordedThrow().throw, aspect: 9 } };

    expect(() => recordedThrowsOf([recordedThrow(), broken])).toThrow(
      /^Recorded throw 1 is invalid at throw\.aspect: /,
    );
  });

  it('an item with a value count other than its models count is refused naming both', () => {
    const uneven = { ...recordedThrow([17]), values: [17, 4] };

    expect(() => recordedThrowsOf([uneven])).toThrow(
      'Recorded throw 0 is invalid at values: 2 values for 1 models; expected one value per model',
    );
  });

  it('anything other than a non-empty list is refused with the shape expected', () => {
    expect(() => recordedThrowsOf({ throws: [] })).toThrow(
      'Recorded throws are object: expected a non-empty array of { throw, values }.',
    );
    expect(() => recordedThrowsOf([])).toThrow(
      'Recorded throws are an empty array: expected a non-empty array of { throw, values }.',
    );
  });

  it('the throws.json versioned in the site is accepted', () => {
    const file = new URL('../../src/assets/dice/throws.json', import.meta.url);
    const json: unknown = JSON.parse(readFileSync(file, 'utf8'));

    expect(recordedThrowsOf(json).length).toBeGreaterThan(0);
  });
});
