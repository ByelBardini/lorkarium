import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { AuthSessionsDao } from '../../src/modules/auth/auth-sessions.dao';
import { users } from '../../src/modules/auth/users.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { newAuthSessionPo, newUserPo } from '../support/auth-factories';
import { insertTestAccount, testDataCipher } from '../support/sign-in';
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

  it('a user inserted without a role is found by its e-mail index with role user and no profile yet', async () => {
    await usersDao.insert(newUserPo({ name: 'Ana', email: 'ana@mesa.com' }));
    const found = await usersDao.findByEmailIndex('idx:email-index:ana@mesa.com');
    expect(found).toMatchObject({ name: 'Ana', username: 'ana', role: 'user' });
    expect(found).toMatchObject({
      color: null,
      bio: null,
      avatarId: null,
      passwordChangedAt: null,
    });
  });

  it('insert keeps the sealed e-mail and its index, and the raw row carries the address nowhere', async () => {
    const ana = await insertTestAccount(connection.db, {
      name: 'Ana',
      email: 'ana@mesa.com',
      password: 'segredo-da-ana',
    });
    expect(ana.emailIndex).toBe(testDataCipher().index('email-index', 'ana@mesa.com'));
    expect(testDataCipher().open('user-email', ana.emailCipher, ana.id)).toBe('ana@mesa.com');
    const raw = await connection.db.execute(sql`SELECT * FROM users WHERE id = ${ana.id}`);
    expect(JSON.stringify(raw.rows)).not.toContain('ana@mesa');
  });

  it('a second user with the same e-mail index violates the unique constraint', async () => {
    await usersDao.insert(newUserPo({ email: 'ana@mesa.com' }));
    const duplicate = usersDao.insert(
      newUserPo({ name: 'Outra', email: 'ana@mesa.com', username: 'outra' }),
    );
    await expect(duplicate).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });

  it('a second user with the same @ violates the unique constraint', async () => {
    await usersDao.insert(newUserPo({ email: 'ana@mesa.com', username: 'ana' }));
    const duplicate = usersDao.insert(newUserPo({ email: 'ana@outra.com', username: 'ana' }));
    await expect(duplicate).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });

  it('a bio over 190 characters violates the check', async () => {
    const tooLong = usersDao.insert(newUserPo({ bio: 'x'.repeat(191) }));
    await expect(tooLong).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('findByUsername finds the account by its @', async () => {
    await usersDao.insert(newUserPo({ name: 'Bia', email: 'bia@mesa.com' }));
    expect(await usersDao.findByUsername('bia')).toMatchObject({ name: 'Bia' });
    expect(await usersDao.findByUsername('bi')).toBeUndefined();
  });

  it('usernamesStartingWith treats _ as a letter, not as a wildcard', async () => {
    await usersDao.insert(newUserPo({ email: 'a_b@mesa.com', username: 'a_b' }));
    await usersDao.insert(newUserPo({ email: 'axb@mesa.com', username: 'axb' }));
    await usersDao.insert(newUserPo({ email: 'a_b2@mesa.com', username: 'a_b2' }));
    expect(await usersDao.usernamesStartingWith('a_b')).toEqual(new Set(['a_b', 'a_b2']));
  });

  it('listPlainEmails is empty once the clear column is gone (migration 0039)', async () => {
    await insertAna();
    expect(await usersDao.listPlainEmails()).toEqual([]);
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
