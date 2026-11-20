import { adminDirectoryResponseDto } from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { runMigrations, runMigrationsThrough } from '../../src/database/migrate';
import { users } from '../../src/modules/auth/users.po';
import { MailerFake } from '../support/account-security-fakes';
import { ClockFake } from '../support/auth-fakes';
import { databaseUrlNamed } from '../support/migrations-up-to';
import { insertTestAccount, logIn } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const SCRATCH = 'lorkarium_invitation_origin';
const LAST_MIGRATION_WITHOUT_ORIGIN = '0122_token_magic_sight';
const PENDING = '40000000-0000-4000-8000-000000000001';
const PASSWORD = 'senha-de-teste';

describe('migration invitation_origin: an invitation that existed', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH));
    await runMigrationsThrough(scratch.db, LAST_MIGRATION_WITHOUT_ORIGIN);
    await scratch.db.execute(sql`
      INSERT INTO invitations (id, token_hash, email_cipher, email_index, role, sent_at, expires_at)
      VALUES (${PENDING}, 'sha:old', 'sealed', 'idx', 'user', now(), now() + interval '7 days')`);
    await runMigrations(scratch.db);
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH}`));
    await admin.close();
  });

  it('comes out as an invitation from the backoffice', async () => {
    const { rows } = await scratch.db.execute(sql`SELECT id, origin FROM invitations`);
    expect(rows).toEqual([{ id: PENDING, origin: 'admin' }]);
  });

  it('a new row without an origin is from the backoffice too', async () => {
    await scratch.db.execute(sql`
      INSERT INTO invitations (token_hash, email_cipher, email_index, role, sent_at, expires_at)
      VALUES ('sha:new', 'sealed-2', 'idx-2', 'user', now(), now())`);
    const { rows } = await scratch.db.execute(
      sql`SELECT origin FROM invitations WHERE token_hash = 'sha:new'`,
    );
    expect(rows).toEqual([{ origin: 'admin' }]);
  });

  it('an origin out of the enum is refused', async () => {
    await expect(
      scratch.db.execute(sql`UPDATE invitations SET origin = 'site' WHERE id = ${PENDING}`),
    ).rejects.toThrow();
  });
});

describe('the backoffice list and the origin', () => {
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    const env = { ...readEnv(process.env), adminSeed: null };
    app = await buildApp({
      env,
      db: connection.db,
      mailer: new MailerFake(),
      clock: new ClockFake(new Date()),
    });
    const email = 'lucas@mesa.com';
    const row = await insertTestAccount(connection.db, {
      name: 'Lucas',
      email,
      password: PASSWORD,
    });
    await connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, row.id));
    adminToken = await logIn(app, email, PASSWORD);
  });

  afterEach(() => app.close());

  it('lists the invitation the admin sent and never a sign-up link', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/admin/invitations',
      cookies: { lk_session: adminToken },
      payload: { email: 'marina@exemplo.com', role: 'user' },
    });
    await connection.db.execute(sql`
      INSERT INTO invitations (token_hash, email_cipher, email_index, role, origin, sent_at, expires_at)
      VALUES ('sha:self', 'sealed-self', 'idx-self', 'user', 'self', now(), now() + interval '1 day')`);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { lk_session: adminToken },
    });
    const { invitations } = adminDirectoryResponseDto.parse(list.json());
    expect(invitations.map((invitation) => invitation.email)).toEqual(['marina@exemplo.com']);
  });
});
