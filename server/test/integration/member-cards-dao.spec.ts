import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { MemberCardsDao } from '../../src/modules/member-cards/member-cards.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const EMPTY_CARD = {
  characterName: null,
  armorClass: null,
  difficultyClass: null,
  noteOne: null,
  noteTwo: null,
};

describe('MemberCardsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let memberCards: MemberCardsDao;
  let vharnId: string;
  let quelmId: string;
  let biaId: string;
  let caioId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    memberCards = new MemberCardsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    const anaId = (await users.insert(newUserPo())).id;
    biaId = (await users.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    caioId = (await users.insert(newUserPo({ email: 'caio@mesa.com', name: 'Caio' }))).id;
    const campaignsDao = new CampaignsDao(connection.db);
    vharnId = (await campaignsDao.insert(newCampaignPo({ ownerId: anaId }))).id;
    quelmId = (
      await campaignsDao.insert(
        newCampaignPo({ ownerId: caioId, name: 'Quelm', joinCode: 'QELM2345' }),
      )
    ).id;
    const members = new CampaignMembersDao(connection.db);
    await members.insert({ campaignId: vharnId, userId: anaId, role: 'master' });
    await members.insert({ campaignId: vharnId, userId: biaId, role: 'player' });
    await members.insert({ campaignId: vharnId, userId: caioId, role: 'player' });
    await members.insert({ campaignId: quelmId, userId: caioId, role: 'master' });
  });

  afterAll(() => connection.close());

  it('save writes the card of a member and the other fields stay null', async () => {
    await memberCards.save(vharnId, biaId, { armorClass: 15 });

    expect(await memberCards.listOfCampaign(vharnId)).toEqual([
      expect.objectContaining({ ...EMPTY_CARD, userId: biaId, armorClass: 15 }),
    ]);
  });

  it('a second save with only the first note keeps the armor class (patch)', async () => {
    await memberCards.save(vharnId, biaId, { armorClass: 15 });
    await memberCards.save(vharnId, biaId, { noteOne: 'Percepção passiva 14' });

    expect(await memberCards.listOfCampaign(vharnId)).toEqual([
      expect.objectContaining({ userId: biaId, armorClass: 15, noteOne: 'Percepção passiva 14' }),
    ]);
  });

  it('saving characterName null clears only the name', async () => {
    await memberCards.save(vharnId, biaId, { characterName: 'Lyra Vandel', armorClass: 15 });
    await memberCards.save(vharnId, biaId, { characterName: null });

    expect(await memberCards.listOfCampaign(vharnId)).toEqual([
      expect.objectContaining({ userId: biaId, characterName: null, armorClass: 15 }),
    ]);
  });

  it('save returns the whole row after the change', async () => {
    await memberCards.save(vharnId, biaId, { armorClass: 15 });

    const saved = await memberCards.save(vharnId, biaId, { difficultyClass: 13 });

    expect(saved).toEqual(
      expect.objectContaining({ userId: biaId, armorClass: 15, difficultyClass: 13 }),
    );
  });

  it('two cards on the same table both come back', async () => {
    await memberCards.save(vharnId, biaId, { armorClass: 15 });
    await memberCards.save(vharnId, caioId, { armorClass: 12 });

    const found = await memberCards.listOfCampaign(vharnId);
    expect(found.map((card) => [card.userId, card.armorClass])).toEqual(
      expect.arrayContaining([
        [biaId, 15],
        [caioId, 12],
      ]),
    );
    expect(found).toHaveLength(2);
  });

  it('an armor class of 1000 written straight to the DAO is refused by the range check', async () => {
    await expect(memberCards.save(vharnId, biaId, { armorClass: 1000 })).rejects.toThrow();
  });

  it('a card of someone who is not a member of the table is refused by the foreign key', async () => {
    await expect(memberCards.save(quelmId, biaId, { armorClass: 15 })).rejects.toThrow();
  });

  it('removing Bia from the table deletes her card (cascade)', async () => {
    await memberCards.save(vharnId, biaId, { armorClass: 15 });
    await connection.db
      .delete(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, vharnId), eq(campaignMembers.userId, biaId)));

    expect(await memberCards.listOfCampaign(vharnId)).toEqual([]);
  });

  it('deleting the table deletes its cards (cascade)', async () => {
    await memberCards.save(vharnId, biaId, { armorClass: 15 });
    await connection.db.delete(campaigns).where(eq(campaigns.id, vharnId));

    expect(await memberCards.listOfCampaign(vharnId)).toEqual([]);
  });

  it('the card of Bia on Vharn does not come out on Quelm', async () => {
    await memberCards.save(vharnId, biaId, { armorClass: 15 });
    await memberCards.save(quelmId, caioId, { armorClass: 10 });

    expect(await memberCards.listOfCampaign(quelmId)).toEqual([
      expect.objectContaining({ userId: caioId, armorClass: 10 }),
    ]);
  });

  it('the card Bia wrote before becoming a spectator stays out of the list, and comes back when she plays again', async () => {
    await memberCards.save(vharnId, biaId, { armorClass: 15 });
    await memberCards.save(vharnId, caioId, { armorClass: 12 });
    const bia = and(eq(campaignMembers.campaignId, vharnId), eq(campaignMembers.userId, biaId));

    await connection.db.update(campaignMembers).set({ role: 'spectator' }).where(bia);
    const hidden = await memberCards.listOfCampaign(vharnId);
    await connection.db.update(campaignMembers).set({ role: 'player' }).where(bia);

    expect(hidden.map(({ userId }) => userId)).toEqual([caioId]);
    expect(await memberCards.listOfCampaign(vharnId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: biaId, armorClass: 15 })]),
    );
  });
});
