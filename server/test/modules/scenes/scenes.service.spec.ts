import { beforeEach, describe, expect, it } from 'vitest';
import { ScenesService } from '../../../src/modules/scenes/scenes.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, QUELM_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import {
  BoardPublisherFake,
  ScenesDaoFake,
  SceneTransactionRunnerFake,
} from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';

const NOW = new Date('2026-10-15T21:00:00Z');
const GRID_30_BY_20 = {
  widthCells: 30,
  heightCells: 20,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 15,
};

describe('ScenesService', () => {
  let scenes: ScenesDaoFake;
  let publisher: BoardPublisherFake;
  let service: ScenesService;

  beforeEach(() => {
    const campaigns = new CampaignsDaoFake();
    const members = new CampaignMembersDaoFake(campaigns, {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    publisher = new BoardPublisherFake(scenes.journal);
    const transaction = new SceneTransactionRunnerFake(scenes);
    service = new ScenesService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('the master configuring the grid locks, saves and bumps before publishing, after the commit', async () => {
    await service.configure(ANA_ID, VHARN_ID, GRID_30_BY_20);
    expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
  });

  it('the published scene:updated carries the new grid and version 5, and the call returns 5', async () => {
    const version = await service.configure(ANA_ID, VHARN_ID, GRID_30_BY_20);
    expect(version).toBe(5);
    expect(publisher.sceneUpdates).toEqual([
      {
        campaignId: VHARN_ID,
        version: 5,
        at: NOW.toISOString(),
        scene: expect.objectContaining({ id: VHARN_SCENE_ID, ...GRID_30_BY_20 }),
      },
    ]);
  });

  it('a player is refused with FORBIDDEN and nothing is saved nor published', async () => {
    await expect(service.configure(BIA_ID, VHARN_ID, GRID_30_BY_20)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(scenes.journal).toEqual([]);
    expect(scenes.rows[0]).toMatchObject({ widthCells: 20, version: 4 });
  });

  it('someone who is not a member gets CAMPAIGN_NOT_FOUND and nothing is touched', async () => {
    await expect(service.configure(ANA_ID, QUELM_ID, GRID_30_BY_20)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(scenes.journal).toEqual([]);
  });
});
