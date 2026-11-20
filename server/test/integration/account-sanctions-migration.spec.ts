import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import {
  accountSanctions,
  type NewAccountSanctionPo,
} from '../../src/modules/sanctions/account-sanctions.po';
import { bannedEmailIndexes } from '../../src/modules/sanctions/banned-email-indexes.po';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const AT = new Date('2026-11-19T12:00:00Z');

describe('the account_sanctions and banned_email_indexes tables (0119)', () => {
  let connection: DatabaseConnection;
  let adminId: string;
  let caioId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const accounts = new UsersDao(connection.db);
    adminId = (await accounts.insert(newUserPo({ email: 'root@mesa.com', role: 'admin' }))).id;
    caioId = (await accounts.insert(newUserPo({ email: 'caio@mesa.com' }))).id;
  });

  afterAll(() => connection.close());

  function sanction(overrides: Partial<NewAccountSanctionPo> = {}): NewAccountSanctionPo {
    return {
      userId: caioId,
      kind: 'warning',
      rule: 'spam',
      statement: 'Mandou propaganda a quem não é amigo.',
      issuedBy: adminId,
      ...overrides,
    };
  }

  async function insert(overrides: Partial<NewAccountSanctionPo> = {}) {
    const [row] = await connection.db
      .insert(accountSanctions)
      .values(sanction(overrides))
      .returning();
    return row;
  }

  it('a suspension with an end is stored', async () => {
    const row = await insert({ kind: 'suspension', until: new Date('2026-11-25T00:00:00Z') });
    expect(row?.until?.toISOString()).toBe('2026-11-25T00:00:00.000Z');
  });

  it('the CHECK refuses an end on a warning', async () => {
    await expect(insert({ until: AT })).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint: 'account_sanctions_until_only_suspension' },
    });
  });

  it('the CHECK refuses a deletion date or the shared tables on a measure that is not a ban', async () => {
    const refused = {
      cause: { code: CHECK_VIOLATION, constraint: 'account_sanctions_deletion_only_ban' },
    };
    await expect(insert({ deletionDueAt: AT })).rejects.toMatchObject(refused);
    await expect(insert({ deleteSharedCampaigns: true })).rejects.toMatchObject(refused);
  });

  it('a ban stores its deletion date and the shared tables; a new measure is not notified yet', async () => {
    const row = await insert({ kind: 'ban', deletionDueAt: AT, deleteSharedCampaigns: true });
    expect(row).toMatchObject({ deletionDueAt: AT, deleteSharedCampaigns: true, notifiedAt: null });
  });

  it('the CHECK refuses an empty statement', async () => {
    await expect(insert({ statement: '' })).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint: 'account_sanctions_statement_length' },
    });
  });

  it('the CHECK refuses a decision without its note', async () => {
    const decided = { appealReceivedAt: AT, appealOutcome: 'upheld', appealDecidedAt: AT } as const;
    await expect(insert(decided)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint: 'account_sanctions_appeal_decision_whole' },
    });
  });

  it('the CHECK refuses a decision before the appeal arrived', async () => {
    const decided = { appealOutcome: 'reverted', appealNote: 'x', appealDecidedAt: AT } as const;
    await expect(insert(decided)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint: 'account_sanctions_appeal_received_first' },
    });
  });

  it('a whole decision keeps its author null once that admin is deleted', async () => {
    const row = await insert({
      appealReceivedAt: AT,
      appealOutcome: 'reverted',
      appealNote: 'Engano.',
      appealDecidedBy: adminId,
      appealDecidedAt: AT,
    });
    await connection.db.delete(users).where(eq(users.id, adminId));
    const [after] = await connection.db
      .select()
      .from(accountSanctions)
      .where(eq(accountSanctions.id, row?.id ?? ''));
    expect(after).toMatchObject({
      issuedBy: null,
      appealDecidedBy: null,
      appealOutcome: 'reverted',
    });
  });

  it('the measures go with the account they target', async () => {
    await insert();
    await connection.db.delete(users).where(eq(users.id, caioId));
    expect(await connection.db.select().from(accountSanctions)).toEqual([]);
  });

  it('the CHECK refuses a suspension end on an account that is not suspended', async () => {
    const write = connection.db
      .update(users)
      .set({ suspendedUntil: AT })
      .where(eq(users.id, caioId));
    await expect(write).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint: 'users_suspended_until_with_suspension' },
    });
  });

  it('the same e-mail index is banned only once', async () => {
    await connection.db.insert(bannedEmailIndexes).values({ emailIndex: 'idx:caio' });
    const again = connection.db.insert(bannedEmailIndexes).values({ emailIndex: 'idx:caio' });
    await expect(again).rejects.toMatchObject({ cause: { code: UNIQUE_VIOLATION } });
  });
});
