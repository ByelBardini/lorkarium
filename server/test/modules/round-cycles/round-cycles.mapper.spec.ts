import { describe, expect, it } from 'vitest';
import type {
  CombatCycleState,
  RoundCycleRow,
} from '../../../src/modules/round-cycles/round-cycles.dao';
import {
  roundCycleCutsOf,
  roundCyclesSeenBy,
  toRoundCycleWrite,
} from '../../../src/modules/round-cycles/round-cycles.mapper';
import { roundCycleRow } from '../../support/round-cycles-factories';

const LYRA = 'user-lyra';
const KAEL = 'user-kael';

const moon: RoundCycleRow = roundCycleRow({
  id: 'moon',
  name: 'Fases da Lua',
  visibility: 'some',
  holderCharacterId: 'char-lyra',
  members: [{ userId: LYRA, canSee: true, canChoose: true }],
});
const sky: RoundCycleRow = roundCycleRow({ id: 'sky', name: 'Céu', visibility: 'everyone' });
const tide: RoundCycleRow = roundCycleRow({
  id: 'tide',
  name: 'Maré',
  visibility: 'masters',
  holderTokenId: 'token-kraken',
});
const state: CombatCycleState = {
  combatId: 'combat-1',
  cycleId: 'moon',
  sceneId: 'scene-1',
  round: 3,
  currentPhaseId: 'moon-phase-0',
  chosenPhaseId: 'moon-phase-2',
};

describe('roundCyclesSeenBy', () => {
  it('the master sees every cycle with its config and may choose in all', () => {
    const seen = roundCyclesSeenBy([moon, sky, tide], [state], { kind: 'master' });
    expect(seen.map(({ id, canChoose }) => [id, canChoose])).toEqual([
      ['moon', true],
      ['sky', true],
      ['tide', true],
    ]);
    expect(seen[0]?.config).toEqual({
      holder: { kind: 'character', characterId: 'char-lyra' },
      visibility: 'some',
      seerIds: [LYRA],
      chooserIds: [LYRA],
    });
    expect(seen[2]?.config?.holder).toEqual({ kind: 'token', tokenId: 'token-kraken' });
  });

  it('a seer gets the cycles they see, with no config, and where each stands in combat', () => {
    const seen = roundCyclesSeenBy([moon, sky, tide], [state], { kind: 'member', userId: LYRA });
    expect(seen.map(({ id }) => id)).toEqual(['moon', 'sky']);
    expect(seen[0]).toMatchObject({ canChoose: true, config: null });
    expect(seen[0]?.combats).toEqual([
      {
        sceneId: 'scene-1',
        round: 3,
        currentPhaseId: 'moon-phase-0',
        chosenPhaseId: 'moon-phase-2',
      },
    ]);
    expect(seen[1]?.combats).toEqual([]);
  });

  it('someone not named sees only what everyone sees, without choosing', () => {
    const seen = roundCyclesSeenBy([moon, sky, tide], [state], { kind: 'member', userId: KAEL });
    expect(seen.map(({ id, canChoose }) => [id, canChoose])).toEqual([['sky', false]]);
  });
});

describe('roundCycleCutsOf', () => {
  it('one list for the masters, one per named member and one for the rest', () => {
    const cuts = roundCycleCutsOf([moon, sky, tide], []);
    expect(cuts.masters.map(({ id }) => id)).toEqual(['moon', 'sky', 'tide']);
    expect(cuts.members.map(({ userId, cycles }) => [userId, cycles.map(({ id }) => id)])).toEqual([
      [LYRA, ['moon', 'sky']],
    ]);
    expect(cuts.rest.map(({ id }) => id)).toEqual(['sky']);
  });
});

describe('toRoundCycleWrite', () => {
  it('the holder of the command becomes the one column it fills', () => {
    const fields = { name: 'Maré', visibility: 'masters', announce: false, phases: [] } as const;
    const ofToken = toRoundCycleWrite({ ...fields, holder: { kind: 'token', tokenId: 't-1' } }, []);
    const ofTable = toRoundCycleWrite({ ...fields, holder: { kind: 'table' } }, []);
    expect([ofToken.holderCharacterId, ofToken.holderTokenId]).toEqual([null, 't-1']);
    expect([ofTable.holderCharacterId, ofTable.holderTokenId]).toEqual([null, null]);
  });
});
