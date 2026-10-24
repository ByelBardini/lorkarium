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
import { TORRE_ID } from '../../support/library-factories';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { LYRA_PORTRAIT_ID, QUELM_MAP_ID, lyraPortraitPo } from '../../support/assets-factories';

const NOW = new Date('2026-10-15T21:00:00Z');
const GRID_30_BY_20 = {
  widthCells: 30,
  heightCells: 20,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 15,
};

const ONLY_GRID = { grid: GRID_30_BY_20 };

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
    const assets = new AssetsDaoFake(
      [],
      [
        lyraPortraitPo({ width: 1400, height: 700 }),
        lyraPortraitPo({ id: QUELM_MAP_ID, campaignId: QUELM_ID }),
      ],
    );
    const transaction = new SceneTransactionRunnerFake(scenes, assets);
    service = new ScenesService({
      members,
      transaction: transaction.run,
      publisher,
      clock: new ClockFake(NOW),
    });
  });

  it('the master configuring the grid locks, saves and bumps before publishing, after the commit', async () => {
    await service.configure(ANA_ID, VHARN_ID, ONLY_GRID);
    expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
  });

  it('the published scene:updated carries the new grid and version 5, and the call returns 5', async () => {
    const version = await service.configure(ANA_ID, VHARN_ID, ONLY_GRID);
    expect(version).toBe(5);
    expect(publisher.sceneUpdates).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: VHARN_SCENE_ID,
        version: 5,
        at: NOW.toISOString(),
        scene: expect.objectContaining({ id: VHARN_SCENE_ID, ...GRID_30_BY_20 }),
      },
    ]);
  });

  // The grid is reached first (under its lock), so a private one answers SCENE_NOT_FOUND below.
  it('a player in the group grid is refused with FORBIDDEN and nothing is saved, bumped nor published', async () => {
    await expect(service.configure(BIA_ID, VHARN_ID, ONLY_GRID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(scenes.journal).toEqual(['lock']);
    expect(scenes.rows[0]).toMatchObject({ widthCells: 20, version: 4 });
  });

  it('someone who is not a member gets CAMPAIGN_NOT_FOUND and nothing is touched', async () => {
    await expect(service.configure(ANA_ID, QUELM_ID, ONLY_GRID)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_FOUND',
    });
    expect(scenes.journal).toEqual([]);
  });

  it('a background of the campaign is saved and published with the pixels of the image', async () => {
    await service.configure(ANA_ID, VHARN_ID, {
      grid: GRID_30_BY_20,
      backgroundAssetId: LYRA_PORTRAIT_ID,
    });

    expect(scenes.rows[0]?.backgroundAssetId).toBe(LYRA_PORTRAIT_ID);
    expect(publisher.sceneUpdates[0]?.scene.background).toEqual({
      assetId: LYRA_PORTRAIT_ID,
      width: 1400,
      height: 700,
    });
    expect(scenes.journal).toEqual(['lock', 'save', 'bump', 'commit', 'publish']);
  });

  it('a null background takes it away and keeps the cells sent', async () => {
    scenes.rows[0]!.backgroundAssetId = LYRA_PORTRAIT_ID;

    await service.configure(ANA_ID, VHARN_ID, { grid: GRID_30_BY_20, backgroundAssetId: null });

    expect(scenes.rows[0]).toMatchObject({ backgroundAssetId: null, widthCells: 30 });
    expect(publisher.sceneUpdates[0]?.scene.background).toBeNull();
  });

  it('no background in the command keeps the one the scene has', async () => {
    scenes.rows[0]!.backgroundAssetId = LYRA_PORTRAIT_ID;
    scenes.backgrounds.set(LYRA_PORTRAIT_ID, { width: 1400, height: 700 });

    await service.configure(ANA_ID, VHARN_ID, ONLY_GRID);

    expect(scenes.rows[0]?.backgroundAssetId).toBe(LYRA_PORTRAIT_ID);
    expect(publisher.sceneUpdates[0]?.scene.background?.width).toBe(1400);
  });

  it('the vision dark is saved and published with the scene', async () => {
    await service.configure(ANA_ID, VHARN_ID, { grid: GRID_30_BY_20, vision: 'dark' });

    expect(scenes.rows[0]?.visionMode).toBe('dark');
    expect(publisher.sceneUpdates[0]?.scene.vision).toBe('dark');
  });

  it('no vision in the command keeps the mode the scene has', async () => {
    scenes.rows[0]!.visionMode = 'daylight';

    await service.configure(ANA_ID, VHARN_ID, ONLY_GRID);

    expect(scenes.rows[0]?.visionMode).toBe('daylight');
    expect(publisher.sceneUpdates[0]?.scene.vision).toBe('daylight');
  });

  it('a player setting the vision is refused with FORBIDDEN and the mode stays', async () => {
    await expect(
      service.configure(BIA_ID, VHARN_ID, { grid: GRID_30_BY_20, vision: 'dark' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(scenes.rows[0]?.visionMode).toBe('off');
  });

  it('an asset of another campaign is ASSET_NOT_FOUND without saving, bumping or publishing', async () => {
    const configure = service.configure(ANA_ID, VHARN_ID, {
      grid: GRID_30_BY_20,
      backgroundAssetId: QUELM_MAP_ID,
    });

    await expect(configure).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
    expect(scenes.journal).toEqual(['lock']);
    expect(scenes.rows[0]).toMatchObject({ widthCells: 20, version: 4, backgroundAssetId: null });
  });

  describe('a grid that is not the group one (sceneId)', () => {
    const QUELM_GRID_ID = '4e5f6a7b-8c9d-4e0f-8a1b-3c4d5e6f7a8b';

    beforeEach(() => {
      scenes.rows.push(scenePo({ id: TORRE_ID, name: 'Torre', version: 0 }));
      scenes.rows.push(scenePo({ id: QUELM_GRID_ID, campaignId: QUELM_ID, visibility: 'public' }));
    });

    it('Ana configuring the Torre locks that grid and bumps its version, leaving the group grid', async () => {
      const version = await service.configure(ANA_ID, VHARN_ID, {
        ...ONLY_GRID,
        sceneId: TORRE_ID,
      });

      expect(version).toBe(1);
      expect(scenes.journal).toEqual([
        `lockInCampaign:${TORRE_ID}`,
        'save',
        'bump',
        'commit',
        'publish',
      ]);
      expect(scenes.rows.find(({ id }) => id === TORRE_ID)).toMatchObject({ widthCells: 30 });
      expect(scenes.rows[0]).toMatchObject({ widthCells: 20, version: 4 });
    });

    it('the scene:updated of the Torre names the Torre as its sceneId', async () => {
      await service.configure(ANA_ID, VHARN_ID, { ...ONLY_GRID, sceneId: TORRE_ID });

      expect(publisher.sceneUpdates).toEqual([
        expect.objectContaining({
          sceneId: TORRE_ID,
          version: 1,
          scene: expect.objectContaining({ id: TORRE_ID }),
        }),
      ]);
    });

    it('Bia in the private Torre gets SCENE_NOT_FOUND, never FORBIDDEN, with no bump nor publish', async () => {
      const configure = service.configure(BIA_ID, VHARN_ID, { ...ONLY_GRID, sceneId: TORRE_ID });

      await expect(configure).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
      expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
      expect(publisher.sceneUpdates).toEqual([]);
    });

    it('a grid of another table is SCENE_NOT_FOUND even for the master', async () => {
      const configure = service.configure(ANA_ID, VHARN_ID, {
        ...ONLY_GRID,
        sceneId: QUELM_GRID_ID,
      });

      await expect(configure).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
      expect(scenes.rows.find(({ id }) => id === QUELM_GRID_ID)).toMatchObject({ version: 0 });
    });
  });
});
