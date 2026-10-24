import { rm } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { MIGRATIONS_FOLDER } from '../../src/database/migrate';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { SceneFoldersDao } from '../../src/modules/library/scene-folders.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { tokens } from '../../src/modules/tokens/tokens.po';
import { newAssetPo } from '../support/assets-factories';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { databaseUrlNamed, migrationsUpTo } from '../support/migrations-up-to';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

describe('SceneFoldersDao and the library queries of ScenesDao on Postgres', () => {
  let connection: DatabaseConnection;
  let folders: SceneFoldersDao;
  let scenesDao: ScenesDao;
  let vharnId: string;
  let quelmId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    folders = new SceneFoldersDao(connection.db);
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

  async function placeTokens(sceneId: string, count: number): Promise<void> {
    const goblins = Array.from({ length: count }, (_, index) => ({
      sceneId,
      name: `Goblin ${index + 1}`,
      initials: 'GO',
      side: 'enemy' as const,
      col: index,
      row: 0,
    }));
    await connection.db.insert(tokens).values(goblins);
  }

  describe('folders', () => {
    it('listOfCampaign returns "Ato 1" and its subfolder "Masmorra" in creation order', async () => {
      const act = await folders.insert({ campaignId: vharnId, name: 'Ato 1' });
      const dungeon = await folders.insert({
        campaignId: vharnId,
        parentId: act.id,
        name: 'Masmorra',
      });

      expect(await folders.listOfCampaign(vharnId)).toEqual([
        expect.objectContaining({ id: act.id, name: 'Ato 1', parentId: null }),
        expect.objectContaining({ id: dungeon.id, name: 'Masmorra', parentId: act.id }),
      ]);
    });

    it('a folder name of 41 characters is refused by the CHECK', async () => {
      const tooLong = folders.insert({ campaignId: vharnId, name: 'a'.repeat(41) });

      await expect(tooLong).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
    });

    it('an empty folder name is refused by the CHECK', async () => {
      const empty = folders.insert({ campaignId: vharnId, name: '' });

      await expect(empty).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
    });

    it('a parent folder of another campaign is refused by the composite foreign key', async () => {
      const quelmAct = await folders.insert({ campaignId: quelmId, name: 'Ato 1' });

      const stray = folders.insert({
        campaignId: vharnId,
        parentId: quelmAct.id,
        name: 'Masmorra',
      });

      await expect(stray).rejects.toMatchObject({ cause: { code: FOREIGN_KEY_VIOLATION } });
    });

    it('listOfCampaign of Quelm brings nothing of Vharn', async () => {
      await folders.insert({ campaignId: vharnId, name: 'Ato 1' });

      expect(await folders.listOfCampaign(quelmId)).toEqual([]);
    });

    it('delete of a Vharn folder through Quelm deletes nothing', async () => {
      const act = await folders.insert({ campaignId: vharnId, name: 'Ato 1' });

      expect(await folders.delete(quelmId, act.id)).toBe(false);
      expect(await folders.listOfCampaign(vharnId)).toHaveLength(1);
    });

    it('deleting the campaign deletes its folders in cascade', async () => {
      await folders.insert({ campaignId: vharnId, name: 'Ato 1' });

      await connection.db.delete(campaigns).where(eq(campaigns.id, vharnId));

      const { rows } = await connection.db.execute<{ total: number }>(
        sql`SELECT count(*)::int AS total FROM scene_folders`,
      );
      expect(rows).toEqual([{ total: 0 }]);
    });
  });

  describe('scenes in the library', () => {
    it('a scene inserted without a visibility is born private and outside any folder', async () => {
      const scene = await scenesDao.insert({ campaignId: vharnId });

      expect(scene).toMatchObject({ visibility: 'private', folderId: null });
    });

    it('listOfCampaign brings each scene with visibility, folder, background pixels and token count', async () => {
      const act = await folders.insert({ campaignId: vharnId, name: 'Ato 1' });
      const map = newAssetPo({ campaignId: vharnId, width: 1400, height: 700 });
      const asset = await new AssetsDao(connection.db).insert(map);
      const hall = await scenesDao.insert({
        campaignId: vharnId,
        name: 'Salão',
        visibility: 'public',
        folderId: act.id,
        backgroundAssetId: asset.id,
      });
      const ossuary = await scenesDao.insert({ campaignId: vharnId, name: 'Ossuário' });
      await placeTokens(hall.id, 3);

      expect(await scenesDao.listOfCampaign(vharnId)).toEqual([
        expect.objectContaining({
          id: hall.id,
          visibility: 'public',
          folderId: act.id,
          backgroundWidth: 1400,
          backgroundHeight: 700,
          tokenCount: 3,
        }),
        expect.objectContaining({
          id: ossuary.id,
          visibility: 'private',
          folderId: null,
          backgroundWidth: null,
          tokenCount: 0,
        }),
      ]);
    });

    it('listOfCampaign of Quelm brings nothing of Vharn', async () => {
      await scenesDao.insert({ campaignId: vharnId, name: 'Salão' });

      expect(await scenesDao.listOfCampaign(quelmId)).toEqual([]);
    });

    it('findInCampaign returns the scene of the campaign with its background pixels', async () => {
      const hall = await scenesDao.insert({ campaignId: vharnId, name: 'Salão' });

      expect(await scenesDao.findInCampaign(vharnId, hall.id)).toMatchObject({
        id: hall.id,
        name: 'Salão',
        backgroundWidth: null,
      });
    });

    it('findInCampaign of Quelm with the Vharn hall returns undefined', async () => {
      const hall = await scenesDao.insert({ campaignId: vharnId, name: 'Salão' });

      expect(await scenesDao.findInCampaign(quelmId, hall.id)).toBeUndefined();
    });

    it('updateLibrary saves only the keys it receives', async () => {
      const act = await folders.insert({ campaignId: vharnId, name: 'Ato 1' });
      const hall = await scenesDao.insert({ campaignId: vharnId, name: 'Salão' });

      await scenesDao.updateLibrary(vharnId, hall.id, { visibility: 'public' });
      const moved = await scenesDao.updateLibrary(vharnId, hall.id, { folderId: act.id });

      expect(moved).toMatchObject({ name: 'Salão', visibility: 'public', folderId: act.id });
    });

    it('updateLibrary through Quelm changes nothing in the Vharn hall', async () => {
      const hall = await scenesDao.insert({ campaignId: vharnId, name: 'Salão' });

      const result = await scenesDao.updateLibrary(quelmId, hall.id, { name: 'Torre' });

      expect(result).toBeUndefined();
      expect(await scenesDao.findById(hall.id)).toMatchObject({ name: 'Salão' });
    });

    it('a folder of Quelm in a Vharn scene is refused by the composite foreign key', async () => {
      const quelmAct = await folders.insert({ campaignId: quelmId, name: 'Ato 1' });
      const hall = await scenesDao.insert({ campaignId: vharnId, name: 'Salão' });

      const stray = scenesDao.updateLibrary(vharnId, hall.id, { folderId: quelmAct.id });

      await expect(stray).rejects.toMatchObject({ cause: { code: FOREIGN_KEY_VIOLATION } });
    });

    it('deleting the folder leaves its scene outside any folder', async () => {
      const act = await folders.insert({ campaignId: vharnId, name: 'Ato 1' });
      const hall = await scenesDao.insert({ campaignId: vharnId, folderId: act.id });

      expect(await folders.delete(vharnId, act.id)).toBe(true);

      expect(await scenesDao.findById(hall.id)).toMatchObject({
        campaignId: vharnId,
        folderId: null,
      });
    });

    it('deleting the parent folder leaves the subfolder at the root', async () => {
      const act = await folders.insert({ campaignId: vharnId, name: 'Ato 1' });
      await folders.insert({ campaignId: vharnId, parentId: act.id, name: 'Masmorra' });

      await folders.delete(vharnId, act.id);

      expect(await folders.listOfCampaign(vharnId)).toEqual([
        expect.objectContaining({ name: 'Masmorra', parentId: null, campaignId: vharnId }),
      ]);
    });

    it('delete removes the scene and its tokens in cascade', async () => {
      const hall = await scenesDao.insert({ campaignId: vharnId });
      await placeTokens(hall.id, 2);

      expect(await scenesDao.delete(vharnId, hall.id)).toBe(true);

      expect(await scenesDao.findById(hall.id)).toBeUndefined();
      const { rows } = await connection.db.execute<{ total: number }>(
        sql`SELECT count(*)::int AS total FROM tokens`,
      );
      expect(rows).toEqual([{ total: 0 }]);
    });

    it('delete of the Vharn hall through Quelm deletes nothing', async () => {
      const hall = await scenesDao.insert({ campaignId: vharnId });

      expect(await scenesDao.delete(quelmId, hall.id)).toBe(false);
      expect(await scenesDao.findById(hall.id)).toBeDefined();
    });
  });
});

const SCRATCH_DATABASE = 'lorkarium_library_migration';

describe('migration 0033_scene_library on a database with a scene', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let partialFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    partialFolder = await migrationsUpTo('0032_member_cards');
    await migrate(scratch.db, { migrationsFolder: partialFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(partialFolder, { recursive: true, force: true });
  });

  it('the scene that existed comes out public and outside any folder', async () => {
    await scratch.db.execute(sql`
      INSERT INTO users (id, name, email, password_hash)
      VALUES ('6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d', 'Ana', 'ana@x.com', 'hash')`);
    await scratch.db.execute(sql`
      INSERT INTO campaigns (id, owner_id, name, join_code)
      VALUES ('3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10', '6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d',
              'Vharn', 'VHRN7K2Q')`);
    await scratch.db.execute(sql`
      INSERT INTO scenes (campaign_id) VALUES ('3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10')`);

    await migrate(scratch.db, { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows } = await scratch.db.execute<{ visibility: string; folder_id: string | null }>(
      sql`SELECT visibility, folder_id FROM scenes WHERE kind = 'grid'`,
    );
    expect(rows).toEqual([{ visibility: 'public', folder_id: null }]);
  });
});
