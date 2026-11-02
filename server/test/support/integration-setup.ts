import { ensureWorkerDatabase, workerDatabaseUrl } from './worker-database';

// Spec files run in parallel and truncate every table, so each worker needs a database of its own.
// This runs before the spec is imported, so every readEnv(process.env) already sees the new address.
const baseUrl = process.env.DATABASE_URL;
const poolId = process.env.VITEST_POOL_ID;
if (baseUrl !== undefined && poolId !== undefined) {
  const workerUrl = workerDatabaseUrl(baseUrl, poolId);
  await ensureWorkerDatabase(baseUrl, workerUrl);
  process.env.DATABASE_URL = workerUrl;
}
