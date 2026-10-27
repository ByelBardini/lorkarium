import { beforeEach, describe, expect, it } from 'vitest';
import type { CampaignRole } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  SceneWatchService,
  type SceneShareDaos,
} from '../../../src/modules/scenes/scene-watch.service';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, QUELM_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { TORRE_ID } from '../../support/library-factories';
import { ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_CAST_ID, VHARN_SCENE_ID, castPo, scenePo } from '../../support/scenes-factories';

describe('SceneWatchService', () => {
  let scenes: ScenesDaoFake;
  let service: SceneWatchService;
  let entered: CampaignRole[];

  const enter = (role: CampaignRole): void => {
    scenes.journal.push('enter');
    entered.push(role);
  };

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([scenePo(), scenePo({ id: TORRE_ID, name: 'Torre' }), castPo()]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    entered = [];
    const share = async <T>(work: (daos: SceneShareDaos) => Promise<T>): Promise<T> => {
      const result = await work({ scenes });
      scenes.journal.push('commit');
      return result;
    };
    service = new SceneWatchService({ members, share, scenes });
  });

  it('Ana watching the private Torre enters its rooms as master while the share lock is held', async () => {
    await service.watch(ANA_ID, VHARN_ID, TORRE_ID, enter);

    expect(scenes.journal).toEqual([`share:${TORRE_ID}`, 'enter', 'commit']);
    expect(entered).toEqual(['master']);
  });

  it('Bia watching the public Torre enters its rooms as player', async () => {
    scenes.rows[1]!.visibility = 'public';

    await service.watch(BIA_ID, VHARN_ID, TORRE_ID, enter);

    expect(entered).toEqual(['player']);
  });

  it('Bia watching the private Torre gets SCENE_NOT_FOUND and enters no room', async () => {
    const watch = service.watch(BIA_ID, VHARN_ID, TORRE_ID, enter);

    await expect(watch).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(entered).toEqual([]);
  });

  it('a grid the table does not have is SCENE_NOT_FOUND, even for the master', async () => {
    const watch = service.watch(ANA_ID, VHARN_ID, '4e5f6a7b-8c9d-4e0f-8a1b-3c4d5e6f7a8b', enter);

    await expect(watch).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(entered).toEqual([]);
  });

  it('someone who is not a member gets CAMPAIGN_NOT_FOUND before any lock', async () => {
    await expect(service.watch(ANA_ID, QUELM_ID, TORRE_ID, enter)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(scenes.journal).toEqual([]);
  });

  it('castSceneIdOf names the cast of the table, and null for a table without one', async () => {
    expect(await service.castSceneIdOf(VHARN_ID)).toBe(VHARN_CAST_ID);
    expect(await service.castSceneIdOf(QUELM_ID)).toBeNull();
  });

  it('Bia watching the cast is refused with SCENE_NOT_FOUND and enters no room', async () => {
    const watch = service.watch(BIA_ID, VHARN_ID, VHARN_CAST_ID, enter);
    await expect(watch).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(entered).toEqual([]);
  });

  it('groupSceneIdOf names the active scene of the table', async () => {
    expect(await service.groupSceneIdOf(VHARN_ID)).toBe(VHARN_SCENE_ID);
  });

  it('groupSceneIdOf of a table without an active scene is null', async () => {
    expect(await service.groupSceneIdOf(QUELM_ID)).toBeNull();
  });

  it('privateGridIdsOf lists the private grids of Vharn a player does not see: the Torre only', async () => {
    const estrada = scenePo({ id: 'estrada', name: 'Estrada', visibility: 'public' });
    scenes.rows.push(estrada, scenePo({ id: 'pantano', campaignId: QUELM_ID }));

    // The group grid stays out though private: every member sees it; the cast is no grid.
    expect(await service.privateGridIdsOf(VHARN_ID)).toEqual([TORRE_ID]);
  });
});
