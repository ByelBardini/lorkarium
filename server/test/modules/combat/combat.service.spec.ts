import type { CombatEntryInput } from '@lorkarium/contracts';
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
import { TORRE_ID, torrePo } from '../../support/library-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { lyraPo, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-15T21:00:00Z');
const THREE_ALONE: CombatEntryInput[] = [
  { name: null, tokenIds: ['kael'], initiative: null },
  { name: null, tokenIds: ['lyra'], initiative: null },
  { name: null, tokenIds: ['ogro'], initiative: null },
];
const GROUPED: CombatEntryInput[] = [
  { name: 'Inimigos', tokenIds: ['goblin', 'lobo'], initiative: null },
  { name: null, tokenIds: ['kael'], initiative: null },
  { name: 'Covil', tokenIds: [], initiative: null },
];

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
    scenes = new ScenesDaoFake([scenePo({ version: 4 }), torrePo()]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const tokens = new TokensDaoFake(scenes.journal, [
      lyraRow({ token: lyraPo({ id: 'kael' }), controllerIds: [BIA_ID] }),
      lyraRow({ token: lyraPo({ id: 'lyra' }), controllerIds: [CAIO_ID] }),
      lyraRow({ token: lyraPo({ id: 'ogro' }), controllerIds: [] }),
      lyraRow({ token: lyraPo({ id: 'goblin' }), controllerIds: [CAIO_ID] }),
      lyraRow({ token: lyraPo({ id: 'lobo' }), controllerIds: [CAIO_ID] }),
      lyraRow({ token: lyraPo({ id: 'torre-goblin', sceneId: TORRE_ID }), controllerIds: [] }),
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

  async function started(entries: CombatEntryInput[] = THREE_ALONE): Promise<void> {
    await service.start(ANA_ID, VHARN_ID, { entries });
    scenes.journal.splice(0);
    publisher.combatEvents.splice(0);
  }

  function current(): string | null | undefined {
    return combat.rows.get(VHARN_SCENE_ID)?.combat.currentCombatantId;
  }

  it('the master starts with three tokens: saved, the first on turn, then combat:started', async () => {
    const version = await service.start(ANA_ID, VHARN_ID, { entries: THREE_ALONE });
    expect(version).toBe(5);
    expect(scenes.journal.at(-2)).toBe('commit');
    expect(scenes.journal.at(-1)).toBe('publish');
    expect(current()).toBe('c-kael');
    expect(publisher.combatEvents[0]).toMatchObject({
      name: 'combat:started',
      event: { version: 5, combat: { round: 1, currentCombatantId: 'c-kael' } },
    });
  });

  it('starting with Kael 12 and the Ogro 18 puts the Ogro on turn, saved before combat:started', async () => {
    const version = await service.start(ANA_ID, VHARN_ID, {
      entries: [
        { name: null, tokenIds: ['kael'], initiative: 12 },
        { name: null, tokenIds: ['ogro'], initiative: 18 },
      ],
    });

    expect(version).toBe(5);
    expect([...new Set(scenes.journal)]).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    expect(current()).toBe('c-ogro');
    const first = publisher.combatEvents[0];
    if (first?.name !== 'combat:started') throw new Error('expected combat:started');
    expect(first.event.combat.combatants.map(({ id, initiative }) => [id, initiative])).toEqual([
      ['c-ogro', 18],
      ['c-kael', 12],
    ]);
  });

  it('adding the Lobo with 15 keeps its initiative in combat:updated', async () => {
    await started();

    await service.addCombatants(ANA_ID, VHARN_ID, {
      entries: [{ name: null, tokenIds: ['lobo'], initiative: 15 }],
    });

    const last = publisher.combatEvents.at(-1);
    if (last?.name !== 'combat:updated') throw new Error('expected combat:updated');
    expect(last.event.combat.combatants[0]).toMatchObject({ id: 'c-lobo', initiative: 15 });
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

  it('at the end of the Ogro’s turn in round 2 its "Envenenado 1" of round 1 expires inside the same combat:turnChanged', async () => {
    await started();
    const envenenado = conditions.define(VHARN_ID, 'Envenenado', 'harm');
    const caido = conditions.define(VHARN_ID, 'Caído', 'harm');
    await conditions.apply('ogro', envenenado, { remainingRounds: 1, appliedRound: 1 });
    await conditions.apply('ogro', caido, { remainingRounds: 3, appliedRound: 1 });
    await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 2, 'c-ogro');
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

  it('"Caído 1" applied in round 1 survives the end of the Ogro’s turn in round 1, untouched', async () => {
    await started();
    const caido = conditions.define(VHARN_ID, 'Caído', 'harm');
    await conditions.apply('ogro', caido, { remainingRounds: 1, appliedRound: 1 });
    await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 1, 'c-ogro');
    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-ogro' });
    expect(conditions.active).toEqual([
      expect.objectContaining({ name: 'Caído', remainingRounds: 1, appliedRound: 1 }),
    ]);
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
    await conditions.apply('ogro', conditions.define(VHARN_ID, 'Caído', 'harm'), {
      remainingRounds: null,
      appliedRound: 1,
    });
    await service.end(ANA_ID, VHARN_ID);
    expect(combat.rows.size).toBe(0);
    expect(conditions.active).toHaveLength(1);
    expect(publisher.combatEvents.at(-1)?.name).toBe('combat:ended');
  });

  it('adding a combatant who is already in adds no one', async () => {
    await started();
    await service.addCombatants(ANA_ID, VHARN_ID, {
      entries: [{ name: null, tokenIds: ['kael'], initiative: null }],
    });
    expect(combat.rows.get(VHARN_SCENE_ID)?.combatants).toHaveLength(3);
  });

  it('the master starts with a group and an entry without tokens, saved as sent', async () => {
    await started(GROUPED);

    expect(
      combat.rows.get(VHARN_SCENE_ID)?.combatants.map(({ name, tokenIds }) => [name, tokenIds]),
    ).toEqual([
      ['Inimigos', ['goblin', 'lobo']],
      [null, ['kael']],
      ['Covil', []],
    ]);
  });

  it('splitting the Lobo off Inimigos saves, bumps one version, commits, then publishes combat:updated', async () => {
    await started(GROUPED);

    const version = await service.regroupTokens(ANA_ID, VHARN_ID, {
      tokenIds: ['lobo'],
      target: { kind: 'own' },
    });

    expect(version).toBe(6);
    expect([...new Set(scenes.journal)]).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    const last = publisher.combatEvents.at(-1);
    if (last?.name !== 'combat:updated') throw new Error('expected combat:updated');
    expect(last.event.combat.combatants.map(({ tokenIds }) => tokenIds)).toEqual([
      ['goblin'],
      ['kael'],
      [],
      ['lobo'],
    ]);
  });

  it('taking the last token of the entry on turn out passes the turn in the same combat:updated', async () => {
    await started(GROUPED);
    await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 1, 'c-kael');

    await service.regroupTokens(ANA_ID, VHARN_ID, { tokenIds: ['kael'], target: { kind: 'out' } });

    const last = publisher.combatEvents.at(-1);
    if (last?.name !== 'combat:updated') throw new Error('expected combat:updated');
    expect(last.event.combat.currentCombatantId).toBe('c-Covil');
    expect(last.event.combat.combatants.map(({ id }) => id)).toEqual(['c-goblin', 'c-Covil']);
  });

  it('renaming Inimigos saves the name, bumps one version and publishes combat:updated', async () => {
    await started(GROUPED);

    await service.renameCombatant(ANA_ID, VHARN_ID, { combatantId: 'c-goblin', name: 'Goblins' });

    expect([...new Set(scenes.journal)]).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    expect(publisher.combatEvents.at(-1)).toMatchObject({
      name: 'combat:updated',
      event: {
        version: 6,
        combat: {
          combatants: expect.arrayContaining([expect.objectContaining({ name: 'Goblins' })]),
        },
      },
    });
  });

  it('at the end of the turn of Inimigos in round 2 the conditions of both tokens count down, one change each', async () => {
    await started(GROUPED);
    const caido = conditions.define(VHARN_ID, 'Caído', 'harm');
    const envenenado = conditions.define(VHARN_ID, 'Envenenado', 'harm');
    await conditions.apply('goblin', caido, { remainingRounds: 1, appliedRound: 1 });
    await conditions.apply('lobo', envenenado, { remainingRounds: 2, appliedRound: 1 });
    await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 2, 'c-goblin');

    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-goblin' });

    expect(publisher.combatEvents.at(-1)).toMatchObject({
      name: 'combat:turnChanged',
      event: {
        conditionChanges: [
          { tokenId: 'goblin', conditions: [] },
          {
            tokenId: 'lobo',
            conditions: [expect.objectContaining({ name: 'Envenenado', remainingRounds: 1 })],
          },
        ],
      },
    });
  });

  it('the end of the turn of the Covil, without tokens, changes no condition', async () => {
    await started(GROUPED);
    await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 1, 'c-Covil');

    await service.nextTurn(ANA_ID, VHARN_ID, { fromCombatantId: 'c-Covil' });

    expect(publisher.combatEvents.at(-1)).toMatchObject({
      name: 'combat:turnChanged',
      event: { conditionChanges: [] },
    });
  });

  it('a regroup the rule refuses saves and publishes nothing', async () => {
    await started(GROUPED);

    await expect(
      service.regroupTokens(CAIO_ID, VHARN_ID, { tokenIds: ['lobo'], target: { kind: 'own' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(scenes.journal).toEqual(['lock']);
    expect(publisher.published).toBe(0);
  });

  describe('on a grid that is not the group one', () => {
    const TORRE_GOBLIN: CombatEntryInput[] = [
      { name: null, tokenIds: ['torre-goblin'], initiative: null },
    ];

    it('Ana starting a combat in the Torre locks the Torre and combat:started carries it', async () => {
      const version = await service.start(ANA_ID, VHARN_ID, {
        sceneId: TORRE_ID,
        entries: TORRE_GOBLIN,
      });

      expect(version).toBe(8);
      expect(scenes.journal[0]).toBe(`lockInCampaign:${TORRE_ID}`);
      expect(publisher.combatEvents[0]).toMatchObject({
        name: 'combat:started',
        event: { sceneId: TORRE_ID, version: 8 },
      });
    });

    it('the combats of the group grid and of the Torre go apart, each in its own version', async () => {
      await service.start(ANA_ID, VHARN_ID, { entries: THREE_ALONE });
      await service.start(ANA_ID, VHARN_ID, { sceneId: TORRE_ID, entries: TORRE_GOBLIN });

      await service.end(ANA_ID, VHARN_ID, { sceneId: TORRE_ID });

      expect(combat.rows.has(VHARN_SCENE_ID)).toBe(true);
      expect(combat.rows.has(TORRE_ID)).toBe(false);
      expect(publisher.combatEvents.map(({ event }) => [event.sceneId, event.version])).toEqual([
        [VHARN_SCENE_ID, 5],
        [TORRE_ID, 8],
        [TORRE_ID, 9],
      ]);
    });

    it('Bia passing the turn in the private Torre is SCENE_NOT_FOUND before anything is saved', async () => {
      const command = { sceneId: TORRE_ID, fromCombatantId: 'c-torre-goblin' };

      await expect(service.nextTurn(BIA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'SCENE_NOT_FOUND',
      });
      expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
    });
  });
});
