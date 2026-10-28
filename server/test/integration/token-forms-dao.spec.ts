import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { assets } from '../../src/modules/assets/assets.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao, type NewTokenRow, type TokenRow } from '../../src/modules/tokens/tokens.dao';
import { tokenForms, type TokenFormInputPo } from '../../src/modules/tokens/tokens.po';
import { newAssetPo } from '../support/assets-factories';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { CountingQueryLog } from '../support/query-count';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const CHECK_VIOLATION = '23514';
const FIELDS = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 } as const;

function form(name: string, size = 1, imageAssetId: string | null = null): TokenFormInputPo {
  const frame = size > 1 ? 'round' : 'square';
  return { id: crypto.randomUUID(), name, imageAssetId, width: size, height: size, frame };
}

describe('the forms of a token on Postgres', () => {
  let connection: DatabaseConnection;
  let tokens: TokensDao;
  let sceneId: string;
  let quelmSceneId: string;
  let vharnId: string;
  const queries = new CountingQueryLog();

  beforeAll(async () => {
    connection = await openTestDatabase({ queryLog: queries });
    tokens = new TokensDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const anaId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    const campaigns = new CampaignsDao(connection.db);
    vharnId = (await campaigns.insert(newCampaignPo({ ownerId: anaId }))).id;
    const quelm = newCampaignPo({ ownerId: anaId, name: 'Quelm', joinCode: 'QELM2345' });
    const quelmId = (await campaigns.insert(quelm)).id;
    const scenes = new ScenesDao(connection.db);
    sceneId = (await scenes.insert({ campaignId: vharnId })).id;
    quelmSceneId = (await scenes.insert({ campaignId: quelmId })).id;
  });

  afterAll(() => connection.close());

  function lyra(overrides: Partial<NewTokenRow> = {}): NewTokenRow {
    const token = { sceneId, ...FIELDS, col: 3, row: 4 };
    return { token, bars: [], controllerIds: [], ...overrides };
  }

  async function lyraInWolf(): Promise<TokenRow> {
    const forms = [form('Elfa'), form('Lobo atroz', 2), form('Corvo', 0.5)];
    const token = { ...lyra().token, width: 2, height: 2 };
    return tokens.insert(lyra({ token, forms, activeFormIndex: 1 }));
  }

  async function reread(tokenId: string, inScene = sceneId): Promise<TokenRow | undefined> {
    return tokens.findInScene(inScene, tokenId);
  }

  it('insert saves the forms in their order with new ids, showing the one at its index', async () => {
    const sent = [form('Elfa'), form('Lobo atroz', 2)];

    const saved = await tokens.insert(lyra({ forms: sent, activeFormIndex: 1 }));

    const found = await reread(saved.token.id);
    const read = found?.forms.map(({ name, position, width, frame }) => [
      name,
      position,
      width,
      frame,
    ]);
    expect(read).toEqual([
      ['Elfa', 0, 1, 'square'],
      ['Lobo atroz', 1, 2, 'round'],
    ]);
    expect(found?.forms.map(({ id }) => id)).not.toContain(sent[0]?.id);
    expect(found?.token.activeFormId).toBe(found?.forms[1]?.id);
    expect(saved).toEqual(found);
  });

  it('reading a token with forms costs the same queries as one without', async () => {
    const plain = await tokens.insert(lyra());
    const shaped = await lyraInWolf();
    queries.reset();
    await reread(plain.token.id);
    const withoutForms = queries.count;
    queries.reset();

    await reread(shaped.token.id);

    expect(queries.count).toBe(withoutForms);
  });

  it('a pasted batch with and without forms is still 2 statements', async () => {
    queries.reset();

    await tokens.insertMany([lyra({ forms: [form('Elfa')], activeFormIndex: 0 }), lyra()]);

    expect(queries.count).toBe(2);
  });

  it('update keeps the id of a form the token had and gives a new one to an id it never had', async () => {
    const saved = await lyraInWolf();
    const wolf = saved.forms[1];
    if (!wolf) throw new Error('Lyra has no wolf');
    const fresh = form('Urso', 3);

    await tokens.update(saved.token.id, {
      fields: { ...FIELDS, width: 2, height: 2, activeFormId: wolf.id },
      bars: [],
      controllerIds: [],
      forms: [fresh, { ...wolf, name: 'Lobo' }],
    });

    const found = await reread(saved.token.id);
    expect(found?.forms.map(({ name }) => name)).toEqual(['Urso', 'Lobo']);
    expect(found?.forms[1]?.id).toBe(wolf.id);
    expect(found?.forms[0]?.id).not.toBe(fresh.id);
    expect(found?.token.activeFormId).toBe(wolf.id);
  });

  it('an id of a form of another token neither collides nor takes that form', async () => {
    const kael = await lyraInWolf();
    const kaelWolf = kael.forms[1];
    const saved = await tokens.insert(lyra());
    if (!kaelWolf) throw new Error('Kael has no wolf');

    await tokens.update(saved.token.id, {
      fields: FIELDS,
      bars: [],
      controllerIds: [],
      forms: [{ ...kaelWolf, name: 'Roubada' }],
    });

    expect((await reread(saved.token.id))?.forms[0]?.id).not.toBe(kaelWolf.id);
    expect((await reread(kael.token.id))?.forms[1]).toEqual(kaelWolf);
  });

  it('dropping the shown form from the list leaves the token without one (FK set null)', async () => {
    const saved = await lyraInWolf();
    const [elf] = saved.forms;
    if (!elf) throw new Error('Lyra has no elf');

    const update = { fields: FIELDS, bars: [], controllerIds: [], forms: [elf] };
    await tokens.update(saved.token.id, update);

    expect((await reread(saved.token.id))?.token.activeFormId).toBeNull();
  });

  it('a form of 0.3 cells is refused by the CHECK of the table', async () => {
    const saved = await tokens.insert(lyra());
    const row = { tokenId: saved.token.id, position: 0, name: 'Pó', width: 0.3, height: 1 };

    await expect(connection.db.insert(tokenForms).values(row)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION },
    });
  });

  it('deleting the asset of a form brings the initials back to it (set null)', async () => {
    const asset = await new AssetsDao(connection.db).insert(newAssetPo({ campaignId: vharnId }));
    const saved = await tokens.insert(lyra({ forms: [form('Lobo', 2, asset.id)] }));

    await connection.db.delete(assets).where(eq(assets.id, asset.id));

    const [wolf] = (await reread(saved.token.id))?.forms ?? [];
    expect(wolf).toMatchObject({ name: 'Lobo', imageAssetId: null });
  });

  it('the scene of Quelm does not find the token of Vharn nor its forms', async () => {
    const saved = await lyraInWolf();

    expect(await reread(saved.token.id, quelmSceneId)).toBeUndefined();
    expect(await tokens.listOfScene(quelmSceneId)).toEqual([]);
  });

  it('deleting the token takes its forms (cascade)', async () => {
    const saved = await lyraInWolf();

    await tokens.delete(saved.token.id);

    const left = await connection.db
      .select()
      .from(tokenForms)
      .where(eq(tokenForms.tokenId, saved.token.id));
    expect(left).toEqual([]);
  });

  it('copyScene copies the forms with new ids and the copy shows the copy of its form', async () => {
    const saved = await lyraInWolf();
    const copySceneId = (await new ScenesDao(connection.db).insert({ campaignId: vharnId })).id;

    const ids = await tokens.copyScene(sceneId, copySceneId);

    const copy = await reread(ids.get(saved.token.id) ?? '', copySceneId);
    expect(copy?.forms.map(({ name, frame }) => [name, frame])).toEqual([
      ['Elfa', 'square'],
      ['Lobo atroz', 'round'],
      ['Corvo', 'square'],
    ]);
    const originalIds = saved.forms.map(({ id }) => id);
    expect(copy?.forms.some(({ id }) => originalIds.includes(id))).toBe(false);
    expect(copy?.token.activeFormId).toBe(copy?.forms[1]?.id);
    expect((await reread(saved.token.id))?.token.activeFormId).toBe(saved.forms[1]?.id);
  });

  it('a restyle with a new image leaves the token without its form; naming the form sets it', async () => {
    const saved = await lyraInWolf();
    const asset = await new AssetsDao(connection.db).insert(newAssetPo({ campaignId: vharnId }));
    const elfId = saved.forms[0]?.id ?? null;

    await tokens.restyle([saved.token.id], { imageAssetId: asset.id });
    const byHand = (await reread(saved.token.id))?.token.activeFormId;
    await tokens.restyle([saved.token.id], { imageAssetId: null, activeFormId: elfId });

    expect(byHand).toBeNull();
    expect((await reread(saved.token.id))?.token.activeFormId).toBe(elfId);
  });

  it('a restyle with a new frame by hand leaves the token without its form', async () => {
    const saved = await lyraInWolf();

    await tokens.restyle([saved.token.id], { frame: 'round' });

    expect((await reread(saved.token.id))?.token.activeFormId).toBeNull();
  });

  it('a restyle with the frame it already has keeps the form', async () => {
    const saved = await lyraInWolf();

    await tokens.restyle([saved.token.id], { frame: 'square', flipY: true });

    expect((await reread(saved.token.id))?.token.activeFormId).toBe(saved.token.activeFormId);
  });

  it('a restyle that keeps the image (the flip) keeps the form', async () => {
    const saved = await lyraInWolf();

    await tokens.restyle([saved.token.id], { flipX: true, imageAssetId: null });

    expect((await reread(saved.token.id))?.token.activeFormId).toBe(saved.token.activeFormId);
  });

  it('resizeMany with a new size leaves the token without its form; a move of the box keeps it', async () => {
    const wolf = await lyraInWolf();
    const other = await lyraInWolf();

    await tokens.resizeMany(sceneId, [
      { tokenId: wolf.token.id, col: 3, row: 4, width: 3, height: 3 },
      { tokenId: other.token.id, col: 5, row: 5, width: 2, height: 2 },
    ]);

    expect((await reread(wolf.token.id))?.token.activeFormId).toBeNull();
    expect((await reread(other.token.id))?.token.activeFormId).toBe(other.token.activeFormId);
  });
});
