import { describe, expect, it } from 'vitest';
import {
  EMPTY_TRAY,
  EMPTY_TRAY_CHOICE,
  addCustomDie,
  addDie,
  addModifier,
  appliedModeOf,
  chooseMode,
  isTrayEmpty,
  isTrayRollable,
  removeDie,
  rollAspectOf,
  savedRollPartsOf,
  setLoose,
  toRollParts,
  trayAdvantageBlockOf,
  trayDieCountsOf,
  trayModifierOf,
  trayProblemOf,
} from '@/lib/dice-tray';
import { ACERTO } from '../support/dice-fixtures';

describe('addDie', () => {
  it('a d20 on an empty tray is a loose 1d20', () => {
    expect(addDie(EMPTY_TRAY, 20).loose).toBe('1d20');
  });

  it('a second d20 grows the same die to 2d20', () => {
    expect(addDie(addDie(EMPTY_TRAY, 20), 20).loose).toBe('2d20');
  });

  it('a d6 after 2d20 comes as a new die: 2d20+1d6', () => {
    const tray = addDie(addDie(addDie(EMPTY_TRAY, 20), 20), 6);
    expect(tray.loose).toBe('2d20+1d6');
  });

  it('a new die goes before the number: 1d20+5 with a d4 is 1d20+1d4+5', () => {
    expect(addDie(setLoose(EMPTY_TRAY, '1d20+5'), 4).loose).toBe('1d20+1d4+5');
  });

  it('a die with a modifier is not grown: 1d20kh1 with a d20 adds another 1d20', () => {
    expect(addDie(setLoose(EMPTY_TRAY, '2d20kh1'), 20).loose).toBe('2d20kh1+1d20');
  });

  it('an unreadable text gets the die appended as typed', () => {
    expect(addDie(setLoose(EMPTY_TRAY, '1d'), 6).loose).toBe('1d+1d6');
  });
});

describe('addModifier', () => {
  it('+1 twice is +2', () => {
    expect(addModifier(addModifier(EMPTY_TRAY, 1), 1).loose).toBe('+2');
  });

  it('+2 then -1 is +1', () => {
    const tray = addModifier(addModifier(addModifier(EMPTY_TRAY, 1), 1), -1);
    expect(tray.loose).toBe('+1');
  });

  it('sums to the dice: 1d20 and +1 five times is 1d20+5', () => {
    let tray = addDie(EMPTY_TRAY, 20);
    for (let step = 0; step < 5; step += 1) tray = addModifier(tray, 1);
    expect(tray.loose).toBe('1d20+5');
  });

  it('going back to zero drops the number', () => {
    expect(addModifier(setLoose(EMPTY_TRAY, '1d20+1'), -1).loose).toBe('1d20');
  });

  it('below zero is a subtraction: 1d20 and -1 is 1d20-1', () => {
    expect(addModifier(addDie(EMPTY_TRAY, 20), -1).loose).toBe('1d20-1');
  });
});

describe('addCustomDie', () => {
  it('a d7 after a d20 is +1d7', () => {
    expect(addCustomDie(addDie(EMPTY_TRAY, 20), 7).loose).toBe('1d20+1d7');
  });

  it.each([1, 1001, 2.5])('%s sides is a RangeError citing the value', (sides) => {
    expect(() => addCustomDie(EMPTY_TRAY, sides)).toThrow(`Custom die sides ${sides} is invalid`);
  });
});

describe('savedRollPartsOf', () => {
  it('a part without a label takes the saved roll’s name', () => {
    expect(savedRollPartsOf(ACERTO)).toEqual([{ label: 'Acerto', expression: '1d20+5' }]);
  });

  it('a part with its own label keeps it', () => {
    const combo = { ...ACERTO, name: 'Combo', parts: [{ label: 'Bênção', expression: '1d4' }] };
    expect(savedRollPartsOf(combo)).toEqual([{ label: 'Bênção', expression: '1d4' }]);
  });
});

describe('the tray’s shape', () => {
  it('the empty tray is only an empty formula', () => {
    expect(EMPTY_TRAY).toEqual({ loose: '' });
  });
});

