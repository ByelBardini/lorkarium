import { beforeEach, describe, expect, it } from 'vitest';
import { CombatService } from '../../../src/modules/combat/combat.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, CAIO_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { CombatDaoFake, CombatTransactionRunnerFake } from '../../support/combat-fakes';
import { ConditionsDaoFake } from '../../support/conditions-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { lyraPo, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-15T21:00:00Z');

describe('CombatService', () => {
  let scenes: ScenesDaoFake;
  let combat: CombatDaoFake;
  let conditions: ConditionsDaoFake;
  let publisher: BoardPublisherFake;
  let service: CombatService;

  beforeEach(() => {
    const campaigns = new CampaignsDaoFake();
    const members = new CampaignMembersDaoFake(campaigns, {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const tokens = new TokensDaoFake(scenes.journal, [
      lyraRow({ token: lyraPo({ id: 'kael' }), controllerIds: [BIA_ID] }),
      lyraRow({ token: lyraPo({ id: 'lyra' }), controllerIds: [CAIO_ID] }),
      lyraRow({ token: lyraPo({ id: 'ogro' }), controllerIds: [] }),
    ]);
    combat = new CombatDaoFake(scenes.journal);
    conditions = new ConditionsDaoFake(scenes.journal);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new CombatTransactionRunnerFake({ scenes, tokens, combat, conditions });
    service = new CombatService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  async function started(): Promise<void> {
    await service.start(ANA_ID, VHARN_ID, { tokenIds: ['kael', 'lyra', 'ogro'] });
    scenes.journal.splice(0);
    publisher.combatEvents.splice(0);
  }

  function current(): string | null | undefined {
    return combat.rows.get(VHARN_SCENE_ID)?.combat.currentCombatantId;
  }

  it('the master starts with three tokens: saved, the first on turn, then combat:started', async () => {
    const version = await service.start(ANA_ID, VHARN_ID, { tokenIds: ['kael', 'lyra', 'ogro'] });
    expect(version).toBe(5);
    expect(scenes.journal.at(-2)).toBe('commit');
    expect(scenes.journal.at(-1)).toBe('publish');
    expect(current()).toBe('c-kael');
    expect(publisher.combatEvents[0]).toMatchObject({
      name: 'combat:started',
      event: { version: 5, combat: { round: 1, currentCombatantId: 'c-kael' } },
    });
  });

  it('initiatives 14, 18 and −2 reorder the combat in combat:updated', async () => {
    await started();
    await service.setInitiative(ANA_ID, VHARN_ID, { combatantId: 'c-kael', initiative: 14 });
    await service.setInitiative(ANA_ID, VHARN_ID, { combatantId: 'c-lyra', initiative: 18 });
    await service.setInitiative(ANA_ID, VHARN_ID, { combatantId: 'c-ogro', initiative: -2 });
    const last = publisher.combatEvents.at(-1);
    expect(last?.name).toBe('combat:updated');
    if (last?.name !== 'combat:updated') throw new Error('expected combat:updated');
    expect(last.event.combat.combatants.map(({ id }) => id)).toEqual([
      'c-lyra',
      'c-kael',
      'c-ogro',
    ]);
  });

  it('"Próximo turno" on the last combatant starts round 2', async () => {
    await started();
    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-kael' });
    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-lyra' });
    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-ogro' });
    expect(combat.rows.get(VHARN_SCENE_ID)?.combat).toMatchObject({
      round: 2,
      currentCombatantId: 'c-kael',
    });
  });

  it('at the end of the Ogro’s turn its "Envenenado 1" expires inside the same combat:turnChanged', async () => {
    await started();
    const envenenado = conditions.define(VHARN_ID, 'Envenenado', 'harm');
    const caido = conditions.define(VHARN_ID, 'Caído', 'harm');
    await conditions.apply('ogro', envenenado, 1);
    await conditions.apply('ogro', caido, 3);
    await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 1, 'c-ogro');
    publisher.combatEvents.splice(0);
    const version = await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-ogro' });
    expect(publisher.combatEvents).toHaveLength(1);
    expect(publisher.combatEvents[0]).toMatchObject({
      name: 'combat:turnChanged',
      event: {
        version,
        conditionChanges: [
          {
            tokenId: 'ogro',
            conditions: [expect.objectContaining({ name: 'Caído', remainingRounds: 2 })],
          },
        ],
      },
    });
    expect(conditions.active.map(({ name }) => name)).toEqual(['Caído']);
  });

  it('Bia passes the turn of her Kael', async () => {
    await started();
    await service.nextTurn(BIA_ID, VHARN_ID, { fromCombatantId: 'c-kael' });
    expect(current()).toBe('c-lyra');
  });

  it('a second "next" from the same turn is TURN_ALREADY_CHANGED and the turn moved once', async () => {
    await started();
    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-kael' });
    await expect(
      service.nextTurn(BIA_ID, VHARN_ID, { fromCombatantId: 'c-kael' }),
    ).rejects.toMatchObject({
      code: 'TURN_ALREADY_CHANGED',
    });
    expect(current()).toBe('c-lyra');
  });

  it('a refused command saves and publishes nothing', async () => {
    await started();
    await expect(service.end(BIA_ID, VHARN_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(scenes.journal).toEqual(['lock']);
    expect(publisher.published).toBe(0);
  });

  it('"Turno anterior" goes back without giving conditions back, in combat:turnChanged with no changes', async () => {
    await started();
    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-kael' });
    await service.previousTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-lyra' });
    expect(current()).toBe('c-kael');
    expect(publisher.combatEvents.at(-1)).toMatchObject({
      name: 'combat:turnChanged',
      event: { conditionChanges: [] },
    });
  });

  it('taking out the combatant on turn hands the turn on', async () => {
    await started();
    await service.removeCombatant(ANA_ID, VHARN_ID, { combatantId: 'c-kael' });
    expect(current()).toBe('c-lyra');
  });

  it('ending deletes the combat and keeps the conditions on the tokens', async () => {
    await started();
    await conditions.apply('ogro', conditions.define(VHARN_ID, 'Caído', 'harm'), null);
    await service.end(ANA_ID, VHARN_ID);
    expect(combat.rows.size).toBe(0);
    expect(conditions.active).toHaveLength(1);
    expect(publisher.combatEvents.at(-1)?.name).toBe('combat:ended');
  });

  it('adding a combatant who is already in adds no one', async () => {
    await started();
    await service.addCombatants(ANA_ID, VHARN_ID, { tokenIds: ['kael'] });
    expect(combat.rows.get(VHARN_SCENE_ID)?.combatants).toHaveLength(3);
  });
});
