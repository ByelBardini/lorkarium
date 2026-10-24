import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionsService } from '../../../src/modules/conditions/conditions.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { CombatDaoFake, soloEntries } from '../../support/combat-fakes';
import { ConditionTransactionRunnerFake, ConditionsDaoFake } from '../../support/conditions-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_CAST_ID, VHARN_SCENE_ID, castPo, scenePo } from '../../support/scenes-factories';
import { TORRE_ID, torrePo } from '../../support/library-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { BRAM_ID, LYRA_ID, bramRow, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-15T21:00:00Z');

describe('ConditionsService', () => {
  let scenes: ScenesDaoFake;
  let conditions: ConditionsDaoFake;
  let combat: CombatDaoFake;
  let publisher: BoardPublisherFake;
  let service: ConditionsService;
  let abencoado: string;

  beforeEach(() => {
    const campaigns = new CampaignsDaoFake();
    const members = new CampaignMembersDaoFake(campaigns, {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: DUDA_ID, role: 'spectator' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 }), torrePo(), castPo({ version: 2 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const tokens = new TokensDaoFake(scenes.journal, [lyraRow(), bramRow()]);
    conditions = new ConditionsDaoFake(scenes.journal);
    abencoado = conditions.define(VHARN_ID, 'Abençoado', 'benefit');
    conditions.define(QUELM_ID, 'Sangrando', 'harm');
    publisher = new BoardPublisherFake(scenes.journal);
    combat = new CombatDaoFake();
    const transaction = new ConditionTransactionRunnerFake(scenes, tokens, conditions, combat);
    service = new ConditionsService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('Bia applying "Abençoado 2" to her Lyra saves, bumps and publishes condition:applied', async () => {
    const version = await service.apply(BIA_ID, VHARN_ID, {
      tokenId: LYRA_ID,
      conditionId: abencoado,
      rounds: 2,
    });
    expect(version).toBe(5);
    expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
    expect(publisher.conditionEvents).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: VHARN_SCENE_ID,
        version: 5,
        at: NOW.toISOString(),
        tokenId: LYRA_ID,
        condition: expect.objectContaining({
          name: 'Abençoado',
          tone: 'benefit',
          remainingRounds: 2,
        }),
      },
    ]);
  });

  it('out of combat the condition is stamped with no round', async () => {
    await service.apply(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, conditionId: abencoado, rounds: 1 });
    expect(conditions.active[0]?.appliedRound).toBeNull();
  });

  it('in round 3 of a combat the condition is stamped with round 3, one by one or in a group', async () => {
    await combat.start(VHARN_SCENE_ID, soloEntries(LYRA_ID, BRAM_ID));
    await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 3, null);
    await service.apply(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, conditionId: abencoado, rounds: 1 });
    await service.applyMany(ANA_ID, VHARN_ID, {
      tokenIds: [LYRA_ID, BRAM_ID],
      conditionId: abencoado,
      rounds: 2,
    });
    expect(conditions.active.map(({ appliedRound }) => appliedRound)).toEqual([3, 3]);
  });

  it('0 rounds applies a condition without limit', async () => {
    await service.apply(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, conditionId: abencoado, rounds: 0 });
    expect(conditions.active[0]?.remainingRounds).toBeNull();
  });

  it('Caio applying to Bia’s Lyra, which he does not control, saves and publishes condition:applied', async () => {
    const version = await service.apply(CAIO_ID, VHARN_ID, {
      tokenId: LYRA_ID,
      conditionId: abencoado,
      rounds: 1,
    });
    expect(version).toBe(5);
    expect(conditions.active).toEqual([
      expect.objectContaining({ tokenId: LYRA_ID, conditionId: abencoado, remainingRounds: 1 }),
    ]);
    expect(publisher.conditionEvents).toEqual([
      expect.objectContaining({ tokenId: LYRA_ID, version: 5 }),
    ]);
  });

  it('the spectator applying a condition is FORBIDDEN before anything is locked', async () => {
    await expect(
      service.apply(DUDA_ID, VHARN_ID, { tokenId: LYRA_ID, conditionId: abencoado, rounds: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(scenes.journal).toEqual([]);
    expect(conditions.active).toEqual([]);
    expect(publisher.published).toBe(0);
  });

  it('a condition of another table is CONDITION_NOT_FOUND', async () => {
    await expect(
      service.apply(ANA_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        conditionId: `${QUELM_ID}-Sangrando`,
        rounds: 1,
      }),
    ).rejects.toMatchObject({ code: 'CONDITION_NOT_FOUND' });
  });

  it('the master defining "Sangrando" adds it and publishes condition:defined as an event of the cast', async () => {
    const version = await service.define(ANA_ID, VHARN_ID, {
      name: 'Sangrando',
      tone: 'harm',
      icon: 'droplet',
      look: null,
      color: null,
      description: '',
      maxStacks: null,
    });
    expect(version).toBe(3);
    expect(publisher.conditionEvents).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: VHARN_CAST_ID,
        version: 3,
        at: NOW.toISOString(),
        definition: expect.objectContaining({ name: 'Sangrando', tone: 'harm', icon: 'droplet' }),
      },
    ]);
  });

  it('defining a name the list has (any case) reuses it: no new row, no bump, no event', async () => {
    const version = await service.define(ANA_ID, VHARN_ID, {
      name: 'abençoado',
      tone: 'benefit',
      icon: 'sun',
      look: 'invisible',
      color: null,
      description: '',
      maxStacks: null,
    });
    expect(version).toBe(2);
    expect(scenes.journal).toEqual(['lock cast', 'commit']);
    expect(conditions.definitions.filter(({ campaignId }) => campaignId === VHARN_ID)).toHaveLength(
      1,
    );
    expect(publisher.published).toBe(0);
    expect(conditions.definitions.find(({ id }) => id === abencoado)?.look).toBeNull();
  });

  it('the master defining "Inconsciente" incapacitating and unconscious saves both, then publishes them after the commit', async () => {
    await service.define(ANA_ID, VHARN_ID, {
      name: 'Inconsciente',
      tone: 'incapacitating',
      icon: 'moon',
      look: 'unconscious',
      color: null,
      description: '',
      maxStacks: null,
    });
    expect(scenes.journal).toEqual(['lock cast', 'save', 'bump cast', 'commit', 'publish']);
    expect(conditions.definitions.at(-1)).toMatchObject({
      tone: 'incapacitating',
      look: 'unconscious',
    });
    expect(publisher.conditionEvents).toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({ tone: 'incapacitating', look: 'unconscious' }),
      }),
    ]);
  });

  it('a player defining a condition is FORBIDDEN', async () => {
    await expect(
      service.define(BIA_ID, VHARN_ID, {
        name: 'Sangrando',
        tone: 'harm',
        icon: 'droplet',
        look: null,
        color: null,
        description: '',
        maxStacks: null,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('Bia removing the condition of her Lyra publishes condition:removed', async () => {
    await service.apply(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, conditionId: abencoado, rounds: 2 });
    const activeId = conditions.active[0]?.id ?? '';
    await service.remove(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, activeConditionId: activeId });
    expect(conditions.active).toEqual([]);
    expect(publisher.conditionEvents.at(-1)).toMatchObject({
      tokenId: LYRA_ID,
      activeConditionId: activeId,
    });
  });

  it('Bia removing the condition the master put on Caio’s Bram publishes condition:removed', async () => {
    await service.apply(ANA_ID, VHARN_ID, { tokenId: BRAM_ID, conditionId: abencoado, rounds: 2 });
    const activeId = conditions.active[0]?.id ?? '';

    const version = await service.remove(BIA_ID, VHARN_ID, {
      tokenId: BRAM_ID,
      activeConditionId: activeId,
    });

    expect(version).toBe(6);
    expect(conditions.active).toEqual([]);
    expect(publisher.conditionEvents.at(-1)).toMatchObject({
      tokenId: BRAM_ID,
      activeConditionId: activeId,
    });
  });

  it('the spectator removing a condition is FORBIDDEN and it stays on the token', async () => {
    await service.apply(ANA_ID, VHARN_ID, { tokenId: BRAM_ID, conditionId: abencoado, rounds: 2 });
    const activeId = conditions.active[0]?.id ?? '';

    await expect(
      service.remove(DUDA_ID, VHARN_ID, { tokenId: BRAM_ID, activeConditionId: activeId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(conditions.active).toHaveLength(1);
  });

  it('removing a condition that is not on the token is CONDITION_NOT_FOUND', async () => {
    await expect(
      service.remove(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, activeConditionId: 'nope' }),
    ).rejects.toMatchObject({ code: 'CONDITION_NOT_FOUND' });
  });

  describe('setRounds', () => {
    async function poisonedInRound1(): Promise<string> {
      await combat.start(VHARN_SCENE_ID, soloEntries(LYRA_ID, BRAM_ID));
      await service.apply(BIA_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        conditionId: abencoado,
        rounds: 3,
      });
      await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 2, null);
      scenes.journal.splice(0);
      return conditions.active[0]?.id ?? '';
    }

    it('Bia setting 2 rounds on her Lyra keeps the round it was applied in and publishes condition:applied once', async () => {
      const activeId = await poisonedInRound1();

      const version = await service.setRounds(BIA_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        activeConditionId: activeId,
        rounds: 2,
      });

      expect(version).toBe(6);
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(conditions.active[0]).toMatchObject({ remainingRounds: 2, appliedRound: 1 });
      expect(publisher.conditionEvents.at(-1)).toEqual({
        campaignId: VHARN_ID,
        sceneId: VHARN_SCENE_ID,
        version: 6,
        at: NOW.toISOString(),
        tokenId: LYRA_ID,
        condition: expect.objectContaining({ id: activeId, remainingRounds: 2 }),
      });
    });

    it('0 rounds leaves the condition without limit', async () => {
      const activeId = await poisonedInRound1();

      await service.setRounds(ANA_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        activeConditionId: activeId,
        rounds: 0,
      });

      expect(conditions.active[0]?.remainingRounds).toBeNull();
    });

    it('the condition of another token is CONDITION_NOT_FOUND and nothing is published', async () => {
      const activeId = await poisonedInRound1();
      const published = publisher.conditionEvents.length;

      await expect(
        service.setRounds(ANA_ID, VHARN_ID, {
          tokenId: BRAM_ID,
          activeConditionId: activeId,
          rounds: 2,
        }),
      ).rejects.toMatchObject({ code: 'CONDITION_NOT_FOUND' });
      expect(publisher.conditionEvents).toHaveLength(published);
    });

    it('Caio, who does not control the Lyra, setting 1 round saves and publishes it', async () => {
      const activeId = await poisonedInRound1();

      const version = await service.setRounds(CAIO_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        activeConditionId: activeId,
        rounds: 1,
      });

      expect(version).toBe(6);
      expect(conditions.active[0]?.remainingRounds).toBe(1);
      expect(publisher.conditionEvents.at(-1)).toMatchObject({
        tokenId: LYRA_ID,
        condition: expect.objectContaining({ id: activeId, remainingRounds: 1 }),
      });
    });

    it('the spectator setting rounds is FORBIDDEN before anything is saved', async () => {
      const activeId = await poisonedInRound1();

      await expect(
        service.setRounds(DUDA_ID, VHARN_ID, {
          tokenId: LYRA_ID,
          activeConditionId: activeId,
          rounds: 2,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(scenes.journal).toEqual([]);
      expect(conditions.active[0]?.remainingRounds).toBe(3);
    });
  });

  describe('applyMany', () => {
    it('the master applying "Abençoado" to Lyra and Bram saves both in one version and one event', async () => {
      const version = await service.applyMany(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, BRAM_ID],
        conditionId: abencoado,
        rounds: 3,
      });
      expect(version).toBe(5);
      expect(scenes.journal).toEqual(['lock', 'save', 'save', 'bump', 'commit', 'publish']);
      expect(publisher.conditionsApplies).toEqual([
        {
          campaignId: VHARN_ID,
          sceneId: VHARN_SCENE_ID,
          version: 5,
          at: NOW.toISOString(),
          applied: [
            { tokenId: LYRA_ID, condition: expect.objectContaining({ remainingRounds: 3 }) },
            { tokenId: BRAM_ID, condition: expect.objectContaining({ name: 'Abençoado' }) },
          ],
        },
      ]);
    });

    it('Bia including Caio’s Bram, which she does not control, applies to the whole group in one version', async () => {
      const version = await service.applyMany(BIA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, BRAM_ID],
        conditionId: abencoado,
        rounds: 1,
      });

      expect(version).toBe(5);
      expect(conditions.active.map(({ tokenId }) => tokenId)).toEqual([LYRA_ID, BRAM_ID]);
      expect(publisher.conditionsApplies).toEqual([
        expect.objectContaining({
          version: 5,
          applied: [
            expect.objectContaining({ tokenId: LYRA_ID }),
            expect.objectContaining({ tokenId: BRAM_ID }),
          ],
        }),
      ]);
    });

    it('the spectator applying to a group is FORBIDDEN and nothing is saved', async () => {
      await expect(
        service.applyMany(DUDA_ID, VHARN_ID, {
          tokenIds: [LYRA_ID, BRAM_ID],
          conditionId: abencoado,
          rounds: 1,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(scenes.journal).toEqual([]);
      expect(conditions.active).toEqual([]);
      expect(publisher.published).toBe(0);
    });

    it('a token outside the scene refuses the group as TOKEN_NOT_FOUND', async () => {
      const ghost = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
      await expect(
        service.applyMany(ANA_ID, VHARN_ID, {
          tokenIds: [LYRA_ID, ghost],
          conditionId: abencoado,
          rounds: 1,
        }),
      ).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
      expect(conditions.active).toEqual([]);
    });

    it('a condition of another table is CONDITION_NOT_FOUND', async () => {
      await expect(
        service.applyMany(ANA_ID, VHARN_ID, {
          tokenIds: [LYRA_ID],
          conditionId: `${QUELM_ID}-Sangrando`,
          rounds: 1,
        }),
      ).rejects.toMatchObject({ code: 'CONDITION_NOT_FOUND' });
    });
  });

  describe('stacks', () => {
    let sangrando: string;

    beforeEach(() => {
      sangrando = conditions.define(VHARN_ID, 'Sangrando', 'harm', 'droplet', null, '', 5);
    });

    function sangrandoOn(tokenId: string, rounds: number) {
      return { tokenId, conditionId: sangrando, rounds };
    }

    async function lyraBleedingTwice(): Promise<string> {
      await service.apply(ANA_ID, VHARN_ID, sangrandoOn(LYRA_ID, 3));
      await service.apply(ANA_ID, VHARN_ID, sangrandoOn(LYRA_ID, 3));
      scenes.journal.splice(0);
      publisher.conditionEvents.splice(0);
      return conditions.active[0]?.id ?? '';
    }

    it('applying Sangrando twice to the Lyra piles up 2 stacks and publishes them', async () => {
      await service.apply(ANA_ID, VHARN_ID, sangrandoOn(LYRA_ID, 1));
      await service.apply(ANA_ID, VHARN_ID, sangrandoOn(LYRA_ID, 1));

      expect(conditions.active).toEqual([expect.objectContaining({ tokenId: LYRA_ID, stacks: 2 })]);
      expect(publisher.conditionEvents.at(-1)).toMatchObject({
        tokenId: LYRA_ID,
        condition: expect.objectContaining({ stacks: 2, maxStacks: 5 }),
      });
    });

    it('the second application renews the rounds and stamps the current combat round again', async () => {
      await service.apply(ANA_ID, VHARN_ID, sangrandoOn(LYRA_ID, 1));
      await combat.start(VHARN_SCENE_ID, soloEntries(LYRA_ID, BRAM_ID));
      await combat.setTurn(`combat-${VHARN_SCENE_ID}`, 2, null);

      await service.apply(ANA_ID, VHARN_ID, sangrandoOn(LYRA_ID, 3));

      expect(conditions.active[0]).toMatchObject({
        stacks: 2,
        remainingRounds: 3,
        appliedRound: 2,
      });
    });

    it('a condition that does not stack applied twice stays at 1 stack', async () => {
      const abencoadoOnLyra = { tokenId: LYRA_ID, conditionId: abencoado, rounds: 1 };
      await service.apply(ANA_ID, VHARN_ID, abencoadoOnLyra);
      await service.apply(ANA_ID, VHARN_ID, abencoadoOnLyra);

      expect(conditions.active.map(({ stacks }) => stacks)).toEqual([1]);
    });

    it('applyMany over the Lyra holding 1 stack and Bram without it gives 2 and 1, in one version and one event', async () => {
      await service.apply(ANA_ID, VHARN_ID, sangrandoOn(LYRA_ID, 1));
      scenes.journal.splice(0);

      const version = await service.applyMany(ANA_ID, VHARN_ID, {
        tokenIds: [LYRA_ID, BRAM_ID],
        conditionId: sangrando,
        rounds: 2,
      });

      expect(version).toBe(6);
      expect(scenes.journal).toEqual(['lock', 'save', 'save', 'bump', 'commit', 'publish']);
      expect(publisher.conditionsApplies).toHaveLength(1);
      const applied = publisher.conditionsApplies[0]?.applied ?? [];
      expect(applied.map(({ tokenId, condition }) => [tokenId, condition.stacks])).toEqual([
        [LYRA_ID, 2],
        [BRAM_ID, 1],
      ]);
    });

    it('Caio setting 4 stacks on the Lyra he does not control saves them, keeps the rounds and publishes condition:applied', async () => {
      const activeId = await lyraBleedingTwice();

      const version = await service.setStacks(CAIO_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        activeConditionId: activeId,
        stacks: 4,
      });

      expect(version).toBe(7);
      expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
      expect(conditions.active[0]).toMatchObject({ stacks: 4, remainingRounds: 3 });
      expect(publisher.conditionEvents).toEqual([
        {
          campaignId: VHARN_ID,
          sceneId: VHARN_SCENE_ID,
          version: 7,
          at: NOW.toISOString(),
          tokenId: LYRA_ID,
          condition: expect.objectContaining({ id: activeId, stacks: 4, remainingRounds: 3 }),
        },
      ]);
    });

    it('setting 6 stacks above the max 5 is INVALID_STACKS: nothing saved, nothing published', async () => {
      const activeId = await lyraBleedingTwice();
      const command = { tokenId: LYRA_ID, activeConditionId: activeId, stacks: 6 };

      await expect(service.setStacks(ANA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'INVALID_STACKS',
        stacks: 6,
        maxStacks: 5,
      });
      expect(scenes.journal).not.toContain('save');
      expect(conditions.active[0]?.stacks).toBe(2);
      expect(publisher.conditionEvents).toEqual([]);
    });

    it('the active id of the Lyra sent with Bram is CONDITION_NOT_FOUND and the Lyra keeps 2', async () => {
      const activeId = await lyraBleedingTwice();
      const command = { tokenId: BRAM_ID, activeConditionId: activeId, stacks: 3 };

      await expect(service.setStacks(ANA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'CONDITION_NOT_FOUND',
      });
      expect(conditions.active[0]?.stacks).toBe(2);
      expect(publisher.conditionEvents).toEqual([]);
    });

    it('the spectator setting stacks is FORBIDDEN before anything is locked', async () => {
      const activeId = await lyraBleedingTwice();
      const command = { tokenId: LYRA_ID, activeConditionId: activeId, stacks: 3 };

      await expect(service.setStacks(DUDA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(scenes.journal).toEqual([]);
      expect(conditions.active[0]?.stacks).toBe(2);
    });
  });

  describe('on a grid that is not the group one', () => {
    it('Bia applying a condition in the private Torre is SCENE_NOT_FOUND before anything is saved', async () => {
      const command = { sceneId: TORRE_ID, tokenId: LYRA_ID, conditionId: abencoado, rounds: 2 };

      await expect(service.apply(BIA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'SCENE_NOT_FOUND',
      });
      expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
    });

    it('Lyra of the group grid addressed to the Torre is TOKEN_NOT_FOUND', async () => {
      const command = { sceneId: TORRE_ID, tokenId: LYRA_ID, conditionId: abencoado, rounds: 2 };

      await expect(service.apply(ANA_ID, VHARN_ID, command)).rejects.toMatchObject({
        code: 'TOKEN_NOT_FOUND',
      });
    });

    it('condition:define naming the Torre stays on the cast: the Torre and the group grid keep their versions', async () => {
      const command = {
        sceneId: TORRE_ID,
        name: 'Atordoado',
        tone: 'harm',
        icon: 'droplet',
        look: null,
        color: null,
        description: '',
        maxStacks: null,
      } as const;

      const version = await service.define(ANA_ID, VHARN_ID, command);

      expect(version).toBe(3);
      expect(scenes.journal[0]).toBe('lock cast');
      expect(scenes.rows.map(({ version }) => version)).toEqual([4, 7, 3]);
      expect(publisher.conditionEvents[0]).toMatchObject({ sceneId: VHARN_CAST_ID, version: 3 });
    });

    it('without sceneId condition:applied carries the group grid', async () => {
      await service.apply(BIA_ID, VHARN_ID, {
        tokenId: LYRA_ID,
        conditionId: abencoado,
        rounds: 2,
      });

      expect(publisher.conditionEvents[0]).toMatchObject({ sceneId: VHARN_SCENE_ID });
    });
  });
});
