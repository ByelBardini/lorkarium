import { describe, expect, it } from 'vitest';
import {
  activeCyclesOf,
  cycleStart,
  nextPhaseOf,
  turnCycle,
  type CycleHolder,
} from '../src/round-cycle';

const MOON = ['nova', 'crescente', 'cheia', 'minguante'];

describe('turnCycle', () => {
  it('with no choice the cycle moves to the following phase', () => {
    expect(turnCycle(MOON, { currentId: 'nova', chosenId: null })).toEqual({
      currentId: 'crescente',
      chosenId: null,
    });
  });

  it('after the last phase the cycle goes back to the first', () => {
    expect(turnCycle(MOON, { currentId: 'minguante', chosenId: null }).currentId).toBe('nova');
  });

  it('a chosen phase is played next and the choice is spent', () => {
    expect(turnCycle(MOON, { currentId: 'nova', chosenId: 'cheia' })).toEqual({
      currentId: 'cheia',
      chosenId: null,
    });
  });

  it('after a chosen phase the cycle goes on from it', () => {
    const chosen = turnCycle(MOON, { currentId: 'nova', chosenId: 'cheia' });
    expect(turnCycle(MOON, chosen).currentId).toBe('minguante');
  });

  it('choosing the current phase repeats it', () => {
    expect(turnCycle(MOON, { currentId: 'cheia', chosenId: 'cheia' }).currentId).toBe('cheia');
  });

  it('a current phase that was deleted (null) restarts at the first phase', () => {
    expect(turnCycle(MOON, { currentId: null, chosenId: null }).currentId).toBe('nova');
  });

  it('a current phase no longer in the list restarts at the first phase', () => {
    expect(turnCycle(MOON, { currentId: 'gone', chosenId: null }).currentId).toBe('nova');
  });

  it('a chosen phase no longer in the list is ignored and the cycle follows', () => {
    expect(turnCycle(MOON, { currentId: 'nova', chosenId: 'gone' }).currentId).toBe('crescente');
  });
});

describe('nextPhaseOf', () => {
  it('is the chosen phase when there is one, else the following', () => {
    expect(nextPhaseOf(MOON, { currentId: 'cheia', chosenId: 'nova' })).toBe('nova');
    expect(nextPhaseOf(MOON, { currentId: 'cheia', chosenId: null })).toBe('minguante');
  });
});

describe('cycleStart', () => {
  it('every combat starts at the first phase', () => {
    expect(cycleStart(MOON)).toEqual({ currentId: 'nova', chosenId: null });
  });

  it('a cycle with no phase starts nowhere', () => {
    expect(cycleStart([])).toEqual({ currentId: null, chosenId: null });
  });
});

describe('activeCyclesOf', () => {
  type Cycle = { id: string; holder: CycleHolder };
  const table: Cycle = { id: 'table', holder: { kind: 'table' } };
  const lyra: Cycle = { id: 'moon', holder: { kind: 'character', characterId: 'lyra' } };
  const kraken: Cycle = { id: 'tide', holder: { kind: 'token', tokenId: 'kraken' } };
  const cycles = [lyra, table, kraken];

  it('the table cycles and the cycles of holders in the combat are active, in list order', () => {
    const present = { characterIds: new Set(['lyra']), tokenIds: new Set(['kraken']) };
    expect(activeCyclesOf(cycles, present).map(({ id }) => id)).toEqual(['moon', 'table', 'tide']);
  });

  it('a holder out of the combat leaves its cycle out', () => {
    const present = { characterIds: new Set<string>(), tokenIds: new Set(['kraken']) };
    expect(activeCyclesOf(cycles, present).map(({ id }) => id)).toEqual(['table', 'tide']);
  });

  it('a character id never activates a token cycle with the same id', () => {
    const present = { characterIds: new Set(['kraken']), tokenIds: new Set<string>() };
    expect(activeCyclesOf(cycles, present).map(({ id }) => id)).toEqual(['table']);
  });
});
