import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { EffectAreasDao } from '../../src/modules/effect-areas/effect-areas.dao';
import type { NewEffectAreaPo } from '../../src/modules/effect-areas/effect-areas.po';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('EffectAreasDao on Postgres', () => {
  let connection: DatabaseConnection;
  let areas: EffectAreasDao;
  let sceneId: string;
  let otherSceneId: string;
  let biaId: string;
  let anaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    areas = new EffectAreasDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const usersDao = new UsersDao(connection.db);
    anaId = (await usersDao.insert(newUserPo())).id;
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

  function cone(overrides: Partial<NewEffectAreaPo> = {}): NewEffectAreaPo {
    return {
      sceneId,
      authorId: biaId,
      kind: 'orthogonal_cone',
      x: '5.00',
      y: '5.50',
      width: '0',
      height: '0',
      reach: '3',
      facing: 0,
      color: 'ember',
      ...overrides,
    };
  }

  const circleShape = {
    kind: 'smooth_circle',
    x: '4.25',
    y: '3.00',
    width: '0',
    height: '0',
    reach: '2.50',
    facing: 0,
    color: 'moss',
  } as const;

  it('insertMany returns the rows in the order sent and listOfScene reads them in creation order', async () => {
    const saved = await areas.insertMany([cone(), cone({ kind: 'line', x: '2.50', y: '2.50' })]);

    expect(saved.map(({ kind }) => kind)).toEqual(['orthogonal_cone', 'line']);
    expect((await areas.listOfScene(sceneId)).map(({ id }) => id)).toEqual(
      saved.map(({ id }) => id),
    );
  });

  it('a later insert is listed after an earlier one', async () => {
    await areas.insertMany([cone({ color: 'violet' })]);
    await areas.insertMany([cone({ color: 'moss' })]);

    expect((await areas.listOfScene(sceneId)).map(({ color }) => color)).toEqual([
      'violet',
      'moss',
    ]);
  });

  it('a numeric field comes back as the numeric string "2.50"', async () => {
    await areas.insertMany([cone({ kind: 'smooth_circle', reach: '2.5' })]);

    const [read] = await areas.listOfScene(sceneId);
    expect(read).toMatchObject({ reach: '2.50', y: '5.50' });
  });

  it('countOfScene counts only that scene', async () => {
    await areas.insertMany([cone(), cone()]);
    await areas.insertMany([cone({ sceneId: otherSceneId })]);

    expect(await areas.countOfScene(sceneId)).toBe(2);
  });

  it('reshapeMany changes the kind, the geometry and the color, never the author nor the scene', async () => {
    const [saved] = await areas.insertMany([cone()]);
    if (!saved) throw new Error('insertMany returned no area');

    await areas.reshapeMany(sceneId, [{ effectAreaId: saved.id, shape: circleShape }]);

    const [reshaped] = await areas.listOfScene(sceneId);
    expect(reshaped).toMatchObject({
      ...circleShape,
      width: '0.00',
      height: '0.00',
      authorId: biaId,
      sceneId,
    });
  });

  it('deleteMany removes the given areas and keeps the rest', async () => {
    const [first, second] = await areas.insertMany([cone(), cone()]);
    if (!first || !second) throw new Error('insertMany returned fewer areas');

    await areas.deleteMany(sceneId, [first.id]);

    expect((await areas.listOfScene(sceneId)).map(({ id }) => id)).toEqual([second.id]);
  });

  it('findManyInScene finds the asked areas of the scene and never one of another table', async () => {
    const [mine] = await areas.insertMany([cone()]);
    const [elsewhere] = await areas.insertMany([cone({ sceneId: otherSceneId })]);
    if (!mine || !elsewhere) throw new Error('insertMany returned no area');

    const found = await areas.findManyInScene(sceneId, [mine.id, elsewhere.id]);

    expect(found.map(({ id }) => id)).toEqual([mine.id]);
  });

  it('reshapeMany and deleteMany with the id of an area of Quelm touch nothing there', async () => {
    const [elsewhere] = await areas.insertMany([cone({ sceneId: otherSceneId })]);
    if (!elsewhere) throw new Error('insertMany returned no area');

    await areas.reshapeMany(sceneId, [{ effectAreaId: elsewhere.id, shape: circleShape }]);
    await areas.deleteMany(sceneId, [elsewhere.id]);

    expect(await areas.listOfScene(otherSceneId)).toEqual([
      expect.objectContaining({ id: elsewhere.id, kind: 'orthogonal_cone', x: '5.00' }),
    ]);
  });

  it('deleting the scene deletes its areas (cascade)', async () => {
    await areas.insertMany([cone()]);

    await connection.db.delete(scenes).where(eq(scenes.id, sceneId));

    expect(await areas.countOfScene(sceneId)).toBe(0);
  });

  it('deleting the author keeps the area with no author', async () => {
    await areas.insertMany([cone()]);

    await connection.db.delete(users).where(eq(users.id, biaId));

    const [kept] = await areas.listOfScene(sceneId);
    expect(kept?.authorId).toBeNull();
  });

  it.each([
    ['a facing of 360', { facing: 360 }],
    ['a negative reach', { reach: '-1' }],
  ])('the table refuses %s (CHECK)', async (_scenario, overrides) => {
    await expect(areas.insertMany([cone(overrides)])).rejects.toThrow();
  });
});
