import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { CharactersDao } from '../../src/modules/characters/characters.dao';
import { runInTransaction } from '../../src/database/transaction';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao, type NewTokenRow } from '../../src/modules/tokens/tokens.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { CountingQueryLog } from '../support/query-count';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('TokensDao: hidden tokens on Postgres', () => {
  let connection: DatabaseConnection;
  let tokens: TokensDao;
  let vharnScene: string;
  let vharnId: string;
  let quelmScene: string;
  let biaId: string;
  let caioId: string;
  const queries = new CountingQueryLog();

  beforeAll(async () => {
    connection = await openTestDatabase({ queryLog: queries });
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
      newCampaignPo({ ownerId: anaId, name: 'Quelm', joinCode: 'QELM2345' }),
    );
    const scenes = new ScenesDao(connection.db);
    vharnScene = (await scenes.insert({ campaignId: vharn.id })).id;
    vharnId = vharn.id;
    quelmScene = (await scenes.insert({ campaignId: quelm.id })).id;
  });

  afterAll(() => connection.close());

  function tokenOf(name: string, overrides: Partial<NewTokenRow['token']> = {}): NewTokenRow {
    const box = { width: 1, height: 1, col: 3, row: 4 };
    const token = { sceneId: vharnScene, name, initials: 'XX', side: 'enemy' as const, ...box };
    return { token: { ...token, ...overrides }, bars: [], controllerIds: [] };
  }

  async function idsOf(sceneId: string, hidden: boolean): Promise<string[]> {
    const rows = await tokens.listOfScene(sceneId);
    return rows.filter(({ token }) => token.hidden === hidden).map(({ token }) => token.id);
  }

  it('a new token is born visible', async () => {
    expect((await tokens.insert(tokenOf('Lobo'))).token.hidden).toBe(false);
  });

  it('setHidden hides the two tokens and returns their ids', async () => {
    const [lobo, sombra] = await tokens.insertMany([tokenOf('Lobo'), tokenOf('Sombra')]);
    if (!lobo || !sombra) throw new Error('insertMany returned fewer tokens');

    const written = await tokens.setHidden(vharnScene, [lobo.token.id, sombra.token.id], true);

    expect(written.sort()).toEqual([lobo.token.id, sombra.token.id].sort());
    expect((await idsOf(vharnScene, true)).sort()).toEqual(written.sort());
  });

  it('setHidden with false shows the token again', async () => {
    const lobo = await tokens.insert(tokenOf('Lobo', { hidden: true }));

    await tokens.setHidden(vharnScene, [lobo.token.id], false);

    expect(await idsOf(vharnScene, false)).toEqual([lobo.token.id]);
  });

  it('setHidden does not write the id of a token of another scene', async () => {
    const quelmToken = await tokens.insert(tokenOf('Espectro', { sceneId: quelmScene }));

    const written = await tokens.setHidden(vharnScene, [quelmToken.token.id], true);

    expect(written).toEqual([]);
    expect(await idsOf(quelmScene, true)).toEqual([]);
  });

  it('insertMany with hidden true saves the token hidden', async () => {
    const [lobo] = await tokens.insertMany([tokenOf('Lobo', { hidden: true })]);

    expect(lobo?.token.hidden).toBe(true);
    expect(await idsOf(vharnScene, true)).toEqual([lobo?.token.id]);
  });

  it('copyScene keeps which tokens are hidden', async () => {
    await tokens.insertMany([tokenOf('Lobo', { hidden: true }), tokenOf('Kael')]);
    const copy = (await new ScenesDao(connection.db).insert({ campaignId: await vharnOf() })).id;

    await tokens.copyScene(vharnScene, copy);

    const copied = await tokens.listOfScene(copy);
    const hiddenByName = Object.fromEntries(copied.map(({ token }) => [token.name, token.hidden]));
    expect(hiddenByName).toEqual({ Lobo: true, Kael: false });
  });

  it('veilOfScene brings only the hidden tokens, with their box, facing, light and controllers', async () => {
    const lantern = { lightBright: '4.00', lightDim: '2.00', lightColor: 'fire' as const };
    const lobo = tokenOf('Lobo', { hidden: true, width: 2, height: 2, facing: 90, ...lantern });
    const [hidden] = await tokens.insertMany([
      { ...lobo, controllerIds: [biaId] },
      tokenOf('Kael'),
    ]);

    const veil = await tokens.veilOfScene(vharnScene);

    expect(veil).toMatchObject([
      {
        token: {
          id: hidden?.token.id,
          ...{ col: 3, row: 4, width: 2, height: 2, facing: 90 },
          ...{ ...lantern, lightAngle: 360, lightLit: true },
        },
        controllerIds: [biaId],
      },
    ]);
    expect(veil).toHaveLength(1);
  });

  it('veilOfScene gives a hidden linked token the controllers of its character', async () => {
    const lyra = {
      campaignId: vharnId,
      userId: biaId,
      name: 'Lyra',
      initials: 'LY',
      side: 'ally' as const,
    };
    const character = await runInTransaction(connection.db, (tx) =>
      new CharactersDao(tx).insert({ character: lyra, bars: [], controllerIds: [caioId] }),
    );
    const linked = tokenOf('Lyra', { hidden: true, characterId: character.character.id });
    await tokens.insert({ ...linked, controllerIds: [biaId] });

    const veil = await tokens.veilOfScene(vharnScene);

    expect(veil.map(({ controllerIds }) => controllerIds)).toEqual([[caioId]]);
  });

  it('veilOfScene of the Vharn scene leaves out the hidden token of the Quelm', async () => {
    await tokens.insert(tokenOf('Espectro', { sceneId: quelmScene, hidden: true }));

    expect(await tokens.veilOfScene(vharnScene)).toEqual([]);
  });

  it('veilOfScene costs one query', async () => {
    await tokens.insertMany([
      tokenOf('Lobo', { hidden: true }),
      tokenOf('Sombra', { hidden: true }),
    ]);
    queries.reset();

    await tokens.veilOfScene(vharnScene);

    expect(queries.count).toBe(1);
  });

  async function vharnOf(): Promise<string> {
    const scene = await new ScenesDao(connection.db).findById(vharnScene);
    if (!scene) throw new Error(`scene ${vharnScene} vanished`);
    return scene.campaignId;
  }
});
