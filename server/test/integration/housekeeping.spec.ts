import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { authSessions } from '../../src/modules/auth/auth-sessions.po';
import { twoFactorChallenges } from '../../src/modules/auth/two-factor-challenges.po';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { CampaignsDao } from '../../src/modules/campaigns/campaigns.dao';
import { libraryDocumentActions } from '../../src/modules/documents/documents.po';
import { HousekeepingDao } from '../../src/modules/housekeeping/housekeeping.dao';
import { HousekeepingService } from '../../src/modules/housekeeping/housekeeping.service';
import { sheetActions } from '../../src/modules/sheets/sheets.po';
import { ClockFake } from '../support/auth-fakes';
import { newUserPo } from '../support/auth-factories';
import { newCampaignPo } from '../support/campaigns-factories';
import { HousekeepingFailureLogFake } from '../support/housekeeping-fakes';
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

  function sweep(): Promise<void> {
    const deps = { clock: new ClockFake(NOW), scheduler: new SchedulerFake() };
    const log = new HousekeepingFailureLogFake();
    return new HousekeepingService({
      dao: new HousekeepingDao(connection.db),
      log,
      ...deps,
    }).sweep();
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
});
