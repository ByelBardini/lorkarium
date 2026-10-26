import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { AssetsDao } from '../../src/modules/assets/assets.dao';
import { assets } from '../../src/modules/assets/assets.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao, type NewTokenRow } from '../../src/modules/tokens/tokens.dao';
import type { TokenAuraPo, TokenPo } from '../../src/modules/tokens/tokens.po';
import { newAssetPo } from '../support/assets-factories';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const CHECK_VIOLATION = '23514';

const NO_AURA: TokenAuraPo = {
  auraKind: null,
  auraRadius: null,
  auraColor: null,
  auraEffect: null,
  auraImageAssetId: null,
  auraOpacity: null,
  auraImageShape: null,
};

const FIRE_AURA: TokenAuraPo = {
  ...NO_AURA,
  auraKind: 'effect',
  auraRadius: '2',
  auraEffect: 'fire',
  auraOpacity: 100,
};

const GOLD_AURA: TokenAuraPo = {
  ...NO_AURA,
  auraKind: 'color',
  auraRadius: '3.5',
  auraColor: 'gold',
  auraOpacity: 50,
};

const ROUND_RUNE: TokenAuraPo = {
  ...NO_AURA,
  auraKind: 'image',
  auraRadius: '1',
  auraOpacity: 80,
  auraImageShape: 'round',
};

function auraOf(token: TokenPo): TokenAuraPo {
  const { auraKind, auraRadius, auraColor, auraEffect, auraImageAssetId, auraOpacity } = token;
  const { auraImageShape } = token;
  return {
    auraKind,
    auraRadius,
    auraColor,
    auraEffect,
    auraImageAssetId,
    auraOpacity,
    auraImageShape,
  };
}

