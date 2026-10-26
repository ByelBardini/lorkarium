import { savedRollNameKey } from '@lorkarium/contracts';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { SavedRollsDao } from '../../src/modules/saved-rolls/saved-rolls.dao';
import type { NewSavedRollPo } from '../../src/modules/saved-rolls/saved-rolls.po';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const ATTACK = [{ label: null, expression: '1d20+5' }];
const BLESS = [{ label: 'Bênção', expression: '1d4' }];

describe('SavedRollsDao on Postgres', () => {
  let connection: DatabaseConnection;
  let rolls: SavedRollsDao;
  let vharnId: string;
  let quelmId: string;
  let biaId: string;
  let caioId: string;

  function rollOf(userId: string, name: string, campaignId = vharnId): NewSavedRollPo {
    return { campaignId, userId, name, nameKey: savedRollNameKey(name), parts: ATTACK };
  }

  beforeAll(async () => {
    connection = await openTestDatabase();
    rolls = new SavedRollsDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    const anaId = (await users.insert(newUserPo())).id;
    biaId = (await users.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    caioId = (await users.insert(newUserPo({ email: 'caio@mesa.com', name: 'Caio' }))).id;
    const campaignsDao = new CampaignsDao(connection.db);
    vharnId = (await campaignsDao.insert(newCampaignPo({ ownerId: anaId }))).id;
    const quelm = newCampaignPo({ ownerId: caioId, name: 'Quelm', joinCode: 'QELM2345' });
    quelmId = (await campaignsDao.insert(quelm)).id;
    const members = new CampaignMembersDao(connection.db);
    await members.insert({ campaignId: vharnId, userId: anaId, role: 'master' });
    await members.insert({ campaignId: vharnId, userId: biaId, role: 'player' });
    await members.insert({ campaignId: vharnId, userId: caioId, role: 'player' });
    await members.insert({ campaignId: quelmId, userId: caioId, role: 'master' });
    await members.insert({ campaignId: quelmId, userId: biaId, role: 'player' });
  });

  afterAll(() => connection.close());

  it('"Acerto" and "Bênção" of Bia at Vharn come back in the order they were created', async () => {
    const acerto = await rolls.insert(rollOf(biaId, 'Acerto'));
    const bencao = await rolls.insert({ ...rollOf(biaId, 'Bênção'), parts: BLESS });

    const listed = await rolls.listOf(vharnId, biaId);

    expect(listed.map((row) => [row.id, row.name, row.parts])).toEqual([
      [acerto.id, 'Acerto', ATTACK],
      [bencao.id, 'Bênção', BLESS],
    ]);
  });

  it('update changes name and pieces and returns the row', async () => {
    const acerto = await rolls.insert(rollOf(biaId, 'Acerto'));

    const changes = { name: 'Acerto com espada', nameKey: 'acerto com espada', parts: BLESS };
    const updated = await rolls.update(vharnId, biaId, acerto.id, changes);

    expect(updated).toMatchObject({ id: acerto.id, name: 'Acerto com espada', parts: BLESS });
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(acerto.updatedAt.getTime());
  });

  it('remove deletes the roll and answers true', async () => {
    const acerto = await rolls.insert(rollOf(biaId, 'Acerto'));

    expect(await rolls.remove(vharnId, biaId, acerto.id)).toBe(true);
    expect(await rolls.listOf(vharnId, biaId)).toEqual([]);
  });

  it('the list of Caio at Vharn does not bring those of Bia', async () => {
    await rolls.insert(rollOf(biaId, 'Acerto'));

    expect(await rolls.listOf(vharnId, caioId)).toEqual([]);
  });

  it('the list of Bia at Quelm does not bring those of Vharn (critério 14)', async () => {
    await rolls.insert(rollOf(biaId, 'Acerto'));
    await rolls.insert(rollOf(biaId, 'Furtivo', quelmId));

    expect((await rolls.listOf(quelmId, biaId)).map((row) => row.name)).toEqual(['Furtivo']);
  });

  it('update and remove with the userId of Caio find nothing and the roll of Bia stays', async () => {
    const acerto = await rolls.insert(rollOf(biaId, 'Acerto'));

    expect(await rolls.update(vharnId, caioId, acerto.id, { name: 'Meu' })).toBeUndefined();
    expect(await rolls.remove(vharnId, caioId, acerto.id)).toBe(false);
    expect((await rolls.listOf(vharnId, biaId)).map((row) => row.name)).toEqual(['Acerto']);
  });

  it('update and remove with the table of Quelm find nothing', async () => {
    const acerto = await rolls.insert(rollOf(biaId, 'Acerto'));

    expect(await rolls.update(quelmId, biaId, acerto.id, { name: 'Meu' })).toBeUndefined();
    expect(await rolls.remove(quelmId, biaId, acerto.id)).toBe(false);
  });

  it('countOf counts only the owner at the table', async () => {
    await rolls.insert(rollOf(biaId, 'Acerto'));
    await rolls.insert(rollOf(biaId, 'Bênção'));
    await rolls.insert(rollOf(caioId, 'Acerto'));

    expect(await rolls.countOf(vharnId, biaId)).toBe(2);
  });

  it('the unique index refuses "ACÉRTO" for Bia and accepts it for Caio', async () => {
    await rolls.insert(rollOf(biaId, 'Acerto'));

    await expect(rolls.insert(rollOf(biaId, 'ACÉRTO'))).rejects.toMatchObject({
      cause: expect.objectContaining({
        code: '23505',
        constraint: 'saved_rolls_member_name_unique',
      }),
    });
    await expect(rolls.insert(rollOf(caioId, 'ACÉRTO'))).resolves.toMatchObject({
      name: 'ACÉRTO',
    });
  });

  it('the CHECK refuses a name of 41 characters', async () => {
    const tooLong = rollOf(biaId, 'x'.repeat(41));

    await expect(rolls.insert(tooLong)).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: 'saved_rolls_name_length' }),
    });
  });

  it('the FK refuses a roll of someone who is not a member', async () => {
    const ofQuelm = rollOf(caioId, 'Acerto', quelmId);
    const stranger = (await new UsersDao(connection.db).insert(newUserPo({ email: 'x@y.com' }))).id;

    await expect(rolls.insert({ ...ofQuelm, userId: stranger })).rejects.toMatchObject({
      cause: expect.objectContaining({ code: '23503' }),
    });
  });

  it('Bia leaves Vharn: her rolls there are gone, the ones at Quelm stay', async () => {
    await rolls.insert(rollOf(biaId, 'Acerto'));
    await rolls.insert(rollOf(biaId, 'Furtivo', quelmId));

    await connection.db
      .delete(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, vharnId), eq(campaignMembers.userId, biaId)));

    expect(await rolls.listOf(vharnId, biaId)).toEqual([]);
    expect(await rolls.countOf(quelmId, biaId)).toBe(1);
  });

  it('Vharn is deleted: the rolls of the table are gone', async () => {
    await rolls.insert(rollOf(biaId, 'Acerto'));
    await rolls.insert(rollOf(caioId, 'Acerto'));

    await connection.db.delete(campaigns).where(eq(campaigns.id, vharnId));

    expect(await rolls.countOf(vharnId, biaId)).toBe(0);
    expect(await rolls.countOf(vharnId, caioId)).toBe(0);
  });

  it('lockOwner answers true for Bia at Vharn and false for someone outside the table', async () => {
    const stranger = '00000000-0000-4000-8000-000000000000';
    const lockOf = (userId: string): Promise<boolean> =>
      runInTransaction(connection.db, (tx) => new SavedRollsDao(tx).lockOwner(vharnId, userId));

    expect(await lockOf(biaId)).toBe(true);
    expect(await lockOf(stranger)).toBe(false);
  });

  it('a second lockOwner of Bia waits for the first transaction to end', async () => {
    const order: string[] = [];
    let release = (): void => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const first = runInTransaction(connection.db, async (tx) => {
      await new SavedRollsDao(tx).lockOwner(vharnId, biaId);
      order.push('first locked');
      await held;
      order.push('first done');
    });
    while (order.length === 0) await new Promise((resolve) => setTimeout(resolve, 10));
    const second = runInTransaction(connection.db, async (tx) => {
      await new SavedRollsDao(tx).lockOwner(vharnId, biaId);
      order.push('second locked');
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    await Promise.all([first, second]);

    expect(order).toEqual(['first locked', 'first done', 'second locked']);
  });
});
