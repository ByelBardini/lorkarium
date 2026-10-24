import { readEnv } from './config/env';
import { readProcessEnv } from './config/process-env';
import { createDatabase } from './database/database';
import { runMigrations, runMigrationsThrough } from './database/migrate';
import { AesGcmDataCipher } from './infrastructure/data-cipher/aes-gcm-data-cipher';
import { EmailEncryptionBackfillService } from './modules/auth/email-encryption-backfill.service';
import { UsersDao } from './modules/auth/users.dao';

// The last migration with the clear column: 0039 drops it and refuses while an account is unsealed.
const LAST_MIGRATION_WITH_PLAIN_EMAIL = '0038_email_cipher';

const env = readEnv(readProcessEnv());
const database = createDatabase(env.databaseUrl, env.database);

// `pnpm db:encrypt-emails`: up to 0038 (the cipher columns), seal every clear e-mail with the key of
// the env, then the remaining migrations; running it again seals nothing.
try {
  await runMigrationsThrough(database.db, LAST_MIGRATION_WITH_PLAIN_EMAIL);
  const backfill = new EmailEncryptionBackfillService(
    new UsersDao(database.db),
    new AesGcmDataCipher(env.dataEncryptionKey),
  );
  const { updated } = await backfill.run();
  await runMigrations(database.db);
  process.stdout.write(`e-mails cifrados: ${updated}\n`);
} finally {
  await database.close();
}
