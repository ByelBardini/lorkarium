import type { ConditionIconDto, RoundCycleAnnouncementDto } from '@lorkarium/contracts';
import {
  activeCyclesOf,
  cycleStart,
  turnCycle,
  type CycleHolder,
  type CycleHoldersPresent,
} from '@lorkarium/game-core';
import type { CombatCyclePhase } from './round-cycles.dao';

/** A cycle as the combat reads it: whose it is, whether it announces and its phases in order. */
export type CycleInCombat = Readonly<{
  id: string;
  name: string;
  announce: boolean;
  holder: CycleHolder;
  phases: readonly Readonly<{
    id: string;
    name: string;
    icon: ConditionIconDto;
    imageAssetId: string | null;
  }>[];
}>;

/** Where one cycle stands in this combat. */
export type CycleStanding = Readonly<{
  cycleId: string;
  currentPhaseId: string | null;
  chosenPhaseId: string | null;
}>;

/** What happened to the combat: it started, a new round began, it ended, or its roster changed
 *  (an entry came in or left) inside the round. */
export type CombatMoment = 'start' | 'round' | 'roster' | 'end';

export type CombatCyclesInput = Readonly<{
  cycles: readonly CycleInCombat[];
  states: readonly CycleStanding[];
  present: CycleHoldersPresent;
  moment: CombatMoment;
}>;

/** What the combat does to its cycles: which enter, which leave, which turn, what is announced. */
export type CombatCyclesPlan = Readonly<{
  start: CombatCyclePhase[];
  remove: string[];
  turn: CombatCyclePhase[];
  announced: RoundCycleAnnouncementDto[];
  changed: boolean;
}>;

/** The cycles of one combat after `moment` (spec §3.16): the cycles that play (the table's and
 *  those of holders in it, by the game-core) enter on their first phase, the rest leave, and a
 *  new round turns the ones that stay. The start and each new round announce the phase of the
 *  cycles that announce; an entry joining mid-round does not.
 *
 *  Example: `planCombatCycles({ cycles, states, present, moment: 'round' }).turn` */
export function planCombatCycles(input: CombatCyclesInput): CombatCyclesPlan {
  const active = input.moment === 'end' ? [] : activeCyclesOf(input.cycles, input.present);
  const standing = new Map(input.states.map((state) => [state.cycleId, state]));
  const entering = active.filter(({ id }) => !standing.has(id));
  const staying = active.filter(({ id }) => standing.has(id));
  const activeIds = new Set(active.map(({ id }) => id));
  const remove = input.states
    .filter(({ cycleId }) => !activeIds.has(cycleId))
    .map(({ cycleId }) => cycleId);
  const start = entering.map((cycle) => ({ cycleId: cycle.id, currentPhaseId: firstOf(cycle) }));
  const turn = input.moment === 'round' ? staying.map((cycle) => turnedOf(cycle, standing)) : [];
  const announced = announcedOf(input.moment === 'start' ? start : turn, input.cycles);
  const changed = start.length + remove.length + turn.length > 0;
  return { start, remove, turn, announced, changed };
}

function firstOf(cycle: CycleInCombat): string | null {
  return cycleStart(cycle.phases.map(({ id }) => id)).currentId;
}

function turnedOf(
  cycle: CycleInCombat,
  standing: ReadonlyMap<string, CycleStanding>,
): CombatCyclePhase {
  const state = standing.get(cycle.id) ?? { currentPhaseId: null, chosenPhaseId: null };
  const ids = cycle.phases.map(({ id }) => id);
  const turned = turnCycle(ids, { currentId: state.currentPhaseId, chosenId: state.chosenPhaseId });
  return { cycleId: cycle.id, currentPhaseId: turned.currentId };
}

function announcedOf(
  phases: readonly CombatCyclePhase[],
  cycles: readonly CycleInCombat[],
): RoundCycleAnnouncementDto[] {
  return phases.flatMap(({ cycleId, currentPhaseId }) => {
    const cycle = cycles.find(({ id }) => id === cycleId);
    const phase = cycle?.phases.find(({ id }) => id === currentPhaseId);
    if (!cycle?.announce || !phase) return [];
    const { name, icon, imageAssetId } = phase;
    return [{ cycleId, cycleName: cycle.name, phase: { name, icon, imageAssetId } }];
  });
}
