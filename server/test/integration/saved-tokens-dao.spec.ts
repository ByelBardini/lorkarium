import { savedTokenFolderNameKey } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { assets } from '../../src/modules/assets/assets.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import { campaignMembers } from '../../src/modules/campaigns/campaign-members.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { MemberPlansDao } from '../../src/modules/plans/member-plans.dao';
import { SavedTokenFoldersDao } from '../../src/modules/saved-tokens/saved-token-folders.dao';
import {
  SavedTokensDao,
  type SavedTokenOwner,
} from '../../src/modules/saved-tokens/saved-tokens.dao';
import { savedTokenForms } from '../../src/modules/saved-tokens/saved-tokens.po';
import { setAccountPlan } from '../support/account-plans';
import { newAssetPo } from '../support/assets-factories';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { rottenFormPo, savedTokenPo, zombieBodyPo } from '../support/saved-tokens-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('SavedTokensDao and SavedTokenFoldersDao on Postgres', () => {
  let connection: DatabaseConnection;
  let tokens: SavedTokensDao;
  let folders: SavedTokenFoldersDao;
  let vharnId: string;
  let quelmId: string;
  let anaId: string;
  let biaId: string;
  let caioId: string;
  let biaAtVharn: SavedTokenOwner;

  async function imageOf(campaignId: string): Promise<string> {
    const [row] = await connection.db.insert(assets).values(newAssetPo({ campaignId })).returning();
    if (!row) throw new Error('no asset');
    return row.id;
  }

  async function dropAsset(assetId: string): Promise<void> {
    await connection.db.delete(assets).where(eq(assets.id, assetId));
  }

  beforeAll(async () => {
    connection = await openTestDatabase();
    tokens = new SavedTokensDao(connection.db);
    folders = new SavedTokenFoldersDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    anaId = (await users.insert(newUserPo())).id;
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
    biaAtVharn = { campaignId: vharnId, userId: biaId };
  });

  afterAll(() => connection.close());

  it('the Zumbi and the Esqueleto of Bia come back in creation order, the forms in order', async () => {
    const wolf = { ...rottenFormPo(), name: 'Lobo' };
    const zombie = await tokens.insert(savedTokenPo(biaAtVharn), [rottenFormPo(), wolf]);
    await tokens.insert(savedTokenPo(biaAtVharn, { name: 'Esqueleto' }), []);

    const listed = await tokens.listOf(biaAtVharn);

    expect(listed.map((row) => row.savedToken.name)).toEqual(['Zumbi', 'Esqueleto']);
    expect(listed[0]?.savedToken.body).toEqual(zombieBodyPo());
    expect(listed[0]?.forms.map((form) => [form.position, form.name])).toEqual([
      [0, 'Podre'],
      [1, 'Lobo'],
    ]);
    expect(listed[0]?.savedToken.id).toBe(zombie.savedToken.id);
    expect(listed[1]?.forms).toEqual([]);
  });

  it('the list of Caio at Vharn and of Bia at Quelm do not bring the Zumbi of Bia at Vharn', async () => {
    await tokens.insert(savedTokenPo(biaAtVharn), []);

    expect(await tokens.listOf({ campaignId: vharnId, userId: caioId })).toEqual([]);
    expect(await tokens.listOf({ campaignId: quelmId, userId: biaId })).toEqual([]);
  });

  it('find, update and remove by Caio or at Quelm find nothing and the Zumbi stays', async () => {
    const { savedToken } = await tokens.insert(savedTokenPo(biaAtVharn), []);
    const caio = { campaignId: vharnId, userId: caioId };
    const atQuelm = { campaignId: quelmId, userId: biaId };

    expect(await tokens.findOf(caio, savedToken.id)).toBeUndefined();
    expect(await tokens.update(caio, savedToken.id, { name: 'Meu' })).toBeUndefined();
    expect(await tokens.update(atQuelm, savedToken.id, { name: 'Meu' })).toBeUndefined();
    expect(await tokens.remove(caio, savedToken.id)).toBe(false);
    expect((await tokens.findOf(biaAtVharn, savedToken.id))?.savedToken.name).toBe('Zumbi');
  });

  it('update renames without touching the forms, and with forms replaces the list', async () => {
    const { savedToken } = await tokens.insert(savedTokenPo(biaAtVharn), [rottenFormPo()]);

    const renamed = await tokens.update(biaAtVharn, savedToken.id, { name: 'Zumbi velho' });
    const replaced = await tokens.update(biaAtVharn, savedToken.id, { activeForm: null }, []);

    expect(renamed?.forms.map((form) => form.name)).toEqual(['Podre']);
    expect(renamed?.savedToken.name).toBe('Zumbi velho');
    expect(replaced?.forms).toEqual([]);
  });

  it('remove deletes the token and its forms', async () => {
    const { savedToken } = await tokens.insert(savedTokenPo(biaAtVharn), [rottenFormPo()]);

    expect(await tokens.remove(biaAtVharn, savedToken.id)).toBe(true);
    const forms = await connection.db
      .select()
      .from(savedTokenForms)
      .where(eq(savedTokenForms.savedTokenId, savedToken.id));
    expect(forms).toEqual([]);
  });

  it('countOf and rankOf count only the owner at the table, in creation order', async () => {
    const first = await tokens.insert(savedTokenPo(biaAtVharn), []);
    const second = await tokens.insert(savedTokenPo(biaAtVharn, { name: 'Esqueleto' }), []);
    await tokens.insert(savedTokenPo({ campaignId: vharnId, userId: caioId }), []);
    await tokens.insert(savedTokenPo({ campaignId: quelmId, userId: biaId }), []);

    expect(await tokens.countOf(biaAtVharn)).toBe(2);
    expect(await tokens.rankOf(biaAtVharn, first.savedToken.id)).toBe(0);
    expect(await tokens.rankOf(biaAtVharn, second.savedToken.id)).toBe(1);
    const caio = { campaignId: vharnId, userId: caioId };
    expect(await tokens.rankOf(caio, second.savedToken.id)).toBeUndefined();
  });

  it('losing the portrait, the aura image or a form image nulls only that column', async () => {
    const portrait = await imageOf(vharnId);
    const auraImage = await imageOf(vharnId);
    const formImage = await imageOf(vharnId);
    const overrides = { imageAssetId: portrait, auraImageAssetId: auraImage };
    const { savedToken } = await tokens.insert(savedTokenPo(biaAtVharn, overrides), [
      rottenFormPo(formImage),
    ]);

    await dropAsset(portrait);
    await dropAsset(auraImage);
    await dropAsset(formImage);

    const found = await tokens.findOf(biaAtVharn, savedToken.id);
    expect(found?.savedToken).toMatchObject({ imageAssetId: null, auraImageAssetId: null });
    expect(found?.forms.map((form) => [form.name, form.imageAssetId])).toEqual([['Podre', null]]);
  });

  it('Bia leaving Vharn takes her saved tokens and folders there, those of Quelm stay', async () => {
    await folders.insert({ ...biaAtVharn, name: 'Mortos', nameKey: 'mortos' });
    await tokens.insert(savedTokenPo(biaAtVharn), []);
    await tokens.insert(savedTokenPo({ campaignId: quelmId, userId: biaId }), []);

    await connection.db.delete(campaignMembers).where(eq(campaignMembers.userId, biaId));
    await new CampaignMembersDao(connection.db).insert({
      campaignId: quelmId,
      userId: biaId,
      role: 'player',
    });

    expect(await tokens.listOf(biaAtVharn)).toEqual([]);
    expect(await folders.listOf(biaAtVharn)).toEqual([]);
  });

  it('deleting the table takes the saved tokens along', async () => {
    await tokens.insert(savedTokenPo(biaAtVharn), []);

    await connection.db.delete(campaigns).where(eq(campaigns.id, vharnId));

    expect(await tokens.countOf(biaAtVharn)).toBe(0);
  });

  it('deleting a folder leaves its tokens out of any folder', async () => {
    const folder = await folders.insert({ ...biaAtVharn, name: 'Mortos', nameKey: 'mortos' });
    const { savedToken } = await tokens.insert(
      savedTokenPo(biaAtVharn, { folderId: folder.id }),
      [],
    );

    expect(await folders.remove(biaAtVharn, folder.id)).toBe(true);

    expect((await tokens.findOf(biaAtVharn, savedToken.id))?.savedToken.folderId).toBeNull();
  });

  it('a folder name repeated by Bia without case or accent is refused, Caio may use it', async () => {
    const named = { name: 'Mortos-Vivos', nameKey: savedTokenFolderNameKey('Mortos-Vivos') };
    await folders.insert({ ...biaAtVharn, ...named });

    const again = folders.insert({ ...biaAtVharn, name: ' MÓRTOS-vivos', nameKey: 'mortos-vivos' });

    await expect(again).rejects.toMatchObject({ cause: { code: '23505' } });
    await folders.insert({ campaignId: vharnId, userId: caioId, ...named });
  });

  it('folders: find, rename and remove by Caio find nothing; countOf only the owner', async () => {
    const folder = await folders.insert({ ...biaAtVharn, name: 'Mortos', nameKey: 'mortos' });
    const caio = { campaignId: vharnId, userId: caioId };

    expect(await folders.findOf(caio, folder.id)).toBeUndefined();
    expect(await folders.rename(caio, folder.id, { name: 'X', nameKey: 'x' })).toBeUndefined();
    expect(await folders.remove(caio, folder.id)).toBe(false);
    expect(await folders.countOf(biaAtVharn)).toBe(1);
    expect(await folders.countOf(caio)).toBe(0);
  });

  it.each([
    ['an empty name', { name: '' }],
    ['a name of 61 characters', { name: 'z'.repeat(61) }],
    ['an active form 8', { activeForm: 8 }],
  ])('the database refuses %s', async (_case, overrides) => {
    const insert = tokens.insert(savedTokenPo(biaAtVharn, overrides), []);

    await expect(insert).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('a saved token of someone who is not a member of the table is refused by the key', async () => {
    const insert = tokens.insert(savedTokenPo({ campaignId: quelmId, userId: anaId }), []);

    await expect(insert).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('MemberPlansDao reads the plan of the table owner and of the member', async () => {
    await setAccountPlan(connection.db, anaId, 'narrador');
    await setAccountPlan(connection.db, biaId, 'apoiador');

    const plans = await new MemberPlansDao(connection.db).find(vharnId, biaId);

    expect(plans?.tableOwner.plan).toBe('narrador');
    expect(plans?.member.plan).toBe('apoiador');
    expect(
      await new MemberPlansDao(connection.db).find(vharnId, 'b1c2d3e4-0000-4000-8000-000000000000'),
    ).toBeUndefined();
  });

  it('MemberPlansDao.lock holds a second lock of the same member until the first commits', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));

    const first = runInTransaction(connection.db, async (tx) => {
      await new MemberPlansDao(tx).lock(vharnId, biaId);
      order.push('first locked');
      await held;
      order.push('first commits');
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = runInTransaction(connection.db, async (tx) => {
      await new MemberPlansDao(tx).lock(vharnId, biaId);
      order.push('second locked');
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    await Promise.all([first, second]);

    expect(order).toEqual(['first locked', 'first commits', 'second locked']);
  });
});
