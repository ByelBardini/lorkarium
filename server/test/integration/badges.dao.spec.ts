import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { isUniqueViolation } from '../../src/lib/postgres-error';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { BadgesDao } from '../../src/modules/badges/badges.dao';
import { userBadges } from '../../src/modules/badges/badges.po';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const IMAGE_A = 'a1a1a1a1-0000-4000-8000-000000000001';
const IMAGE_B = 'b2b2b2b2-0000-4000-8000-000000000002';
const IMAGE_C = 'c3c3c3c3-0000-4000-8000-000000000003';

describe('BadgesDao on Postgres', () => {
  let connection: DatabaseConnection;
  let dao: BadgesDao;
  let biaId: string;
  let caioId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    dao = new BadgesDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const accounts = new UsersDao(connection.db);
    biaId = (await accounts.insert(newUserPo({ name: 'Bia', email: 'bia@mesa.com' }))).id;
    caioId = (await accounts.insert(newUserPo({ name: 'Caio', email: 'caio@mesa.com' }))).id;
  });

  afterAll(() => connection.close());

  async function badgeWithImage(name: string, imageId: string): Promise<string> {
    const { id } = await dao.insert({ name, description: `${name}, descrita` });
    await dao.swapImage(id, imageId);
    return id;
  }

  it('insert puts each new badge last, without an image', async () => {
    const first = await dao.insert({ name: 'Veterano', description: 'Jogou 100 sessões' });
    const second = await dao.insert({ name: 'Mestre', description: 'Mestrou 10 mesas' });

    expect([first.position, second.position]).toEqual([0, 1]);
    expect(second.imageId).toBeNull();
  });

  it('listCatalog comes in position order with how many accounts hold each', async () => {
    const veterano = await badgeWithImage('Veterano', IMAGE_A);
    const mestre = await badgeWithImage('Mestre', IMAGE_B);
    await dao.replaceGrants(biaId, [veterano, mestre]);
    await dao.replaceGrants(caioId, [veterano]);

    const catalog = await dao.listCatalog();

    expect(catalog.map(({ id, holders }) => [id, holders])).toEqual([
      [veterano, 2],
      [mestre, 1],
    ]);
  });

  it('reorder writes the new order in one statement, swapping positions', async () => {
    const a = await dao.insert({ name: 'A', description: 'a' });
    const b = await dao.insert({ name: 'B', description: 'b' });
    const c = await dao.insert({ name: 'C', description: 'c' });

    await dao.reorder([c.id, a.id, b.id]);

    const catalog = await dao.listCatalog();
    expect(catalog.map(({ name, position }) => [name, position])).toEqual([
      ['C', 0],
      ['A', 1],
      ['B', 2],
    ]);
  });

  it('badgesOfAccount follows the catalog order and leaves out a badge without an image', async () => {
    const veterano = await badgeWithImage('Veterano', IMAGE_A);
    const semImagem = (await dao.insert({ name: 'Sem imagem', description: 'x' })).id;
    const mestre = await badgeWithImage('Mestre', IMAGE_B);
    await dao.replaceGrants(biaId, [mestre, semImagem, veterano]);
    await dao.reorder([mestre, semImagem, veterano]);

    const shown = await dao.badgesOfAccount(biaId);

    expect(shown.map((badge) => badge.name)).toEqual(['Mestre', 'Veterano']);
    expect(await dao.grantIdsOf(biaId)).toEqual([mestre, semImagem, veterano]);
  });

  it('replaceGrants with [] takes every badge off, and granting again does not duplicate', async () => {
    const veterano = await badgeWithImage('Veterano', IMAGE_A);
    await dao.replaceGrants(biaId, [veterano]);
    await dao.replaceGrants(biaId, [veterano]);

    expect(await connection.db.select().from(userBadges)).toHaveLength(1);
    await dao.replaceGrants(biaId, []);
    expect(await dao.grantIdsOf(biaId)).toEqual([]);
  });

  it('replaceGrants touches only the account asked for', async () => {
    const veterano = await badgeWithImage('Veterano', IMAGE_A);
    await dao.replaceGrants(caioId, [veterano]);

    await dao.replaceGrants(biaId, []);

    expect(await dao.grantIdsOf(caioId)).toEqual([veterano]);
  });

  it('a name repeated with another case is refused by the unique index on lower(name)', async () => {
    await dao.insert({ name: 'veterano', description: 'x' });

    const repeated = dao.insert({ name: 'Veterano', description: 'y' }).catch((error) => error);

    expect(isUniqueViolation(await repeated, 'badges_name_unique')).toBe(true);
  });

  it('swapImage answers the previous image; isCurrentImage follows the new one', async () => {
    const id = await badgeWithImage('Veterano', IMAGE_A);

    expect(await dao.swapImage(id, IMAGE_C)).toEqual({ previousId: IMAGE_A });
    expect(await dao.isCurrentImage(IMAGE_A)).toBe(false);
    expect(await dao.isCurrentImage(IMAGE_C)).toBe(true);
  });

  it('swapImage and update of an unknown badge answer undefined', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';

    expect(await dao.swapImage(unknown, IMAGE_A)).toBeUndefined();
    expect(await dao.update(unknown, { name: 'X' })).toBeUndefined();
  });

  it('deleting the badge answers its image and takes the grants by cascade', async () => {
    const veterano = await badgeWithImage('Veterano', IMAGE_A);
    await dao.replaceGrants(biaId, [veterano]);

    expect(await dao.delete(veterano)).toEqual({ imageId: IMAGE_A });
    expect(await connection.db.select().from(userBadges)).toEqual([]);
  });

  it('deleting the account takes its grants by cascade', async () => {
    const veterano = await badgeWithImage('Veterano', IMAGE_A);
    await dao.replaceGrants(biaId, [veterano]);

    await connection.db.delete(users).where(eq(users.id, biaId));

    expect(await connection.db.select().from(userBadges)).toEqual([]);
    expect((await dao.findById(veterano))?.holders).toBe(0);
  });

  it('lockCatalog inside a transaction reads every badge in order', async () => {
    const a = await badgeWithImage('A', IMAGE_A);
    const b = (await dao.insert({ name: 'B', description: 'b' })).id;

    const locked = await runInTransaction(connection.db, (tx) => new BadgesDao(tx).lockCatalog());

    expect(locked).toEqual([
      { id: a, imageId: IMAGE_A },
      { id: b, imageId: null },
    ]);
  });
});
