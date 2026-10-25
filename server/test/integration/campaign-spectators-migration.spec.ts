import { rm } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/config/env';
import { createDatabase, type DatabaseConnection } from '../../src/database/database';
import {
  databaseUrlNamed,
  migrationsUpTo,
  insertUserAtOldMigration,
} from '../support/migrations-up-to';

const SCRATCH_DATABASE = 'lorkarium_campaign_spectators_migration';
const LAST_MIGRATION_BEFORE_SPECTATORS = '0048_campaign_settings';
const SPECTATORS_MIGRATION = '0049_campaign_spectators';

async function seedTableAt0048(scratch: DatabaseConnection): Promise<void> {
  const masterId = await insertUserAtOldMigration(scratch.db, {
    name: 'Ana',
    email: 'ana@mesa.com',
  });
  const playerId = await insertUserAtOldMigration(scratch.db, {
    name: 'Bia',
    email: 'bia@mesa.com',
  });
  await scratch.db.execute(sql`
    WITH vharn AS (
      INSERT INTO campaigns (owner_id, name, join_code) VALUES (${masterId}, 'Vharn', 'VHRN7K2Q')
      RETURNING id
    )
    INSERT INTO campaign_members (campaign_id, user_id, role)
      SELECT id, ${masterId}::uuid, 'master'::campaign_role FROM vharn
      UNION ALL SELECT id, ${playerId}::uuid, 'player'::campaign_role FROM vharn`);
}

describe('migration 0049_campaign_spectators on a table with a master and a player', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let spectatorsFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_SPECTATORS);
    spectatorsFolder = await migrationsUpTo(SPECTATORS_MIGRATION);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedTableAt0048(scratch);
    await migrate(scratch.db, { migrationsFolder: spectatorsFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(spectatorsFolder, { recursive: true, force: true });
  });

  it('keeps the master and the player roles as they were', async () => {
    const result = await scratch.db.execute<{ role: string }>(
      sql`SELECT role FROM campaign_members ORDER BY role`,
    );
    expect(result.rows.map((row) => row.role)).toEqual(['master', 'player']);
  });
});
