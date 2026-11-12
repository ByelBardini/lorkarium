import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import {
  databaseUrlNamed,
  insertUserAtOldMigration,
  migrationsUpTo,
} from '../support/migrations-up-to';
import { insertTestAccount } from '../support/sign-in';

const SCRATCH_DATABASE = 'lorkarium_user_plans_migration';
const LAST_MIGRATION_BEFORE_PLANS = '0100_sheet_template_assets';
const PLANS_MIGRATION = '0101_user_plans';

type PlanRow = { name: string; plan: string };

// Two accounts at 0100: a user and an admin.
async function seedAccountsAt0100(scratch: DatabaseConnection): Promise<void> {
  await insertUserAtOldMigration(scratch.db, { name: 'Bia', email: 'bia@mesa.com' });
  const adminId = await insertUserAtOldMigration(scratch.db, {
    name: 'Ana',
    email: 'ana@mesa.com',
  });
  await scratch.db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${adminId}`);
}

describe('migration 0101_user_plans on a database with a user and an admin', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let plansFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_PLANS);
    plansFolder = await migrationsUpTo(PLANS_MIGRATION);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedAccountsAt0100(scratch);
    await migrate(scratch.db, { migrationsFolder: plansFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(plansFolder, { recursive: true, force: true });
  });

  async function planOf(name: string): Promise<PlanRow | undefined> {
    const { rows } = await scratch.db.execute<PlanRow>(
      sql`SELECT name, plan FROM users WHERE name = ${name}`,
    );
    return rows[0];
  }

  it('puts the account that is not admin in amigo_do_dono', async () => {
    expect(await planOf('Bia')).toEqual({ name: 'Bia', plan: 'amigo_do_dono' });
  });

  it('leaves the admin in free', async () => {
    expect(await planOf('Ana')).toEqual({ name: 'Ana', plan: 'free' });
  });

  it('an account inserted after the migration is born free', async () => {
    const caio = await insertTestAccount(scratch.db, {
      name: 'Caio',
      email: 'caio@mesa.com',
      password: 'senha-de-teste',
    });
    expect(caio.plan).toBe('free');
  });

  it('the enum takes the Apoiador as a plan, and there is no supporter column', async () => {
    await scratch.db.execute(sql`UPDATE users SET plan = 'apoiador' WHERE name = 'Bia'`);
    expect(await planOf('Bia')).toEqual({ name: 'Bia', plan: 'apoiador' });
    await expect(scratch.db.execute(sql`SELECT supporter FROM users`)).rejects.toMatchObject({
      cause: { code: '42703' },
    });
  });

  it('the enum refuses a plan out of the list', async () => {
    await expect(scratch.db.execute(sql`UPDATE users SET plan = 'pro'`)).rejects.toMatchObject({
      cause: { code: '22P02' },
    });
  });
});
