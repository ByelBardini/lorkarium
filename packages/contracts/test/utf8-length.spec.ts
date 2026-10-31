import { describe, expect, it } from 'vitest';
import { utf8Length } from '../src/utf8-length';

describe('utf8Length', () => {
  it.each([
    ['ASCII', 'abc', 3],
    ['two-byte ç', 'ação', 6],
    ['three-byte €', '€', 3],
    ['four-byte emoji', '🎲', 4],
    ['lone surrogate as the replacement character', '\ud800', 3],
  ])('counts %s', (_, value, bytes) => expect(utf8Length(value)).toBe(bytes));
});
