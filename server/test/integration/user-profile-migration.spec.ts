import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import { databaseUrlNamed, migrationsUpTo } from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_user_profile_migration';
const LAST_MIGRATION_BEFORE_PROFILE = '0036_token_anchor';
const PROFILE_MIGRATION = '0037_user_profile';

type ProfileRow = {
  email: string;
  name: string;
  username: string;
  color: string | null;
  bio: string | null;
  avatar_id: string | null;
};

// Three accounts at 0036, oldest first: two share the local part "bia", one is too short.
async function seedUsersAt0036(scratch: DatabaseConnection): Promise<void> {
  await scratch.db.execute(sql`
    INSERT INTO users (name, email, password_hash, created_at) VALUES
      ('Bia Rola', 'bia@lorkarium.dev', 'hash', '2026-01-01T00:00:00Z'),
      ('Outra Bia', 'Bia@outro.com', 'hash', '2026-02-01T00:00:00Z'),
      ('Ana', 'a@x.com', 'hash', '2026-03-01T00:00:00Z')`);
}

describe('migration 0037_user_profile on a database with accounts', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection | undefined;
  let beforeFolder: string;
  let profileFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_PROFILE);
    profileFolder = await migrationsUpTo(PROFILE_MIGRATION);
  });

  afterEach(async () => {
    await scratch?.close();
    scratch = undefined;
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
  });

  afterAll(async () => {
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(profileFolder, { recursive: true, force: true });
  });

  async function migratedFrom0036(): Promise<DatabaseConnection> {
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedUsersAt0036(scratch);
    await migrate(scratch.db, { migrationsFolder: profileFolder });
    return scratch;
  }

  it('fills the @ by the rule of the BO (bia, bia2, a.rpg) and leaves the name untouched', async () => {
    const database = await migratedFrom0036();
    const { rows } = await database.db.execute<ProfileRow>(sql`
      SELECT email, name, username, color, bio, avatar_id FROM users ORDER BY created_at`);
    expect(rows).toEqual([
      {
        email: 'bia@lorkarium.dev',
        name: 'Bia Rola',
        username: 'bia',
        color: null,
        bio: null,
        avatar_id: null,
      },
      {
        email: 'Bia@outro.com',
        name: 'Outra Bia',
        username: 'bia2',
        color: null,
        bio: null,
        avatar_id: null,
      },
      { email: 'a@x.com', name: 'Ana', username: 'a.rpg', color: null, bio: null, avatar_id: null },
    ]);
  });

  it('the unique index then refuses a repeated @ with 23505', async () => {
    const database = await migratedFrom0036();
    const repeated = database.db.execute(sql`
      INSERT INTO users (name, username, email, password_hash)
      VALUES ('Mais uma', 'bia', 'bia3@x.com', 'hash')`);
    await expect(repeated).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('a database without accounts migrates and the @ is required from then on', async () => {
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    await migrate(scratch.db, { migrationsFolder: profileFolder });
    const withoutUsername = scratch.db.execute(sql`
      INSERT INTO users (name, email, password_hash) VALUES ('Ana', 'ana@x.com', 'hash')`);
    await expect(withoutUsername).rejects.toMatchObject({ cause: { code: '23502' } });
  });
});
