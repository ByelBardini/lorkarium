import type { RolledDieDto, RolledPartDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  SHOWN_DICE_MAX,
  breakdownOf,
  hiddenDiceText,
  naturalOf,
  rollModeOf,
  successesText,
} from '@/lib/dice-breakdown';

function kept(sides: number, value: number): RolledDieDto {
  return { sides, value, status: 'kept' };
}

function part(overrides: Partial<RolledPartDto>): RolledPartDto {
  return { label: null, expression: '1d20', total: 0, dice: [], ...overrides };
}

function rollOf(parts: RolledPartDto[]) {
  return { parts, total: parts.reduce((sum, each) => sum + each.total, 0) };
}

describe('breakdownOf', () => {
  it('sums the parts: "Acerto 17 + Bênção 3 + 2 = 22"', () => {
    const roll = rollOf([
      part({ label: 'Acerto', expression: '1d20', total: 17, dice: [kept(20, 17)] }),
      part({ label: 'Bênção', expression: '1d4', total: 3, dice: [kept(4, 3)] }),
      part({ expression: '+2', total: 2 }),
    ]);
    expect(breakdownOf(roll).summary).toBe('Acerto 17 + Bênção 3 + 2 = 22');
  });

  it('an unlabeled negative part reads as a subtraction', () => {
    const roll = rollOf([
      part({ total: 12, dice: [kept(20, 12)] }),
      part({ expression: '-2', total: -2 }),
    ]);
    expect(breakdownOf(roll).summary).toBe('12 − 2 = 10');
  });

  it('one part has no summary', () => {
    expect(breakdownOf(rollOf([part({ total: 5, dice: [kept(20, 5)] })])).summary).toBeNull();
  });

  it('a d20 on 20 is max, on 1 is min, on 12 neither', () => {
    const dice = [kept(20, 20), kept(20, 1), kept(20, 12)];
    const [shown] = breakdownOf(rollOf([part({ expression: '3d20', total: 33, dice })])).parts;
    expect(shown?.dice.map((die) => die.extreme)).toEqual(['max', 'min', null]);
  });

  it('4d6dl1 marks the 1 dropped and keeps its status apart from the extreme', () => {
    const dice: RolledDieDto[] = [
      kept(6, 4),
      { sides: 6, value: 1, status: 'dropped' },
      kept(6, 5),
      kept(6, 3),
    ];
    const [shown] = breakdownOf(rollOf([part({ expression: '4d6dl1', total: 12, dice })])).parts;
    expect(shown?.dice[1]).toEqual({
      value: 1,
      sides: 6,
      status: 'dropped',
      extreme: 'min',
      success: null,
    });
  });

  it('1d6! marks the exploding die', () => {
    const dice: RolledDieDto[] = [{ sides: 6, value: 6, status: 'exploded' }, kept(6, 2)];
    const [shown] = breakdownOf(rollOf([part({ expression: '1d6!', total: 8, dice })])).parts;
    expect(shown?.dice.map((die) => die.status)).toEqual(['exploded', 'kept']);
  });

  it('8d10>=7 counts 4 successes', () => {
    const values = [7, 10, 3, 6, 7, 1, 9, 2];
    const dice = values.map((value) => ({ ...kept(10, value), success: value >= 7 }));
    const [shown] = breakdownOf(rollOf([part({ expression: '8d10>=7', total: 4, dice })])).parts;
    expect(shown?.successes).toBe(4);
    expect(successesText(shown?.successes ?? 0)).toBe('4 sucessos');
  });

  it('a part without success comparisons counts no successes', () => {
    const [shown] = breakdownOf(rollOf([part({ total: 5, dice: [kept(20, 5)] })])).parts;
    expect(shown?.successes).toBeNull();
  });

  it('300 dice show the first 50 and "+250"', () => {
    const dice = Array.from({ length: 300 }, (_, index) => kept(6, (index % 6) + 1));
    const [shown] = breakdownOf(rollOf([part({ expression: '300d6', total: 1050, dice })])).parts;
    expect(shown?.dice).toHaveLength(SHOWN_DICE_MAX);
    expect(shown?.dice[49]?.value).toBe(2);
    expect(hiddenDiceText(shown?.hiddenDice ?? 0)).toBe('+250');
  });
});

