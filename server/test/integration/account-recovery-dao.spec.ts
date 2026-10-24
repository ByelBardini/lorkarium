import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { AccountRecoveryTokensDao } from '../../src/modules/account-security/account-recovery-tokens.dao';
import type { NewAccountRecoveryTokenPo } from '../../src/modules/account-security/account-recovery-tokens.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import type { UserPo } from '../../src/modules/auth/users.po';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const EXPIRES_AT = new Date('2026-10-31T12:00:00Z');

describe('AccountRecoveryTokensDao', () => {
  let connection: DatabaseConnection;
  let dao: AccountRecoveryTokensDao;
  let ana: UserPo;
  let bia: UserPo;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const users = new UsersDao(connection.db);
    ana = await users.insert(newUserPo({ email: 'ana@mesa.com' }));
    bia = await users.insert(newUserPo({ name: 'Bia', email: 'bia@mesa.com' }));
    dao = new AccountRecoveryTokensDao(connection.db);
  });

  function token(overrides: Partial<NewAccountRecoveryTokenPo> = {}): NewAccountRecoveryTokenPo {
    return {
      id: 'a'.repeat(64),
      userId: ana.id,
      kind: 'revert-password-change',
      expiresAt: EXPIRES_AT,
      ...overrides,
    };
  }

  it('stores the hash as the id and finds it by the hash', async () => {
    await dao.insert(token());
    expect(await dao.findById('a'.repeat(64))).toMatchObject({
      userId: ana.id,
      kind: 'revert-password-change',
      emailCipher: null,
      expiresAt: EXPIRES_AT,
    });
  });

  it("deleteAllOf(ana) deletes Ana's three links and none of Bia's", async () => {
    await dao.insert(token({ id: '1'.repeat(64) }));
    await dao.insert(token({ id: '2'.repeat(64), kind: 'cancel-email-change' }));
    await dao.insert(
      token({ id: '3'.repeat(64), kind: 'revert-email-change', emailCipher: 'c', emailIndex: 'i' }),
    );
    await dao.insert(token({ id: '4'.repeat(64), userId: bia.id }));
    expect(await dao.deleteAllOf(ana.id)).toBe(3);
    expect(await dao.findById('4'.repeat(64))).toBeDefined();
  });

  it('deleteById claims a link once: the second delete finds nothing', async () => {
    await dao.insert(token());
    expect(await dao.deleteById('a'.repeat(64))).toBe(true);
    expect(await dao.deleteById('a'.repeat(64))).toBe(false);
  });

  it('deleting the account deletes its links (cascade)', async () => {
    await dao.insert(token());
    await connection.db.execute(sql`DELETE FROM users WHERE id = ${ana.id}`);
    expect(await dao.findById('a'.repeat(64))).toBeUndefined();
  });

  it('the check refuses a revert without the address, and a password link with one', async () => {
    await expect(dao.insert(token({ kind: 'revert-email-change' }))).rejects.toThrow();
    await expect(
      dao.insert(token({ id: 'b'.repeat(64), emailCipher: 'c', emailIndex: 'i' })),
    ).rejects.toThrow();
  });
});
