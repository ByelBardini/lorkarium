import type { CombatantCopy, ConditionCopy, EncounterCopy } from '@/copy/landing-copy';

export type CombatantState = Pick<CombatantCopy, 'name' | 'hp' | 'maxHp' | 'conditions'>;

export interface EncounterState {
  round: number;
  /** Index in `combatants` of whoever has the turn. */
  turnIndex: number;
  /** Steps played since the initial state; the script loops after `ENCOUNTER_SCRIPT_STEPS`. */
  step: number;
  combatants: readonly CombatantState[];
}

/** Two full rounds from the Ogre: Kael hits twice and Poisoned runs out on the last step. */
export const ENCOUNTER_SCRIPT_STEPS = 10;

const STAGED_HIT = { attacker: 'Kael', target: 'Ogro das Cinzas', damage: 12 } as const;

/**
 * The tracker state the landing copy describes, with the turn on the combatant that has it.
 * Example: `initialEncounterState(landingCopy.encounter) // { round: 3, turnIndex: 3, step: 0, … }`
 */
export function initialEncounterState(copy: EncounterCopy): EncounterState {
  const holders = copy.combatants.filter((combatant) => combatant.hasTurn).length;
  if (holders !== 1) {
    throw new RangeError(
      `encounter has ${holders} combatants with the turn among ${copy.combatants.length}: expected exactly one`,
    );
  }
  const combatants = copy.combatants.map(({ name, hp, maxHp, conditions }) => ({
    name,
    hp,
    maxHp,
    conditions,
  }));
  const turnIndex = copy.combatants.findIndex((combatant) => combatant.hasTurn);
  return { round: copy.round, turnIndex, step: 0, combatants };
}

/**
 * The staged step after `state`: the turn passes, the holder's durations go down and, on
 * Kael's turn, the Ogre takes the hit; after the last scripted step it is `initial` again.
 * Example: `nextEncounterStep(initial, initial).turnIndex // 4 (Thoren)`
 */
export function nextEncounterStep(state: EncounterState, initial: EncounterState): EncounterState {
  if (state.step >= ENCOUNTER_SCRIPT_STEPS) return initial;
  const turnIndex = (state.turnIndex + 1) % state.combatants.length;
  const round = turnIndex === 0 ? state.round + 1 : state.round;
  const ticked = state.combatants.map((combatant, index) =>
    index === turnIndex
      ? { ...combatant, conditions: tickedConditions(combatant.conditions) }
      : combatant,
  );
  return { round, turnIndex, step: state.step + 1, combatants: stagedHitOn(ticked, turnIndex) };
}

function tickedConditions(conditions: readonly ConditionCopy[]): ConditionCopy[] {
  return conditions.flatMap((condition) => {
    if (condition.rounds === null) return [condition];
    if (condition.rounds <= 1) return [];
    return [{ ...condition, rounds: condition.rounds - 1 }];
  });
}

function stagedHitOn(
  combatants: readonly CombatantState[],
  turnIndex: number,
): readonly CombatantState[] {
  if (combatants[turnIndex]?.name !== STAGED_HIT.attacker) return combatants;
  return combatants.map((combatant) =>
    combatant.name === STAGED_HIT.target
      ? { ...combatant, hp: Math.max(0, combatant.hp - STAGED_HIT.damage) }
      : combatant,
  );
}
