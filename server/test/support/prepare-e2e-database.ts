import { readEnv } from '../../src/config/env';
import { prepareE2eDatabase } from './e2e-database';

// Run by the e2e webServer before the server boots: `pnpm --filter @lorkarium/server e2e:database`.
const env = readEnv(process.env);
await prepareE2eDatabase(env.databaseUrl, env.nodeEnv, env.dataEncryptionKey);
process.stdout.write(`e2e: ${new URL(env.databaseUrl).pathname.slice(1)} pronto e vazio\n`);
