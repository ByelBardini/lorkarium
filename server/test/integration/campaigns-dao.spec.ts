import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { assets } from '../../src/modules/assets/assets.po';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { scenes } from '../../src/modules/scenes/scenes.po';
import { newAssetPo } from '../support/assets-factories';
import { newUserPo } from '../support/auth-factories';
import { newCampaignMemberPo, newCampaignPo } from '../support/campaigns-factories';
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

  describe('the campaign settings', () => {
    it('a new campaign is "building", with no chosen cover, no warnings and no tags', async () => {
      const inserted = await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
      expect(inserted).toMatchObject({
        status: 'building',
        coverDrawing: null,
        coverTone: null,
        coverAssetId: null,
        contentWarnings: [],
        tags: [],
      });
    });

    it('update writes only the fields sent and returns the row', async () => {
      const inserted = await campaignsDao.insert(newCampaignPo({ ownerId: anaId, system: 'D&D' }));
      const at = new Date('2026-10-24T20:00:00Z');
      const updated = await campaignsDao.update(inserted.id, {
        ...{ status: 'ongoing', tags: ['sandbox', 'mistério'] },
        ...{ contentWarnings: ['gore'], updatedAt: at },
      });
      expect(updated).toMatchObject({
        system: 'D&D',
        status: 'ongoing',
        tags: ['sandbox', 'mistério'],
        contentWarnings: ['gore'],
        updatedAt: at,
      });
    });

    it('update of an unknown campaign returns undefined', async () => {
      expect(await campaignsDao.update(UNKNOWN_ID, { name: 'Nada' })).toBeUndefined();
    });

    it('replaceJoinCode swaps the code; the old one finds nothing', async () => {
      const inserted = await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
      const at = new Date('2026-10-24T20:00:00Z');
      expect(await campaignsDao.replaceJoinCode(inserted.id, 'PNTN2345', at)).toBe(true);
      expect(await campaignsDao.findByJoinCode('VHRN7K2Q')).toBeUndefined();
      expect(await campaignsDao.findByJoinCode('PNTN2345')).toMatchObject({ id: inserted.id });
    });

    it('replaceJoinCode with a code of another campaign violates the unique constraint', async () => {
      const inserted = await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
      await campaignsDao.insert(newCampaignPo({ ownerId: anaId, joinCode: 'PNTN2345' }));
      const at = new Date('2026-10-24T20:00:00Z');
      await expect(campaignsDao.replaceJoinCode(inserted.id, 'PNTN2345', at)).rejects.toMatchObject(
        { cause: { code: UNIQUE_VIOLATION } },
      );
    });

    it('a deleted cover image leaves the campaign without an image cover', async () => {
      const inserted = await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
      const asset = await new AssetsDao(connection.db).insert(
        newAssetPo({ campaignId: inserted.id, purpose: 'cover' }),
      );
      await campaignsDao.update(inserted.id, { coverAssetId: asset.id });
      await connection.db.delete(assets).where(eq(assets.id, asset.id));
      expect((await campaignsDao.findById(inserted.id))?.coverAssetId).toBeNull();
    });

    it('delete takes the campaign, its members, scenes and assets, and leaves the other campaign', async () => {
      const vharn = await campaignsDao.insert(newCampaignPo({ ownerId: anaId }));
      const quelm = await campaignsDao.insert(
        newCampaignPo({ ownerId: anaId, joinCode: 'QLMR2345' }),
      );
      const members = new CampaignMembersDao(connection.db);
      for (const campaignId of [vharn.id, quelm.id]) {
        await members.insert(newCampaignMemberPo({ campaignId, userId: anaId, role: 'master' }));
        await new ScenesDao(connection.db).insert({ campaignId });
        await new AssetsDao(connection.db).insert(newAssetPo({ campaignId, purpose: 'cover' }));
      }
      expect(await campaignsDao.delete(vharn.id)).toBe(true);
      expect(await campaignsDao.findById(vharn.id)).toBeUndefined();
      expect(await members.findMembership(vharn.id, anaId)).toBeUndefined();
      const leftScenes = await connection.db.select({ campaignId: scenes.campaignId }).from(scenes);
      const leftAssets = await connection.db.select({ campaignId: assets.campaignId }).from(assets);
      expect(leftScenes).toEqual([{ campaignId: quelm.id }]);
      expect(leftAssets).toEqual([{ campaignId: quelm.id }]);
    });

    it('delete of an unknown campaign returns false', async () => {
      expect(await campaignsDao.delete(UNKNOWN_ID)).toBe(false);
    });
  });
});
