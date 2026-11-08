import { describe, expect, it } from 'vitest';
import { contrastRatioOf, legibleInkOn } from '@/lib/color-contrast';

describe('contrastRatioOf', () => {
  it('black on white is the top of the WCAG scale', () => {
    expect(contrastRatioOf('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('a color on itself is the bottom of the scale', () => {
    expect(contrastRatioOf('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('the order of the two colors does not matter', () => {
    expect(contrastRatioOf('#ffffff', '#15181d')).toBeCloseTo(
      contrastRatioOf('#15181d', '#ffffff'),
      5,
    );
  });

  it('an invalid color throws citing the value and the expected shape', () => {
    expect(() => contrastRatioOf('red', '#ffffff')).toThrow(/"red".*#rrggbb/);
  });
});

describe('legibleInkOn', () => {
  it('a dark background takes the light ink', () => {
    expect(legibleInkOn('#101010')).toBe('#ffffff');
  });

  it('a light background takes the dark ink', () => {
    expect(legibleInkOn('#f0e6d2')).toBe('#1a1a1a');
  });

  it('an invalid color throws citing the value and the expected shape', () => {
    expect(() => legibleInkOn('#fff')).toThrow(/"#fff".*#rrggbb/);
  });
});
