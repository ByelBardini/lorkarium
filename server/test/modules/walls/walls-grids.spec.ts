import { beforeEach, describe, expect, it } from 'vitest';
import { WallsService } from '../../../src/modules/walls/walls.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { BIA_ID, QUELM_ID, VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { TORRE_ID, torrePo } from '../../support/library-factories';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { newGrate } from '../../support/walls-factories';
import { SceneWallsFake, WallTransactionRunnerFake, WallsDaoFake } from '../../support/walls-fakes';

const NOW = new Date('2026-10-22T21:00:00Z');
const LIMITS = { walls: 500, segments: 4000 };

describe('wall commands on a grid that is not the group one', () => {
  let scenes: ScenesDaoFake;
  let publisher: BoardPublisherFake;
  let service: WallsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
      campaignMemberPo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' }),
    ]);
    scenes = new ScenesDaoFake([
      scenePo({ version: 4 }),
      torrePo(),
      scenePo({ id: 'quelm-scene', campaignId: QUELM_ID }),
    ]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    publisher = new BoardPublisherFake(scenes.journal);
    const walls = new WallsDaoFake(scenes.journal);
    service = new WallsService({
      members,
      transaction: new WallTransactionRunnerFake(scenes, walls).run,
      publisher,
      clock: new ClockFake(NOW),
      sceneWalls: new SceneWallsFake(),
      limits: LIMITS,
    });
  });

  it('Ana raising a wall in the Torre locks the Torre and wall:createdMany carries it', async () => {
    const created = await service.createMany(ANA_ID, VHARN_ID, {
      sceneId: TORRE_ID,
      walls: [newGrate()],
    });

    expect(created.version).toBe(8);
    expect(scenes.journal[0]).toBe(`lockInCampaign:${TORRE_ID}`);
    expect(publisher.wallsCreates[0]).toMatchObject({ sceneId: TORRE_ID, version: 8 });
  });

  it('Bia opening a door in the private Torre is SCENE_NOT_FOUND before anything is saved', async () => {
    const command = { sceneId: TORRE_ID, wallId: 'any-door', state: 'open' } as const;

    await expect(service.setDoor(BIA_ID, VHARN_ID, command)).rejects.toMatchObject({
      code: 'SCENE_NOT_FOUND',
    });
    expect(scenes.journal).toEqual([`lockInCampaign:${TORRE_ID}`]);
  });

  it("a sceneId of Quelm's grid at Vharn is SCENE_NOT_FOUND", async () => {
    const command = { sceneId: 'quelm-scene', walls: [newGrate()] };

    await expect(service.createMany(ANA_ID, VHARN_ID, command)).rejects.toMatchObject({
      code: 'SCENE_NOT_FOUND',
    });
    expect(publisher.published).toBe(0);
  });
});