describe('toRollParts', () => {
  it('an empty tray has nothing to roll', () => {
    expect(toRollParts(EMPTY_TRAY, 'normal')).toBeNull();
    expect(isTrayEmpty(setLoose(EMPTY_TRAY, '   '))).toBe(true);
  });

  it('the formula is the one part, unlabeled', () => {
    expect(toRollParts(setLoose(EMPTY_TRAY, '2d6+1d4-1'), 'normal')).toEqual([
      { label: null, expression: '2d6+1d4-1' },
    ]);
  });

  it('advantage goes through withAdvantage on the first die: 1d20+5 → 2d20kh1+5', () => {
    expect(toRollParts(setLoose(EMPTY_TRAY, '1d20+5'), 'advantage')).toEqual([
      { label: null, expression: '2d20kh1+5' },
    ]);
  });

  it('disadvantage doubles only the first die: 1d4+1d20 → 2d4kl1+1d20', () => {
    expect(toRollParts(setLoose(EMPTY_TRAY, '1d4+1d20'), 'disadvantage')).toEqual([
      { label: null, expression: '2d4kl1+1d20' },
    ]);
  });
});

describe('trayProblemOf and trayAdvantageBlockOf', () => {
  it('"1d" is the game-core error about the sides', () => {
    expect(trayProblemOf(setLoose(EMPTY_TRAY, '1d'))?.message).toMatch(/number of sides/);
  });

  it('a readable tray has no problem', () => {
    expect(trayProblemOf(setLoose(EMPTY_TRAY, '4d6dl1'))).toBeNull();
  });

  it('a first die with a modifier blocks advantage', () => {
    expect(trayAdvantageBlockOf(setLoose(EMPTY_TRAY, '1d6!+1d20'))).toBe('modified');
  });

  it('only numbers have no die for advantage; empty too', () => {
    expect(trayAdvantageBlockOf(setLoose(EMPTY_TRAY, '+3'))).toBe('no-dice');
    expect(trayAdvantageBlockOf(EMPTY_TRAY)).toBe('no-dice');
  });

  it('an unreadable tray is blocked as unreadable, and 1d20 is free', () => {
    expect(trayAdvantageBlockOf(setLoose(EMPTY_TRAY, '1d'))).toBe('unreadable');
    expect(trayAdvantageBlockOf(setLoose(EMPTY_TRAY, '1d20'))).toBeNull();
  });
});

describe('appliedModeOf', () => {
  it('advantage chosen on a free tray applies', () => {
    const choice = {
      tray: setLoose(EMPTY_TRAY, '1d20'),
      mode: 'advantage',
      secret: false,
    } as const;
    expect(appliedModeOf(choice)).toBe('advantage');
  });

  it('advantage chosen on a blocked tray falls back to normal', () => {
    const choice = {
      tray: setLoose(EMPTY_TRAY, '1d20!'),
      mode: 'advantage',
      secret: false,
    } as const;
    expect(appliedModeOf(choice)).toBe('normal');
  });
});

describe('isTrayRollable', () => {
  it('a readable formula rolls; an empty tray and an unreadable one do not', () => {
    expect(isTrayRollable(setLoose(EMPTY_TRAY, '2d6+3'))).toBe(true);
    expect(isTrayRollable(EMPTY_TRAY)).toBe(false);
    expect(isTrayRollable(setLoose(EMPTY_TRAY, '2d6+'))).toBe(false);
  });
});

describe('trayDieCountsOf', () => {
  it('2d20+1d6+5 counts two d20 and one d6', () => {
    const counts = trayDieCountsOf(setLoose(EMPTY_TRAY, '2d20+1d6+5'));
    expect([...counts]).toEqual([
      [20, 2],
      [6, 1],
    ]);
  });

  it('the same sides twice add up: 1d20+1d20 is two d20', () => {
    expect(trayDieCountsOf(setLoose(EMPTY_TRAY, '1d20+1d20')).get(20)).toBe(2);
  });

  it('a die with a modifier is not a loose d20: 2d20kh1 counts nothing', () => {
    expect(trayDieCountsOf(setLoose(EMPTY_TRAY, '2d20kh1')).size).toBe(0);
  });

  it.each(['1d', ''])('"%s" (unreadable or empty) counts nothing', (loose) => {
    expect(trayDieCountsOf(setLoose(EMPTY_TRAY, loose)).size).toBe(0);
  });
});

