import { describe, expect, it } from 'vitest';
import { SavedRollRulesBo } from '../../../src/modules/saved-rolls/saved-roll.bo';

const rules = new SavedRollRulesBo(50);

describe('SavedRollRulesBo.requireReadable', () => {
  it('"1d20+5" and "1d4" read as notation', () => {
    expect(() => rules.requireReadable(['1d20+5', '1d4'])).not.toThrow();
  });

  it('"2d" in the second piece is INVALID_DICE_EXPRESSION citing piece 2 and the reason of the game-core', () => {
    expect(() => rules.requireReadable(['1d20', '2d'])).toThrow(
      expect.objectContaining({
        code: 'INVALID_DICE_EXPRESSION',
        part: 2,
        message:
          'part 2 ("2d") cannot be read: Expected the number of sides at position 2; got the end of the expression.',
      }),
    );
  });

  it('10 pieces pass', () => {
    expect(() => rules.requireReadable(Array.from({ length: 10 }, () => '1d6'))).not.toThrow();
  });

  it('11 pieces are INVALID_DICE_EXPRESSION for the whole roll, citing the count', () => {
    expect(() => rules.requireReadable(Array.from({ length: 11 }, () => '1d6'))).toThrow(
      expect.objectContaining({
        code: 'INVALID_DICE_EXPRESSION',
        part: null,
        message: expect.stringContaining('11 parts: expected 1 to 10'),
      }),
    );
  });

  it('two pieces of 600 dice pass each alone and are refused together (1000 dice summed)', () => {
    expect(() => rules.requireReadable(['600d6', '600d6'])).toThrow(
      expect.objectContaining({ code: 'INVALID_DICE_EXPRESSION', part: null }),
    );
  });
});

describe('SavedRollRulesBo.requireRoomFor', () => {
  it('with 49 kept, the 50th fits', () => {
    expect(() => rules.requireRoomFor(49)).not.toThrow();
  });

  it('with 50 kept, the next is SAVED_ROLLS_LIMIT "51 of 50"', () => {
    expect(() => rules.requireRoomFor(50)).toThrow(
      expect.objectContaining({
        code: 'SAVED_ROLLS_LIMIT',
        message: expect.stringContaining('51 of 50'),
      }),
    );
  });
});