describe('TokensDao: the aura columns on Postgres', () => {
  let connection: DatabaseConnection;
  let tokens: TokensDao;
  let vharnId: string;
  let vharnScene: string;
  let quelmScene: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    tokens = new TokensDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const anaId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    const campaigns = new CampaignsDao(connection.db);
    vharnId = (await campaigns.insert(newCampaignPo({ ownerId: anaId }))).id;
    const quelm = await campaigns.insert(
      newCampaignPo({ ownerId: anaId, name: 'Quelm', joinCode: 'QELM2345' }),
    );
    const scenes = new ScenesDao(connection.db);
    vharnScene = (await scenes.insert({ campaignId: vharnId })).id;
    quelmScene = (await scenes.insert({ campaignId: quelm.id })).id;
  });

  afterAll(() => connection.close());

  function lyra(aura: Partial<TokenAuraPo> = {}, sceneId = vharnScene): NewTokenRow {
    const box = { width: 1, height: 1, col: 3, row: 4 };
    const token = { sceneId, name: 'Lyra', initials: 'LY', side: 'ally' as const, ...box };
    return { token: { ...token, ...aura }, bars: [], controllerIds: [] };
  }

  async function reread(tokenId: string, sceneId = vharnScene): Promise<TokenPo> {
    const row = await tokens.findInScene(sceneId, tokenId);
    if (!row) throw new Error(`token ${tokenId} not found in scene ${sceneId}`);
    return row.token;
  }

  async function auraAsset(): Promise<string> {
    const row = await new AssetsDao(connection.db).insert(
      newAssetPo({ campaignId: vharnId, purpose: 'aura', mimeType: 'image/gif' }),
    );
    return row.id;
  }

  it('a token inserted with a fire aura reads its six columns back', async () => {
    const saved = await tokens.insert(lyra(FIRE_AURA));

    expect(auraOf(await reread(saved.token.id))).toEqual({
      auraKind: 'effect',
      auraRadius: '2.00',
      auraColor: null,
      auraEffect: 'fire',
      auraImageAssetId: null,
      auraOpacity: 100,
    });
  });

  it('a token inserted without an aura has all six columns null', async () => {
    const saved = await tokens.insert(lyra());

    expect(auraOf(saved.token)).toEqual(NO_AURA);
  });

  it('restyle with an aura swaps only the aura, keeping the name, the image and the light', async () => {
    const lit = { lightBright: '4', lightDim: '4', frame: 'round' as const };
    const saved = await tokens.insert({
      ...lyra(FIRE_AURA),
      token: { ...lyra(FIRE_AURA).token, ...lit },
    });

    await tokens.restyle([saved.token.id], GOLD_AURA);

    const after = await reread(saved.token.id);
    expect(auraOf(after)).toEqual({ ...GOLD_AURA, auraRadius: '3.50' });
    expect(after).toMatchObject({ name: 'Lyra', frame: 'round', lightBright: '4.00' });
  });

  it('restyle with the null aura clears all six columns', async () => {
    const saved = await tokens.insert(lyra(GOLD_AURA));

    await tokens.restyle([saved.token.id], NO_AURA);

    expect(auraOf(await reread(saved.token.id))).toEqual(NO_AURA);
  });

  it('restyle without aura fields leaves the aura as it was', async () => {
    const saved = await tokens.insert(lyra(FIRE_AURA));

    await tokens.restyle([saved.token.id], { flipX: true });

    expect((await reread(saved.token.id)).auraEffect).toBe('fire');
  });

  it('a radius of 0 (only the footprint) is kept', async () => {
    const saved = await tokens.insert(lyra({ ...GOLD_AURA, auraRadius: '0' }));

    expect(saved.token.auraRadius).toBe('0.00');
  });

  it('updateFields with an aura writes it on the token alone', async () => {
    const saved = await tokens.insert(lyra());

    await tokens.updateFields(saved.token.id, FIRE_AURA);

    expect((await reread(saved.token.id)).auraKind).toBe('effect');
  });

  it('deleting the asset of an image aura nulls only the image (set null), the shape stays', async () => {
    const assetId = await auraAsset();
    const saved = await tokens.insert(lyra({ ...ROUND_RUNE, auraImageAssetId: assetId }));

    await connection.db.delete(assets).where(eq(assets.id, assetId));

    expect(auraOf(await reread(saved.token.id))).toEqual({ ...ROUND_RUNE, auraRadius: '1.00' });
  });

  it('a round image aura is read back round', async () => {
    const assetId = await auraAsset();
    const saved = await tokens.insert(lyra({ ...ROUND_RUNE, auraImageAssetId: assetId }));

    expect((await reread(saved.token.id)).auraImageShape).toBe('round');
  });

  it('copyScene (Duplicate of the library) takes the aura of each token', async () => {
    await tokens.insertMany([
      lyra(FIRE_AURA),
      { ...lyra(GOLD_AURA), token: { ...lyra(GOLD_AURA).token, name: 'Kael' } },
    ]);
    const copy = (await new ScenesDao(connection.db).insert({ campaignId: vharnId })).id;

    await tokens.copyScene(vharnScene, copy);

    const copied = await tokens.listOfScene(copy);
    const byName = Object.fromEntries(copied.map(({ token }) => [token.name, token.auraKind]));
    expect(byName).toEqual({ Lyra: 'effect', Kael: 'color' });
  });

  it.each([
    ['a color aura without its color', { ...GOLD_AURA, auraColor: null }],
    ['an effect aura without its effect', { ...FIRE_AURA, auraEffect: null }],
    ['an effect aura with an image', { ...FIRE_AURA, auraImageAssetId: 'IMAGE' }],
    ['an image aura with an effect', { ...FIRE_AURA, auraKind: 'image' }],
    ['an image aura with a color', { ...GOLD_AURA, auraKind: 'image' }],
    [
      'only the kind, without radius nor opacity',
      { ...NO_AURA, auraKind: 'color', auraColor: 'gold' },
    ],
    ['a radius of 20.01 cells', { ...GOLD_AURA, auraRadius: '20.01' }],
    ['an opacity of 9%', { ...GOLD_AURA, auraOpacity: 9 }],
    ['an opacity of 101%', { ...GOLD_AURA, auraOpacity: 101 }],
    ['a color without a kind', { ...NO_AURA, auraColor: 'gold' }],
    ['a radius without a kind', { ...NO_AURA, auraRadius: '2', auraOpacity: 50 }],
    ['an image aura without its shape', { ...ROUND_RUNE, auraImageShape: null }],
    ['a color aura with a shape', { ...GOLD_AURA, auraImageShape: 'round' }],
    ['a shape without a kind', { ...NO_AURA, auraImageShape: 'square' }],
  ] as const)('%s is refused by the aura CHECKs of the table', async (_name, aura) => {
    const image = aura.auraImageAssetId === 'IMAGE' ? { auraImageAssetId: await auraAsset() } : {};

    await expect(tokens.insert(lyra({ ...aura, ...image }))).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION },
    });
  });

  it('a radius of exactly 20 cells and an opacity of 10% are kept', async () => {
    const widest = { ...GOLD_AURA, auraRadius: '20', auraOpacity: 10 };

    expect(auraOf((await tokens.insert(lyra(widest))).token)).toMatchObject({
      auraRadius: '20.00',
      auraOpacity: 10,
    });
  });

  it('findManyInScene of the Quelm scene does not find the Vharn token with an aura', async () => {
    const saved = await tokens.insert(lyra(FIRE_AURA));

    expect(await tokens.findManyInScene(quelmScene, [saved.token.id])).toEqual([]);
  });

  it('restyling the Vharn token leaves the aura of the Quelm token as it was', async () => {
    const vharn = await tokens.insert(lyra(FIRE_AURA));
    const quelm = await tokens.insert(lyra(GOLD_AURA, quelmScene));

    await tokens.restyle([vharn.token.id], NO_AURA);

    expect(auraOf(await reread(quelm.token.id, quelmScene))).toEqual({
      ...GOLD_AURA,
      auraRadius: '3.50',
    });
  });
});
