import { describe, expect, it } from 'vitest';
import { landingCopy, type EncounterCopy } from '@/copy/landing-copy';
import {
  initialEncounterState,
  nextEncounterStep,
  type EncounterState,
} from '@/lib/encounter-round';

const ENCOUNTER = landingCopy.encounter;
const LYRA = 0;
const KAEL = 2;
const OGRE = 3;
const THOREN = 4;

function afterSteps(count: number, encounter: EncounterCopy = ENCOUNTER): EncounterState {
  const initial = initialEncounterState(encounter);
  let state = initial;
  for (let step = 0; step < count; step += 1) state = nextEncounterStep(state, initial);
  return state;
}

function conditionsOf(state: EncounterState, index: number): unknown {
  return state.combatants[index]?.conditions;
}

describe('initialEncounterState', () => {
  it('starts at round 3 with the turn on the Ogre', () => {
    const state = initialEncounterState(ENCOUNTER);

    expect(state.round).toBe(3);
    expect(state.turnIndex).toBe(OGRE);
    expect(state.step).toBe(0);
    expect(state.combatants.map((combatant) => combatant.hp)).toEqual([22, 44, 38, 41, 6]);
  });

  it('an encounter where nobody has the turn is refused citing the count', () => {
    const nobody = {
      round: 1,
      combatants: ENCOUNTER.combatants.map((combatant) => ({ ...combatant, hasTurn: false })),
    };

    expect(() => initialEncounterState(nobody)).toThrow(
      new RangeError('encounter has 0 combatants with the turn among 5: expected exactly one'),
    );
  });
});

describe('nextEncounterStep', () => {
  it('passes the turn from the Ogre to Thoren in the same round', () => {
    const state = afterSteps(1);

    expect(state.turnIndex).toBe(THOREN);
    expect(state.round).toBe(3);
  });

  it('after the last in the order the turn goes back to Lyra and the round turns to 4', () => {
    const state = afterSteps(2);

    expect(state.turnIndex).toBe(LYRA);
    expect(state.round).toBe(4);
  });

  it('a duration goes down at the start of the turn of whoever has it, and only theirs', () => {
    const state = afterSteps(1);

    expect(conditionsOf(state, THOREN)).toEqual([{ name: 'Abençoado', rounds: 7 }]);
    expect(conditionsOf(state, KAEL)).toEqual([{ name: 'Abençoado', rounds: 8 }]);
    expect(conditionsOf(state, OGRE)).toEqual([{ name: 'Envenenado', rounds: 2 }]);
  });

  it('Poisoned 2 drops to 1 at the start of the Ogre turn', () => {
    const state = afterSteps(5);

    expect(state.turnIndex).toBe(OGRE);
    expect(conditionsOf(state, OGRE)).toEqual([{ name: 'Envenenado', rounds: 1 }]);
  });

  it('a condition with 1 round left ends at the start of the next turn of its holder', () => {
    const state = afterSteps(10);

    expect(state.turnIndex).toBe(OGRE);
    expect(conditionsOf(state, OGRE)).toEqual([]);
  });

  it('a condition without a limit never goes down', () => {
    const state = afterSteps(7);

    expect(state.turnIndex).toBe(LYRA);
    expect(conditionsOf(state, LYRA)).toEqual([{ name: 'Concentrando', rounds: null }]);
  });

  it('on the Kael turn the Ogre takes 12 damage, 41 to 29 and then 17', () => {
    expect(afterSteps(3).combatants[OGRE]?.hp).toBe(41);
    expect(afterSteps(4).combatants[OGRE]?.hp).toBe(29);
    expect(afterSteps(9).combatants[OGRE]?.hp).toBe(17);
  });

  it('the staged hit never takes hit points below 0', () => {
    const weakOgre = {
      ...ENCOUNTER,
      combatants: ENCOUNTER.combatants.map((combatant, index) =>
        index === OGRE ? { ...combatant, hp: 5 } : combatant,
      ),
    };

    expect(afterSteps(4, weakOgre).combatants[OGRE]?.hp).toBe(0);
  });

  it('after the last scripted step it loops back to the initial state', () => {
    expect(afterSteps(11)).toEqual(initialEncounterState(ENCOUNTER));
    expect(afterSteps(12)).toEqual(afterSteps(1));
  });

  it('playing the whole script leaves the initial state and the copy untouched', () => {
    const initial = initialEncounterState(ENCOUNTER);
    let state = initial;
    for (let step = 0; step < 10; step += 1) state = nextEncounterStep(state, initial);

    expect(state.combatants[OGRE]?.hp).toBe(17);
    expect(initial.combatants[OGRE]).toEqual({
      name: 'Ogro das Cinzas',
      hp: 41,
      maxHp: 68,
      conditions: [{ name: 'Envenenado', rounds: 2 }],
    });
    expect(ENCOUNTER.combatants[OGRE]).toMatchObject({
      hp: 41,
      conditions: [{ name: 'Envenenado', rounds: 2 }],
    });
  });
});
