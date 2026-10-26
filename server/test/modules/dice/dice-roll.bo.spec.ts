import { DICE_THROW_MODELS_MAX } from '@lorkarium/contracts';
import type { DieRequest } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import type { DieThrowModel } from '../../../src/modules/dice/dice-physics.port';
import {
  DiceWavesBo,
  audienceOf,
  modeledOf,
  requireReadableDice,
  revealDelayOf,
} from '../../../src/modules/dice/dice-roll.bo';
import { InvalidDiceExpressionError } from '../../../src/modules/dice/dice.error';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID } from '../../support/campaigns-factories';
import { RESTING_FRAMES } from '../../support/dice-fakes';

const MAX = DICE_THROW_MODELS_MAX;

function requests(count: number, sides: number, term = 0): DieRequest[] {
  return Array.from({ length: count }, () => ({ part: 0, term, sides }));
}

function model(
  kind: DieThrowModel['kind'],
  value: number,
  startMs = 0,
  settleMs = 1500,
): DieThrowModel {
  return { kind, startMs, settleMs, frames: RESTING_FRAMES, value, rethrows: 0 };
}

describe('modeledOf', () => {
  it('25 d6: the first 20 get a model, the other 5 are drawn by crypto', () => {
    const plans = modeledOf(requests(25, 6), 0, MAX);

    expect(plans.slice(0, 20).every((plan) => plan.join() === 'd6')).toBe(true);
    expect(plans.slice(20)).toEqual([[], [], [], [], []]);
  });

  it('11 d100: 10 get the tens and units models (each counts 2), the 11th none', () => {
    const plans = modeledOf(requests(11, 100), 0, MAX);

    expect(plans.slice(0, 10).every((plan) => plan.join() === 'd100tens,d10')).toBe(true);
    expect(plans[10]).toEqual([]);
  });

  it('a d7 has no 3D shape: no model', () => {
    expect(modeledOf(requests(2, 7), 0, MAX)).toEqual([[], []]);
  });

  it('a later wave counts the models already thrown: 18 used leave room for 2 d6', () => {
    expect(modeledOf(requests(3, 6), 18, MAX)).toEqual([['d6'], ['d6'], []]);
  });

  it('with one slot left a d100 gets none, but a d6 after it still takes the slot', () => {
    const wave = [...requests(1, 100), ...requests(1, 6, 1)];

    expect(modeledOf(wave, 19, MAX)).toEqual([[], ['d6']]);
  });
});

describe('audienceOf', () => {
  it('a public roll goes to the whole table', () => {
    expect(audienceOf('public', BIA_ID, false)).toEqual({ kind: 'table' });
  });

  it('Bia (a player) rolling for the masters: the masters and Bia', () => {
    expect(audienceOf('masters', BIA_ID, false)).toEqual({ kind: 'masters', userIds: [BIA_ID] });
  });

  it('Ana (the master) rolling for the masters: only the masters', () => {
    expect(audienceOf('masters', ANA_ID, true)).toEqual({ kind: 'masters', userIds: [] });
  });
});

describe('revealDelayOf', () => {
  it('without models the "…" lasts 800 ms', () => {
    expect(revealDelayOf([])).toBe(800);
  });

  it('with models it lasts until the last one settles', () => {
    expect(revealDelayOf([{ settleMs: 1200 }, { settleMs: 3100 }, { settleMs: 900 }])).toBe(3100);
  });
});

describe('DiceWavesBo', () => {
  it('the first wave starts at 0 and the next one 300 ms after the last model settled', () => {
    const waves = new DiceWavesBo(MAX);
    expect(waves.nextStartMs()).toBe(0);

    const wave = requests(2, 6);
    waves.land(wave, waves.planOf(wave), [model('d6', 6, 0, 1400), model('d6', 2, 0, 1700)], []);

    expect(waves.nextStartMs()).toBe(2000);
  });

  it('a d100 joins its tens and units models; a d10 face 10 counts as units 0', () => {
    const waves = new DiceWavesBo(MAX);
    const wave = requests(2, 100);
    const thrown = [model('d100tens', 90), model('d10', 5), model('d100tens', 0), model('d10', 10)];

    expect(waves.land(wave, waves.planOf(wave), thrown, [])).toEqual([95, 100]);
    expect(waves.indicesOf()).toEqual([
      [
        [
          [0, 1],
          [2, 3],
        ],
      ],
    ]);
  });

  it('crypto faces fill the dice without a model, in request order', () => {
    const waves = new DiceWavesBo(MAX);
    const wave = [...requests(1, 7), ...requests(1, 20, 1), ...requests(1, 7, 2)];

    const values = waves.land(wave, waves.planOf(wave), [model('d20', 17)], [3, 5]);

    expect(values).toEqual([3, 17, 5]);
    expect(waves.indicesOf()).toEqual([[[undefined], [[0]], [undefined]]]);
  });

  it('a die with no face for it is a RangeError citing the request', () => {
    const waves = new DiceWavesBo(MAX);
    const wave = requests(1, 7);

    expect(() => waves.land(wave, waves.planOf(wave), [], [])).toThrow(
      new RangeError('Die of part 0 term 0 (d7) got no value: expected one face per request.'),
    );
  });
});

describe('requireReadableDice', () => {
  it('a piece that does not read names it (from 1) with the game-core reason', () => {
    const read = (): void => requireReadableDice(['1d20', '2d']);

    expect(read).toThrow(InvalidDiceExpressionError);
    expect(read).toThrow(
      'part 2 ("2d") cannot be read: Expected the number of sides at position 2; got the end of the expression.',
    );
  });

  it('a composition past 1000 dice is refused as the whole roll', () => {
    expect(() => requireReadableDice(['600d6', '401d6'])).toThrow(
      'the roll cannot be read: Dice roll has 1001 dice: expected at most 1000.',
    );
  });
});