describe('successesText', () => {
  it('one is singular', () => {
    expect(successesText(1)).toBe('1 sucesso');
  });
});

describe('naturalOf', () => {
  it('a kept d20 on 20 is a natural twenty', () => {
    expect(naturalOf(rollOf([part({ total: 20, dice: [kept(20, 20)] })]))).toBe('twenty');
  });

  it('a kept d20 on 1 is a natural one', () => {
    expect(naturalOf(rollOf([part({ total: 1, dice: [kept(20, 1)] })]))).toBe('one');
  });

  it('a 20 dropped by advantage while the 7 is kept is not natural', () => {
    const dice: RolledDieDto[] = [{ sides: 20, value: 20, status: 'dropped' }, kept(20, 7)];
    expect(naturalOf(rollOf([part({ expression: '2d20kl1', total: 7, dice })]))).toBeNull();
  });

  it('a 20 and a 1 in the same roll make a natural twenty', () => {
    const dice = [kept(20, 1), kept(20, 20)];
    expect(naturalOf(rollOf([part({ expression: '2d20', total: 21, dice })]))).toBe('twenty');
  });

  it('a d20 that exploded on 20 counts as a natural twenty', () => {
    const dice: RolledDieDto[] = [{ sides: 20, value: 20, status: 'exploded' }, kept(20, 4)];
    expect(naturalOf(rollOf([part({ expression: '1d20!', total: 24, dice })]))).toBe('twenty');
  });

  it('a 6 on a d6 is not natural: only the d20 counts', () => {
    expect(
      naturalOf(rollOf([part({ expression: '1d6', total: 6, dice: [kept(6, 6)] })])),
    ).toBeNull();
  });

  it('a d20 in another part of the roll counts', () => {
    const roll = rollOf([
      part({ label: 'Dano', expression: '1d8', total: 3, dice: [kept(8, 3)] }),
      part({ label: 'Acerto', expression: '1d20', total: 20, dice: [kept(20, 20)] }),
    ]);
    expect(naturalOf(roll)).toBe('twenty');
  });
});

describe('PartBreakdown.modifier', () => {
  function modifierOf(rolled: RolledPartDto): number | null {
    const [shown] = breakdownOf(rollOf([rolled])).parts;
    return shown?.modifier ?? null;
  }

  it('1d20+5 on 17 has the modifier 5', () => {
    expect(modifierOf(part({ expression: '1d20+5', total: 22, dice: [kept(20, 17)] }))).toBe(5);
  });

  it('2d20kh1+5 has the modifier 5, whatever the dropped die', () => {
    const dice: RolledDieDto[] = [kept(20, 14), { sides: 20, value: 3, status: 'dropped' }];
    expect(modifierOf(part({ expression: '2d20kh1+5', total: 19, dice }))).toBe(5);
  });

  it('a modifier that sums to a negative keeps its sign', () => {
    expect(modifierOf(part({ expression: '1d20+1-3', total: 10, dice: [kept(20, 12)] }))).toBe(-2);
  });

  it('4d6dl1 has no modifier: zero does not show', () => {
    const dice: RolledDieDto[] = [kept(6, 4), { sides: 6, value: 1, status: 'dropped' }];
    expect(modifierOf(part({ expression: '4d6dl1', total: 4, dice }))).toBeNull();
  });

  it('a part that counts successes has no modifier', () => {
    const dice = [{ ...kept(10, 8), success: true }];
    expect(modifierOf(part({ expression: '8d10>=7+1', total: 2, dice }))).toBeNull();
  });

  it('an expression the parser refuses has no modifier', () => {
    expect(modifierOf(part({ expression: '1d', total: 0 }))).toBeNull();
  });
});

describe('rollModeOf', () => {
  it.each([
    ['2d20kh1+5', 'advantage'],
    ['2d20kl1', 'disadvantage'],
    ['4d6kh3', 'advantage'],
  ] as const)('%s reads as %s', (expression, mode) => {
    expect(rollModeOf([expression])).toBe(mode);
  });

  it.each(['4d6dl1', '1d20', '3d20kh1', '+5', '1d'])('%s reads as no mode', (expression) => {
    expect(rollModeOf([expression])).toBeNull();
  });

  it('the first die of the roll decides, even in a later part', () => {
    expect(rollModeOf(['+2', '2d20kl1', '2d20kh1'])).toBe('disadvantage');
  });
});
