import { beforeEach, describe, expect, it } from 'vitest';
import { WallsService } from '../../../src/modules/walls/walls.service';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { CampaignMembersDaoFake, CampaignsDaoFake } from '../../support/campaigns-fakes';
import { VHARN_ID, campaignMemberPo } from '../../support/campaigns-factories';
import { planAccount } from '../../support/plan-account-fakes';
import { BoardPublisherFake, ScenesDaoFake } from '../../support/scenes-fakes';
import { VHARN_SCENE_ID, scenePo } from '../../support/scenes-factories';
import { SceneWallsFake, WallsDaoFake, WallTransactionRunnerFake } from '../../support/walls-fakes';
import {
  CELL_DOOR_ID,
  NORTH_WALL_ID,
  cellDoorPo,
  newGrate,
  northWallPo,
} from '../../support/walls-factories';

// Three grids older than the group one: at a free table (3 grids) the group grid is the 4th.
const OLDER = [1, 2, 3].map((n) => `0d0d0d0d-0d0d-4d0d-8d0d-00000000000${n}`);
const THIRD = OLDER[2]!;

const readOnly = expect.objectContaining({
  code: 'PLAN_LIMIT',
  reason: 'readOnly',
  resource: 'scenes',
  stored: 4,
  limit: 3,
});

describe('WallsService on the 4th grid of a free table', () => {
  let scenes: ScenesDaoFake;
  let walls: WallsDaoFake;
  let publisher: BoardPublisherFake;
  let service: WallsService;

  beforeEach(() => {
    const members = new CampaignMembersDaoFake(new CampaignsDaoFake(), {}, [
      campaignMemberPo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' }),
    ]);
    scenes = new ScenesDaoFake([...OLDER.map((id) => scenePo({ id })), scenePo({ version: 4 })]);
    scenes.activeOf.set(VHARN_ID, VHARN_SCENE_ID);
    scenes.owners.set(VHARN_ID, planAccount({ plan: 'free' }));
    walls = new WallsDaoFake(scenes.journal, [northWallPo(), cellDoorPo()]);
    publisher = new BoardPublisherFake(scenes.journal);
    service = new WallsService({
      members,
      transaction: new WallTransactionRunnerFake(scenes, walls).run,
      publisher,
      clock: new ClockFake(new Date('2026-11-18T12:00:00Z')),
      sceneWalls: new SceneWallsFake(),
      limits: { walls: 500, segments: 4000 },
    });
  });

  it('a new wall is refused with PLAN_LIMIT readOnly, nothing saved nor published', async () => {
    await expect(service.createMany(ANA_ID, VHARN_ID, { walls: [newGrate()] })).rejects.toThrow(
      readOnly,
    );

    expect(scenes.journal).toEqual(['lock']);
    expect(walls.rows).toHaveLength(2);
  });

  it.each([
    [
      'deleting a wall',
      (s: WallsService) => s.deleteMany(ANA_ID, VHARN_ID, { wallIds: [NORTH_WALL_ID] }),
    ],
    [
      'turning a wall into a grate',
      (s: WallsService) =>
        s.setKindMany(ANA_ID, VHARN_ID, { wallIds: [NORTH_WALL_ID], kind: 'grate' }),
    ],
    [
      'erasing an area',
      (s: WallsService) =>
        s.eraseArea(ANA_ID, VHARN_ID, { box: { x: 0, y: 0, width: 20, height: 12 } }),
    ],
  ])('%s is refused with PLAN_LIMIT readOnly', async (_, command) => {
    await expect(command(service)).rejects.toThrow(readOnly);
    expect(walls.rows).toHaveLength(2);
  });

  it('the master opening the door is play: confirmed and published', async () => {
    const version = await service.setDoor(ANA_ID, VHARN_ID, {
      wallId: CELL_DOOR_ID,
      state: 'open',
    });

    expect(version).toBe(5);
    expect(publisher.doorChanges.map(({ doorState }) => doorState)).toEqual(['open']);
  });

  it('a new wall on the 3rd grid passes', async () => {
    const created = await service.createMany(ANA_ID, VHARN_ID, {
      walls: [newGrate()],
      sceneId: THIRD,
    });

    expect(created.createdIds).toHaveLength(1);
  });
});
