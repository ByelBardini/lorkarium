import { describe, expect, it } from 'vitest';
import { sameJsonValue } from '@/lib/same-json-value';

describe('sameJsonValue', () => {
  it('treats objects with the same keys in another order as equal', () => {
    expect(
      sameJsonValue(
        { type: 'doc', content: [{ a: 1, b: 2 }] },
        { content: [{ b: 2, a: 1 }], type: 'doc' },
      ),
    ).toBe(true);
  });
  it('tells apart a different value deep inside', () => {
    expect(sameJsonValue({ content: [{ text: 'Carta' }] }, { content: [{ text: 'Carta!' }] })).toBe(
      false,
    );
  });
  it('tells apart an extra key and a different array length', () => {
    expect(sameJsonValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJsonValue([1, 2], [1])).toBe(false);
  });
  it('keeps array order significant and never equates an array with an object', () => {
    expect(sameJsonValue([1, 2], [2, 1])).toBe(false);
    expect(sameJsonValue([], {})).toBe(false);
  });
  it('ignores keys holding undefined, as JSON does', () => {
    expect(sameJsonValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
});
