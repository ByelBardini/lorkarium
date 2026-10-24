import { buildApp } from './app/build-app';
import { readEnv } from './config/env';
import { createDatabase } from './database/database';

const env = readEnv(process.env);
const database = createDatabase(env.databaseUrl, env.database);
const app = await buildApp({ env, db: database.db });

app.addHook('onClose', database.close);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close());
}

await app.listen({ port: env.port, host: env.host });
