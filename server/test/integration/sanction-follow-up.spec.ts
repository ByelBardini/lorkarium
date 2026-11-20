import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { SecurityNoticesService } from '../../src/modules/account-security/security-notices.service';
import { users } from '../../src/modules/auth/users.po';
import { accountSanctions } from '../../src/modules/sanctions/account-sanctions.po';
import { bannedEmailIndexes } from '../../src/modules/sanctions/banned-email-indexes.po';
import type { SanctionFollowUpService } from '../../src/modules/sanctions/sanction-follow-up.service';
import { createSanctionsModule } from '../../src/modules/sanctions/sanctions.plugin';
import { createUserAdminModule } from '../../src/modules/user-admin/user-admin.plugin';
import { MailerFake } from '../support/account-security-fakes';
import { ClockFake, SessionEndedFake } from '../support/auth-fakes';
import { HousekeepingFailureLogFake } from '../support/housekeeping-fakes';
import { ProfileChangedFake } from '../support/profiles-fakes';
import { insertTestAccount, testDataCipher } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';
import {
  MembershipsForgetFake,
  OwnerLimitsFake,
  RevokedSeatsFake,
  TablesGoneFake,
} from '../support/user-admin-fakes';

const NOW = new Date('2026-12-05T12:00:00Z');
const PAST_DUE = new Date('2026-12-04T12:00:00Z');
const HARASSMENT = { rule: 'harassment', statement: 'Ameaçou um jogador real.' } as const;

describe("the measures' follow-up on Postgres", () => {
  let connection: DatabaseConnection;
  let mailer: MailerFake;
  let followUp: SanctionFollowUpService;
  let caioId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    mailer = new MailerFake();
    followUp = followUpOver(mailer);
    const caio = { name: 'Caio', email: 'caio@mesa.com', password: 'senha-de-teste' };
    caioId = (await insertTestAccount(connection.db, caio)).id;
  });

  function followUpOver(mail: MailerFake): SanctionFollowUpService {
    const { db } = connection;
    const shared = { db, cipher: testDataCipher(), clock: new ClockFake(NOW) };
    const notices = new SecurityNoticesService(mail, () => undefined);
    const mailing = {
      notices,
      appPublicUrl: 'https://mesa.example.com',
      sitePublicUrl: 'https://s',
    };
    const sessionEnded = new SessionEndedFake();
    const userAdmin = createUserAdminModule({
      ...{ ...shared, ...mailing, sessionEnded, mailer: mail },
      invitations: { listPending: async () => [] },
      memberships: new MembershipsForgetFake(),
      tables: new TablesGoneFake([]),
      juggernauts: new RevokedSeatsFake([]),
      profiles: new ProfileChangedFake(),
      ownedTables: new OwnerLimitsFake([]),
    });
    const log = new HousekeepingFailureLogFake();
    const deletion = userAdmin.service;
    return createSanctionsModule({
      ...shared,
      ...mailing,
      deletion,
      sessionEnded,
      replyTo: null,
      log,
    }).followUp;
  }

  async function banCaio(overrides: Partial<typeof accountSanctions.$inferInsert> = {}) {
    await connection.db.insert(accountSanctions).values({
      ...{ userId: caioId, kind: 'ban', ...HARASSMENT, issuedAt: PAST_DUE },
      ...{ deletionDueAt: PAST_DUE, notifiedAt: PAST_DUE },
      ...overrides,
    });
  }

  async function caioExists(): Promise<boolean> {
    const rows = await connection.db.select().from(users).where(eq(users.id, caioId));
    return rows.length === 1;
  }

  it('a due ban deletes the account and keeps its e-mail out', async () => {
    await banCaio();

    await followUp.sweep();

    expect(await caioExists()).toBe(false);
    expect(await connection.db.select().from(bannedEmailIndexes)).toHaveLength(1);
  });

  it('a due ban for the minimum age deletes the account without keeping the e-mail out', async () => {
    await banCaio({ rule: 'minimum_age' });

    await followUp.sweep();

    expect(await caioExists()).toBe(false);
    expect(await connection.db.select().from(bannedEmailIndexes)).toEqual([]);
  });

  it('an appeal waiting for its decision holds the deletion', async () => {
    await banCaio({ appealReceivedAt: PAST_DUE });

    await followUp.sweep();

    expect(await caioExists()).toBe(true);
  });

  it('a ban whose e-mail never left is sent first, then the account goes', async () => {
    await banCaio({ notifiedAt: null });

    await followUp.sweep();

    expect(mailer.to('caio@mesa.com').map((mail) => mail.subject)).toEqual([
      'Sua conta no Lorkarium será excluída',
    ]);
    expect(await caioExists()).toBe(false);
  });

  it('a ban whose e-mail fails again is not deleted', async () => {
    await banCaio({ notifiedAt: null });
    mailer.failWith = new Error('smtp down');

    await followUp.sweep();

    expect(await caioExists()).toBe(true);
  });
});
