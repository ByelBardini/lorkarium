import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { MainTokensDao } from '../../src/modules/tokens/main-tokens.dao';
import { TokensDao, type NewTokenRow } from '../../src/modules/tokens/tokens.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('MainTokensDao on Postgres', () => {
  let connection: DatabaseConnection;
  let mainTokens: MainTokensDao;
  let tokens: TokensDao;
  let vharnSceneId: string;
  let quelmSceneId: string;
  let biaId: string;
  let caioId: string;
  let lyraId: string;
  let bramId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    mainTokens = new MainTokensDao(connection.db);
    tokens = new TokensDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    const anaId = (await users.insert(newUserPo())).id;
    biaId = (await users.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    caioId = (await users.insert(newUserPo({ email: 'caio@mesa.com', name: 'Caio' }))).id;
    const campaigns = new CampaignsDao(connection.db);
    const vharn = await campaigns.insert(newCampaignPo({ ownerId: anaId }));
    const quelm = await campaigns.insert(
      newCampaignPo({ ownerId: caioId, name: 'Quelm', joinCode: 'QELM2345' }),
    );
    const scenes = new ScenesDao(connection.db);
    vharnSceneId = (await scenes.insert({ campaignId: vharn.id })).id;
    quelmSceneId = (await scenes.insert({ campaignId: quelm.id })).id;
    lyraId = (await tokens.insert(tokenRow('Lyra', [biaId, caioId]))).token.id;
    bramId = (await tokens.insert(tokenRow('Bram', [biaId]))).token.id;
  });

  afterAll(() => connection.close());

  function tokenRow(name: string, controllerIds: string[]): NewTokenRow {
    const token = { sceneId: vharnSceneId, name, initials: 'XX', side: 'ally' as const };
    return { token: { ...token, col: 1, row: 1 }, bars: [], controllerIds };
  }

  it('choose saves the main token of a person on a scene', async () => {
    await mainTokens.choose(vharnSceneId, biaId, lyraId);

    expect(await mainTokens.listOfScene(vharnSceneId)).toEqual([
      { userId: biaId, tokenId: lyraId },
    ]);
  });

  it('choosing again on the same scene replaces the choice in place (one row per person)', async () => {
    await mainTokens.choose(vharnSceneId, biaId, lyraId);
    await mainTokens.choose(vharnSceneId, biaId, bramId);

    expect(await mainTokens.listOfScene(vharnSceneId)).toEqual([
      { userId: biaId, tokenId: bramId },
    ]);
  });

  it('two people may choose the same token', async () => {
    await mainTokens.choose(vharnSceneId, biaId, lyraId);
    await mainTokens.choose(vharnSceneId, caioId, lyraId);

    const found = await mainTokens.listOfScene(vharnSceneId);
    expect(found).toHaveLength(2);
    expect(found).toEqual(
      expect.arrayContaining([
        { userId: biaId, tokenId: lyraId },
        { userId: caioId, tokenId: lyraId },
      ]),
    );
  });

  it('deleting the token deletes the choices pointing at it (cascade)', async () => {
    await mainTokens.choose(vharnSceneId, biaId, lyraId);
    await tokens.delete(lyraId);

    expect(await mainTokens.listOfScene(vharnSceneId)).toEqual([]);
  });

  it('dropLostControl([Caio]) deletes the choice of Bia on Lyra and keeps the one of Caio', async () => {
    await mainTokens.choose(vharnSceneId, biaId, lyraId);
    await mainTokens.choose(vharnSceneId, caioId, lyraId);

    await mainTokens.dropLostControl(lyraId, [caioId]);

    expect(await mainTokens.listOfScene(vharnSceneId)).toEqual([
      { userId: caioId, tokenId: lyraId },
    ]);
  });

  it('dropLostControl with both kept changes nothing', async () => {
    await mainTokens.choose(vharnSceneId, biaId, lyraId);
    await mainTokens.choose(vharnSceneId, caioId, lyraId);

    await mainTokens.dropLostControl(lyraId, [biaId, caioId]);

    expect(await mainTokens.listOfScene(vharnSceneId)).toHaveLength(2);
  });

  it('dropLostControl([]) deletes every choice of the token and only of that token', async () => {
    await mainTokens.choose(vharnSceneId, biaId, lyraId);
    await mainTokens.choose(vharnSceneId, caioId, lyraId);
    await mainTokens.choose(vharnSceneId, biaId, bramId);

    await mainTokens.dropLostControl(lyraId, []);

    expect(await mainTokens.listOfScene(vharnSceneId)).toEqual([
      { userId: biaId, tokenId: bramId },
    ]);
  });

  it('listOfScene of the Quelm scene does not bring the choice made on the Vharn scene', async () => {
    await mainTokens.choose(vharnSceneId, biaId, lyraId);

    expect(await mainTokens.listOfScene(quelmSceneId)).toEqual([]);
  });
});
