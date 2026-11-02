import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { assets } from '../../src/modules/assets/assets.po';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { newAssetPo } from '../support/assets-factories';
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

  describe('a grid by its address', () => {
    it('lockInCampaign without sceneId locks the group grid and marks it active', async () => {
      const groupId = await activeSceneOf(vharnId);
      await scenesDao.insert({ campaignId: vharnId, name: 'Torre' });

      const locked = await runInTransaction(connection.db, (tx) =>
        new ScenesDao(tx).lockInCampaign(vharnId),
      );

      expect(locked).toMatchObject({ id: groupId, isActive: true });
    });

    it('lockInCampaign of the Torre brings it as not active, with its visibility', async () => {
      await activeSceneOf(vharnId);
      const torre = await scenesDao.insert({ campaignId: vharnId, name: 'Torre' });

      const locked = await runInTransaction(connection.db, (tx) =>
        new ScenesDao(tx).lockInCampaign(vharnId, torre.id),
      );

      expect(locked).toMatchObject({ id: torre.id, isActive: false, visibility: 'private' });
    });

    it('a grid of Quelm addressed at Vharn is found by neither lockInCampaign nor findGridInCampaign', async () => {
      await activeSceneOf(vharnId);
      const quelmGrid = await activeSceneOf(quelmId);

      const locked = await runInTransaction(connection.db, (tx) =>
        new ScenesDao(tx).lockInCampaign(vharnId, quelmGrid),
      );

      expect(locked).toBeUndefined();
      expect(await scenesDao.findGridInCampaign(vharnId, quelmGrid)).toBeUndefined();
    });

    it('findGridInCampaign reads the addressed grid without a transaction', async () => {
      const groupId = await activeSceneOf(vharnId);
      const torre = await scenesDao.insert({ campaignId: vharnId, name: 'Torre' });

      expect(await scenesDao.findGridInCampaign(vharnId)).toMatchObject({ id: groupId });
      expect(await scenesDao.findGridInCampaign(vharnId, torre.id)).toMatchObject({
        name: 'Torre',
        isActive: false,
      });
    });
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
      backgroundAssetId: null,
      visionMode: 'dark' as const,
    };
    const saved = await scenesDao.update(sceneId, grid);
    expect(saved).toMatchObject({ ...grid, cellDistance: '3.00' });
  });

  it('deleting the campaign deletes its scenes in cascade', async () => {
    const sceneId = await activeSceneOf(vharnId);
    await connection.db.delete(campaigns).where(eq(campaigns.id, vharnId));
    expect(await scenesDao.findById(sceneId)).toBeUndefined();
  });

  describe('the share lock against a library edit', () => {
    // The library edit locks the table and then the grid: holding the grid while waiting for the
    // table deadlocks with it, and Postgres aborts one of the two (the PATCH answered a 500).
    it('shareInCampaign waiting for the table holds no lock on the grid yet', async () => {
      const torre = await scenesDao.insert({ campaignId: vharnId, name: 'Torre' });

      const outcome = await runInTransaction(connection.db, async (tx) => {
        await new CampaignsDao(tx).lockById(vharnId);
        const watch = runInTransaction(connection.db, (share) =>
          new ScenesDao(share).shareInCampaign(vharnId, torre.id),
        );
        await untilOneQueryWaitsForALock();
        const grid = tx.select().from(scenes).where(eq(scenes.id, torre.id));
        const taken = await grid.for('update', { noWait: true }).then(
          () => 'free',
          () => 'held',
        );
        return { taken, watch };
      });

      expect(outcome.taken).toBe('free');
      expect((await outcome.watch)?.id).toBe(torre.id);
    });

    async function untilOneQueryWaitsForALock(): Promise<void> {
      const waiting = sql`SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if ((await connection.db.execute(waiting)).rows.length > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('expected shareInCampaign to wait for the table lock, nothing waited in 2 s');
    }
  });

  describe('background', () => {
    async function withBackground(campaignId: string, assetCampaignId: string): Promise<string> {
      const sceneId = await activeSceneOf(campaignId);
      const map = newAssetPo({ campaignId: assetCampaignId, width: 1400, height: 700 });
      const asset = await new AssetsDao(connection.db).insert(map);
      await connection.db
        .update(scenes)
        .set({ backgroundAssetId: asset.id })
        .where(eq(scenes.id, sceneId));
      return asset.id;
    }

    it('findActiveOf brings the width and height of the background image', async () => {
      const assetId = await withBackground(vharnId, vharnId);

      expect(await scenesDao.findActiveOf(vharnId)).toMatchObject({
        backgroundAssetId: assetId,
        backgroundWidth: 1400,
        backgroundHeight: 700,
      });
    });

    it('the locked scene brings the background pixels too', async () => {
      await withBackground(vharnId, vharnId);

      const locked = await runInTransaction(connection.db, (tx) =>
        new ScenesDao(tx).lockActiveOf(vharnId),
      );

      expect(locked).toMatchObject({ backgroundWidth: 1400, backgroundHeight: 700 });
    });

    it('a background id of another campaign joins no pixels', async () => {
      await withBackground(vharnId, quelmId);

      expect(await scenesDao.findActiveOf(vharnId)).toMatchObject({
        backgroundWidth: null,
        backgroundHeight: null,
      });
    });

    it('deleting the background asset leaves the scene without one', async () => {
      const assetId = await withBackground(vharnId, vharnId);

      await connection.db.delete(assets).where(eq(assets.id, assetId));

      expect((await scenesDao.findActiveOf(vharnId))?.backgroundAssetId).toBeNull();
    });
  });
});
