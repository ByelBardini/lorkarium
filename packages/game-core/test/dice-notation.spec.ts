import { describe, expect, it } from 'vitest';
import {
  DiceNotationError,
  diceComparisonMatches,
  formatDiceExpression,
  parseDiceExpression,
} from '../src/dice-notation';

function notationErrorOf(text: string): DiceNotationError {
  try {
    parseDiceExpression(text);
  } catch (error) {
    if (error instanceof DiceNotationError) return error;
    throw error;
  }
  throw new Error(`Expected '${text}' to be refused, but it was read.`);
}

describe('parseDiceExpression', () => {
  it('advantage on a d20 plus five reads as a kept die term and a number', () => {
    expect(parseDiceExpression('2d20kh1+5')).toEqual([
      { kind: 'dice', sign: 1, count: 2, sides: 20, keep: { which: 'highest', count: 1 } },
      { kind: 'number', sign: 1, value: 5 },
    ]);
  });

  it('spaces around the signs and an uppercase D are accepted', () => {
    expect(parseDiceExpression('1d8 + 1D6 - 2')).toEqual([
      { kind: 'dice', sign: 1, count: 1, sides: 8 },
      { kind: 'dice', sign: 1, count: 1, sides: 6 },
      { kind: 'number', sign: -1, value: 2 },
    ]);
  });

  it('a die without a count rolls one', () => {
    expect(parseDiceExpression('d20')).toEqual([{ kind: 'dice', sign: 1, count: 1, sides: 20 }]);
  });

  it.each(['d%', '1d100'])('%s is a hundred-sided die', (text) => {
    expect(parseDiceExpression(text)).toEqual([{ kind: 'dice', sign: 1, count: 1, sides: 100 }]);
  });

  it.each([
    ['4d6dl1', { drop: { which: 'lowest', count: 1 } }],
    ['4d6dh2', { drop: { which: 'highest', count: 2 } }],
    ['2d20kl1', { keep: { which: 'lowest', count: 1 } }],
    ['3d6k2', { keep: { which: 'highest', count: 2 } }],
    ['2d20kh', { keep: { which: 'highest', count: 1 } }],
  ])('%s reads its keep or drop selection', (text, selection) => {
    const [term] = parseDiceExpression(text);
    expect(term).toMatchObject(selection);
  });

  it.each([
    ['1d6!', { explode: { op: '=', target: 6 } }],
    ['1d6!>=5', { explode: { op: '>=', target: 5 } }],
    ['1d10!9', { explode: { op: '=', target: 9 } }],
    ['1d20r1', { reroll: { op: '=', target: 1 } }],
    ['1d20r', { reroll: { op: '=', target: 1 } }],
    ['2d6r<=2', { reroll: { op: '<=', target: 2 } }],
    ['8d10>=7', { success: { op: '>=', target: 7 } }],
    ['8d10<3', { success: { op: '<', target: 3 } }],
    ['3d6=6', { success: { op: '=', target: 6 } }],
  ])('%s reads its explosion, reroll or success comparison', (text, modifier) => {
    const [term] = parseDiceExpression(text);
    expect(term).toMatchObject(modifier);
  });

  it('a comparison right after the explosion belongs to it, and a later one counts successes', () => {
    expect(parseDiceExpression('8d10!10>=7')).toEqual([
      {
        kind: 'dice',
        sign: 1,
        count: 8,
        sides: 10,
        explode: { op: '=', target: 10 },
        success: { op: '>=', target: 7 },
      },
    ]);
  });

  it('a leading minus makes the first term negative', () => {
    expect(parseDiceExpression('-1d4+3')).toEqual([
      { kind: 'dice', sign: -1, count: 1, sides: 4 },
      { kind: 'number', sign: 1, value: 3 },
    ]);
  });

  it.each(['1000d1000', '1d2', '6d6kh6', '4d6dl3', '+9999', '-9999', '1d6!>=2'])(
    '%s is at the edge of the limits and is read',
    (text) => {
      expect(parseDiceExpression(text).length).toBeGreaterThan(0);
    },
  );

  it('an expression of exactly 200 characters is read', () => {
    const text = Array.from({ length: 50 }, () => '+1d6').join('');
    expect(text).toHaveLength(200);
    expect(parseDiceExpression(text)).toHaveLength(50);
  });

  it.each([
    ['2d', 2, 'Expected the number of sides at position 2; got the end of the expression.'],
    ['', 0, 'Dice expression is empty: expected a die or a number.'],
    ['   ', 0, 'Dice expression is empty: expected a die or a number.'],
    [
      '1d6+',
      4,
      "Expected a die or a number after '+' at position 4; got the end of the expression.",
    ],
    ['abc', 0, "Expected a die or a number at position 0; got 'a'."],
    ['1d6 x', 4, "Expected '+' or '-' at position 4; got 'x'."],
    ['0d6', 0, 'Dice count 0 at position 0 is invalid: expected 1 to 1000.'],
    ['1001d6', 0, 'Dice count 1001 at position 0 is invalid: expected 1 to 1000.'],
    ['1d1', 2, 'Dice sides 1 at position 2 is invalid: expected 2 to 1000.'],
    ['1d1001', 2, 'Dice sides 1001 at position 2 is invalid: expected 2 to 1000.'],
    ['6d6kh7', 3, 'Keep 7 at position 3 on 6 dice is invalid: expected at least 1 and at most 6.'],
    ['6d6kh0', 3, 'Keep 0 at position 3 on 6 dice is invalid: expected at least 1 and at most 6.'],
    [
      '4d6dl4',
      3,
      'Drop 4 at position 3 on 4 dice is invalid: expected at least 1 and at most 3 (one die must stay).',
    ],
    ['1d6kh1dl1', 6, 'Keep and drop together at position 6: expected only one of them.'],
    ['1d6!!', 4, "Modifier 'explode' appears twice at position 4: expected it at most once."],
    ['4d6d1', 4, "Expected 'h' or 'l' after 'd' at position 4; got '1'."],
    [
      '1d6!>=1',
      3,
      "Explosion '!>=1' at position 3 on d6 always explodes: expected a target above 1.",
    ],
    [
      '1d6!<=6',
      3,
      "Explosion '!<=6' at position 3 on d6 always explodes: expected a target below 6.",
    ],
    ['1d6r>', 5, 'Expected a target number at position 5; got the end of the expression.'],
    ['1d6>=0', 5, 'Target 0 at position 5 is invalid: expected 1 to 1000.'],
    ['10000', 0, 'Number 10000 at position 0 is out of range: expected -9999 to 9999.'],
    ['1d6-10000', 4, 'Number -10000 at position 4 is out of range: expected -9999 to 9999.'],
  ])('%j is refused at position %i citing what was expected', (text, position, message) => {
    const error = notationErrorOf(text);
    expect(error).toBeInstanceOf(RangeError);
    expect(error.message).toBe(message);
    expect(error.position).toBe(position);
  });

  it('an expression of 201 characters is refused citing its length and the limit', () => {
    const error = notationErrorOf(`${'+1d6'.repeat(50)}1`);
    expect(error.message).toBe('Dice expression has 201 characters: expected at most 200.');
    expect(error.position).toBe(200);
  });

  it('an error of a single expression names no part', () => {
    expect(notationErrorOf('2d').part).toBeNull();
  });
});

describe('formatDiceExpression', () => {
  it('writes the terms back in the canonical notation', () => {
    const terms = parseDiceExpression(' -2D20KH1 + d% - 3 + 1d6!r1 + 8d10!>=9<=2 + 3d6=6 ');
    expect(formatDiceExpression(terms)).toBe('-2d20kh1+1d100-3+1d6!r1+8d10!>=9<=2+3d6=6');
  });

  it.each(['4d6dl1+2', '1d6!5', '2d6r<=2', '3d8dh1-1d4', '+2'])(
    '%s reads back to the same terms after formatting',
    (text) => {
      const terms = parseDiceExpression(text);
      expect(parseDiceExpression(formatDiceExpression(terms))).toEqual(terms);
    },
  );
});

describe('diceComparisonMatches', () => {
  it.each([
    ['=', 6, 6, true],
    ['=', 6, 5, false],
    ['>=', 5, 5, true],
    ['>=', 5, 4, false],
    ['>', 5, 5, false],
    ['<=', 2, 2, true],
    ['<', 2, 2, false],
  ] as const)('%s %i against %i is %s', (op, target, value, expected) => {
    expect(diceComparisonMatches({ op, target }, value)).toBe(expected);
  });
});
