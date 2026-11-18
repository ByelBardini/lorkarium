import { beforeEach, describe, expect, it } from 'vitest';
import { ScenesService } from '../../../src/modules/scenes/scenes.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { TORRE_ID, torrePo } from '../../support/library-factories';
import { planAccount } from '../../support/plan-account-fakes';
import {
  BoardPublisherFake,
  ScenesDaoFake,
  SceneTransactionRunnerFake,
} from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';

// The grid of a stored scene (`scenePo`): 20×12, 1.5 m, lines at 30%.
const STORED_GRID = {
  widthCells: 20,
  heightCells: 12,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
};
const OTHER_IDS = ['0d0d0d0d-0d0d-4d0d-8d0d-000000000002', '0d0d0d0d-0d0d-4d0d-8d0d-000000000003'];

describe('ScenesService.configure on the 4th grid of a free table (3 grids)', () => {
  let scenes: ScenesDaoFake;
  let publisher: BoardPublisherFake;
  let service: ScenesService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    ]);
    const older = OTHER_IDS.map((id) => scenePo({ id }));
    scenes = new ScenesDaoFake([scenePo(), ...older, torrePo()]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    scenes.owners.set(VHARN_ID, planAccount({ plan: 'free' }));
    publisher = new BoardPublisherFake(scenes.journal);
    service = new ScenesService({
      members,
      transaction: new SceneTransactionRunnerFake(scenes).run,
      publisher,
      clock: new ClockFake(new Date('2026-11-18T12:00:00Z')),
    });
  });

  it.each([
    ['a new ruler', { ...STORED_GRID, cellDistance: 3 }],
    ['a new size', { ...STORED_GRID, widthCells: 30 }],
  ])('%s is refused with PLAN_LIMIT readOnly, without saving nor publishing', async (_, grid) => {
    const configure = service.configure(ANA_ID, VHARN_ID, { grid, sceneId: TORRE_ID });

    await expect(configure).rejects.toThrow(
      expect.objectContaining({ code: 'PLAN_LIMIT', reason: 'readOnly', stored: 4, limit: 3 }),
    );
    expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
  });

  it('taking the background away is refused too', async () => {
    scenes.rows[3]!.backgroundAssetId = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
    const request = { grid: STORED_GRID, backgroundAssetId: null, sceneId: TORRE_ID };

    await expect(service.configure(ANA_ID, VHARN_ID, request)).rejects.toThrow(
      expect.objectContaining({ code: 'PLAN_LIMIT', reason: 'readOnly' }),
    );
  });

  it('the vision mode alone, with the same grid, is play: saved and published', async () => {
    const request = { grid: STORED_GRID, vision: 'dark', sceneId: TORRE_ID } as const;

    const version = await service.configure(ANA_ID, VHARN_ID, request);

    expect(version).toBe(8);
    expect(publisher.sceneUpdates.map(({ scene }) => scene.vision)).toEqual(['dark']);
  });

  it('a new ruler on the 3rd grid passes', async () => {
    const grid = { ...STORED_GRID, cellDistance: 3 };

    await service.configure(ANA_ID, VHARN_ID, { grid, sceneId: OTHER_IDS[1] });

    expect(scenes.rows[2]!.cellDistance).toBe('3');
  });
});
