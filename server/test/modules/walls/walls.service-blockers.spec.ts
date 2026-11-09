import { beforeEach, describe, expect, it } from 'vitest';
import { WallsService } from '../../../src/modules/walls/walls.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { AssetsDaoFake } from '../../support/assets-fakes';
import { LYRA_PORTRAIT_ID, QUELM_MAP_ID, lyraPortraitPo } from '../../support/assets-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, QUELM_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { LightsDaoFake } from '../../support/lights-fakes';
import { corridorTorchPo } from '../../support/lights-factories';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { scenePo } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { lyraPo, lyraRow, statueRow } from '../../support/tokens-factories';
import { SceneWallsFake, WallsDaoFake, WallTransactionRunnerFake } from '../../support/walls-fakes';
import { CELL_DOOR_ID, cellDoorPo, northWallPo } from '../../support/walls-factories';

const OTHER_STATUE_ID = 'ab8a7f6e-5d4c-4b3a-8f2e-2d3c4b5a6f7e';
const ROUND_IMAGE_ID = 'bc8a7f6e-5d4c-4b3a-8f2e-2d3c4b5a6f7e';
const SEEING_LYRA = { sightBright: '6.00', sightDim: '0.00' };
// In the 1×4 statue at (5, 3), an L along its top: the line from Lyra to the door runs below it,
// through the empty part of the footprint.
const L_OUTLINE = [
  [
    [0, 0],
    [1, 0],
    [1, 0.2],
    [0.3, 0.2],
    [0.3, 0.4],
    [0, 0.4],
  ],
] as const;
// In a 1×1 token, the strip on its right: the center is out of the shape, the way right crosses it.
const RIGHT_STRIP = [
  [
    [0.7, 0],
    [1, 0],
    [1, 1],
    [0.7, 1],
  ],
] as const;
const AROUND_LYRA = { col: 2, row: 3, width: 3, height: 3 };

