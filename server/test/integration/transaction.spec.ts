import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { runInSnapshot, runInTransaction } from '../../src/database/transaction';
import { users } from '../../src/modules/auth/users.po';
import { newUserPo } from '../support/auth-factories';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

describe('runInTransaction on Postgres', () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  beforeEach(() => truncateAllTables(connection.db));

  afterAll(() => connection.close());

  // The @ the factory derives from each e-mail: the e-mail itself is sealed.
  async function storedEmails(): Promise<string[]> {
    const rows = await connection.db.select({ username: users.username }).from(users);
    return rows.map((row) => `${row.username}@mesa.com`).sort();
  }

  it('commits every insert of the callback and returns what the callback returned', async () => {
    const returned = await runInTransaction(connection.db, async (tx) => {
      await tx.insert(users).values(newUserPo({ email: 'ana@mesa.com' }));
      await tx.insert(users).values(newUserPo({ email: 'bia@mesa.com' }));
      return 'both inserted';
    });
    expect(returned).toBe('both inserted');
    expect(await storedEmails()).toEqual(['ana@mesa.com', 'bia@mesa.com']);
  });

  it('a throw after an insert leaves no row and reaches the caller as the same error', async () => {
    const failure = new Error('second step failed');
    const run = runInTransaction(connection.db, async (tx) => {
      await tx.insert(users).values(newUserPo({ email: 'ana@mesa.com' }));
      throw failure;
    });
    await expect(run).rejects.toBe(failure);
    expect(await storedEmails()).toEqual([]);
  });
});

describe('the pool size and timeouts of a connection', () => {
  const url = readEnv(process.env).databaseUrl;
  const opened: DatabaseConnection[] = [];

  afterEach(async () => {
    for (const connection of opened.splice(0)) await connection.close();
  });

  function open(options: Parameters<typeof createDatabase>[1]): DatabaseConnection {
    const connection = createDatabase(url, options);
    opened.push(connection);
    return connection;
  }

  async function setting(connection: DatabaseConnection, name: string): Promise<unknown> {
    const result = await connection.db.execute(sql.raw(`SHOW ${name}`));
    return result.rows[0]?.[name];
  }

  it('a connection opened with 1500 ms answers SHOW statement_timeout and lock_timeout with 1500ms', async () => {
    const connection = open({ statementTimeoutMs: 1500, lockTimeoutMs: 1500 });
    expect(await setting(connection, 'statement_timeout')).toBe('1500ms');
    expect(await setting(connection, 'lock_timeout')).toBe('1500ms');
  });

  it('a pool of 1 serves two queries at once on the same backend', async () => {
    const connection = open({ poolMax: 1 });
    const pidOf = async (): Promise<unknown> =>
      (await connection.db.execute(sql`select pg_backend_pid() as pid`)).rows[0]?.pid;
    const [first, second] = await Promise.all([pidOf(), pidOf()]);
    expect(first).toBe(second);
  });

  it('waiting for a row lock longer than lock_timeout fails with the Postgres code 55P03', async () => {
    const patient = open({});
    await truncateAllTables(patient.db);
    await patient.db.insert(users).values(newUserPo({ email: 'ana@mesa.com' }));
    const impatient = open({ lockTimeoutMs: 200 });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const holder = runInTransaction(patient.db, async (tx) => {
      await tx.execute(sql`select id from users for update`);
      await held;
    });
    const waiting = runInTransaction(impatient.db, (tx) =>
      tx.execute(sql`select id from users for update`),
    );
    await expect(waiting).rejects.toMatchObject({ cause: { code: '55P03' } });
    release();
    await holder;
  });
});

describe('runInSnapshot on Postgres', () => {
  let connection: DatabaseConnection;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  it('reads in one repeatable read, read only transaction and refuses a write in it', async () => {
    const level = await runInSnapshot(connection.db, async (tx) => {
      const shown = await tx.execute(sql`SHOW transaction_isolation`);
      return shown.rows[0]?.transaction_isolation;
    });
    expect(level).toBe('repeatable read');
    const writing = runInSnapshot(connection.db, (tx) =>
      tx.insert(users).values(newUserPo({ email: 'ana@mesa.com' })),
    );
    await expect(writing).rejects.toMatchObject({ cause: { code: '25006' } });
  });
});
