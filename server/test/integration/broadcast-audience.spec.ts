import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users, type NewUserPo } from '../../src/modules/auth/users.po';
import { BroadcastAudienceDao } from '../../src/modules/broadcasts/broadcast-audience.dao';
import { mailBroadcastDeliveries } from '../../src/modules/broadcasts/mail-broadcast-deliveries.po';
import { mailBroadcasts } from '../../src/modules/broadcasts/mail-broadcasts.po';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

type AccountState = Readonly<{
  username: string;
  account?: Partial<NewUserPo>;
  paid?: Readonly<{ plan: 'apoiador' | 'narrador' | 'lenda'; interval: string }>;
}>;

// Ana free; Bia pays the Lenda; Edu pays the Narrador; Fabi's Lenda ended yesterday; Caio pays the
// Lenda but is suspended; Dani is an admin with the Lenda given by an admin (not paid); Gabi's
// suspension already ended (the housekeeping did not clear it yet) and she pays the Narrador;
// Hugo is suspended until 2099.
const ACCOUNTS: readonly AccountState[] = [
  { username: 'ana' },
  { username: 'bia', paid: { plan: 'lenda', interval: '30 days' } },
  { username: 'edu', paid: { plan: 'narrador', interval: '30 days' } },
  { username: 'fabi', paid: { plan: 'lenda', interval: '-1 day' } },
  {
    username: 'caio',
    account: { suspendedAt: new Date('2026-11-01T00:00:00Z') },
    paid: { plan: 'lenda', interval: '30 days' },
  },
  { username: 'dani', account: { role: 'admin', plan: 'lenda' } },
  {
    username: 'gabi',
    account: {
      suspendedAt: new Date('2026-11-01T00:00:00Z'),
      suspendedUntil: new Date('2026-11-02T00:00:00Z'),
    },
    paid: { plan: 'narrador', interval: '30 days' },
  },
  {
    username: 'hugo',
    account: {
      suspendedAt: new Date('2026-11-01T00:00:00Z'),
      suspendedUntil: new Date('2099-01-01T00:00:00Z'),
    },
  },
];

describe('who each broadcast segment reaches', () => {
  let connection: DatabaseConnection;
  let audience: BroadcastAudienceDao;
  const ids = new Map<string, string>();

  beforeAll(async () => {
    connection = await openTestDatabase();
    audience = new BroadcastAudienceDao(connection.db);
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    for (const state of ACCOUNTS) ids.set(state.username, await insertAccount(state));
  });

  afterAll(() => connection.close());

  async function insertAccount(state: AccountState): Promise<string> {
    const email = `${state.username}@mesa.com`;
    const base = newUserPo({ email, name: state.username, ...state.account });
    const { id } = await new UsersDao(connection.db).insert(base);
    if (!state.paid) return id;
    const paidPlanUntil = sql`now() + ${state.paid.interval}::interval`;
    await connection.db
      .update(users)
      .set({ paidPlan: state.paid.plan, paidPlanUntil })
      .where(eq(users.id, id));
    return id;
  }

  async function newBroadcast(): Promise<string> {
    const [row] = await connection.db
      .insert(mailBroadcasts)
      .values({ segment: 'all', subject: 'Aviso', title: 'Aviso', paragraphs: ['Texto.'] })
      .returning({ id: mailBroadcasts.id });
    if (!row) throw new Error('the broadcast was not inserted');
    return row.id;
  }

  async function frozenUsernames(broadcastId: string): Promise<string[]> {
    const rows = await connection.db
      .select({ username: users.username })
      .from(mailBroadcastDeliveries)
      .innerJoin(users, eq(users.id, mailBroadcastDeliveries.userId))
      .where(eq(mailBroadcastDeliveries.broadcastId, broadcastId));
    return rows.map((row) => row.username).sort();
  }

  it('"all" counts every account not suspended now, the admin included', async () => {
    expect(await audience.count('all')).toBe(6);
  });

  it('"paid" counts the paid plans in force of active accounts only', async () => {
    expect(await audience.count('paid')).toBe(3);
  });

  it('{ plan: lenda } counts only the paid Lenda in force of an active account', async () => {
    expect(await audience.count({ plan: 'lenda' })).toBe(1);
  });

  it('{ plan: apoiador } with nobody paying it counts 0', async () => {
    expect(await audience.count({ plan: 'apoiador' })).toBe(0);
  });

  it('freezing "all" writes one pending delivery per account of the segment', async () => {
    const broadcastId = await newBroadcast();
    expect(await audience.freeze(broadcastId, 'all')).toBe(6);
    expect(await frozenUsernames(broadcastId)).toEqual([
      'ana',
      'bia',
      'dani',
      'edu',
      'fabi',
      'gabi',
    ]);
  });

  it('freezing { plan: lenda } leaves out the expired, the suspended and the admin-given Lenda', async () => {
    const broadcastId = await newBroadcast();
    expect(await audience.freeze(broadcastId, { plan: 'lenda' })).toBe(1);
    expect(await frozenUsernames(broadcastId)).toEqual(['bia']);
  });

  it('a delivery keeps no address: only the account id', async () => {
    const broadcastId = await newBroadcast();
    await audience.freeze(broadcastId, 'paid');
    const [row] = await connection.db
      .select()
      .from(mailBroadcastDeliveries)
      .where(eq(mailBroadcastDeliveries.userId, ids.get('bia') ?? ''));
    expect(row).toMatchObject({ attempts: 0, sentAt: null, failedAt: null, skippedAt: null });
    expect(Object.keys(row ?? {}).some((column) => /mail|address/i.test(column))).toBe(false);
  });
});
