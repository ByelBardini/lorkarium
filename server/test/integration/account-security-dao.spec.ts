import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { EmailChangeRequestsDao } from '../../src/modules/account-security/email-change-requests.dao';
import { AuthSessionsDao } from '../../src/modules/auth/auth-sessions.dao';
import { RecoveryCodesDao } from '../../src/modules/auth/recovery-codes.dao';
import { TwoFactorChallengesDao } from '../../src/modules/auth/two-factor-challenges.dao';
import { TwoFactorDao } from '../../src/modules/auth/two-factor.dao';
import { UsersDao } from '../../src/modules/auth/users.dao';
import type { UserPo } from '../../src/modules/auth/users.po';
import { newAuthSessionPo, newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const NOW = new Date('2026-10-14T12:00:00Z');

describe('account security DAOs', () => {
  let connection: DatabaseConnection;
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
  });

  describe('AuthSessionsDao', () => {
    const live = new Date('2026-10-20T12:00:00Z');

    async function insertSessions(): Promise<AuthSessionsDao> {
      const dao = new AuthSessionsDao(connection.db);
      const seen = (iso: string): Date => new Date(iso);
      await dao.insert({
        ...newAuthSessionPo({ id: 'a'.repeat(64), userId: ana.id, expiresAt: live }),
        lastSeenAt: seen('2026-10-13T00:00:00Z'),
      });
      await dao.insert({
        ...newAuthSessionPo({ id: 'b'.repeat(64), userId: ana.id, expiresAt: live }),
        lastSeenAt: seen('2026-10-14T00:00:00Z'),
      });
      await dao.insert(newAuthSessionPo({ id: 'c'.repeat(64), userId: ana.id, expiresAt: NOW }));
      await dao.insert(newAuthSessionPo({ id: 'd'.repeat(64), userId: bia.id, expiresAt: live }));
      return dao;
    }

    it('a new session gets a public uuid apart from its hash, and last_seen_at', async () => {
      const dao = await insertSessions();
      const row = await dao.findById('a'.repeat(64));
      expect(row?.publicId).toMatch(/^[0-9a-f-]{36}$/);
      expect(row?.lastSeenAt).toEqual(new Date('2026-10-13T00:00:00Z'));
    });

    it('listOf brings only the live sessions of the user, the most recently seen first', async () => {
      const dao = await insertSessions();
      const listed = await dao.listOf(ana.id, NOW);
      expect(listed.map((row) => row.id)).toEqual(['b'.repeat(64), 'a'.repeat(64)]);
    });

    it("findOfUser finds by public id only the user's own session", async () => {
      const dao = await insertSessions();
      const biaSession = await dao.findById('d'.repeat(64));
      expect(await dao.findOfUser(ana.id, biaSession?.publicId ?? '')).toBeUndefined();
      expect((await dao.findOfUser(bia.id, biaSession?.publicId ?? ''))?.id).toBe('d'.repeat(64));
    });

    it('touch rewrites last_seen_at', async () => {
      const dao = await insertSessions();
      await dao.touch('a'.repeat(64), NOW);
      expect((await dao.findById('a'.repeat(64)))?.lastSeenAt).toEqual(NOW);
    });

    it("deleteOthersOf deletes the user's other sessions and returns their ids, never another user's", async () => {
      const dao = await insertSessions();
      const deleted = await dao.deleteOthersOf(ana.id, 'a'.repeat(64));
      expect(deleted.sort()).toEqual(['b'.repeat(64), 'c'.repeat(64)]);
      expect(await dao.findById('a'.repeat(64))).toBeDefined();
      expect(await dao.findById('d'.repeat(64))).toBeDefined();
    });
  });

  describe('TwoFactorDao', () => {
    it('savePending over an enabled row starts it over (pending, no step)', async () => {
      const dao = new TwoFactorDao(connection.db);
      await dao.savePending(ana.id, 'v1.cifra-1');
      await dao.enable(ana.id, NOW, 100);
      await dao.savePending(ana.id, 'v1.cifra-2');
      expect(await dao.findOf(ana.id)).toMatchObject({
        secretCipher: 'v1.cifra-2',
        enabledAt: null,
        lastStep: null,
      });
    });

    it('recordStep only moves forward: the same step again is false', async () => {
      const dao = new TwoFactorDao(connection.db);
      await dao.savePending(ana.id, 'v1.cifra');
      await dao.enable(ana.id, NOW, 100);
      expect(await dao.recordStep(ana.id, 101)).toBe(true);
      expect(await dao.recordStep(ana.id, 101)).toBe(false);
      expect(await dao.recordStep(ana.id, 99)).toBe(false);
      expect((await dao.findOf(ana.id))?.lastStep).toBe(101);
    });
  });

  describe('RecoveryCodesDao', () => {
    it('replace swaps the codes, use marks one once, countUnused counts the rest', async () => {
      const dao = new RecoveryCodesDao(connection.db);
      await dao.replace(ana.id, ['idx-1', 'idx-2', 'idx-3']);
      await dao.replace(ana.id, ['idx-4', 'idx-5']);
      expect(await dao.findOf(ana.id, 'idx-1')).toBeUndefined();
      expect(await dao.use(ana.id, 'idx-4', NOW)).toBe(true);
      expect(await dao.use(ana.id, 'idx-4', NOW)).toBe(false);
      expect(await dao.countUnused(ana.id)).toBe(1);
    });

    it('a code of Bia is not found nor usable for Ana', async () => {
      const dao = new RecoveryCodesDao(connection.db);
      await dao.replace(bia.id, ['idx-bia']);
      expect(await dao.findOf(ana.id, 'idx-bia')).toBeUndefined();
      expect(await dao.use(ana.id, 'idx-bia', NOW)).toBe(false);
    });
  });

  describe('TwoFactorChallengesDao', () => {
    it('recordFailure counts in the database and returns the total; 0 once deleted', async () => {
      const dao = new TwoFactorChallengesDao(connection.db);
      await dao.insert({ id: 'e'.repeat(64), userId: ana.id, persistent: false, expiresAt: NOW });
      expect(await dao.recordFailure('e'.repeat(64))).toBe(1);
      expect(await dao.recordFailure('e'.repeat(64))).toBe(2);
      await dao.delete('e'.repeat(64));
      expect(await dao.recordFailure('e'.repeat(64))).toBe(0);
    });
  });

  describe('EmailChangeRequestsDao', () => {
    const request = {
      id: 'f'.repeat(64),
      emailCipher: 'v1.cifra',
      emailIndex: 'indice',
      expiresAt: NOW,
    };

    it('a second request of the user replaces the first (one row, the new token)', async () => {
      const dao = new EmailChangeRequestsDao(connection.db);
      await dao.replace({ ...request, userId: ana.id });
      await dao.replace({ ...request, id: '0'.repeat(64), userId: ana.id });
      expect(await dao.findById('f'.repeat(64))).toBeUndefined();
      expect((await dao.findOfUser(ana.id))?.id).toBe('0'.repeat(64));
    });

    it("deleteOfUser removes only the user's request", async () => {
      const dao = new EmailChangeRequestsDao(connection.db);
      await dao.replace({ ...request, userId: ana.id });
      await dao.replace({ ...request, id: '1'.repeat(64), userId: bia.id });
      await dao.deleteOfUser(ana.id);
      expect(await dao.findOfUser(ana.id)).toBeUndefined();
      expect(await dao.findOfUser(bia.id)).toBeDefined();
    });
  });

  describe('UsersDao', () => {
    it('updatePassword stores the hash and when', async () => {
      const users = new UsersDao(connection.db);
      await users.updatePassword(ana.id, '$argon2id$novo', NOW);
      expect(await users.findById(ana.id)).toMatchObject({
        passwordHash: '$argon2id$novo',
        passwordChangedAt: NOW,
      });
    });

    it("updateEmail to Bia's index fails with the unique violation", async () => {
      const users = new UsersDao(connection.db);
      const taken = { emailCipher: 'v1.x', emailIndex: bia.emailIndex };
      await expect(users.updateEmail(ana.id, taken)).rejects.toMatchObject({
        cause: { code: '23505' },
      });
    });
  });
});
