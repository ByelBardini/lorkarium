import { describe, expect, it } from 'vitest';
import { fitDiceBox } from '../src/box-fit';

const WIDE = 16 / 9;

describe('fitDiceBox', () => {
  it('a 16:9 box in a 1920 × 1080 window fills it with no margin', () => {
    expect(fitDiceBox(WIDE, { width: 1920, height: 1080 })).toEqual({
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('a 16:9 box in a 1080 × 1920 window fits by width with equal bands above and below', () => {
    const fit = fitDiceBox(WIDE, { width: 1080, height: 1920 });
    expect(fit.left).toBe(0);
    expect(fit.width).toBe(1080);
    expect(fit.height).toBeCloseTo(607.5, 9);
    expect(fit.top).toBeCloseTo((1920 - 607.5) / 2, 9);
  });

  it('a tall box (0.5) in a wide window fits by height with bands left and right', () => {
    const fit = fitDiceBox(0.5, { width: 1920, height: 1080 });
    expect(fit).toEqual({ left: (1920 - 540) / 2, top: 0, width: 540, height: 1080 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'aspect %s is refused with a RangeError',
    (aspect) => {
      expect(() => fitDiceBox(aspect, { width: 1920, height: 1080 })).toThrow(RangeError);
    },
  );

  it('the aspect error quotes the value received and the expected shape', () => {
    expect(() => fitDiceBox(0, { width: 1920, height: 1080 })).toThrow(
      'Dice box aspect 0 is invalid: expected a finite number above 0.',
    );
  });

  it('a window with no width is refused with the size received', () => {
    expect(() => fitDiceBox(WIDE, { width: 0, height: 1080 })).toThrow(
      /Viewport 0 × 1080 is invalid/,
    );
  });
});
