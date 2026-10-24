import { describe, expect, it } from 'vitest';
import { SceneWallsService } from '../../../src/modules/walls/scene-walls.service';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { WallListingsFake } from '../../support/walls-fakes';
import { NORTH_WALL_ID, cellDoorPo, northWallPo } from '../../support/walls-factories';

const QUELM_SCENE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('SceneWallsService', () => {
  it('the second read of the same scene does not go to the DAO and is the same wall array', async () => {
    const dao = new WallListingsFake([northWallPo(), cellDoorPo()]);
    const memory = new SceneWallsService();
    const first = await memory.wallsOf(VHARN_SCENE_ID, dao);
    const second = await memory.wallsOf(VHARN_SCENE_ID, dao);
    expect(second.walls).toBe(first.walls);
    expect(second.placed.map(({ id }) => id)).toEqual([NORTH_WALL_ID, cellDoorPo().id]);
    expect(dao.listed).toEqual([VHARN_SCENE_ID]);
  });

  it('each placed wall carries the very wall of the array, so a door is found by identity', async () => {
    const known = await new SceneWallsService().wallsOf(
      VHARN_SCENE_ID,
      new WallListingsFake([cellDoorPo()]),
    );
    expect(known.placed[0]?.wall).toBe(known.walls[0]);
  });

  it('after forget(scene) the next read goes to the DAO and sees the new wall', async () => {
    const dao = new WallListingsFake([northWallPo()]);
    const memory = new SceneWallsService();
    await memory.wallsOf(VHARN_SCENE_ID, dao);
    dao.rows.push(cellDoorPo());
    memory.forget(VHARN_SCENE_ID);
    expect((await memory.wallsOf(VHARN_SCENE_ID, dao)).placed).toHaveLength(2);
    expect(dao.listed).toEqual([VHARN_SCENE_ID, VHARN_SCENE_ID]);
  });

  it('different scenes do not mix: the walls of one are never answered for the other', async () => {
    const dao = new WallListingsFake([northWallPo()]);
    const memory = new SceneWallsService();
    await memory.wallsOf(VHARN_SCENE_ID, dao);
    expect((await memory.wallsOf(QUELM_SCENE_ID, dao)).placed).toEqual([]);
    expect(dao.listed).toEqual([VHARN_SCENE_ID, QUELM_SCENE_ID]);
  });

  it('at the scene limit the memory starts over and the next read goes to the DAO', async () => {
    const dao = new WallListingsFake([northWallPo()]);
    const memory = new SceneWallsService(1);
    await memory.wallsOf(VHARN_SCENE_ID, dao);
    await memory.wallsOf(QUELM_SCENE_ID, dao);
    await memory.wallsOf(VHARN_SCENE_ID, dao);
    expect(dao.listed).toEqual([VHARN_SCENE_ID, QUELM_SCENE_ID, VHARN_SCENE_ID]);
  });
});
