import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionsService } from '../../../src/modules/conditions/conditions.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { ConditionTransactionRunnerFake, ConditionsDaoFake } from '../../support/conditions-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { LYRA_ID, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-15T21:00:00Z');

describe('ConditionsService', () => {
  let scenes: ScenesDaoFake;
  let conditions: ConditionsDaoFake;
  let publisher: BoardPublisherFake;
  let service: ConditionsService;
  let abencoado: string;

  beforeEach(() => {
    const campaigns = new CampaignsDaoFake();
    const members = new CampaignMembersDaoFake(campaigns, {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    const tokens = new TokensDaoFake(scenes.journal, [lyraRow()]);
    conditions = new ConditionsDaoFake(scenes.journal);
    abencoado = conditions.define(VHARN_ID, 'Abençoado', 'benefit');
    conditions.define(QUELM_ID, 'Sangrando', 'harm');
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new ConditionTransactionRunnerFake(scenes, tokens, conditions);
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

  it('0 rounds applies a condition without limit', async () => {
    await service.apply(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, conditionId: abencoado, rounds: 0 });
    expect(conditions.active[0]?.remainingRounds).toBeNull();
  });

  it('Caio applying to Bia’s token is FORBIDDEN and nothing is saved', async () => {
    await expect(
      service.apply(CAIO_ID, VHARN_ID, { tokenId: LYRA_ID, conditionId: abencoado, rounds: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
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

  it('the master defining "Sangrando" adds it and publishes condition:defined', async () => {
    const version = await service.define(ANA_ID, VHARN_ID, { name: 'Sangrando', tone: 'harm' });
    expect(version).toBe(5);
    expect(publisher.conditionEvents).toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({ name: 'Sangrando', tone: 'harm' }),
      }),
    ]);
  });

  it('defining a name the list has (any case) reuses it: no new row, no bump, no event', async () => {
    const version = await service.define(ANA_ID, VHARN_ID, { name: 'abençoado', tone: 'benefit' });
    expect(version).toBe(4);
    expect(conditions.definitions.filter(({ campaignId }) => campaignId === VHARN_ID)).toHaveLength(
      1,
    );
    expect(publisher.published).toBe(0);
  });

  it('a player defining a condition is FORBIDDEN', async () => {
    await expect(
      service.define(BIA_ID, VHARN_ID, { name: 'Sangrando', tone: 'harm' }),
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

  it('removing a condition that is not on the token is CONDITION_NOT_FOUND', async () => {
    await expect(
      service.remove(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, activeConditionId: 'nope' }),
    ).rejects.toMatchObject({ code: 'CONDITION_NOT_FOUND' });
  });
});