describe('WallsService.setDoor with tokens that block sight', () => {
  let scenes: ScenesDaoFake;
  let walls: WallsDaoFake;
  let tokens: TokensDaoFake;
  let lights: LightsDaoFake;
  let assets: AssetsDaoFake;
  let service: WallsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([scenePo({ visionMode: 'dark' })]);
    scenes.activeOf.set(VHARN_ID, scenes.rows[0]!.id);
    walls = new WallsDaoFake(scenes.journal, [cellDoorPo()]);
    tokens = new TokensDaoFake(scenes.journal, [lyraRow({ token: lyraPo(SEEING_LYRA) })]);
    lights = new LightsDaoFake(scenes.journal, []);
    assets = new AssetsDaoFake();
    service = new WallsService({
      members,
      transaction: new WallTransactionRunnerFake(scenes, walls, tokens, lights, assets).run,
      publisher: new BoardPublisherFake(scenes.journal),
      clock: new ClockFake(new Date('2026-11-04T21:00:00Z')),
      sceneWalls: new SceneWallsFake(),
      limits: { walls: 500, segments: 4000 },
    });
  });

  const biaOpens = () => service.setDoor(BIA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' });

  async function expectOutOfSight(): Promise<void> {
    await expect(biaOpens()).rejects.toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: expect.stringContaining(`set door ${CELL_DOOR_ID} out of sight`),
      }),
    );
    expect(walls.rows[0]?.doorState).toBe('closed');
  }

  async function expectOpened(): Promise<void> {
    await biaOpens();
    expect(walls.rows[0]?.doorState).toBe('open');
  }

  function imageOutlined(sightOutline: typeof L_OUTLINE | typeof RIGHT_STRIP | null): void {
    assets.rows.push(lyraPortraitPo({ sightOutline: sightOutline && [...sightOutline] }));
  }

  describe('between Lyra and the door', () => {
    it('a statue hides the door: FORBIDDEN and nothing saved', async () => {
      tokens.rows.push(statueRow());

      await expectOutOfSight();
    });

    it('a statue that no longer blocks leaves the door open to Bia', async () => {
      tokens.rows.push(statueRow({ blocksSight: false }));

      await expectOpened();
    });

    it('a statue moved out of the way leaves the door open to Bia', async () => {
      tokens.rows.push(statueRow({ col: 12 }));

      await expectOpened();
    });

    it('a statue hides the door in daylight too, where only the line of sight counts', async () => {
      scenes.rows[0]!.visionMode = 'daylight';
      tokens.rows.push(statueRow());

      await expectOutOfSight();
    });
  });

  describe('by the shape of the image', () => {
    it('an L whose empty part the line runs through lets the door be seen', async () => {
      imageOutlined(L_OUTLINE);
      tokens.rows.push(statueRow({ imageAssetId: LYRA_PORTRAIT_ID }));

      await expectOpened();
    });

    it('the same image on the round frame blocks by the disc', async () => {
      imageOutlined(L_OUTLINE);
      tokens.rows.push(statueRow({ imageAssetId: LYRA_PORTRAIT_ID, frame: 'round' }));

      await expectOutOfSight();
    });

    it('an image sent before the feature blocks by the footprint', async () => {
      imageOutlined(null);
      tokens.rows.push(statueRow({ imageAssetId: LYRA_PORTRAIT_ID }));

      await expectOutOfSight();
    });

    it('an image of another table is never read: the statue blocks by the footprint', async () => {
      const foreign = { id: QUELM_MAP_ID, campaignId: QUELM_ID, sightOutline: [...L_OUTLINE] };
      assets.rows.push(lyraPortraitPo(foreign));
      tokens.rows.push(statueRow({ imageAssetId: QUELM_MAP_ID }));

      await expectOutOfSight();
    });
  });

  describe('what each eye leaves out', () => {
    it('Lyra standing inside the shape sees the door on the other side', async () => {
      tokens.rows.push(statueRow(AROUND_LYRA));

      await expectOpened();
    });

    it('standing inside one statue does not see through another', async () => {
      tokens.rows.push(statueRow({ ...AROUND_LYRA, id: OTHER_STATUE_ID }), statueRow());

      await expectOutOfSight();
    });

    it('a Lyra who blocks sight does not hide the door from herself, center out of her shape', async () => {
      imageOutlined(RIGHT_STRIP);
      const blocker = { ...SEEING_LYRA, blocksSight: true, imageAssetId: LYRA_PORTRAIT_ID };
      tokens.rows[0] = lyraRow({ token: lyraPo(blocker) });

      await expectOpened();
    });
  });

  describe('the lights', () => {
    // A torch below the door (x = 7, y from 5 to 6); the statue stands between them, off Lyra's way.
    const TORCH_BELOW = { x: '7.00', y: '9.00', bright: '4.00', dim: '0.00' };
    const BELOW_THE_DOOR = { col: 6, row: 7, width: 2, height: 1 };

    beforeEach(() => {
      tokens.rows[0] = lyraRow();
    });

    it('a torch with nothing in the way shows the door to a Lyra without darkvision', async () => {
      lights.rows.push(corridorTorchPo(TORCH_BELOW));

      await expectOpened();
    });

    it('a torch behind the statue does not show the door', async () => {
      lights.rows.push(corridorTorchPo(TORCH_BELOW));
      tokens.rows.push(statueRow(BELOW_THE_DOOR));

      await expectOutOfSight();
    });

    it('a torch inside the statue shines out and shows the door', async () => {
      lights.rows.push(corridorTorchPo({ ...TORCH_BELOW, y: '7.50' }));
      tokens.rows.push(statueRow(BELOW_THE_DOOR));

      await expectOpened();
    });

    it('the lantern of the statue itself shines out and shows the door', async () => {
      const lantern = { lightBright: '4.00', lightDim: '0.00', lightLit: true };
      tokens.rows.push(statueRow({ ...BELOW_THE_DOOR, ...lantern }));

      await expectOpened();
    });
  });

  it('a hidden statue does not block, and its image is not read', async () => {
    imageOutlined(null);
    tokens.rows.push(statueRow({ hidden: true, imageAssetId: LYRA_PORTRAIT_ID }));

    await expectOpened();
    expect(assets.lookups.flat()).toEqual([]);
  });

  it('a statue on another grid of the table does not block', async () => {
    tokens.rows.push(statueRow({ sceneId: 'another-grid' }));

    await expectOpened();
  });

  describe('what it costs', () => {
    function crowdedScene(lightCount: number): void {
      for (let at = 0; at < 3999; at += 1) walls.rows.push(northWallPo({ id: `line-${at}` }));
      for (let at = 0; at < lightCount; at += 1)
        lights.rows.push(corridorTorchPo({ id: `l${at}` }));
    }

    it('past the budget of wall checks the door stays and the answer says why', async () => {
      crowdedScene(84);

      await expect(biaOpens()).rejects.toMatchObject({ code: 'WALL_CHECKS_EXCEEDED' });

      expect(walls.rows[0]?.doorState).toBe('closed');
    });

    it('the master never spends the budget: no sight check runs', async () => {
      crowdedScene(84);

      await service.setDoor(ANA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' });

      expect(walls.rows[0]?.doorState).toBe('open');
    });

    it('a scene without a blocker reads no outline', async () => {
      await expectOpened();

      expect(assets.lookups.flat()).toEqual([]);
    });

    it('the master opens the door behind the statue without reading any outline', async () => {
      tokens.rows.push(statueRow({ imageAssetId: LYRA_PORTRAIT_ID }));

      await service.setDoor(ANA_ID, VHARN_ID, { wallId: CELL_DOOR_ID, state: 'open' });

      expect(walls.rows[0]?.doorState).toBe('open');
      expect(assets.lookups).toEqual([]);
    });

    it('with the vision off, Bia opens the door without reading any outline', async () => {
      scenes.rows[0]!.visionMode = 'off';
      tokens.rows.push(statueRow({ imageAssetId: LYRA_PORTRAIT_ID }));

      await expectOpened();
      expect(assets.lookups).toEqual([]);
    });

    it('asks once for each image on the square frame, none for the round one or no image', async () => {
      tokens.rows.push(
        statueRow({ col: 12, imageAssetId: LYRA_PORTRAIT_ID }),
        statueRow({ id: OTHER_STATUE_ID, col: 14, imageAssetId: LYRA_PORTRAIT_ID }),
        statueRow({ col: 16, imageAssetId: ROUND_IMAGE_ID, frame: 'round' }),
        statueRow({ col: 18 }),
      );

      await expectOpened();

      expect(assets.lookups).toEqual([[LYRA_PORTRAIT_ID]]);
    });
  });
});
