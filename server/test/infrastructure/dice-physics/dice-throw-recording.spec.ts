import { diceThrowDto } from '@lorkarium/contracts';
import { encodeDiceFrames } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  diceThrowRecordingOf,
  settlesNearCentre,
  type RecordedDiceThrow,
} from '../../../src/infrastructure/dice-physics/dice-throw-recording';
import { DicePhysicsFake } from '../../support/dice-fakes';

const WIDE = 16 / 9;
const VALUES = [17, 3, 20, 1, 11, 9, 14, 6, 2, 8, 19, 4, 7, 5, 12, 1, 18, 3];

describe('diceThrowRecordingOf', () => {
  it('records perSet throws of every set, each one accepted by diceThrowDto with its values', () => {
    const physics = new DicePhysicsFake([...VALUES]);

    const recorded = diceThrowRecordingOf({
      physics,
      sets: [['d20'], ['d20', 'd8']],
      perSet: 6,
      aspect: WIDE,
    });

    expect(recorded).toHaveLength(12);
    expect(recorded.every((item) => diceThrowDto.safeParse(item.throw).success)).toBe(true);
    expect(recorded.map((item) => item.values)).toEqual([
      [17],
      [3],
      [20],
      [1],
      [11],
      [9],
      [14, 6],
      [2, 8],
      [19, 4],
      [7, 5],
      [12, 1],
      [18, 3],
    ]);
  });

  it('throws each recording on its own from the start, in the box of the given aspect', () => {
    const physics = new DicePhysicsFake();

    const recorded = diceThrowRecordingOf({ physics, sets: [['d20', 'd8']], perSet: 2, aspect: 2 });

    expect(physics.throws).toEqual([
      { kinds: ['d20', 'd8'], aspect: 2, startMs: 0 },
      { kinds: ['d20', 'd8'], aspect: 2, startMs: 0 },
    ]);
    expect(recorded[0]?.throw.aspect).toBe(2);
    expect(recorded[0]?.throw.models.map((model) => model.kind)).toEqual(['d20', 'd8']);
  });

  it('perSet 0 records nothing and never throws a die', () => {
    const physics = new DicePhysicsFake();

    const recorded = diceThrowRecordingOf({ physics, sets: [['d20']], perSet: 0, aspect: WIDE });

    expect(recorded).toEqual([]);
    expect(physics.throws).toEqual([]);
  });

  it('a kind without a 3D model is refused naming the kind and the accepted ones', () => {
    const physics = new DicePhysicsFake();
    const sets = [['d20'], ['d7']];

    expect(() => diceThrowRecordingOf({ physics, sets, perSet: 6, aspect: WIDE })).toThrow(
      'Die kind "d7" in set 2 has no 3D model: expected one of d4, d6, d8, d10, d100tens, d12, d20.',
    );
    expect(physics.throws).toEqual([]);
  });

  it('an empty set is refused naming its position and size', () => {
    const physics = new DicePhysicsFake();

    expect(() =>
      diceThrowRecordingOf({ physics, sets: [['d20'], []], perSet: 1, aspect: WIDE }),
    ).toThrow('Dice set 2 has 0 dice: expected 1 to 20 modeled dice.');
  });

  it('a set past the 20 models of one throw is refused with its size', () => {
    const physics = new DicePhysicsFake();
    const crowded = Array.from({ length: 21 }, () => 'd6');

    expect(() =>
      diceThrowRecordingOf({ physics, sets: [crowded], perSet: 1, aspect: WIDE }),
    ).toThrow('Dice set 1 has 21 dice: expected 1 to 20 modeled dice.');
  });

  it('a perSet that is not a whole number from 0 is refused with the value', () => {
    const physics = new DicePhysicsFake();

    expect(() =>
      diceThrowRecordingOf({ physics, sets: [['d20']], perSet: 1.5, aspect: WIDE }),
    ).toThrow('Throws per set 1.5 is invalid: expected a whole number from 0.');
  });
});

// The 16:9 box is ±14.2 × ±8 units (diceBoxOf): a die resting at x = 13 lies against the side.
function restingAt(...ends: readonly { x: number; z: number }[]): RecordedDiceThrow {
  const models = ends.map(({ x, z }) => ({
    kind: 'd20' as const,
    startMs: 0,
    settleMs: 1500,
    frames: encodeDiceFrames([
      { position: { x: 0, y: 6, z: 7 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
      { position: { x, y: 1, z }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
    ]),
  }));
  return { throw: { aspect: WIDE, frameMs: 1000 / 30, models }, values: ends.map(() => 7) };
}

describe('settlesNearCentre', () => {
  it('keeps a throw whose dice rest inside the central share of the box', () => {
    expect(settlesNearCentre(restingAt({ x: 2, z: -1 }), 0.45)).toBe(true);
  });

  it('drops a throw that rests against a side, wherever it flew before', () => {
    expect(settlesNearCentre(restingAt({ x: 13, z: 0 }), 0.45)).toBe(false);
  });

  it('drops a throw when any one of its dice rests outside', () => {
    expect(settlesNearCentre(restingAt({ x: 0, z: 0 }, { x: 0, z: 7 }), 0.45)).toBe(false);
  });

  it.each([0, 1.5])('refuses a share of %s naming the range expected', (share) => {
    expect(() => settlesNearCentre(restingAt({ x: 0, z: 0 }), share)).toThrow(/share.*\(0, 1\]/);
  });
});
