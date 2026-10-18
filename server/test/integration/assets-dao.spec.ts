import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { assets } from '../../src/modules/assets/assets.po';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { newAssetPo } from '../support/assets-factories';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('AssetsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let dao: AssetsDao;
  let vharnId: string;
  let quelmId: string;
  let biaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    dao = new AssetsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const usersDao = new UsersDao(connection.db);
    const anaId = (await usersDao.insert(newUserPo())).id;
    biaId = (await usersDao.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    const campaignsDao = new CampaignsDao(connection.db);
    vharnId = (await campaignsDao.insert(newCampaignPo({ ownerId: anaId }))).id;
    const quelm = newCampaignPo({ ownerId: anaId, name: 'Quelm', joinCode: 'QELM2345' });
    quelmId = (await campaignsDao.insert(quelm)).id;
  });

  afterAll(() => connection.close());

  it('an inserted asset is found in its campaign with every column', async () => {
    const inserted = await dao.insert(
      newAssetPo({
        campaignId: vharnId,
        ownerId: biaId,
        purpose: 'background',
        width: 1400,
        height: 700,
        storageKey: 'assets/mapa-de-vharn',
      }),
    );

    const found = await dao.findInCampaign(vharnId, inserted.id);

    expect(found).toMatchObject({
      campaignId: vharnId,
      ownerId: biaId,
      purpose: 'background',
      mimeType: 'image/png',
      sizeBytes: 48_213,
      width: 1400,
      height: 700,
      storageKey: 'assets/mapa-de-vharn',
    });
  });

  it('findManyInCampaign returns only the asked assets of that campaign', async () => {
    const ofVharn = await dao.insert(newAssetPo({ campaignId: vharnId }));
    const ofQuelm = await dao.insert(newAssetPo({ campaignId: quelmId }));

    const found = await dao.findManyInCampaign(vharnId, [ofVharn.id, ofQuelm.id]);

    expect(found.map((row) => row.id)).toEqual([ofVharn.id]);
  });

  it('an asset of Vharn looked up in Quelm is not found (campaign B never sees A)', async () => {
    const ofVharn = await dao.insert(newAssetPo({ campaignId: vharnId }));

    expect(await dao.findInCampaign(quelmId, ofVharn.id)).toBeUndefined();
  });

  it('deleting the owner keeps the asset with no owner', async () => {
    const inserted = await dao.insert(newAssetPo({ campaignId: vharnId, ownerId: biaId }));

    await connection.db.delete(users).where(eq(users.id, biaId));

    expect((await dao.findById(inserted.id))?.ownerId).toBeNull();
  });

  it('deleting the campaign deletes its assets', async () => {
    const inserted = await dao.insert(newAssetPo({ campaignId: vharnId }));

    await connection.db.delete(campaigns).where(eq(campaigns.id, vharnId));

    expect(await dao.findById(inserted.id)).toBeUndefined();
  });

  it('a repeated storage key is refused by the unique index', async () => {
    await dao.insert(newAssetPo({ campaignId: vharnId, storageKey: 'assets/same' }));

    const repeated = dao.insert(newAssetPo({ campaignId: quelmId, storageKey: 'assets/same' }));

    await expect(repeated).rejects.toMatchObject({ cause: { code: '23505' } });
    expect(await connection.db.select().from(assets)).toHaveLength(1);
  });
});
