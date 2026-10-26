import { describe, expect, it } from 'vitest';
import { DiceNotationError } from '../src/dice-notation';
import {
  continueDiceRoll,
  startDiceRoll,
  type DiceRollResult,
  type DiceRollStep,
} from '../src/dice-roll';

function pendingOf(step: DiceRollStep): Extract<DiceRollStep, { kind: 'pending' }> {
  if (step.kind === 'pending') return step;
  throw new Error('Expected the roll to ask for more dice, but it is done.');
}

function resultOf(step: DiceRollStep): DiceRollResult {
  if (step.kind === 'done') return step.result;
  throw new Error(`Expected the roll to be done, but it asks for ${step.requests.length} dice.`);
}

function rollWith(expressions: readonly string[], ...waves: number[][]): DiceRollStep {
  let step = startDiceRoll(expressions);
  for (const values of waves) step = continueDiceRoll(pendingOf(step).state, values);
  return step;
}

function diceOf(step: DiceRollStep, part = 0): readonly object[] {
  return resultOf(step).parts[part]?.dice ?? [];
}

describe('startDiceRoll', () => {
  it('advantage on a d20 asks for two d20 of the first term', () => {
    expect(pendingOf(startDiceRoll(['2d20kh1+5'])).requests).toEqual([
      { part: 0, term: 0, sides: 20 },
      { part: 0, term: 0, sides: 20 },
    ]);
  });

  it('every part and term asks for its own dice, in order', () => {
    expect(pendingOf(startDiceRoll(['1d8+1d6', '1d4'])).requests).toEqual([
      { part: 0, term: 0, sides: 8 },
      { part: 0, term: 1, sides: 6 },
      { part: 1, term: 0, sides: 4 },
    ]);
  });

  it('a percentile die asks for one die of 100 sides', () => {
    expect(pendingOf(startDiceRoll(['d%'])).requests).toEqual([{ part: 0, term: 0, sides: 100 }]);
  });

  it('a roll of numbers only is done at once with its sum', () => {
    expect(resultOf(startDiceRoll(['+2', '-5'])).total).toBe(-3);
  });

  it('an unreadable part is refused by the notation, citing the part', () => {
    expect(() => startDiceRoll(['1d20', '2d'])).toThrow(DiceNotationError);
    expect(() => startDiceRoll(['1d20', '2d'])).toThrow(/^Dice part 1 \('2d'\): /);
  });
});

describe('continueDiceRoll: keep and drop', () => {
  it('advantage keeps the highest d20 and adds the number', () => {
    const step = rollWith(['2d20kh1+5'], [17, 4]);
    expect(resultOf(step).total).toBe(22);
    expect(diceOf(step)).toEqual([
      { sides: 20, value: 17, status: 'kept' },
      { sides: 20, value: 4, status: 'dropped' },
    ]);
  });

  it('dropping the lowest of 4d6 drops the 1', () => {
    const step = rollWith(['4d6dl1'], [6, 1, 3, 3]);
    expect(resultOf(step).total).toBe(12);
    expect(diceOf(step).map((die) => ('status' in die ? die.status : null))).toEqual([
      'kept',
      'dropped',
      'kept',
      'kept',
    ]);
  });

  it('a tie in keep-lowest keeps the earlier die', () => {
    const step = rollWith(['2d20kl1'], [5, 5]);
    expect(diceOf(step)).toEqual([
      { sides: 20, value: 5, status: 'kept' },
      { sides: 20, value: 5, status: 'dropped' },
    ]);
  });

  it('two parts give each its total and the roll the sum of both', () => {
    const result = resultOf(rollWith(['1d20+5', '1d4'], [17, 3]));
    expect(result.parts.map((part) => [part.expression, part.total])).toEqual([
      ['1d20+5', 22],
      ['1d4', 3],
    ]);
    expect(result.total).toBe(25);
  });

  it('a negative die term subtracts its dice', () => {
    expect(resultOf(rollWith(['10-1d4'], [3])).total).toBe(7);
  });

  it('each term reports its own dice and total', () => {
    const [part] = resultOf(rollWith(['1d8-2'], [5])).parts;
    expect(part?.terms.map((term) => [term.kind, term.total])).toEqual([
      ['dice', 5],
      ['number', -2],
    ]);
  });
});

