import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao, type NewTokenRow } from '../../src/modules/tokens/tokens.dao';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('TokensDao: the author of a token on Postgres', () => {
  let connection: DatabaseConnection;
  let tokens: TokensDao;
  let vharnId: string;
  let vharnScene: string;
  let biaId: string;
  let caioId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    tokens = new TokensDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const usersDao = new UsersDao(connection.db);
    const anaId = (await usersDao.insert(newUserPo())).id;
    biaId = (await usersDao.insert(newUserPo({ email: 'bia@mesa.com', name: 'Bia' }))).id;
    caioId = (await usersDao.insert(newUserPo({ email: 'caio@mesa.com', name: 'Caio' }))).id;
    vharnId = (await new CampaignsDao(connection.db).insert(newCampaignPo({ ownerId: anaId }))).id;
    vharnScene = (await new ScenesDao(connection.db).insert({ campaignId: vharnId })).id;
  });

  afterAll(() => connection.close());

  function tokenBy(name: string, createdBy: string | null): NewTokenRow {
    const box = { width: 1, height: 1, col: 3, row: 4 };
    const token = { sceneId: vharnScene, name, initials: 'XX', side: 'ally' as const, ...box };
    return { token: { ...token, createdBy }, bars: [], controllerIds: [] };
  }

  async function authorsOf(sceneId: string): Promise<Record<string, string | null>> {
    const rows = await tokens.listOfScene(sceneId);
    return Object.fromEntries(rows.map(({ token }) => [token.name, token.createdBy]));
  }

  it('insert saves the author and listOfScene reads it back', async () => {
    await tokens.insert(tokenBy('Lyra', biaId));

    expect(await authorsOf(vharnScene)).toEqual({ Lyra: biaId });
  });

  it('a token inserted without an author has created_by null', async () => {
    const box = { width: 1, height: 1, col: 3, row: 4 };
    const withoutAuthor = {
      sceneId: vharnScene,
      name: 'Lobo',
      initials: 'LO',
      side: 'enemy',
    } as const;

    const saved = await tokens.insert({
      token: { ...withoutAuthor, ...box },
      bars: [],
      controllerIds: [],
    });

    expect(saved.token.createdBy).toBeNull();
  });

  it('insertMany saves the author of each row', async () => {
    await tokens.insertMany([tokenBy('Lyra', biaId), tokenBy('Bram', caioId)]);

    expect(await authorsOf(vharnScene)).toEqual({ Lyra: biaId, Bram: caioId });
  });

  it('deleting the account of the author keeps the token, with created_by null (set null)', async () => {
    await tokens.insertMany([tokenBy('Lyra', biaId), tokenBy('Bram', caioId)]);

    await connection.db.delete(users).where(eq(users.id, biaId));

    expect(await authorsOf(vharnScene)).toEqual({ Lyra: null, Bram: caioId });
  });

  it('copyScene (Duplicate of the library) copies the author of each token', async () => {
    await tokens.insertMany([tokenBy('Lyra', biaId), tokenBy('Lobo', null)]);
    const copy = (await new ScenesDao(connection.db).insert({ campaignId: vharnId })).id;

    await tokens.copyScene(vharnScene, copy);

    expect(await authorsOf(copy)).toEqual({ Lyra: biaId, Lobo: null });
  });
});
