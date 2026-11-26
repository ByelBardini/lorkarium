import { beforeEach, describe, expect, it } from 'vitest';
import { RoundCyclesService } from '../../../src/modules/round-cycles/round-cycles.service';
import type { DefineRoundCycle } from '../../../src/modules/round-cycles/round-cycles.service';
import { newAssetPo } from '../../support/assets-factories';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { ClockFake } from '../../support/auth-fakes';
import { campaignMemberPo } from '../../support/campaigns-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import { CharactersDaoFake } from '../../support/characters-fakes';
import {
  RoundCyclePublisherFake,
  RoundCycleTransactionRunnerFake,
  RoundCyclesDaoFake,
} from '../../support/round-cycles-fakes';

const VHARN = 'campaign-vharn';
const QUELM = 'campaign-quelm';
const GM = 'user-gm';
const LYRA = 'user-lyra';
const KAEL = 'user-kael';
const NOW = new Date('2026-11-25T12:00:00Z');

const moon = (overrides: Partial<DefineRoundCycle> = {}): DefineRoundCycle => ({
  name: 'Fases da Lua',
  holder: { kind: 'table' },
  visibility: 'some',
  seerIds: [LYRA],
  chooserIds: [LYRA],
  announce: true,
  phases: ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante'].map((name) => ({
    name,
    imageAssetId: null,
  })),
  ...overrides,
});

