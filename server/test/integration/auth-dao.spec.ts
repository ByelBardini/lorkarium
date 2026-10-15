import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { AuthSessionsDao } from '../../src/modules/auth/auth-sessions.dao';
import { users } from '../../src/modules/auth/users.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { newAuthSessionPo, newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const UNIQUE_VIOLATION = '23505';

describe('auth DAOs on Postgres', () => {
  let connection: DatabaseConnection;
  let usersDao: UsersDao;
  let sessionsDao: AuthSessionsDao;

  beforeAll(async () => {
    connection = await openTestDatabase();
    usersDao = new UsersDao(connection.db);
    sessionsDao = new AuthSessionsDao(connection.db);
  });

  beforeEach(() => truncateAllTables(connection.db));

  afterAll(() => connection.close());

  async function insertAna(): Promise<string> {
    return (await usersDao.insert(newUserPo())).id;
  }

  it('a user inserted without a role is found by e-mail with role user', async () => {
    await usersDao.insert(newUserPo({ name: 'Ana', email: 'ana@mesa.com' }));
    const found = await usersDao.findByEmail('ana@mesa.com');
    expect(found).toMatchObject({ name: 'Ana', email: 'ana@mesa.com', role: 'user' });
  });

  it('a second user with the same e-mail violates the unique constraint', async () => {
    await usersDao.insert(newUserPo({ email: 'ana@mesa.com' }));
    const duplicate = usersDao.insert(newUserPo({ name: 'Outra', email: 'ana@mesa.com' }));
    await expect(duplicate).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });

  it('a session inserted under its hash is found with its expiry and persistence', async () => {
    const userId = await insertAna();
    const expiresAt = new Date('2026-11-13T10:00:00Z');
    await sessionsDao.insert(
      newAuthSessionPo({ id: 'f'.repeat(64), userId, expiresAt, persistent: false }),
    );
    const found = await sessionsDao.findById('f'.repeat(64));
    expect(found).toMatchObject({ userId, expiresAt, persistent: false });
  });

  it('updateExpiry writes the new deadline', async () => {
    const userId = await insertAna();
    await sessionsDao.insert(newAuthSessionPo({ id: 'b'.repeat(64), userId }));
    await sessionsDao.updateExpiry('b'.repeat(64), new Date('2026-12-01T00:00:00Z'));
    const found = await sessionsDao.findById('b'.repeat(64));
    expect(found?.expiresAt).toEqual(new Date('2026-12-01T00:00:00Z'));
  });

  it('deleting a user deletes its sessions in cascade', async () => {
    const userId = await insertAna();
    await sessionsDao.insert(newAuthSessionPo({ id: 'c'.repeat(64), userId }));
    await connection.db.delete(users).where(eq(users.id, userId));
    expect(await sessionsDao.findById('c'.repeat(64))).toBeUndefined();
  });

  it('delete removes only the session with that hash', async () => {
    const userId = await insertAna();
    await sessionsDao.insert(newAuthSessionPo({ id: 'd'.repeat(64), userId }));
    await sessionsDao.insert(newAuthSessionPo({ id: 'e'.repeat(64), userId }));
    await sessionsDao.delete('d'.repeat(64));
    expect(await sessionsDao.findById('d'.repeat(64))).toBeUndefined();
    expect(await sessionsDao.findById('e'.repeat(64))).toMatchObject({ userId });
  });
});
