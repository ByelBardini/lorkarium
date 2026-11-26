import { describe, expect, it } from 'vitest';
import {
  planCombatCycles,
  type CycleInCombat,
} from '../../../src/modules/round-cycles/combat-cycles.bo';

const phases = (id: string, names: readonly string[]) =>
  names.map((name, i) => ({ id: `${id}-${i}`, name, imageAssetId: i === 2 ? 'img-cheia' : null }));

const moon: CycleInCombat = {
  id: 'moon',
  name: 'Fases da Lua',
  announce: true,
  holder: { kind: 'character', characterId: 'char-lyra' },
  phases: phases('moon', ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante']),
};
const tide: CycleInCombat = {
  id: 'tide',
  name: 'Maré',
  announce: false,
  holder: { kind: 'token', tokenId: 'token-kraken' },
  phases: phases('tide', ['Baixa', 'Subindo', 'Alta']),
};
const sky: CycleInCombat = {
  id: 'sky',
  name: 'Céu',
  announce: false,
  holder: { kind: 'table' },
  phases: phases('sky', ['Dia', 'Noite']),
};
const lyraOnly = { characterIds: new Set(['char-lyra']), tokenIds: new Set<string>() };
const both = { characterIds: new Set(['char-lyra']), tokenIds: new Set(['token-kraken']) };

describe('planCombatCycles', () => {
  it('a combat that starts puts the table cycles and those of holders in it on their first phase', () => {
    const plan = planCombatCycles({
      cycles: [moon, tide, sky],
      states: [],
      present: lyraOnly,
      moment: 'start',
    });
    expect(plan.start).toEqual([
      { cycleId: 'moon', currentPhaseId: 'moon-0' },
      { cycleId: 'sky', currentPhaseId: 'sky-0' },
    ]);
    expect([plan.remove, plan.turn]).toEqual([[], []]);
  });

  it('the start announces the first phase of the cycles that announce', () => {
    const plan = planCombatCycles({
      cycles: [moon, sky],
      states: [],
      present: lyraOnly,
      moment: 'start',
    });
    expect(plan.announced).toEqual([
      {
        cycleId: 'moon',
        cycleName: 'Fases da Lua',
        phase: { name: 'Lua Nova', imageAssetId: null },
      },
    ]);
  });

  it('a new round moves each cycle on: the chosen phase or the following one', () => {
    const plan = planCombatCycles({
      cycles: [moon, sky],
      states: [
        { cycleId: 'moon', currentPhaseId: 'moon-0', chosenPhaseId: 'moon-2' },
        { cycleId: 'sky', currentPhaseId: 'sky-1', chosenPhaseId: null },
      ],
      present: lyraOnly,
      moment: 'round',
    });
    expect(plan.turn).toEqual([
      { cycleId: 'moon', currentPhaseId: 'moon-2' },
      { cycleId: 'sky', currentPhaseId: 'sky-0' },
    ]);
    expect(plan.announced).toEqual([
      {
        cycleId: 'moon',
        cycleName: 'Fases da Lua',
        phase: { name: 'Lua Cheia', imageAssetId: 'img-cheia' },
      },
    ]);
  });

  it('a turn inside the round moves nothing and announces nothing', () => {
    const plan = planCombatCycles({
      cycles: [moon],
      states: [{ cycleId: 'moon', currentPhaseId: 'moon-0', chosenPhaseId: null }],
      present: lyraOnly,
      moment: 'roster',
    });
    expect(plan).toEqual({ start: [], remove: [], turn: [], announced: [], changed: false });
  });

  it('a holder that joins mid-combat starts its cycle on the first phase, unannounced', () => {
    const plan = planCombatCycles({
      cycles: [moon, tide],
      states: [{ cycleId: 'moon', currentPhaseId: 'moon-1', chosenPhaseId: null }],
      present: both,
      moment: 'roster',
    });
    expect(plan.start).toEqual([{ cycleId: 'tide', currentPhaseId: 'tide-0' }]);
    expect([plan.announced, plan.changed]).toEqual([[], true]);
  });

  it('a holder that leaves the combat takes its cycle out', () => {
    const plan = planCombatCycles({
      cycles: [moon, tide],
      states: [
        { cycleId: 'moon', currentPhaseId: 'moon-1', chosenPhaseId: null },
        { cycleId: 'tide', currentPhaseId: 'tide-2', chosenPhaseId: null },
      ],
      present: lyraOnly,
      moment: 'round',
    });
    expect(plan.remove).toEqual(['tide']);
    expect(plan.turn).toEqual([{ cycleId: 'moon', currentPhaseId: 'moon-2' }]);
  });

  it('the end of the combat takes every cycle out', () => {
    const plan = planCombatCycles({
      cycles: [moon, sky],
      states: [
        { cycleId: 'moon', currentPhaseId: 'moon-1', chosenPhaseId: null },
        { cycleId: 'sky', currentPhaseId: 'sky-0', chosenPhaseId: null },
      ],
      present: lyraOnly,
      moment: 'end',
    });
    expect([plan.remove, plan.start, plan.turn]).toEqual([['moon', 'sky'], [], []]);
  });
});
