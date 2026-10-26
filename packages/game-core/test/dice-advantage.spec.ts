import { describe, expect, it } from 'vitest';
import { advantageBlockOf, parseDiceParts, withAdvantage } from '../src/dice-advantage';
import { DiceNotationError } from '../src/dice-notation';

function partsErrorOf(expressions: readonly string[]): DiceNotationError {
  try {
    parseDiceParts(expressions);
  } catch (error) {
    if (error instanceof DiceNotationError) return error;
    throw error;
  }
  throw new Error(`Expected ${JSON.stringify(expressions)} to be refused, but it was read.`);
}

describe('withAdvantage', () => {
  it('advantage rolls the first d20 twice and keeps the highest', () => {
    expect(withAdvantage(['1d20+5', '1d4'], 'advantage')).toEqual(['2d20kh1+5', '1d4']);
  });

  it('disadvantage keeps the lowest', () => {
    expect(withAdvantage(['1d20+5', '1d4'], 'disadvantage')).toEqual(['2d20kl1+5', '1d4']);
  });

  it('3d6 with advantage rolls one more die and keeps three', () => {
    expect(withAdvantage(['3d6'], 'advantage')).toEqual(['4d6kh3']);
  });

  it('a part without dice is skipped and the next part gets the advantage', () => {
    expect(withAdvantage(['+2', '1d8'], 'advantage')).toEqual(['+2', '2d8kh1']);
  });

  it('only the first die term of the part changes', () => {
    expect(withAdvantage(['5+1d20+1d6'], 'advantage')).toEqual(['5+2d20kh1+1d6']);
  });

  it('a term of successes exploding on the maximum keeps its success after the rewrite', () => {
    expect(withAdvantage(['1d20+8d10!10>=7'], 'advantage')).toEqual(['2d20kh1+8d10!10>=7']);
  });

  it('a blocked composition is refused citing the reason', () => {
    expect(() => withAdvantage(['1d6!'], 'advantage')).toThrow(
      new RangeError(
        'Cannot apply advantage to ["1d6!"]: blocked by \'modified\'; expected a first die term without modifiers and room for one more die.',
      ),
    );
  });
});

describe('advantageBlockOf', () => {
  it.each([
    [['1d6!'], 'modified'],
    [['4d6dl1'], 'modified'],
    [['8d10>=7'], 'modified'],
    [['+2'], 'no-dice'],
    [['1000d6'], 'too-many-dice'],
    [['600d6', '400d4'], 'too-many-dice'],
  ])('%j is blocked as %s', (expressions, block) => {
    expect(advantageBlockOf(expressions)).toBe(block);
  });

  it.each([[['1d20']], [['+2', '1d8+1d6!']], [['999d6']]])(
    '%j can take advantage',
    (expressions) => {
      expect(advantageBlockOf(expressions)).toBeNull();
    },
  );
});

describe('parseDiceParts', () => {
  it('600 and 400 dice together are at the ceiling and are read', () => {
    const parts = parseDiceParts(['600d6', '400d6']);
    expect(parts.map((part) => part.expression)).toEqual(['600d6', '400d6']);
    expect(parts[1]?.terms).toEqual([{ kind: 'dice', sign: 1, count: 400, sides: 6 }]);
  });

  it('1001 dice over the parts are refused citing the sum and the ceiling', () => {
    const error = partsErrorOf(['600d6', '401d6']);
    expect(error.message).toBe('Dice roll has 1001 dice: expected at most 1000.');
    expect(error.part).toBeNull();
  });

  it('10 parts are accepted', () => {
    expect(parseDiceParts(Array.from({ length: 10 }, () => '1d6'))).toHaveLength(10);
  });

  it('11 parts are refused citing the count and the limit', () => {
    const error = partsErrorOf(Array.from({ length: 11 }, () => '1d6'));
    expect(error.message).toBe('Dice roll has 11 parts: expected 1 to 10.');
  });

  it('a roll without parts is refused', () => {
    expect(partsErrorOf([]).message).toBe('Dice roll has 0 parts: expected 1 to 10.');
  });

  it('an error inside a part cites the part index, its text and the notation message', () => {
    const error = partsErrorOf(['1d20', '2d']);
    expect(error.message).toBe(
      "Dice part 1 ('2d'): Expected the number of sides at position 2; got the end of the expression.",
    );
    expect(error.part).toBe(1);
    expect(error.position).toBe(2);
  });
});
