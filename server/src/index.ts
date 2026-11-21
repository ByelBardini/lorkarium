import { buildApp } from './app/build-app';
import { readEnv } from './config/env';
import { createDatabase } from './database/database';
import { SentryErrorReportSink } from './infrastructure/error-reporting/sentry-error-report-sink';

// What is still queued for Sentry gets this long to leave when the server stops.
const ERROR_REPORT_FLUSH_MS = 2_000;

const env = readEnv(process.env);
// Before the database and the app: a crash while booting is reported too.
const errorReportSink = env.errorReporting
  ? new SentryErrorReportSink({ config: env.errorReporting, catchProcessFailures: true })
  : undefined;
const database = createDatabase(env.databaseUrl, {
  ...env.database,
  ownerUsername: env.ownerUsername,
});
const app = await buildApp({ env, db: database.db, errorReportSink });

app.addHook('onClose', database.close);
app.addHook('onClose', async () => {
  await errorReportSink?.flush(ERROR_REPORT_FLUSH_MS);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close());
}

await app.listen({ port: env.port, host: env.host });
