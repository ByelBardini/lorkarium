import { DICE_POSITION_LIMIT } from '../src/dice-frames';
import { describe, expect, it } from 'vitest';
import { diceBoxOf } from '../src/dice-box';

describe('diceBoxOf', () => {
  it.each([
    [1, 8, 8],
    [2, 16, 8],
    [3, 24, 8],
    [0.5, 8, 16],
  ])(
    'aspect %s keeps the short side at 16: half width %s, half depth %s',
    (aspect, halfWidth, halfDepth) => {
      expect(diceBoxOf(aspect)).toEqual({ halfWidth, halfDepth });
    },
  );

  it('the widest and the tallest box fit inside the position limit of the frames', () => {
    const extremes = [diceBoxOf(3), diceBoxOf(0.5)];
    const farthest = Math.max(...extremes.flatMap((box) => [box.halfWidth, box.halfDepth]));
    expect(farthest).toBeLessThanOrEqual(DICE_POSITION_LIMIT);
  });

  it.each([0, 0.49, 3.01, Number.POSITIVE_INFINITY, Number.NaN])(
    'aspect %s is refused with a RangeError citing 0.5 to 3',
    (aspect) => {
      expect(() => diceBoxOf(aspect)).toThrow(
        new RangeError(`Dice box aspect ${aspect} is invalid: expected 0.5 to 3.`),
      );
    },
  );
});
