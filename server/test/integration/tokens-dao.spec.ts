import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao, type NewTokenRow } from '../../src/modules/tokens/tokens.dao';
import { tokenBars } from '../../src/modules/tokens/tokens.po';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const PV = {
  label: 'PV',
  current: 32,
  max: 45,
  color: 'ember',
  visibility: 'controllers',
} as const;
const INSPIRATION = {
  label: 'Inspiração',
  current: 1,
  max: 1,
  color: 'gold',
  visibility: 'everyone',
} as const;

describe('TokensDao on Postgres', () => {
  let connection: DatabaseConnection;
  let tokens: TokensDao;
  let sceneId: string;
  let otherSceneId: string;
  let biaId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    tokens = new TokensDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    const anaId = (await users.insert(newUserPo())).id;
    biaId = (await users.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    const campaigns = new CampaignsDao(connection.db);
    const vharn = await campaigns.insert(newCampaignPo({ ownerId: anaId }));
    const quelm = await campaigns.insert(
      newCampaignPo({ ownerId: anaId, name: 'Quelm', joinCode: 'QELM2345' }),
    );
    const scenes = new ScenesDao(connection.db);
    sceneId = (await scenes.insert({ campaignId: vharn.id })).id;
    otherSceneId = (await scenes.insert({ campaignId: quelm.id })).id;
  });

  afterAll(() => connection.close());

  function lyra(overrides: Partial<NewTokenRow> = {}): NewTokenRow {
    return {
      token: { sceneId, name: 'Lyra', initials: 'LY', side: 'ally', size: 1, col: 3, row: 4 },
      bars: [PV, INSPIRATION],
      controllerIds: [biaId],
      ...overrides,
    };
  }

  it('insert saves the token, its bars in order and its controllers', async () => {
    const saved = await tokens.insert(lyra());
    expect(saved.token).toMatchObject({ name: 'Lyra', col: 3, row: 4, sceneId });
    expect(saved.bars.map(({ label, position }) => [label, position])).toEqual([
      ['PV', 0],
      ['Inspiração', 1],
    ]);
    expect(saved.controllerIds).toEqual([biaId]);
  });

  it('insert without a layer puts the token on the tokens layer', async () => {
    expect((await tokens.insert(lyra())).token.layer).toBe('tokens');
  });

  it('a token inserted without a look is the square disc with no image looking down', async () => {
    expect((await tokens.insert(lyra())).token).toMatchObject({
      imageAssetId: null,
      frame: 'square',
      flipX: false,
      flipY: false,
      facing: 0,
    });
  });

  it('a facing of 360 is refused by the CHECK of the table', async () => {
    const turned = lyra({ token: { ...lyra().token, facing: 360 } });

    await expect(tokens.insert(turned)).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('insert on the background layer reads back on the background layer', async () => {
    const saved = await tokens.insert(lyra({ token: { ...lyra().token, layer: 'background' } }));
    expect((await tokens.findInScene(sceneId, saved.token.id))?.token.layer).toBe('background');
  });

  it('findManyInScene returns the asked tokens of the scene and skips one of another scene', async () => {
    const lyraRow = await tokens.insert(lyra());
    const bramRow = await tokens.insert(lyra({ controllerIds: [], bars: [] }));
    const elsewhere = await tokens.insert(
      lyra({ token: { ...lyra().token, sceneId: otherSceneId } }),
    );
    const found = await tokens.findManyInScene(sceneId, [
      bramRow.token.id,
      elsewhere.token.id,
      lyraRow.token.id,
    ]);
    expect(found.map(({ token }) => token.id).sort()).toEqual(
      [lyraRow.token.id, bramRow.token.id].sort(),
    );
    expect(found.find(({ token }) => token.id === lyraRow.token.id)?.controllerIds).toEqual([
      biaId,
    ]);
  });

  it('setLayer moves every listed token to the layer and leaves the others', async () => {
    const lyraRow = await tokens.insert(lyra());
    const bramRow = await tokens.insert(lyra({ controllerIds: [], bars: [] }));
    const kept = await tokens.insert(lyra({ controllerIds: [], bars: [] }));
    await tokens.setLayer([lyraRow.token.id, bramRow.token.id], 'background');
    const layers = (await tokens.listOfScene(sceneId)).map(({ token }) => [token.id, token.layer]);
    expect(layers).toEqual(
      expect.arrayContaining([
        [lyraRow.token.id, 'background'],
        [bramRow.token.id, 'background'],
        [kept.token.id, 'tokens'],
      ]),
    );
  });

  it('listOfScene returns every token of the scene with its bars and controllers', async () => {
    await tokens.insert(lyra());
    await tokens.insert(lyra({ controllerIds: [], bars: [] }));
    const listed = await tokens.listOfScene(sceneId);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.bars).toHaveLength(2);
    expect(listed[1]?.controllerIds).toEqual([]);
  });

  it('findInScene finds the token only in its own scene', async () => {
    const saved = await tokens.insert(lyra());
    expect(await tokens.findInScene(sceneId, saved.token.id)).toMatchObject({
      token: { id: saved.token.id },
    });
    expect(await tokens.findInScene(otherSceneId, saved.token.id)).toBeUndefined();
  });

  it('move saves the new cell', async () => {
    const saved = await tokens.insert(lyra());
    await tokens.move(saved.token.id, 8, 6);
    expect((await tokens.findInScene(sceneId, saved.token.id))?.token).toMatchObject({
      col: 8,
      row: 6,
    });
  });

  it('setBarCurrent changes one bar, even to a negative value', async () => {
    const saved = await tokens.insert(lyra());
    const pv = saved.bars[0];
    if (!pv) throw new Error('Lyra was saved without bars');
    await tokens.setBarCurrent(pv.id, -4);
    const found = await tokens.findInScene(sceneId, saved.token.id);
    expect(found?.bars.map(({ current }) => current)).toEqual([-4, 1]);
  });

  it('update replaces the fields, the bars and the controllers', async () => {
    const saved = await tokens.insert(lyra());
    await tokens.update(saved.token.id, {
      fields: { name: 'Lyra, a Rubra', initials: 'LR', side: 'neutral', size: 2 },
      bars: [INSPIRATION],
      controllerIds: [],
    });
    const found = await tokens.findInScene(sceneId, saved.token.id);
    expect(found?.token).toMatchObject({ name: 'Lyra, a Rubra', size: 2, side: 'neutral' });
    expect(found?.bars.map(({ label, position }) => [label, position])).toEqual([
      ['Inspiração', 0],
    ]);
    expect(found?.controllerIds).toEqual([]);
  });

  it('delete removes the token with its bars and controllers', async () => {
    const saved = await tokens.insert(lyra());
    await tokens.delete(saved.token.id);
    expect(await tokens.findInScene(sceneId, saved.token.id)).toBeUndefined();
    expect(await tokens.listOfScene(sceneId)).toEqual([]);
  });

  it('two bars at the same position violate the unique index', async () => {
    const saved = await tokens.insert(lyra());
    const duplicate = { tokenId: saved.token.id, position: 0, ...INSPIRATION };
    await expect(connection.db.insert(tokenBars).values(duplicate)).rejects.toMatchObject({
      cause: { code: UNIQUE_VIOLATION },
    });
  });

  it('insertMany saves each token with its bars, and deleteMany removes only the ones of the scene', async () => {
    const [mine, theirs] = await tokens.insertMany([
      lyra(),
      lyra({ token: { ...lyra().token, sceneId: otherSceneId } }),
    ]);
    if (!mine || !theirs) throw new Error('insertMany returned fewer tokens');
    expect(mine.bars).toHaveLength(2);

    await tokens.deleteMany(sceneId, [mine.token.id, theirs.token.id]);

    expect(await tokens.listOfScene(sceneId)).toEqual([]);
    expect((await tokens.listOfScene(otherSceneId)).map(({ token }) => token.id)).toEqual([
      theirs.token.id,
    ]);
  });
});
