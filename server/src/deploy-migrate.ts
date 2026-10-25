import { readEnv } from './config/env';
import { readProcessEnv } from './config/process-env';
import { createDatabase } from './database/database';
import { migrationsFolderOf, runMigrations } from './database/migrate';
import { failureText } from './lib/failure-text';

// The image has no drizzle-kit (a dev dependency): the container runs this before the server, so a
// failing migration keeps the new version from booting and the old container stays up.
const env = readEnv(readProcessEnv());
const database = createDatabase(env.databaseUrl, env.database);

try {
  await runMigrations(database.db, migrationsFolderOf(import.meta.dirname));
  process.stdout.write('migrations applied\n');
} catch (error) {
  process.stderr.write(`migrations failed: ${failureText(error)}\n`);
  process.exitCode = 1;
} finally {
  await database.close();
}
