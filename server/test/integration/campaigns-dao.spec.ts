import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNIQUE_VIOLATION = '23505';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('CampaignsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let campaignsDao: CampaignsDao;
  let anaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    campaignsDao = new CampaignsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    anaId = (await new UsersDao(connection.db).insert(newUserPo())).id;
  });

  afterAll(() => connection.close());

  it('insert returns the row with an id, a creation date and private visibility by default', async () => {
    const inserted = await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
    expect(inserted).toMatchObject({ name: 'Os Sinos de Vharn', visibility: 'private' });
    expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(inserted.createdAt).toBeInstanceOf(Date);
  });

  it('a campaign is found by its join code and by its id', async () => {
    const inserted = await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
    expect(await campaignsDao.findByJoinCode('VHRN7K2Q')).toMatchObject({ id: inserted.id });
    expect(await campaignsDao.findById(inserted.id)).toMatchObject({ joinCode: 'VHRN7K2Q' });
  });

  it('an unknown join code or id finds nothing', async () => {
    await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
    expect(await campaignsDao.findByJoinCode('ZZZZ2222')).toBeUndefined();
    expect(await campaignsDao.findById(UNKNOWN_ID)).toBeUndefined();
  });

  it('a second campaign with the same join code violates the unique constraint', async () => {
    await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
    const duplicate = campaignsDao.insert(newCampaignPo({ ownerId: anaId, name: 'Outra' }));
    await expect(duplicate).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });

  it('deleting the owner deletes their campaigns in cascade', async () => {
    const inserted = await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
    await connection.db.delete(users).where(eq(users.id, anaId));
    expect(await campaignsDao.findById(inserted.id)).toBeUndefined();
  });
});
