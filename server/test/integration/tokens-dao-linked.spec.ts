import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { CharactersDao, type NewCharacterRow } from '../../src/modules/characters/characters.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao, type NewTokenRow } from '../../src/modules/tokens/tokens.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { CountingQueryLog } from '../support/query-count';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const PV = {
  label: 'PV',
  current: 25,
  max: 30,
  color: 'ember',
  visibility: 'controllers',
} as const;
const OWN_PV = { ...PV, current: 99, max: 99 };

describe('TokensDao: a token linked to a character, on Postgres', () => {
  let connection: DatabaseConnection;
  let tokens: TokensDao;
  let vharnId: string;
  let quelmId: string;
  let salao: string;
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
    vharnId = (await campaigns.insert(newCampaignPo({ ownerId: anaId }))).id;
    const quelm = newCampaignPo({ ownerId: caioId, name: 'Quelm', joinCode: 'QELM2345' });
    quelmId = (await campaigns.insert(quelm)).id;
    salao = (await new ScenesDao(connection.db).insert({ campaignId: vharnId })).id;
  });

  afterAll(() => connection.close());

  async function characterAt(campaignId: string, name: string): Promise<string> {
    const character = { campaignId, userId: biaId, name, initials: 'LV', side: 'neutral' as const };
    const row: NewCharacterRow = {
      character: { ...character, imageAssetId: null, frame: 'round', defeated: true },
      bars: [PV],
      controllerIds: [biaId],
    };
    const saved = await runInTransaction(connection.db, (tx) => new CharactersDao(tx).insert(row));
    return saved.character.id;
  }

  // Lyra on the Salão, linked to `characterId`, with her own (hidden) name, PV and controller.
  async function lyraWearing(characterId: string, hidden = false): Promise<string> {
    const box = { width: 2, height: 2, col: 3, row: 4, facing: 90 };
    const own = { sceneId: salao, name: 'Lyra', initials: 'LY', side: 'ally' as const, ...box };
    const row: NewTokenRow = {
      token: { ...own, characterId, hidden },
      bars: [OWN_PV],
      controllerIds: [caioId],
    };
    const saved = await runInTransaction(connection.db, (tx) => new TokensDao(tx).insert(row));
    return saved.token.id;
  }

  it('listOfScene, findInScene and findManyInScene dress the token in its character', async () => {
    const characterId = await characterAt(vharnId, 'Lyra Vento');
    const lyraId = await lyraWearing(characterId);

    const reads = [
      (await tokens.listOfScene(salao))[0],
      await tokens.findInScene(salao, lyraId),
      (await tokens.findManyInScene(salao, [lyraId]))[0],
    ];

    for (const row of reads) {
      expect(row?.token).toMatchObject({
        name: 'Lyra Vento',
        side: 'neutral',
        frame: 'round',
        defeated: true,
        width: 2,
        facing: 90,
        characterId,
      });
      expect(row?.bars.map(({ current, tokenId }) => [current, tokenId])).toEqual([[25, lyraId]]);
      expect(row?.controllerIds).toEqual([biaId]);
    }
  });

  it('controlOfScene, findDragGroup and veilOfScene read the control of the character', async () => {
    const lyraId = await lyraWearing(await characterAt(vharnId, 'Lyra'), true);

    const control = await tokens.controlOfScene(salao);
    const drag = await tokens.findDragGroup(vharnId, salao, [lyraId]);
    const veil = await tokens.veilOfScene(salao);

    expect(control.map(({ controllerIds }) => controllerIds)).toEqual([[biaId]]);
    expect(drag?.tokens.map(({ controllerIds }) => controllerIds)).toEqual([[biaId]]);
    expect(veil.map(({ controllerIds }) => controllerIds)).toEqual([[biaId]]);
  });

  it('an unlinked token keeps its own control in the same queries', async () => {
    const own = { sceneId: salao, name: 'Lobo', initials: 'LO', side: 'enemy' as const };
    const box = { width: 1, height: 1, col: 1, row: 1 };
    await tokens.insert({ token: { ...own, ...box }, bars: [], controllerIds: [caioId] });

    const control = await tokens.controlOfScene(salao);
    const drag = await tokens.findDragGroup(vharnId, salao, [control[0]?.tokenId ?? '']);

    expect(control.map(({ controllerIds }) => controllerIds)).toEqual([[caioId]]);
    expect(drag?.tokens.map(({ controllerIds }) => controllerIds)).toEqual([[caioId]]);
  });

  it('a character of Quelm is never worn by a token of Vharn (§2.6)', async () => {
    const lyraId = await lyraWearing(await characterAt(quelmId, 'Espiã'));

    const row = await tokens.findInScene(salao, lyraId);

    expect(row?.token.name).toBe('Lyra');
    expect(row?.bars.map(({ current }) => current)).toEqual([99]);
  });

  it('wearing the character costs two reads more, whatever the number of linked tokens', async () => {
    await lyraWearing(await characterAt(vharnId, 'Lyra'));
    queries.reset();

    await tokens.listOfScene(salao);

    expect(queries.count).toBe(5);
  });
});