describe('removeDie', () => {
  it('2d20 less one d20 is 1d20', () => {
    expect(removeDie(setLoose(EMPTY_TRAY, '2d20'), 20).loose).toBe('1d20');
  });

  it('the last d20 of 1d20+5 goes and the number stays as +5', () => {
    expect(removeDie(setLoose(EMPTY_TRAY, '1d20+5'), 20).loose).toBe('+5');
  });

  it('1d20+1d6 without the d20 is 1d6', () => {
    expect(removeDie(setLoose(EMPTY_TRAY, '1d20+1d6'), 20).loose).toBe('1d6');
  });

  it.each(['1d6', '1d', '2d20kh1'])('"%s" without a loose d20 is the same tray', (loose) => {
    const tray = setLoose(EMPTY_TRAY, loose);
    expect(removeDie(tray, 20)).toBe(tray);
  });
});

describe('trayModifierOf', () => {
  it('1d20+5-2 has a modifier of 3', () => {
    expect(trayModifierOf(setLoose(EMPTY_TRAY, '1d20+5-2'))).toBe(3);
  });

  it('no number is 0, an empty tray too', () => {
    expect(trayModifierOf(setLoose(EMPTY_TRAY, '2d6'))).toBe(0);
    expect(trayModifierOf(EMPTY_TRAY)).toBe(0);
  });

  it('an unreadable text has no modifier to read', () => {
    expect(trayModifierOf(setLoose(EMPTY_TRAY, '1d+'))).toBeNull();
  });
});

describe('chooseMode', () => {
  const choiceOf = (loose: string) => ({ ...EMPTY_TRAY_CHOICE, tray: setLoose(EMPTY_TRAY, loose) });

  it('Vantagem on an empty tray puts 1d20 and chooses advantage', () => {
    const chosen = chooseMode(EMPTY_TRAY_CHOICE, 'advantage');
    expect(chosen.tray.loose).toBe('1d20');
    expect(chosen.mode).toBe('advantage');
  });

  it('Desvantagem on +5 puts the d20 before the number: 1d20+5', () => {
    const chosen = chooseMode(choiceOf('+5'), 'disadvantage');
    expect(chosen).toMatchObject({ tray: { loose: '1d20+5' }, mode: 'disadvantage' });
  });

  it('Vantagem with a d6 on the tray only chooses the mode', () => {
    expect(chooseMode(choiceOf('1d6'), 'advantage')).toMatchObject({
      tray: { loose: '1d6' },
      mode: 'advantage',
    });
  });

  it('Normal never touches the tray', () => {
    const choice = { ...EMPTY_TRAY_CHOICE, mode: 'advantage' } as const;
    expect(chooseMode(choice, 'normal')).toEqual({ ...choice, mode: 'normal' });
  });

  it('a blocked tray (1d6!) only takes the mode, and it still applies as normal', () => {
    const chosen = chooseMode(choiceOf('1d6!'), 'advantage');
    expect(chosen.tray.loose).toBe('1d6!');
    expect(appliedModeOf(chosen)).toBe('normal');
  });

  it('the secret choice stays', () => {
    const secret = { ...EMPTY_TRAY_CHOICE, secret: true };
    expect(chooseMode(secret, 'advantage').secret).toBe(true);
  });
});

describe('rollAspectOf', () => {
  it('a 1920 × 1080 window is 16:9', () => {
    expect(rollAspectOf({ width: 1920, height: 1080 })).toBeCloseTo(16 / 9);
  });

  it('a tall phone is held at 0.5 and a very wide window at 3', () => {
    expect(rollAspectOf({ width: 300, height: 1000 })).toBe(0.5);
    expect(rollAspectOf({ width: 4000, height: 1000 })).toBe(3);
  });

  it('a window without height falls back to 1', () => {
    expect(rollAspectOf({ width: 800, height: 0 })).toBe(1);
  });
});
