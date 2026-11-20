import { inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { invitations } from '../../src/modules/account-links/invitations.po';
import { authSessions } from '../../src/modules/auth/auth-sessions.po';
import { twoFactorChallenges } from '../../src/modules/auth/two-factor-challenges.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { libraryDocumentActions } from '../../src/modules/documents/documents.po';
import { HousekeepingDao } from '../../src/modules/housekeeping/housekeeping.dao';
import { HousekeepingService } from '../../src/modules/housekeeping/housekeeping.service';
import { createFeedbackRetention } from '../../src/modules/feedback/feedback.plugin';
import { createReportRetention } from '../../src/modules/reports/reports.plugin';
import { sheetActions } from '../../src/modules/sheets/sheets.po';
import { ClockFake } from '../support/auth-fakes';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { HousekeepingFailureLogFake, SuspensionEndedFake } from '../support/housekeeping-fakes';
import { SchedulerFake } from '../support/sessions-fakes';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const NOW = new Date('2026-11-10T12:00:00Z');
const HOURS_AGO = (hours: number): Date => new Date(NOW.getTime() - hours * 60 * 60_000);

describe('the housekeeping on Postgres', () => {
  let connection: DatabaseConnection;
  let userId: string;
  let campaignId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    userId = (await new UsersDao(connection.db).insert(newUserPo())).id;
    campaignId = (await new CampaignsDao(connection.db).insert(newCampaignPo({ ownerId: userId })))
      .id;
  });

  afterAll(() => connection.close());

  function sweep(suspensionEnded = new SuspensionEndedFake()): Promise<void> {
    const deps = { clock: new ClockFake(NOW), scheduler: new SchedulerFake() };
    const log = new HousekeepingFailureLogFake();
    const dao = new HousekeepingDao(connection.db);
    return new HousekeepingService({
      dao,
      expired: dao,
      suspensionEnded,
      reportRetention: createReportRetention(connection.db, deps.clock),
      feedbackRetention: createFeedbackRetention(connection.db, deps.clock),
      log,
      ...deps,
    }).sweep();
  }

  async function suspendUntil(email: string, until: Date): Promise<string> {
    const account = newUserPo({ email, suspendedAt: HOURS_AGO(48), suspendedUntil: until });
    return (await new UsersDao(connection.db).insert(account)).id;
  }

  async function receiptKeptAt(createdAt: Date, operation: string): Promise<void> {
    const receipt = { actionId: crypto.randomUUID(), operation, fingerprint: 'f', receipt: {} };
    const row = { campaignId, userId, createdAt, ...receipt };
    await connection.db.insert(libraryDocumentActions).values(row);
    await connection.db.insert(sheetActions).values(row);
  }

  async function operationsLeft(): Promise<string[]> {
    const documents = await connection.db.select().from(libraryDocumentActions);
    const sheets = await connection.db.select().from(sheetActions);
    return [...documents, ...sheets].map(({ operation }) => operation).sort();
  }

  it('deletes the receipts kept 25 hours ago and keeps the one of an hour ago', async () => {
    await receiptKeptAt(HOURS_AGO(25), 'old');
    await receiptKeptAt(HOURS_AGO(1), 'recent');

    await sweep();

    expect(await operationsLeft()).toEqual(['recent', 'recent']);
  });

  it('deletes the expired sessions and 2FA steps and keeps the valid ones', async () => {
    const session = { userId, persistent: false };
    await connection.db.insert(authSessions).values([
      { ...session, id: 'expired', expiresAt: HOURS_AGO(1) },
      { ...session, id: 'valid', expiresAt: HOURS_AGO(-1) },
    ]);
    await connection.db.insert(twoFactorChallenges).values([
      { ...session, id: 'expired', expiresAt: HOURS_AGO(1) },
      { ...session, id: 'valid', expiresAt: HOURS_AGO(-1) },
    ]);

    await sweep();

    const sessions = await connection.db.select({ id: authSessions.id }).from(authSessions);
    const steps = await connection.db
      .select({ id: twoFactorChallenges.id })
      .from(twoFactorChallenges);
    expect(sessions).toEqual([{ id: 'valid' }]);
    expect(steps).toEqual([{ id: 'valid' }]);
  });

  it('deletes the expired sign-up links and keeps the live ones and every admin invitation', async () => {
    const link = (name: string, origin: 'admin' | 'self', expiresAt: Date) => ({
      tokenHash: `sha:${name}`,
      emailCipher: `sealed-${name}`,
      emailIndex: `idx-${name}`,
      role: 'user' as const,
      origin,
      sentAt: HOURS_AGO(200),
      expiresAt,
    });
    await connection.db
      .insert(invitations)
      .values([
        link('self-expired', 'self', HOURS_AGO(1)),
        link('self-live', 'self', HOURS_AGO(-1)),
        link('admin-expired', 'admin', HOURS_AGO(1)),
      ]);

    await sweep();

    const left = await connection.db.select({ tokenHash: invitations.tokenHash }).from(invitations);
    expect(left.map(({ tokenHash }) => tokenHash).sort()).toEqual([
      'sha:admin-expired',
      'sha:self-live',
    ]);
  });

  it('empties a backlog larger than one batch in the same sweep', async () => {
    await connection.db.execute(
      sql`INSERT INTO sheet_actions (campaign_id, user_id, action_id, operation, fingerprint, receipt, created_at)
          SELECT ${campaignId}, ${userId}, gen_random_uuid(), 'old', 'f', '{}', ${HOURS_AGO(30).toISOString()}
          FROM generate_series(1, 2500)`,
    );

    await sweep();

    expect(await operationsLeft()).toEqual([]);
  });

  it('a receipt kept a day and an hour ago no longer dedupes: the same actionId is a new command', async () => {
    await receiptKeptAt(HOURS_AGO(25), 'old');
    const [kept] = await connection.db.select().from(sheetActions);

    await sweep();
    const again = { ...kept, operation: 'retried', createdAt: NOW };
    await connection.db.insert(sheetActions).values(again as typeof sheetActions.$inferInsert);

    expect(await operationsLeft()).toEqual(['retried']);
  });

  it('lifts the suspensions that ended an hour ago or right now, keeps the one ending tomorrow', async () => {
    const ended = await suspendUntil('bia@mesa.com', HOURS_AGO(1));
    const endsNow = await suspendUntil('caio@mesa.com', NOW);
    const holding = await suspendUntil('davi@mesa.com', HOURS_AGO(-24));
    const told = new SuspensionEndedFake();

    await sweep(told);

    const rows = await connection.db
      .select({ id: users.id, suspendedAt: users.suspendedAt, until: users.suspendedUntil })
      .from(users)
      .where(inArray(users.id, [ended, endsNow, holding]));
    const suspended = rows.filter((row) => row.suspendedAt !== null).map((row) => row.id);
    expect(suspended).toEqual([holding]);
    expect(rows.find((row) => row.id === ended)?.until).toBeNull();
    expect([...told.told].sort()).toEqual([ended, endsNow].sort());
  });

  it('a suspension without an end is never lifted by the sweep', async () => {
    await connection.db.update(users).set({ suspendedAt: HOURS_AGO(500) });

    await sweep();

    const [row] = await connection.db.select({ at: users.suspendedAt }).from(users);
    expect(row?.at).toEqual(HOURS_AGO(500));
  });
});
