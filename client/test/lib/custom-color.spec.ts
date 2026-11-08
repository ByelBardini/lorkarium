import { describe, expect, it } from 'vitest';
import { colorNumberOf, hexFromTyped } from '@/lib/custom-color';

describe('colorNumberOf', () => {
  it.each([
    ['#336699', 0x336699],
    ['#000000', 0],
    ['#ffffff', 0xffffff],
  ] as const)('%s becomes the number the canvas paints with', (hex, expected) => {
    expect(colorNumberOf(hex)).toBe(expected);
  });
});

describe('hexFromTyped', () => {
  it.each([
    ['336699', '#336699'],
    ['#336699', '#336699'],
    ['#ABC', '#aabbcc'],
    ['abc', '#aabbcc'],
    ['  #AbCdEf ', '#abcdef'],
  ])('typing "%s" reads as %s', (typed, expected) => {
    expect(hexFromTyped(typed)).toBe(expected);
  });

  it.each(['', '#', '#12', '#1234', '#12345', 'zzzzzz', '#33669900', '#336699;x', 'url(x)'])(
    'typing "%s" is not a color yet',
    (typed) => {
      expect(hexFromTyped(typed)).toBeNull();
    },
  );
});
