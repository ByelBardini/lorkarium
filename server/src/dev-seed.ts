import { randomUUID } from 'node:crypto';
import { readEnv } from './config/env';
import { readProcessEnv } from './config/process-env';
import { createDatabase } from './database/database';
import { AesGcmDataCipher } from './infrastructure/data-cipher/aes-gcm-data-cipher';
import { Argon2PasswordHasher } from './infrastructure/password-hasher/argon2-password-hasher';
import { DevPlayersSeedService } from './modules/auth/dev-players-seed.service';
import { UsersDao } from './modules/auth/users.dao';

const env = readEnv(readProcessEnv());
const database = createDatabase(env.databaseUrl, env.database);

try {
  const seed = new DevPlayersSeedService({
    users: new UsersDao(database.db),
    hasher: new Argon2PasswordHasher(),
    cipher: new AesGcmDataCipher(env.dataEncryptionKey),
    newId: randomUUID,
  });
  const { created, skipped } = await seed.seed(env.nodeEnv);
  process.stdout.write(`criados: ${created.join(', ') || 'nenhum'}\n`);
  process.stdout.write(`já existiam: ${skipped.join(', ') || 'nenhum'}\n`);
} finally {
  await database.close();
}