describe('RoundCyclesService', () => {
  let journal: string[];
  let characters: CharactersDaoFake;
  let cycles: RoundCyclesDaoFake;
  let assets: AssetsDaoFake;
  let publisher: RoundCyclePublisherFake;
  let service: RoundCyclesService;

  beforeEach(() => {
    journal = [];
    characters = new CharactersDaoFake(journal, [], { [VHARN]: 4, [QUELM]: 1 });
    cycles = new RoundCyclesDaoFake(journal);
    cycles.players[VHARN] = [LYRA, KAEL];
    assets = new AssetsDaoFake();
    publisher = new RoundCyclePublisherFake(journal);
    const members = new MembershipReadsFake([
      campaignMemberPo({ campaignId: VHARN, userId: GM, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN, userId: LYRA, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN, userId: KAEL, role: 'player' }),
      campaignMemberPo({ campaignId: QUELM, userId: GM, role: 'master' }),
    ]);
    const transaction = new RoundCycleTransactionRunnerFake(characters, cycles, assets).run;
    service = new RoundCyclesService({
      members,
      transaction,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('define locks the table stream, writes, bumps, commits and only then publishes', async () => {
    const version = await service.define(GM, VHARN, moon());

    expect(version).toBe(5);
    expect(journal).toEqual([
      'lock characters',
      'insert cycle Fases da Lua',
      'bump characters',
      'commit',
      'publish',
    ]);
  });

  it('the change is cut for each audience: the masters, the seer, and a rest without it', async () => {
    await service.define(GM, VHARN, moon());

    const [change] = publisher.changes;
    expect(change).toMatchObject({ campaignId: VHARN, version: 5, at: NOW.toISOString() });
    expect(change?.cuts.masters.map(({ name }) => name)).toEqual(['Fases da Lua']);
    expect(change?.cuts.members.map(({ userId, cycles: seen }) => [userId, seen.length])).toEqual([
      [LYRA, 1],
    ]);
    expect(change?.cuts.rest).toEqual([]);
  });

  it('a player who defines a cycle is refused with FORBIDDEN before anything is locked', async () => {
    await expect(service.define(LYRA, VHARN, moon())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(journal).toEqual([]);
  });

  it('the 21st cycle of the table is refused with ROUND_CYCLE_LIMIT and nothing is published', async () => {
    for (let i = 0; i < 20; i++) await service.define(GM, VHARN, moon({ name: `Ciclo ${i}` }));
    journal.length = 0;

    await expect(service.define(GM, VHARN, moon())).rejects.toMatchObject({
      code: 'ROUND_CYCLE_LIMIT',
    });
    expect(journal).toEqual(['lock characters']);
  });

  it('an image of another table is refused with ASSET_NOT_FOUND before writing', async () => {
    const foreign = await assets.insert(newAssetPo({ campaignId: QUELM }));
    const phases = moon().phases.map((phase) => ({ ...phase, imageAssetId: foreign.id }));

    await expect(service.define(GM, VHARN, moon({ phases }))).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
    });
    expect(cycles.rows).toEqual([]);
  });

  it('a holder character of another table is refused; one of the table holds', async () => {
    const character = { name: 'Lyra', initials: 'LY', side: 'ally', userId: null } as const;
    const bars = { bars: [], controllerIds: [] };
    const ours = await characters.insert({
      character: { ...character, campaignId: VHARN },
      ...bars,
    });
    const theirs = await characters.insert({
      character: { ...character, campaignId: QUELM },
      ...bars,
    });
    journal.length = 0;

    const foreign = { kind: 'character', characterId: theirs.character.id } as const;
    await expect(service.define(GM, VHARN, moon({ holder: foreign }))).rejects.toMatchObject({
      code: 'ROUND_CYCLE_HOLDER_NOT_FOUND',
    });
    await service.define(
      GM,
      VHARN,
      moon({ holder: { kind: 'character', characterId: ours.character.id } }),
    );
    expect(cycles.rows[0]?.cycle.holderCharacterId).toBe(ours.character.id);
  });

  it('a loose token of the table holds a cycle; one of another table does not', async () => {
    cycles.looseTokens[VHARN] = ['token-kraken'];
    await service.define(GM, VHARN, moon({ holder: { kind: 'token', tokenId: 'token-kraken' } }));

    const stranger = moon({ holder: { kind: 'token', tokenId: 'token-of-quelm' } });
    await expect(service.define(GM, VHARN, stranger)).rejects.toMatchObject({
      code: 'ROUND_CYCLE_HOLDER_NOT_FOUND',
    });
    expect(cycles.rows[0]?.cycle.holderTokenId).toBe('token-kraken');
  });

  it('a seer who is not a player of the table is refused citing them', async () => {
    const work = service.define(GM, VHARN, moon({ seerIds: ['user-stranger'] }));
    await expect(work).rejects.toMatchObject({
      code: 'ROUND_CYCLE_MEMBER_NOT_PLAYER',
      message: expect.stringContaining('user-stranger'),
    });
  });

  it('update of a cycle of another table is ROUND_CYCLE_NOT_FOUND', async () => {
    await service.define(GM, VHARN, moon());
    const cycleId = cycles.rows[0]?.cycle.id ?? '';
    cycles.players[QUELM] = [];

    const work = service.update(GM, QUELM, {
      ...moon({ seerIds: [], chooserIds: [], visibility: 'everyone' }),
      cycleId,
    });
    await expect(work).rejects.toMatchObject({ code: 'ROUND_CYCLE_NOT_FOUND' });
  });

  it('delete removes the cycle and publishes the list without it', async () => {
    await service.define(GM, VHARN, moon());
    const cycleId = cycles.rows[0]?.cycle.id ?? '';

    await service.delete(GM, VHARN, { cycleId });

    expect(publisher.changes.at(-1)?.cuts.masters).toEqual([]);
    expect(publisher.changes.at(-1)?.version).toBe(6);
  });

  describe('chooseNext', () => {
    let cycleId: string;
    let cheia: string;

    beforeEach(async () => {
      await service.define(GM, VHARN, moon());
      const row = cycles.rows[0];
      cycleId = row?.cycle.id ?? '';
      cheia = row?.phases[2]?.id ?? '';
      cycles.states.push({
        combatId: 'combat-1',
        cycleId,
        sceneId: 'scene-1',
        round: 2,
        currentPhaseId: row?.phases[0]?.id ?? null,
        chosenPhaseId: null,
      });
      journal.length = 0;
    });

    it('a chooser picks the next phase in the combat of the grid, in a new version', async () => {
      const version = await service.chooseNext(LYRA, VHARN, {
        sceneId: 'scene-1',
        cycleId,
        phaseId: cheia,
      });

      expect(version).toBe(6);
      expect(cycles.states[0]?.chosenPhaseId).toBe(cheia);
      expect(journal).toEqual([
        'lock characters',
        `choose ${cheia}`,
        'bump characters',
        'commit',
        'publish',
      ]);
    });

    it('null follows the cycle again', async () => {
      await service.chooseNext(LYRA, VHARN, { sceneId: 'scene-1', cycleId, phaseId: cheia });
      await service.chooseNext(GM, VHARN, { sceneId: 'scene-1', cycleId, phaseId: null });

      expect(cycles.states[0]?.chosenPhaseId).toBeNull();
    });

    it('a member who does not choose is refused with FORBIDDEN', async () => {
      const work = service.chooseNext(KAEL, VHARN, { sceneId: 'scene-1', cycleId, phaseId: cheia });
      await expect(work).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(cycles.states[0]?.chosenPhaseId).toBeNull();
    });

    it('a phase of another cycle is ROUND_CYCLE_PHASE_NOT_FOUND citing it', async () => {
      const work = service.chooseNext(LYRA, VHARN, {
        sceneId: 'scene-1',
        cycleId,
        phaseId: 'other-phase',
      });
      await expect(work).rejects.toMatchObject({
        code: 'ROUND_CYCLE_PHASE_NOT_FOUND',
        message: expect.stringContaining('other-phase'),
      });
    });

    it('a grid where the cycle is not in combat is ROUND_CYCLE_NOT_ACTIVE', async () => {
      const work = service.chooseNext(LYRA, VHARN, { sceneId: 'scene-2', cycleId, phaseId: cheia });
      await expect(work).rejects.toMatchObject({ code: 'ROUND_CYCLE_NOT_ACTIVE' });
    });
  });
});