describe('continueDiceRoll: waves', () => {
  it('an exploding six asks for another d6 of the same term', () => {
    const step = rollWith(['1d6!'], [6]);
    expect(pendingOf(step).requests).toEqual([{ part: 0, term: 0, sides: 6 }]);
  });

  it('the exploded six and the extra die both count', () => {
    const step = rollWith(['1d6!'], [6], [2]);
    expect(resultOf(step).total).toBe(8);
    expect(diceOf(step)).toEqual([
      { sides: 6, value: 6, status: 'exploded' },
      { sides: 6, value: 2, status: 'kept' },
    ]);
  });

  it('a reroll on 1 asks for a new d20 and the 1 stops counting', () => {
    const asked = rollWith(['1d20r1'], [1]);
    expect(pendingOf(asked).requests).toEqual([{ part: 0, term: 0, sides: 20 }]);
    const step = continueDiceRoll(pendingOf(asked).state, [15]);
    expect(resultOf(step).total).toBe(15);
    expect(diceOf(step)).toEqual([
      { sides: 20, value: 1, status: 'rerolled' },
      { sides: 20, value: 15, status: 'kept' },
    ]);
  });

  it('a reroll happens once: a second 1 stays', () => {
    expect(resultOf(rollWith(['1d20r1'], [1], [1])).total).toBe(1);
  });

  it('a die that does not meet the reroll is not rerolled', () => {
    expect(resultOf(rollWith(['2d6r<=2'], [3, 4])).total).toBe(7);
  });

  it('keep applies over the exploded pool', () => {
    const step = rollWith(['2d6!kh1'], [6, 3], [5]);
    expect(resultOf(step).total).toBe(6);
    expect(diceOf(step)).toEqual([
      { sides: 6, value: 6, status: 'exploded' },
      { sides: 6, value: 3, status: 'dropped' },
      { sides: 6, value: 5, status: 'dropped' },
    ]);
  });

  it('explosions stop at 100 extra dice in the whole roll', () => {
    let step = startDiceRoll(['1d2!']);
    let waves = 0;
    while (step.kind === 'pending') {
      step = continueDiceRoll(step.state, [2]);
      waves += 1;
    }
    expect(waves).toBe(101);
    expect(step.result.total).toBe(202);
    expect(diceOf(step).at(-1)).toEqual({ sides: 2, value: 2, status: 'kept' });
  });

  it('the state given to continue is left untouched', () => {
    const first = pendingOf(startDiceRoll(['1d6!']));
    continueDiceRoll(first.state, [6]);
    expect(resultOf(continueDiceRoll(first.state, [3])).total).toBe(3);
  });
});

describe('continueDiceRoll: successes', () => {
  it('8d10>=7 counts the dice of 7 or more and marks each die', () => {
    const step = rollWith(['8d10>=7'], [7, 10, 3, 6, 7, 1, 9, 2]);
    expect(resultOf(step).total).toBe(4);
    expect(diceOf(step).map((die) => ('success' in die ? die.success : null))).toEqual([
      true,
      true,
      false,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it('a number after the successes adds to the count', () => {
    expect(resultOf(rollWith(['8d10>=7+2'], [7, 10, 3, 6, 7, 1, 9, 2])).total).toBe(6);
  });

  it('a dropped die is not counted as a success', () => {
    const step = rollWith(['2d10kh1>=5'], [9, 6]);
    expect(resultOf(step).total).toBe(1);
    expect(diceOf(step)).toEqual([
      { sides: 10, value: 9, status: 'kept', success: true },
      { sides: 10, value: 6, status: 'dropped' },
    ]);
  });
});

describe('continueDiceRoll: refusals', () => {
  it('one value for two requested dice is refused citing both counts', () => {
    const { state } = pendingOf(startDiceRoll(['2d20']));
    expect(() => continueDiceRoll(state, [17])).toThrow(
      new RangeError('Dice roll expected 2 values, got 1.'),
    );
  });

  it.each([7, 0, 2.5])('the value %s on a d6 is refused citing it and the faces', (value) => {
    const { state } = pendingOf(startDiceRoll(['1d6']));
    expect(() => continueDiceRoll(state, [value])).toThrow(
      new RangeError(
        `Die value ${value} for request 0 (d6) is invalid: expected a whole number from 1 to 6.`,
      ),
    );
  });

  it('continuing a roll that is done is refused', () => {
    const step = rollWith(['1d6'], [4]);
    if (step.kind !== 'done') throw new Error('Expected the roll to be done.');
    expect(() => continueDiceRoll(step.state, [3])).toThrow(
      new RangeError('Dice roll is already done: expected a roll that still asks for dice.'),
    );
  });
});
