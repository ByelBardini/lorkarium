import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('ScenesDao on Postgres', () => {
  let connection: DatabaseConnection;
  let scenesDao: ScenesDao;
  let vharnId: string;
  let quelmId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    scenesDao = new ScenesDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const ownerId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    const campaignsDao = new CampaignsDao(connection.db);
    vharnId = (await campaignsDao.insert(newCampaignPo({ ownerId }))).id;
    const quelm = newCampaignPo({ ownerId, name: 'Quelm', joinCode: 'QELM2345' });
    quelmId = (await campaignsDao.insert(quelm)).id;
  });

  afterAll(() => connection.close());

  async function activeSceneOf(campaignId: string): Promise<string> {
    const scene = await scenesDao.insert({ campaignId });
    await new CampaignsDao(connection.db).setActiveScene(campaignId, scene.id);
    return scene.id;
  }

  it('a new scene has the default 20×12 grid of 1.5 m cells at version 0', async () => {
    const scene = await scenesDao.insert({ campaignId: vharnId });
    expect(scene).toMatchObject({
      name: 'Cena 1',
      widthCells: 20,
      heightCells: 12,
      cellDistance: '1.50',
      cellUnit: 'm',
      gridVisible: true,
      gridOpacity: 30,
      version: 0,
    });
  });

  it('findActiveOf returns the scene the campaign points to', async () => {
    const sceneId = await activeSceneOf(vharnId);
    expect(await scenesDao.findActiveOf(vharnId)).toMatchObject({ id: sceneId });
  });

  it('findActiveOf of another campaign never returns this campaign scene', async () => {
    const sceneId = await activeSceneOf(vharnId);
    await connection.db
      .update(campaigns)
      .set({ activeSceneId: sceneId })
      .where(eq(campaigns.id, quelmId));
    expect(await scenesDao.findActiveOf(quelmId)).toBeUndefined();
  });

  it('a campaign without an active scene finds nothing', async () => {
    await scenesDao.insert({ campaignId: vharnId });
    expect(await scenesDao.findActiveOf(vharnId)).toBeUndefined();
  });

  it('inside a transaction, the locked scene bumps its version by one', async () => {
    const sceneId = await activeSceneOf(vharnId);
    const version = await runInTransaction(connection.db, async (tx) => {
      const locked = await new ScenesDao(tx).lockActiveOf(vharnId);
      expect(locked?.id).toBe(sceneId);
      return new ScenesDao(tx).bumpVersion(sceneId);
    });
    expect(version).toBe(1);
    expect(await scenesDao.findActiveOf(vharnId)).toMatchObject({ version: 1 });
  });

  it('update saves the grid and returns the saved row', async () => {
    const sceneId = await activeSceneOf(vharnId);
    const grid = {
      widthCells: 30,
      heightCells: 20,
      cellDistance: '3',
      cellUnit: 'ft',
      gridVisible: false,
      gridOpacity: 15,
    };
    const saved = await scenesDao.update(sceneId, grid);
    expect(saved).toMatchObject({ ...grid, cellDistance: '3.00' });
  });

  it('deleting the campaign deletes its scenes in cascade', async () => {
    const sceneId = await activeSceneOf(vharnId);
    await connection.db.delete(campaigns).where(eq(campaigns.id, vharnId));
    expect(await scenesDao.findById(sceneId)).toBeUndefined();
  });
});
