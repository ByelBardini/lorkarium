import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { LightsDao } from '../../src/modules/lights/lights.dao';
import type { LightPo, NewLightPo } from '../../src/modules/lights/lights.po';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const CHECK_VIOLATION = '23514';
const INVALID_TEXT = '22P02';

describe('LightsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let lights: LightsDao;
  let sceneId: string;
  let otherSceneId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    lights = new LightsDao(connection.db);
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

  function wallTorch(overrides: Partial<NewLightPo> = {}): NewLightPo {
    return { sceneId, x: '5.50', y: '3.00', bright: '4.00', dim: '4.00', lit: true, ...overrides };
  }

  async function savedOne(row: NewLightPo): Promise<LightPo> {
    const [saved] = await lights.insertMany([row]);
    if (!saved) throw new Error('insertMany returned no light');
    return saved;
  }

  it('insertMany returns the rows in the order sent and listOfScene reads them by light_order', async () => {
    const inserted = await lights.insertMany([wallTorch({ x: '9.00' }), wallTorch({ x: '1.00' })]);
    await lights.insertMany([wallTorch({ x: '4.00' })]);

    expect(inserted.map(({ x }) => x)).toEqual(['9.00', '1.00']);
    expect((await lights.listOfScene(sceneId)).map(({ x }) => x)).toEqual(['9.00', '1.00', '4.00']);
  });

  it('insertMany keeps a fire color and a light sent without color is neutral (null)', async () => {
    const inserted = await lights.insertMany([wallTorch({ color: 'fire' }), wallTorch()]);

    expect(inserted.map(({ color }) => color)).toEqual(['fire', null]);
    expect((await lights.listOfScene(sceneId)).map(({ color }) => color)).toEqual(['fire', null]);
  });

  it('moving, ranging and putting out a fire light keep its color', async () => {
    const saved = await savedOne(wallTorch({ color: 'fire' }));

    await lights.moveMany(sceneId, [{ lightId: saved.id, x: '7.00', y: '1.00' }]);
    await lights.setRanges(sceneId, [{ lightId: saved.id, bright: '6.00', dim: '2.00' }]);
    await lights.setLit(sceneId, [saved.id], false);

    expect((await lights.listOfScene(sceneId))[0]?.color).toBe('fire');
  });

  it('the light_color enum refuses red written straight to the table', async () => {
    await expect(
      connection.db.execute(
        sql`INSERT INTO lights (scene_id, x, y, bright, dim, color) VALUES (${sceneId}, 1, 1, 1, 1, 'red')`,
      ),
    ).rejects.toMatchObject({ cause: { code: INVALID_TEXT } });
  });

  it('a light inserted without lit is born lit, and the numerics come back as strings', async () => {
    const saved = await savedOne({ sceneId, x: '5.5', y: '3', bright: '4', dim: '4' });

    expect(saved).toMatchObject({ x: '5.50', y: '3.00', bright: '4.00', dim: '4.00', lit: true });
  });

  it('findManyInScene leaves out the id of a light in another scene', async () => {
    const here = await savedOne(wallTorch());
    const there = await savedOne(wallTorch({ sceneId: otherSceneId }));

    const found = await lights.findManyInScene(sceneId, [here.id, there.id]);

    expect(found.map(({ id }) => id)).toEqual([here.id]);
  });

  it('moveMany changes only x and y', async () => {
    const saved = await savedOne(wallTorch());

    await lights.moveMany(sceneId, [{ lightId: saved.id, x: '7.25', y: '1.00' }]);

    expect((await lights.listOfScene(sceneId))[0]).toMatchObject({
      x: '7.25',
      y: '1.00',
      bright: '4.00',
      dim: '4.00',
      lit: true,
    });
  });

  it('setRanges changes only bright and dim', async () => {
    const saved = await savedOne(wallTorch());

    await lights.setRanges(sceneId, [{ lightId: saved.id, bright: '6.00', dim: '2.50' }]);

    expect((await lights.listOfScene(sceneId))[0]).toMatchObject({
      x: '5.50',
      bright: '6.00',
      dim: '2.50',
      lit: true,
    });
  });

  it('setColors changes only the color', async () => {
    const saved = await savedOne(wallTorch());

    await lights.setColors(sceneId, [{ lightId: saved.id, color: 'necrotic' }]);

    expect((await lights.listOfScene(sceneId))[0]).toMatchObject({
      x: '5.50',
      bright: '4.00',
      lit: true,
      color: 'necrotic',
    });
  });

  it('setLit changes only lit', async () => {
    const saved = await savedOne(wallTorch());

    await lights.setLit(sceneId, [saved.id], false);

    expect((await lights.listOfScene(sceneId))[0]).toMatchObject({
      x: '5.50',
      bright: '4.00',
      lit: false,
    });
  });

  it('deleteMany removes only the given lights of the scene', async () => {
    const [first, second] = await lights.insertMany([wallTorch(), wallTorch({ x: '1.00' })]);
    if (!first || !second) throw new Error('insertMany returned fewer lights');

    await lights.deleteMany(sceneId, [first.id]);

    expect((await lights.listOfScene(sceneId)).map(({ id }) => id)).toEqual([second.id]);
  });

  it('moving, ranging, lighting, coloring and deleting with an id of Quelm leave the Quelm row intact', async () => {
    const quelmTorch = await savedOne(wallTorch({ sceneId: otherSceneId }));

    await lights.moveMany(sceneId, [{ lightId: quelmTorch.id, x: '9.00', y: '9.00' }]);
    await lights.setRanges(sceneId, [{ lightId: quelmTorch.id, bright: '1.00', dim: '1.00' }]);
    await lights.setLit(sceneId, [quelmTorch.id], false);
    await lights.setColors(sceneId, [{ lightId: quelmTorch.id, color: 'fire' }]);
    await lights.deleteMany(sceneId, [quelmTorch.id]);

    expect(await lights.listOfScene(otherSceneId)).toEqual([
      expect.objectContaining({
        id: quelmTorch.id,
        x: '5.50',
        bright: '4.00',
        lit: true,
        color: null,
      }),
    ]);
  });

  it('deleting the scene deletes its lights (cascade)', async () => {
    await savedOne(wallTorch());

    await connection.db.delete(scenes).where(eq(scenes.id, sceneId));

    expect(await lights.listOfScene(sceneId)).toEqual([]);
  });

  it.each([
    ['a bright of 101', { bright: '101' }],
    ['an x of -1', { x: '-1' }],
  ])('the CHECK refuses %s', async (_name, overrides) => {
    await expect(lights.insertMany([wallTorch(overrides)])).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION },
    });
  });
});
