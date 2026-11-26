import type { RoundCycleConfigDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  NEW_CYCLE_DRAFT,
  draftOfCycle,
  draftProblem,
  fieldsOfDraft,
  holderOfKey,
  keyOfHolder,
  withChooserToggled,
  withPhaseAdded,
  withPhaseMoved,
  withPhaseRemoved,
  withSeerToggled,
} from '@/lib/round-cycle-form';
import { MOON_PHASE_IDS, moonCycle } from '../support/round-cycle-fixtures';

const LYRA = 'user-lyra';
const KAEL = 'user-kael';

describe('the round cycle draft', () => {
  it('a new cycle starts with two empty phases, of the table, seen by everyone', () => {
    expect(NEW_CYCLE_DRAFT).toMatchObject({ name: '', holder: 'table', visibility: 'everyone' });
    expect(NEW_CYCLE_DRAFT.phases.map(({ name }) => name)).toEqual(['', '']);
  });

  it('a saved cycle opens with its phases by id and its config', () => {
    const config: RoundCycleConfigDto = {
      holder: { kind: 'character', characterId: 'char-lyra' },
      visibility: 'some',
      seerIds: [LYRA],
      chooserIds: [LYRA],
    };
    const draft = draftOfCycle(moonCycle({ config }));
    expect(draft).toMatchObject({
      name: 'Fases da Lua',
      holder: 'character:char-lyra',
      seerIds: [LYRA],
    });
    expect(draft.phases.map(({ id }) => id)).toEqual([...MOON_PHASE_IDS]);
  });

  it('the fields keep the seers only for "some" and trim the names', () => {
    const draft = {
      ...NEW_CYCLE_DRAFT,
      name: ' Lua ',
      visibility: 'everyone' as const,
      seerIds: [LYRA],
    };
    const phased = {
      ...draft,
      phases: draft.phases.map((phase, i) => ({ ...phase, name: ` F${i} ` })),
    };
    expect(fieldsOfDraft(phased)).toMatchObject({
      name: 'Lua',
      seerIds: [],
      phases: [
        { name: 'F0', imageAssetId: null },
        { name: 'F1', imageAssetId: null },
      ],
    });
  });

  it('a kept phase goes with its id; a new one without', () => {
    const draft = withPhaseAdded(draftOfCycle(moonCycle()));
    const phases = fieldsOfDraft({
      ...draft,
      phases: draft.phases.map((phase) => ({ ...phase, name: 'X' })),
    }).phases;
    expect(phases.map((phase) => phase.id ?? null)).toEqual([...MOON_PHASE_IDS, null]);
  });

  it.each([
    [{ name: '  ' }, 'Dê um nome ao ciclo.'],
    [{ name: 'Lua', visibility: 'some' as const, seerIds: [] }, 'Escolha quem vê o ciclo.'],
  ])('%j is refused: %s', (change, problem) => {
    const named = {
      ...NEW_CYCLE_DRAFT,
      phases: NEW_CYCLE_DRAFT.phases.map((p) => ({ ...p, name: 'F' })),
    };
    expect(draftProblem({ ...named, ...change })).toBe(problem);
  });

  it('a phase without a name is refused citing its place', () => {
    const draft = { ...NEW_CYCLE_DRAFT, name: 'Lua' };
    expect(draftProblem(draft)).toBe('Dê um nome à fase 1.');
  });

  it('phases are added up to 12, removed down to 2, and moved', () => {
    let draft = NEW_CYCLE_DRAFT;
    for (let i = 0; i < 20; i++) draft = withPhaseAdded(draft);
    expect(draft.phases).toHaveLength(12);
    for (let i = 0; i < 20; i++) draft = withPhaseRemoved(draft, draft.phases[0]?.key ?? '');
    expect(draft.phases).toHaveLength(2);
    const [first, second] = draft.phases;
    const moved = withPhaseMoved(draft, second?.key ?? '', -1);
    expect(moved.phases.map(({ key }) => key)).toEqual([second?.key, first?.key]);
  });

  it('choosing makes one see; no longer seeing stops choosing', () => {
    const chooser = withChooserToggled({ ...NEW_CYCLE_DRAFT, visibility: 'some' }, KAEL);
    expect([chooser.seerIds, chooser.chooserIds]).toEqual([[KAEL], [KAEL]]);
    const unseen = withSeerToggled(chooser, KAEL);
    expect([unseen.seerIds, unseen.chooserIds]).toEqual([[], []]);
  });

  it('the holder key goes both ways', () => {
    for (const holder of [
      { kind: 'table' },
      { kind: 'character', characterId: 'c-1' },
      { kind: 'token', tokenId: 't-1' },
    ] as const) {
      expect(holderOfKey(keyOfHolder(holder))).toEqual(holder);
    }
  });
});
