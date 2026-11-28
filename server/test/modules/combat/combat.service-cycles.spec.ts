import type { CombatEntryInput } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { CombatService } from '../../../src/modules/combat/combat.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { CharacterPublisherFake, CharactersDaoFake } from '../../support/characters-fakes';
import { CombatDaoFake, CombatTransactionRunnerFake } from '../../support/combat-fakes';
import { ConditionsDaoFake } from '../../support/conditions-fakes';
import { roundCycleRow } from '../../support/round-cycles-factories';
import { RoundCyclePublisherFake, RoundCyclesDaoFake } from '../../support/round-cycles-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { lyraPo, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-11-25T21:00:00Z');
const TWO: CombatEntryInput[] = [
  { name: null, tokenIds: ['kael'], initiative: 18 },
  { name: null, tokenIds: ['ogro'], initiative: 10 },
];

describe('CombatService with round cycles', () => {
  let scenes: ScenesDaoFake;
  let combat: CombatDaoFake;
  let cycles: RoundCyclesDaoFake;
  let cyclePublisher: RoundCyclePublisherFake;
  let service: CombatService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const tokens = new TokensDaoFake(scenes.journal, [
      lyraRow({ token: lyraPo({ id: 'kael' }), controllerIds: [] }),
      lyraRow({ token: lyraPo({ id: 'ogro' }), controllerIds: [] }),
      lyraRow({ token: lyraPo({ id: 'kraken' }), controllerIds: [] }),
    ]);
    combat = new CombatDaoFake(scenes.journal);
    const characters = new CharactersDaoFake(scenes.journal, [], { [VHARN_ID]: 7 });
    cycles = new RoundCyclesDaoFake(scenes.journal);
    cyclePublisher = new RoundCyclePublisherFake(scenes.journal);
    const conditions = new ConditionsDaoFake(scenes.journal);
    const daos = { scenes, tokens, combat, conditions, characters, roundCycles: cycles };
    service = new CombatService({
      members,
      transaction: new CombatTransactionRunnerFake(daos).run,
      publisher: new BoardPublisherFake(scenes.journal),
      characterPublisher: new CharacterPublisherFake(),
      roundCyclePublisher: cyclePublisher,
      clock: new ClockFake(NOW),
    });
  });

  function moonOfTheTable(announce = true): void {
    cycles.rows.push(roundCycleRow({ id: 'moon', campaignId: VHARN_ID, announce }));
  }

  function moonState() {
    return cycles.states.find(({ cycleId }) => cycleId === 'moon');
  }

  async function closeRound(): Promise<void> {
    const row = combat.rows.get(VHARN_SCENE_ID);
    const order = ['c-kael', 'c-ogro'];
    const current = row?.combat.currentCombatantId ?? 'c-kael';
    for (const from of order.slice(order.indexOf(current))) {
      await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: from });
    }
  }

  it('a table without cycles never locks the table stream nor publishes cycles', async () => {
    await service.start(ANA_ID, VHARN_ID, { entries: TWO });

    expect(scenes.journal).not.toContain('lock characters');
    expect(cyclePublisher.changes).toEqual([]);
  });

  it('the start puts the table cycle on its first phase, in a version of the table stream', async () => {
    moonOfTheTable();

    await service.start(ANA_ID, VHARN_ID, { entries: TWO });

    expect(moonState()?.currentPhaseId).toBe('moon-phase-0');
    // The run that writes locks the table stream first, then the grid (spec §5.5 lock order).
    const writing = scenes.journal.slice(scenes.journal.lastIndexOf('lock characters'));
    expect(writing.slice(0, 2)).toEqual(['lock characters', 'lock']);
    expect(cyclePublisher.changes.map(({ version }) => version)).toEqual([8]);
  });

  it('the start announces the first phase to the grid', async () => {
    moonOfTheTable();

    await service.start(ANA_ID, VHARN_ID, { entries: TWO });

    expect(cyclePublisher.announced).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: VHARN_SCENE_ID,
        round: 1,
        at: NOW.toISOString(),
        announcements: [
          {
            cycleId: 'moon',
            cycleName: 'Fases da Lua',
            phase: { name: 'Lua Nova', icon: 'game-icons:cycle', imageAssetId: null },
          },
        ],
      },
    ]);
  });

  it('a turn inside the round does not turn the cycle nor publish it', async () => {
    moonOfTheTable();
    await service.start(ANA_ID, VHARN_ID, { entries: TWO });
    cyclePublisher.changes.splice(0);

    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-kael' });

    expect(moonState()?.currentPhaseId).toBe('moon-phase-0');
    expect(cyclePublisher.changes).toEqual([]);
  });

  it('closing the round turns the cycle to the following phase and announces round 2', async () => {
    moonOfTheTable();
    await service.start(ANA_ID, VHARN_ID, { entries: TWO });
    cyclePublisher.announced.splice(0);

    await closeRound();

    expect(moonState()?.currentPhaseId).toBe('moon-phase-1');
    expect(
      cyclePublisher.announced.map(({ round, announcements }) => [
        round,
        announcements[0]?.phase.name,
      ]),
    ).toEqual([[2, 'Crescente']]);
  });

  it('a chosen phase is played at the next round and the choice is spent', async () => {
    moonOfTheTable(false);
    await service.start(ANA_ID, VHARN_ID, { entries: TWO });
    const combatId = combat.rows.get(VHARN_SCENE_ID)?.combat.id ?? '';
    await cycles.setChosen(combatId, 'moon', 'moon-phase-0');

    await closeRound();

    expect([moonState()?.currentPhaseId, moonState()?.chosenPhaseId]).toEqual([
      'moon-phase-0',
      null,
    ]);
    expect(cyclePublisher.announced).toEqual([]);
  });

  it('the cycle of a loose token enters when it joins the combat and leaves with it', async () => {
    cycles.rows.push(
      roundCycleRow({
        id: 'tide',
        campaignId: VHARN_ID,
        holderTokenId: 'kraken',
        phaseNames: ['Baixa', 'Alta'],
      }),
    );
    await service.start(ANA_ID, VHARN_ID, { entries: TWO });
    expect(cycles.states).toEqual([]);

    const kraken = [{ name: null, tokenIds: ['kraken'], initiative: 5 }];
    await service.addCombatants(ANA_ID, VHARN_ID, { entries: kraken });
    expect(cycles.states.map(({ cycleId, currentPhaseId }) => [cycleId, currentPhaseId])).toEqual([
      ['tide', 'tide-phase-0'],
    ]);

    await service.removeCombatant(ANA_ID, VHARN_ID, { combatantId: 'c-kraken' });
    expect(cycles.states).toEqual([]);
  });

  it('the end of the combat takes the cycles out and publishes the list', async () => {
    moonOfTheTable();
    await service.start(ANA_ID, VHARN_ID, { entries: TWO });
    cyclePublisher.changes.splice(0);

    await service.end(ANA_ID, VHARN_ID);

    expect(cycles.states).toEqual([]);
    expect(cyclePublisher.changes.map(({ cuts }) => cuts.masters[0]?.combats)).toEqual([[]]);
  });
});
