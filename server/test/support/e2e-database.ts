import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { NodeEnv } from '../../src/config/env';
import { AesGcmDataCipher } from '../../src/infrastructure/data-cipher/aes-gcm-data-cipher';
import { Argon2PasswordHasher } from '../../src/infrastructure/password-hasher/argon2-password-hasher';
import { DevPlayersSeedService } from '../../src/modules/auth/dev-players-seed.service';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { openTestDatabase, truncateAllTables } from './test-database';

// Only a name like this is ever created or emptied: never the dev database nor production.
const E2E_DATABASE_NAME = /^[a-z0-9_]+_e2e$/;

/** The database name of `url`, refused unless it ends in `_e2e` (it is also quoted into SQL).
 *
 *  Example: `e2eDatabaseName('postgres://u:p@localhost:5432/lorkarium_e2e') // 'lorkarium_e2e'` */
export function e2eDatabaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (E2E_DATABASE_NAME.test(name)) return name;
  throw new Error(
    `refusing to prepare database "${name}" for the e2e: its name must be lowercase letters, digits and _, ending in _e2e`,
  );
}

/** Creates the e2e database if missing, migrates it, empties it and seeds Bia and Caio, so each
 *  e2e run starts clean without touching the dev database. The admin is seeded by the server.
 *
 *  Example: `await prepareE2eDatabase(env.databaseUrl, env.nodeEnv, env.dataEncryptionKey)` */
export async function prepareE2eDatabase(
  url: string,
  nodeEnv: NodeEnv,
  dataEncryptionKey: Buffer,
): Promise<void> {
  await createDatabaseIfMissing(url);
  const connection = await openTestDatabase();
  try {
    await truncateAllTables(connection.db);
    const seed = new DevPlayersSeedService({
      users: new UsersDao(connection.db),
      hasher: new Argon2PasswordHasher(),
      cipher: new AesGcmDataCipher(dataEncryptionKey),
      newId: randomUUID,
    });
    await seed.seed(nodeEnv);
  } finally {
    await connection.close();
  }
}

async function createDatabaseIfMissing(url: string): Promise<void> {
  const name = e2eDatabaseName(url);
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}
