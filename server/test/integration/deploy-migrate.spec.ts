import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { MIGRATIONS_FOLDER, runMigrations } from '../../src/database/migrate';
import { databaseUrlNamed } from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_deploy_migrate';

async function journalLength(): Promise<number> {
  const journalPath = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as { entries: unknown[] };
  return journal.entries.length;
}

async function appliedCount(scratch: DatabaseConnection): Promise<number> {
  const result = await scratch.db.execute<{ applied: number }>(
    sql`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`,
  );
  return result.rows[0]?.applied ?? 0;
}

describe('runMigrations on the folder the deploy passes (deploy-migrate)', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
  });

  it('on an empty database it records one row per journal entry', async () => {
    await runMigrations(scratch.db, MIGRATIONS_FOLDER);
    expect(await appliedCount(scratch)).toBe(await journalLength());
  });

  it('run again (every boot does) it applies nothing new and does not fail', async () => {
    await runMigrations(scratch.db, MIGRATIONS_FOLDER);
    expect(await appliedCount(scratch)).toBe(await journalLength());
  });

  it('a folder without migrations is refused citing the path received', async () => {
    const missing = path.resolve('nao-existe', 'drizzle');
    await expect(runMigrations(scratch.db, missing)).rejects.toThrow(missing);
  });
});
