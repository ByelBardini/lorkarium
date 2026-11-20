import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { runInTransaction } from '../../src/database/transaction';
import { users } from '../../src/modules/auth/users.po';
import { BroadcastAudienceDao } from '../../src/modules/broadcasts/broadcast-audience.dao';
import { BroadcastSenderService } from '../../src/modules/broadcasts/broadcast-sender.service';
import { MailBroadcastDeliveriesDao } from '../../src/modules/broadcasts/mail-broadcast-deliveries.dao';
import { mailBroadcastDeliveries } from '../../src/modules/broadcasts/mail-broadcast-deliveries.po';
import { HousekeepingDao } from '../../src/modules/housekeeping/housekeeping.dao';
import { mailBroadcasts } from '../../src/modules/broadcasts/mail-broadcasts.po';
import { MailerFake } from '../support/account-security-fakes';
import { ClockFake } from '../support/auth-fakes';
import { BroadcastSenderLogFake, SendPaceFake } from '../support/broadcasts-fakes';
import { SchedulerFake } from '../support/sessions-fakes';
import { insertTestAccount, testDataCipher } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const NOW = new Date('2026-11-19T12:00:00Z');
const MINUTE = 60_000;
const NAMES = ['ana', 'bia', 'caio', 'dani', 'edu'];

describe('the queue of a confirmed notice (mail_broadcast_deliveries)', () => {
  let connection: DatabaseConnection;
  let queue: MailBroadcastDeliveriesDao;
  let broadcastId: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
    queue = new MailBroadcastDeliveriesDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    for (const name of NAMES) {
      await insertTestAccount(connection.db, {
        ...{ name, email: `${name}@mesa.com`, password: 'x' },
      });
    }
    broadcastId = await confirmedNotice();
  });

  afterAll(() => connection.close());

  async function confirmedNotice(): Promise<string> {
    const [row] = await connection.db
      .insert(mailBroadcasts)
      .values({
        ...{ segment: 'all', subject: 'Aviso', title: 'Aviso', paragraphs: ['Texto.'] },
        ...{ confirmedAt: NOW, total: NAMES.length },
      })
      .returning({ id: mailBroadcasts.id });
    if (!row) throw new Error('the broadcast was not inserted');
    await new BroadcastAudienceDao(connection.db).freeze(row.id, 'all');
    return row.id;
  }

  function senderWith(mailer: MailerFake): BroadcastSenderService {
    return new BroadcastSenderService({
      deliveries: queue,
      cipher: testDataCipher(),
      mailer,
      clock: new ClockFake(NOW),
      scheduler: new SchedulerFake(),
      pace: new SendPaceFake(),
      log: new BroadcastSenderLogFake(),
      appPublicUrl: 'https://app.lorkarium.com.br',
      replyTo: null,
    });
  }

  async function finishedAt(): Promise<Date | null> {
    const [row] = await connection.db
      .select({ finishedAt: mailBroadcasts.finishedAt })
      .from(mailBroadcasts)
      .where(eq(mailBroadcasts.id, broadcastId));
    return row?.finishedAt ?? null;
  }

  it('a row reserved by an open transaction is skipped, not waited for, by another cycle', async () => {
    const until = new Date(NOW.getTime() + 5 * MINUTE);
    let other: string[] = [];
    await runInTransaction(connection.db, async (tx) => {
      const held = await new MailBroadcastDeliveriesDao(tx).claim(NOW, until, 2);
      other = (await queue.claim(NOW, until, 10)).map(({ id }) => id);
      expect(other.filter((id) => held.some((row) => row.id === id))).toEqual([]);
    });
    expect(other).toHaveLength(3);
  });

  it('two cycles at the same time never send the same e-mail twice', async () => {
    const mailer = new MailerFake();
    await Promise.all([senderWith(mailer).cycle(), senderWith(mailer).cycle()]);
    expect(mailer.sent.map(({ to }) => to).sort()).toEqual(NAMES.map((n) => `${n}@mesa.com`));
  });

  it('a reserved row is not claimed again until its time passes', async () => {
    const until = new Date(NOW.getTime() + 5 * MINUTE);
    await queue.claim(NOW, until, 10);
    expect(await queue.claim(new Date(NOW.getTime() + MINUTE), until, 10)).toEqual([]);
    const later = new Date(until.getTime() + 1);
    expect(await queue.claim(later, new Date(later.getTime() + 5 * MINUTE), 10)).toHaveLength(5);
  });

  it('the claimed row brings the letter and the account to open the address', async () => {
    const [first] = await queue.claim(NOW, new Date(NOW.getTime() + MINUTE), 1);
    expect(first?.letter).toEqual({
      subject: 'Aviso',
      title: 'Aviso',
      paragraphs: ['Texto.'],
      button: null,
    });
    expect(NAMES).toContain(first?.account?.username);
  });

  it('an account deleted after the confirmation comes without account', async () => {
    await connection.db.delete(users);
    const claimed = await queue.claim(NOW, new Date(NOW.getTime() + MINUTE), 10);
    expect(claimed.map(({ account }) => account)).toEqual([null, null, null, null, null]);
  });

  it('a failed attempt frees the row for the next cycle', async () => {
    const [first] = await queue.claim(NOW, new Date(NOW.getTime() + 5 * MINUTE), 1);
    await queue.markFailed(first?.id ?? '', { attempts: 1, error: 'timeout', failedAt: null });
    const again = await queue.claim(NOW, new Date(NOW.getTime() + 5 * MINUTE), 10);
    expect(again.find(({ id }) => id === first?.id)?.attempts).toBe(1);
  });

  it('the notice is finished only once every delivery ended, sent, failed or skipped', async () => {
    const claimed = await queue.claim(NOW, new Date(NOW.getTime() + MINUTE), 10);
    const [a, b, ...rest] = claimed.map(({ id }) => id);
    await queue.markFailed(a ?? '', { attempts: 3, error: '550', failedAt: NOW });
    await queue.markSkipped(b ?? '', NOW);
    expect(await queue.finishCompleted(NOW)).toBe(0);
    for (const id of rest) await queue.markSent(id, NOW);
    expect(await queue.finishCompleted(NOW)).toBe(1);
    expect(await finishedAt()).toEqual(NOW);
  });

  it('a whole cycle sends to everyone and finishes the notice', async () => {
    const mailer = new MailerFake();
    await senderWith(mailer).cycle();
    expect(mailer.sent).toHaveLength(5);
    expect(await finishedAt()).toEqual(NOW);
  });

  it('the housekeeping deletes a notice older than the cut together with its deliveries', async () => {
    await connection.db
      .update(mailBroadcasts)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(mailBroadcasts.id, broadcastId));
    const recent = await confirmedNotice();
    const cut = new Date('2021-11-09T12:00:00Z');
    expect(await new HousekeepingDao(connection.db).deleteBefore('broadcasts', cut, 1000)).toBe(1);
    const left = await connection.db
      .selectDistinct({ broadcastId: mailBroadcastDeliveries.broadcastId })
      .from(mailBroadcastDeliveries);
    expect(left).toEqual([{ broadcastId: recent }]);
  });
});
