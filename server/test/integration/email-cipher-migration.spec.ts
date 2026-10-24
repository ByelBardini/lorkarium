import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { runMigrations, runMigrationsThrough } from '../../src/database/migrate';
import { EmailEncryptionBackfillService } from '../../src/modules/auth/email-encryption-backfill.service';
import { UsersDao } from '../../src/modules/auth/users.dao';
import {
  databaseUrlNamed,
  LAST_MIGRATION_WITH_PLAIN_EMAIL,
  migrationsUpTo,
} from '../support/migrations-up-to';
import { testDataCipher } from '../support/sign-in';

const SCRATCH_DATABASE = 'lorkarium_email_cipher_migration';
const LAST_MIGRATION_BEFORE_PROFILE = '0036_token_anchor';
const ANA = '6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d';

type ColumnRow = { column_name: string; is_nullable: string };

async function userColumns(database: DatabaseConnection): Promise<ColumnRow[]> {
  const { rows } = await database.db.execute<ColumnRow>(sql`
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users'
      AND column_name IN ('email', 'email_cipher', 'email_index')
    ORDER BY column_name`);
  return rows;
}

// The Postgres text arrives wrapped by the Drizzle error (in `cause`).
function messagesOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return `${error.message} | ${error.cause instanceof Error ? error.cause.message : ''}`;
}

function sealEmails(database: DatabaseConnection): Promise<{ updated: number }> {
  return new EmailEncryptionBackfillService(new UsersDao(database.db), testDataCipher()).run();
}

describe('migration 0039_drop_plain_email and pnpm db:encrypt-emails', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection | undefined;
  let cipherFolder: string;
  let beforeFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    cipherFolder = await migrationsUpTo(LAST_MIGRATION_WITH_PLAIN_EMAIL);
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_PROFILE);
  });

  afterEach(async () => {
    await scratch?.close();
    scratch = undefined;
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
  });

  afterAll(async () => {
    await admin.close();
    await rm(cipherFolder, { recursive: true, force: true });
    await rm(beforeFolder, { recursive: true, force: true });
  });

  async function scratchAt(folder: string): Promise<DatabaseConnection> {
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    await migrate(scratch.db, { migrationsFolder: folder });
    return scratch;
  }

  async function insertPlainAna(database: DatabaseConnection): Promise<void> {
    await database.db.execute(sql`
      INSERT INTO users (id, name, email, password_hash)
      VALUES (${ANA}, 'Ana', 'ana@x.com', 'hash')`);
  }

  it('with an account still in clear at 0038 the rest refuses, telling to run pnpm db:encrypt-emails', async () => {
    const database = await scratchAt(cipherFolder);
    await database.db.execute(sql`
      INSERT INTO users (id, name, username, email, password_hash)
      VALUES (${ANA}, 'Ana', 'ana', 'ana@x.com', 'hash')`);
    const refusal = await runMigrations(database.db).then(
      () => 'migrated',
      (error: unknown) => messagesOf(error),
    );
    expect(refusal).toMatch(
      /1 account\(s\) still keep the e-mail in clear.*pnpm db:encrypt-emails/,
    );
    expect(await userColumns(database)).toContainEqual({
      column_name: 'email',
      is_nullable: 'YES',
    });
  });

  it('after the backfill it passes: the clear column goes and the cipher and index become required', async () => {
    const database = await scratchAt(cipherFolder);
    await database.db.execute(sql`
      INSERT INTO users (id, name, username, email, password_hash)
      VALUES (${ANA}, 'Ana', 'ana', 'ana@x.com', 'hash')`);
    expect(await sealEmails(database)).toEqual({ updated: 1 });
    await runMigrations(database.db);
    expect(await userColumns(database)).toEqual([
      { column_name: 'email_cipher', is_nullable: 'NO' },
      { column_name: 'email_index', is_nullable: 'NO' },
    ]);
    const ana = await new UsersDao(database.db).findById(ANA);
    expect(testDataCipher().open('user-email', ana?.emailCipher ?? '', ANA)).toBe('ana@x.com');
    expect(await sealEmails(database)).toEqual({ updated: 0 });
  });

  it('the script path from 0036: through 0038, seal, then the rest; the account logs in by the index', async () => {
    const database = await scratchAt(beforeFolder);
    await insertPlainAna(database);
    await expect(runMigrations(database.db)).rejects.toThrow();
    await runMigrationsThrough(database.db, LAST_MIGRATION_WITH_PLAIN_EMAIL);
    expect(await sealEmails(database)).toEqual({ updated: 1 });
    await runMigrations(database.db);
    const index = testDataCipher().index('email-index', 'ana@x.com');
    expect(await new UsersDao(database.db).findByEmailIndex(index)).toMatchObject({
      id: ANA,
      username: 'ana',
    });
  });
});
