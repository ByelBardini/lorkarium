import { readEnv } from './config/env';
import { readProcessEnv } from './config/process-env';
import { createDatabase } from './database/database';
import { buildStressSceneSeed } from './app/build-stress-seed';

const env = readEnv(readProcessEnv());
const database = createDatabase(env.databaseUrl, env.database);

try {
  const { campaignId, created } = await buildStressSceneSeed(database.db).seed(env.nodeEnv);
  const outcome = created ? 'criada' : 'já existia';
  process.stdout.write(`Mesa de estresse ${outcome}: /campaigns/${campaignId}/table\n`);
} finally {
  await database.close();
}
