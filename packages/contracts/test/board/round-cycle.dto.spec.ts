import { describe, expect, it } from 'vitest';
import {
  ROUND_CYCLE_NAME_MAX_LENGTH,
  chooseNextPhaseCommandDto,
  defineRoundCycleCommandDto,
  updateRoundCycleCommandDto,
} from '../../src/board/round-cycle.dto';

const BASE = {
  actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
  campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
};
const LYRA_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const KAEL_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const CHARACTER_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const CYCLE_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const PHASE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const phase = (name: string) => ({ name, imageAssetId: null });
const MOON = ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante'].map(phase);

const moonCycle = {
  ...BASE,
  name: 'Fases da Lua',
  holder: { kind: 'character', characterId: CHARACTER_ID },
  visibility: 'some',
  seerIds: [LYRA_ID],
  chooserIds: [LYRA_ID],
  announce: true,
  phases: MOON,
};

describe('defineRoundCycleCommandDto', () => {
  it('a cycle of a character seen and chosen by one player is accepted', () => {
    expect(defineRoundCycleCommandDto.parse(moonCycle).phases).toHaveLength(4);
  });

  it('a table cycle seen by everyone, with a chooser who is not in seerIds, is accepted', () => {
    const parsed = defineRoundCycleCommandDto.parse({
      ...moonCycle,
      holder: { kind: 'table' },
      visibility: 'everyone',
      seerIds: [],
      chooserIds: [KAEL_ID],
    });
    expect(parsed.holder).toEqual({ kind: 'table' });
  });

  it.each([1, 13])('%s phases are refused', (count) => {
    const phases = Array.from({ length: count }, (_, i) => phase(`Fase ${i}`));
    expect(defineRoundCycleCommandDto.safeParse({ ...moonCycle, phases }).success).toBe(false);
  });

  it('a name past the limit is refused', () => {
    const name = 'x'.repeat(ROUND_CYCLE_NAME_MAX_LENGTH + 1);
    expect(defineRoundCycleCommandDto.safeParse({ ...moonCycle, name }).success).toBe(false);
  });

  it('seerIds with a visibility other than some is refused naming the field', () => {
    const result = defineRoundCycleCommandDto.safeParse({ ...moonCycle, visibility: 'everyone' });
    expect(result.error?.issues[0]?.message).toMatch(/seerIds only with visibility some.*everyone/);
  });

  it('visibility some with nobody in seerIds is refused', () => {
    const result = defineRoundCycleCommandDto.safeParse({ ...moonCycle, seerIds: [] });
    expect(result.error?.issues[0]?.message).toMatch(/visibility some needs at least one seer/);
  });

  it('a member repeated in chooserIds is refused citing the id', () => {
    const result = defineRoundCycleCommandDto.safeParse({
      ...moonCycle,
      chooserIds: [LYRA_ID, LYRA_ID],
    });
    expect(result.error?.issues[0]?.message).toContain(LYRA_ID);
  });
});

describe('updateRoundCycleCommandDto', () => {
  it('a phase kept by its id and a new one without id are accepted', () => {
    const parsed = updateRoundCycleCommandDto.parse({
      ...moonCycle,
      cycleId: CYCLE_ID,
      phases: [{ id: PHASE_ID, ...phase('Lua Nova') }, phase('Lua Cheia')],
    });
    expect(parsed.phases.map((one) => one.id ?? null)).toEqual([PHASE_ID, null]);
  });

  it('the same phase id twice is refused citing it', () => {
    const result = updateRoundCycleCommandDto.safeParse({
      ...moonCycle,
      cycleId: CYCLE_ID,
      phases: [
        { id: PHASE_ID, ...phase('Lua Nova') },
        { id: PHASE_ID, ...phase('Lua Cheia') },
      ],
    });
    expect(result.error?.issues[0]?.message).toContain(PHASE_ID);
  });
});

describe('chooseNextPhaseCommandDto', () => {
  it('null phaseId (follow the cycle) is accepted', () => {
    const parsed = chooseNextPhaseCommandDto.parse({ ...BASE, cycleId: CYCLE_ID, phaseId: null });
    expect(parsed.phaseId).toBeNull();
  });

  it('a missing phaseId is refused (absent is not null)', () => {
    expect(chooseNextPhaseCommandDto.safeParse({ ...BASE, cycleId: CYCLE_ID }).success).toBe(false);
  });
});
