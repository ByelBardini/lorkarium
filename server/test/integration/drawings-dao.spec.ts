import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { DrawingsDao } from '../../src/modules/drawings/drawings.dao';
import type { NewDrawingPo } from '../../src/modules/drawings/drawings.po';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { CountingQueryLog } from '../support/query-count';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('DrawingsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let drawings: DrawingsDao;
  let sceneId: string;
  let otherSceneId: string;
  let biaId: string;

  const queries = new CountingQueryLog();

  beforeAll(async () => {
    connection = await openTestDatabase({ queryLog: queries });
    drawings = new DrawingsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const usersDao = new UsersDao(connection.db);
    const anaId = (await usersDao.insert(newUserPo())).id;
    biaId = (await usersDao.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
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

  function square(overrides: Partial<NewDrawingPo> = {}): NewDrawingPo {
    return {
      sceneId,
      authorId: biaId,
      kind: 'rectangle',
      x: '2.50',
      y: '3.00',
      width: '2.00',
      height: '2.00',
      points: null,
      stroke: 'gold',
      fill: 'ember',
      strokeWidth: 'medium',
      ...overrides,
    };
  }

  function path(overrides: Partial<NewDrawingPo> = {}): NewDrawingPo {
    const points: [number, number][] = [
      [0, 0],
      [1.25, 0.5],
      [2, 1],
    ];
    return square({ kind: 'freehand', fill: null, points, width: '2', height: '1', ...overrides });
  }

  it('insertMany saves a square and a path and listOfScene reads them back in creation order', async () => {
    await drawings.insertMany([square(), path()]);

    const listed = await drawings.listOfScene(sceneId);

    expect(listed.map(({ kind }) => kind)).toEqual(['rectangle', 'freehand']);
    expect(listed[0]).toMatchObject({ x: '2.50', fill: 'ember', authorId: biaId });
    expect(listed[1]?.points).toEqual([
      [0, 0],
      [1.25, 0.5],
      [2, 1],
    ]);
  });

  it('a later insert is listed after an earlier one', async () => {
    await drawings.insertMany([square({ stroke: 'violet' })]);
    await drawings.insertMany([square({ stroke: 'moss' })]);

    const listed = await drawings.listOfScene(sceneId);

    expect(listed.map(({ stroke }) => stroke)).toEqual(['violet', 'moss']);
  });

  it('moveMany changes only the corner of each drawing', async () => {
    const [saved] = await drawings.insertMany([path()]);
    if (!saved) throw new Error('insertMany returned no drawing');

    await drawings.moveMany(sceneId, [{ drawingId: saved.id, x: '7.25', y: '1.00' }]);

    const [moved] = await drawings.listOfScene(sceneId);
    expect(moved).toMatchObject({ x: '7.25', y: '1.00', width: '2.00', points: saved.points });
  });

  it('moveMany of two drawings is 1 UPDATE, and a drawing of another scene in it does not move', async () => {
    const [first, second] = await drawings.insertMany([square(), path()]);
    const [theirs] = await drawings.insertMany([square({ sceneId: otherSceneId })]);
    if (!first || !second || !theirs) throw new Error('insertMany returned fewer drawings');
    const moves = [first, second, theirs].map(({ id }) => ({
      drawingId: id,
      x: '6.00',
      y: '6.50',
    }));
    queries.reset();

    await drawings.moveMany(sceneId, moves);

    expect(queries.count).toBe(1);
    const moved = await drawings.listOfScene(sceneId);
    expect(moved.map(({ x, y }) => [x, y])).toEqual([
      ['6.00', '6.50'],
      ['6.00', '6.50'],
    ]);
    expect((await drawings.listOfScene(otherSceneId))[0]).toMatchObject({ x: theirs.x });
  });

  it('deleteMany removes the given drawings and keeps the rest', async () => {
    const [first, second] = await drawings.insertMany([square(), path()]);
    if (!first || !second) throw new Error('insertMany returned fewer drawings');

    await drawings.deleteMany(sceneId, [first.id]);

    expect((await drawings.listOfScene(sceneId)).map(({ id }) => id)).toEqual([second.id]);
  });

  it('countOfScene counts only that scene', async () => {
    await drawings.insertMany([square(), square(), path()]);
    await drawings.insertMany([square({ sceneId: otherSceneId })]);

    expect(await drawings.countOfScene(sceneId)).toBe(3);
  });

  it('deleting the scene deletes its drawings (cascade)', async () => {
    await drawings.insertMany([square()]);

    await connection.db.delete(scenes).where(eq(scenes.id, sceneId));

    expect(await drawings.countOfScene(sceneId)).toBe(0);
  });

  it('deleting the author keeps the drawing with no author', async () => {
    await drawings.insertMany([square()]);

    await connection.db.delete(users).where(eq(users.id, biaId));

    const [kept] = await drawings.listOfScene(sceneId);
    expect(kept?.authorId).toBeNull();
  });

  it('findManyInScene never finds a drawing of another table', async () => {
    const [elsewhere] = await drawings.insertMany([square({ sceneId: otherSceneId })]);
    if (!elsewhere) throw new Error('insertMany returned no drawing');

    expect(await drawings.findManyInScene(sceneId, [elsewhere.id])).toEqual([]);
  });

  it('findManyInScene finds the asked drawings of the scene', async () => {
    const [first] = await drawings.insertMany([square(), path()]);
    if (!first) throw new Error('insertMany returned no drawing');

    const found = await drawings.findManyInScene(sceneId, [first.id]);

    expect(found.map(({ id }) => id)).toEqual([first.id]);
  });

  it('moveMany and deleteMany with the id of another scene touch nothing', async () => {
    const [elsewhere] = await drawings.insertMany([square({ sceneId: otherSceneId })]);
    if (!elsewhere) throw new Error('insertMany returned no drawing');

    await drawings.moveMany(sceneId, [{ drawingId: elsewhere.id, x: '9.00', y: '9.00' }]);
    await drawings.deleteMany(sceneId, [elsewhere.id]);

    expect(await drawings.listOfScene(otherSceneId)).toEqual([
      expect.objectContaining({ id: elsewhere.id, x: '2.50' }),
    ]);
  });
});
