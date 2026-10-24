import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignMemberPo, newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNIQUE_VIOLATION = '23505';

describe('CampaignMembersDao on Postgres', () => {
  let connection: DatabaseConnection;
  let membersDao: CampaignMembersDao;
  let usersDao: UsersDao;
  let campaignsDao: CampaignsDao;
  let anaId: string;
  let biaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    membersDao = new CampaignMembersDao(connection.db);
    usersDao = new UsersDao(connection.db);
    campaignsDao = new CampaignsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    anaId = (await usersDao.insert(newUserPo({ name: 'Ana', email: 'ana@mesa.com' }))).id;
    biaId = (await usersDao.insert(newUserPo({ name: 'Bia', email: 'bia@mesa.com' }))).id;
  });

  afterAll(() => connection.close());

  async function campaignMasteredBy(masterId: string, name: string, code: string) {
    const campaign = await campaignsDao.insert(
      newCampaignPo({ ownerId: masterId, name, joinCode: code }),
    );
    await membersDao.insert(
      newCampaignMemberPo({ campaignId: campaign.id, userId: masterId, role: 'master' }),
    );
    return campaign.id;
  }

  async function playerJoins(campaignId: string, name: string): Promise<void> {
    const email = `${name.toLowerCase()}@mesa.com`;
    const userId = (await usersDao.insert(newUserPo({ name, email }))).id;
    await membersDao.insert(newCampaignMemberPo({ campaignId, userId, role: 'player' }));
  }

  async function listedNamesOf(userId: string): Promise<string[]> {
    return (await membersDao.listOfUser(userId)).map((row) => row.campaign.name);
  }

  it('an inserted membership is found with its role and dates', async () => {
    const campaignId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    const found = await membersDao.findMembership(campaignId, anaId);
    expect(found).toMatchObject({ campaignId, userId: anaId, role: 'master', lastEnteredAt: null });
    expect(found?.joinedAt).toBeInstanceOf(Date);
  });

  it('someone who is not a member has no membership', async () => {
    const campaignId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    expect(await membersDao.findMembership(campaignId, biaId)).toBeUndefined();
  });

  it('listOfUser brings the campaigns of the user and not a private one they are not in', async () => {
    await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    await campaignMasteredBy(biaId, 'Pântano de Bia', 'PNTN2345');
    expect(await listedNamesOf(anaId)).toEqual(['Vharn']);
  });

  it('a listed row carries the master name, the member count and the role of the user', async () => {
    const campaignId = await campaignMasteredBy(biaId, 'Pântano', 'PNTN2345');
    await membersDao.insert(newCampaignMemberPo({ campaignId, userId: anaId, role: 'player' }));
    await playerJoins(campaignId, 'Caio');
    await playerJoins(campaignId, 'Duda');
    const [row] = await membersDao.listOfUser(anaId);
    expect(row).toMatchObject({ masterName: 'Bia', memberCount: 4, role: 'player' });
  });

  it('the list orders by last entry descending, never-entered last, then by join date descending', async () => {
    const codes = ['AAAA2222', 'BBBB2222', 'CCCC2222', 'DDDD2222'];
    const names = ['Entrou antes', 'Entrou depois', 'Nunca, antiga', 'Nunca, nova'];
    const ids: string[] = [];
    for (const [index, name] of names.entries()) {
      const campaignId = await campaignMasteredBy(biaId, name, codes[index] ?? '');
      const joinedAt = new Date(`2026-10-0${index + 1}T12:00:00Z`);
      await membersDao.insert(newCampaignMemberPo({ campaignId, userId: anaId, joinedAt }));
      ids.push(campaignId);
    }
    await membersDao.markEntered(ids[0] ?? '', anaId, new Date('2026-10-10T12:00:00Z'));
    await membersDao.markEntered(ids[1] ?? '', anaId, new Date('2026-10-11T12:00:00Z'));
    expect(await listedNamesOf(anaId)).toEqual([
      'Entrou depois',
      'Entrou antes',
      'Nunca, nova',
      'Nunca, antiga',
    ]);
  });

  it('listMembers returns the id, nickname, @, profile and role of every member', async () => {
    const campaignId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    await membersDao.insert(newCampaignMemberPo({ campaignId, userId: biaId, role: 'player' }));
    const photo = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
    await connection.db
      .update(users)
      .set({ color: 'rose', avatarId: photo, bio: 'Mestre' })
      .where(eq(users.id, anaId));
    const members = await membersDao.listMembers(campaignId);
    expect([...members].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      {
        userId: anaId,
        name: 'Ana',
        username: 'ana',
        colorChoice: 'rose',
        avatarId: photo,
        bio: 'Mestre',
        role: 'master',
      },
      {
        userId: biaId,
        name: 'Bia',
        username: 'bia',
        colorChoice: null,
        avatarId: null,
        bio: null,
        role: 'player',
      },
    ]);
  });

  it('listMembers of one campaign never lists a member of another (criterion 14)', async () => {
    const vharnId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    await campaignMasteredBy(biaId, 'Quelm', 'QLM4X7PZ');
    const members = await membersDao.listMembers(vharnId);
    expect(members.map(({ userId }) => userId)).toEqual([anaId]);
  });

  it('campaignIdsOfUser returns only the campaigns the user is a member of', async () => {
    const vharnId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    const quelmId = await campaignMasteredBy(biaId, 'Quelm', 'QLM4X7PZ');
    await membersDao.insert(newCampaignMemberPo({ campaignId: quelmId, userId: anaId }));
    await campaignMasteredBy(biaId, 'Sem Ana', 'SNA9K3TR');
    const ids = await membersDao.campaignIdsOfUser(anaId);
    expect([...ids].sort()).toEqual([vharnId, quelmId].sort());
  });

  it('markEntered writes only the row of that campaign and user', async () => {
    const campaignId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    await membersDao.insert(newCampaignMemberPo({ campaignId, userId: biaId, role: 'player' }));
    const at = new Date('2026-10-14T21:00:00Z');
    await membersDao.markEntered(campaignId, biaId, at);
    expect((await membersDao.findMembership(campaignId, biaId))?.lastEnteredAt).toEqual(at);
    expect((await membersDao.findMembership(campaignId, anaId))?.lastEnteredAt).toBeNull();
  });

  it('a duplicate membership violates the primary key', async () => {
    const campaignId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    const duplicate = membersDao.insert(
      newCampaignMemberPo({ campaignId, userId: anaId, role: 'player' }),
    );
    await expect(duplicate).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });

  it('lastAccessAtOf is the latest entry of any member of that campaign only', async () => {
    const vharnId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    const quelmId = await campaignMasteredBy(biaId, 'Quelm', 'QLMR2345');
    await membersDao.insert(newCampaignMemberPo({ campaignId: vharnId, userId: biaId }));
    await membersDao.markEntered(vharnId, anaId, new Date('2026-10-12T22:00:00Z'));
    await membersDao.markEntered(vharnId, biaId, new Date('2026-10-13T23:30:00Z'));
    await membersDao.markEntered(quelmId, biaId, new Date('2026-10-20T20:00:00Z'));
    expect(await membersDao.lastAccessAtOf(vharnId)).toEqual(new Date('2026-10-13T23:30:00Z'));
  });

  it('lastAccessAtOf is null while nobody entered the campaign', async () => {
    const campaignId = await campaignMasteredBy(anaId, 'Vharn', 'VHRN7K2Q');
    expect(await membersDao.lastAccessAtOf(campaignId)).toBeNull();
  });
});
