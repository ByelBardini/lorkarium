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
      token: {
        sceneId,
        name: 'Lyra',
        initials: 'LY',
        side: 'ally',
        width: 1,
        height: 1,
        col: 3,
        row: 4,
      },
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

  it('a token inserted without a look is the square disc with no image looking right (facing 0)', async () => {
    expect((await tokens.insert(lyra())).token).toMatchObject({
      imageAssetId: null,
      frame: 'square',
      flipX: false,
      flipY: false,
      facing: 0,
      defeated: false,
    });
  });

  it('a facing of 360 is refused by the CHECK of the table', async () => {
    const turned = lyra({ token: { ...lyra().token, facing: 360 } });

    await expect(tokens.insert(turned)).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('a sight of 12 and 4 reads back as the numeric strings "12.00" and "4.00"', async () => {
    const seeing = lyra({ token: { ...lyra().token, sightBright: '12', sightDim: '4' } });

    expect((await tokens.insert(seeing)).token).toMatchObject({
      sightBright: '12.00',
      sightDim: '4.00',
    });
  });

  it.each([
    ['a bright of 100.5', '100.5', '0'],
    ['a dim of -1', '3', '-1'],
    ['only the bright set', '3', null],
  ])('%s is refused by the sight CHECK of the table', async (_name, bright, dim) => {
    const broken = lyra({ token: { ...lyra().token, sightBright: bright, sightDim: dim } });

    await expect(tokens.insert(broken)).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('a token inserted without a light has both light columns null and is lit', async () => {
    expect((await tokens.insert(lyra())).token).toMatchObject({
      lightBright: null,
      lightDim: null,
      lightLit: true,
    });
  });

  it.each([
    ['a light bright of 101', '101', '0'],
    ['only the light bright set', '4', null],
  ])('%s is refused by the light CHECK of the table', async (_name, bright, dim) => {
    const broken = lyra({ token: { ...lyra().token, lightBright: bright, lightDim: dim } });

    await expect(tokens.insert(broken)).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('restyle with lightLit false writes only the switch and keeps the light and the look', async () => {
    const torch = { lightBright: '4', lightDim: '4', frame: 'round' } as const;
    const saved = await tokens.insert(lyra({ token: { ...lyra().token, ...torch } }));

    await tokens.restyle([saved.token.id], { lightLit: false });

    expect((await tokens.findInScene(sceneId, saved.token.id))?.token).toMatchObject({
      lightLit: false,
      lightBright: '4.00',
      lightDim: '4.00',
      frame: 'round',
    });
  });

  it('a half-cell box (1.5 × 0.5 at 2.5, 3) reads back exactly', async () => {
    const box = { col: 2.5, row: 3, width: 1.5, height: 0.5 };
    const saved = await tokens.insert(lyra({ token: { ...lyra().token, ...box } }));

    expect((await tokens.findInScene(sceneId, saved.token.id))?.token).toMatchObject(box);
  });

  it.each([
    ['width', 0.25],
    ['height', 10.5],
    ['col', 1.25],
  ])('a %s of %s is refused by the CHECK of the table', async (field, value) => {
    const odd = lyra({ token: { ...lyra().token, [field]: value } });

    await expect(tokens.insert(odd)).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('resizeMany writes the new box of each listed token', async () => {
    const saved = await tokens.insert(lyra());

    await tokens.resizeMany([{ tokenId: saved.token.id, col: 2, row: 4, width: 2, height: 1 }]);

    const found = await tokens.findInScene(sceneId, saved.token.id);
    expect(found?.token).toMatchObject({ col: 2, row: 4, width: 2, height: 1 });
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

  it('setBarValues changes one bar, even to a negative current', async () => {
    const saved = await tokens.insert(lyra());
    const pv = saved.bars[0];
    if (!pv) throw new Error('Lyra was saved without bars');
    await tokens.setBarValues(pv.id, { current: -4, max: 50 });
    const found = await tokens.findInScene(sceneId, saved.token.id);
    expect(found?.bars.map(({ current, max }) => [current, max])).toEqual([
      [-4, 50],
      [1, 1],
    ]);
  });

  it('a bar saved without a display reads back as number, and percent is kept', async () => {
    const saved = await tokens.insert(lyra());
    const pv = saved.bars[0];
    if (!pv) throw new Error('Lyra was saved without bars');
    await tokens.update(saved.token.id, {
      fields: { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 },
      bars: [{ ...INSPIRATION, display: 'percent' }],
      controllerIds: [],
    });
    const found = await tokens.findInScene(sceneId, saved.token.id);
    expect([pv.display, found?.bars[0]?.display]).toEqual(['number', 'percent']);
  });

  it('update replaces the fields, the bars and the controllers', async () => {
    const saved = await tokens.insert(lyra());
    await tokens.update(saved.token.id, {
      fields: { name: 'Lyra, a Rubra', initials: 'LR', side: 'neutral', width: 2.5, height: 0.5 },
      bars: [INSPIRATION],
      controllerIds: [],
    });
    const found = await tokens.findInScene(sceneId, saved.token.id);
    expect(found?.token).toMatchObject({
      name: 'Lyra, a Rubra',
      width: 2.5,
      height: 0.5,
      side: 'neutral',
    });
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
