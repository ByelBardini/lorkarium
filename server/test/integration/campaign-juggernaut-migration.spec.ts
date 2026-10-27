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

const SCRATCH_DATABASE = 'lorkarium_campaign_juggernaut_migration';
const LAST_MIGRATION_BEFORE_JUGGERNAUT = '0063_token_created_by';
const JUGGERNAUT_MIGRATION = '0064_campaign_juggernaut';

type MemberColumns = Readonly<{
  role: string;
  juggernaut_since: Date | null;
  role_before_juggernaut: string | null;
}>;

// Vharn of Ana with Bia playing and Duda watching, as 0063 left them.
async function seedTableAt0063(scratch: DatabaseConnection): Promise<void> {
  const ids: string[] = [];
  for (const name of ['Ana', 'Bia', 'Duda']) {
    const email = `${name.toLowerCase()}@mesa.com`;
    ids.push(await insertUserAtOldMigration(scratch.db, { name, email }));
  }
  const [ana, bia, duda] = ids;
  await scratch.db.execute(sql`
    WITH vharn AS (
      INSERT INTO campaigns (owner_id, name, join_code) VALUES (${ana}, 'Vharn', 'VHRN7K2Q')
      RETURNING id
    )
    INSERT INTO campaign_members (campaign_id, user_id, role)
      SELECT id, ${ana}::uuid, 'master'::campaign_role FROM vharn
      UNION ALL SELECT id, ${bia}::uuid, 'player'::campaign_role FROM vharn
      UNION ALL SELECT id, ${duda}::uuid, 'spectator'::campaign_role FROM vharn`);
}

describe('migration 0064_campaign_juggernaut on a table with a master, a player and a spectator', () => {
  let admin: DatabaseConnection;
  let scratch: DatabaseConnection;
  let beforeFolder: string;
  let juggernautFolder: string;

  beforeAll(async () => {
    admin = createDatabase(readEnv(process.env).databaseUrl);
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.db.execute(sql.raw(`CREATE DATABASE ${SCRATCH_DATABASE}`));
    scratch = createDatabase(databaseUrlNamed(SCRATCH_DATABASE));
    beforeFolder = await migrationsUpTo(LAST_MIGRATION_BEFORE_JUGGERNAUT);
    juggernautFolder = await migrationsUpTo(JUGGERNAUT_MIGRATION);
    await migrate(scratch.db, { migrationsFolder: beforeFolder });
    await seedTableAt0063(scratch);
    await migrate(scratch.db, { migrationsFolder: juggernautFolder });
  });

  afterAll(async () => {
    await scratch.close();
    await admin.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`));
    await admin.close();
    await rm(beforeFolder, { recursive: true, force: true });
    await rm(juggernautFolder, { recursive: true, force: true });
  });

  it('keeps the three roles, each with no juggernaut instant and no role before', async () => {
    const result = await scratch.db.execute<MemberColumns>(
      sql`SELECT role, juggernaut_since, role_before_juggernaut FROM campaign_members ORDER BY role`,
    );
    expect(result.rows).toEqual([
      { role: 'master', juggernaut_since: null, role_before_juggernaut: null },
      { role: 'player', juggernaut_since: null, role_before_juggernaut: null },
      { role: 'spectator', juggernaut_since: null, role_before_juggernaut: null },
    ]);
  });
});
