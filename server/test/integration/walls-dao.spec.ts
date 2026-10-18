import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { WallsDao } from '../../src/modules/walls/walls.dao';
import type { NewWallPo, WallPo } from '../../src/modules/walls/walls.po';
import { eq } from 'drizzle-orm';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('WallsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let walls: WallsDao;
  let sceneId: string;
  let otherSceneId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    walls = new WallsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const anaId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    const campaigns = new CampaignsDao(connection.db);
    const vharn = await campaigns.insert(newCampaignPo({ ownerId: anaId }));
    const quelm = await campaigns.insert(
      newCampaignPo({ ownerId: anaId, name: 'Quelm', joinCode: 'QELM2345' }),
    );
    const scenesDao = new ScenesDao(connection.db);
    sceneId = (await scenesDao.insert({ campaignId: vharn.id })).id;
    otherSceneId = (await scenesDao.insert({ campaignId: quelm.id })).id;
  });

  afterAll(() => connection.close());

  function northLine(overrides: Partial<NewWallPo> = {}): NewWallPo {
    return {
      sceneId,
      kind: 'wall',
      shape: 'line',
      x: '2.50',
      y: '2.00',
      width: '4.00',
      height: '0.00',
      points: [
        [0, 0],
        [4, 0],
      ],
      doorState: null,
      ...overrides,
    };
  }

  function grateBox(overrides: Partial<NewWallPo> = {}): NewWallPo {
    return northLine({
      kind: 'grate',
      shape: 'rectangle',
      height: '3.00',
      points: null,
      ...overrides,
    });
  }

  async function savedOne(row: NewWallPo): Promise<WallPo> {
    const [saved] = await walls.insertMany([row]);
    if (!saved) throw new Error('insertMany returned no wall');
    return saved;
  }

  it('insertMany returns the rows in the order sent and listOfScene reads them by wall_order', async () => {
    const inserted = await walls.insertMany([grateBox(), northLine()]);
    await walls.insertMany([northLine({ kind: 'curtain' })]);

    expect(inserted.map(({ kind }) => kind)).toEqual(['grate', 'wall']);
    expect((await walls.listOfScene(sceneId)).map(({ kind }) => kind)).toEqual([
      'grate',
      'wall',
      'curtain',
    ]);
  });

  it('a numeric "2.50" comes back as the numeric string and the points come back equal', async () => {
    const saved = await savedOne(northLine());

    expect(saved).toMatchObject({ x: '2.50', width: '4.00', height: '0.00' });
    expect(saved.points).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });

  it('findManyInScene leaves out the id of a wall in another scene', async () => {
    const here = await savedOne(northLine());
    const there = await savedOne(northLine({ sceneId: otherSceneId }));

    const found = await walls.findManyInScene(sceneId, [here.id, there.id]);

    expect(found.map(({ id }) => id)).toEqual([here.id]);
  });

  it('moveMany changes only x and y', async () => {
    const saved = await savedOne(northLine());

    await walls.moveMany(sceneId, [{ wallId: saved.id, x: '7.25', y: '1.00' }]);

    const [moved] = await walls.listOfScene(sceneId);
    expect(moved).toMatchObject({ x: '7.25', y: '1.00', width: '4.00', kind: 'wall' });
    expect(moved?.points).toEqual(saved.points);
  });

  it('setKinds changes the kind and the door state together', async () => {
    const saved = await savedOne(northLine());

    await walls.setKinds(sceneId, [{ wallId: saved.id, kind: 'door', doorState: 'closed' }]);

    const [changed] = await walls.listOfScene(sceneId);
    expect(changed).toMatchObject({ kind: 'door', doorState: 'closed', x: '2.50' });
  });

  it('setDoor changes only the door state', async () => {
    const door = await savedOne(northLine({ kind: 'door', doorState: 'closed' }));

    await walls.setDoor(sceneId, door.id, 'open');

    const [opened] = await walls.listOfScene(sceneId);
    expect(opened).toMatchObject({ kind: 'door', doorState: 'open', x: '2.50' });
  });

  it('deleteMany removes only the given walls of the scene', async () => {
    const [first, second] = await walls.insertMany([northLine(), grateBox()]);
    if (!first || !second) throw new Error('insertMany returned fewer walls');

    await walls.deleteMany(sceneId, [first.id]);

    expect((await walls.listOfScene(sceneId)).map(({ id }) => id)).toEqual([second.id]);
  });

  it('moving, changing, opening and deleting with an id of Quelm leave the Quelm row intact', async () => {
    const quelmDoor = await savedOne(
      northLine({ sceneId: otherSceneId, kind: 'door', doorState: 'closed' }),
    );

    await walls.moveMany(sceneId, [{ wallId: quelmDoor.id, x: '9.00', y: '9.00' }]);
    await walls.setKinds(sceneId, [{ wallId: quelmDoor.id, kind: 'grate', doorState: null }]);
    await walls.setDoor(sceneId, quelmDoor.id, 'open');
    await walls.deleteMany(sceneId, [quelmDoor.id]);

    const [kept] = await walls.listOfScene(otherSceneId);
    expect(kept).toMatchObject({ id: quelmDoor.id, x: '2.50', kind: 'door', doorState: 'closed' });
  });

  it('deleting the scene deletes its walls (cascade)', async () => {
    await savedOne(northLine());

    await connection.db.delete(scenes).where(eq(scenes.id, sceneId));

    expect(await walls.listOfScene(sceneId)).toEqual([]);
  });

  it.each([
    ['a door without a state', northLine({ kind: 'door', doorState: null })],
    ['a wall with a door state', northLine({ doorState: 'open' })],
    ['a rectangular door', grateBox({ kind: 'door', doorState: 'closed' })],
  ])('the CHECK refuses %s', async (_name, row) => {
    await expect(walls.insertMany([row])).rejects.toThrow();
  });
});
