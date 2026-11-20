import { readEnv } from './config/env';
import { readProcessEnv } from './config/process-env';
import { createDatabase } from './database/database';
import { S3AssetStorage } from './infrastructure/asset-storage/s3-asset-storage';
import { SystemClock } from './infrastructure/clock/system-clock';
import { AssetsDao } from './modules/assets/assets.dao';
import {
  OrphanObjectsService,
  type OrphanObjectsReport,
} from './modules/assets/orphan-objects.service';
import { StorageDeletionsDao } from './modules/assets/storage-deletions.dao';

const CHUNK_SIZE = 1000;

const env = readEnv(readProcessEnv());
const database = createDatabase(env.databaseUrl, env.database);
const storage = new S3AssetStorage(env.storage);
const flags = new Set(process.argv.slice(2));

function reportText(report: OrphanObjectsReport, dryRun: boolean): string {
  const verb = dryRun ? 'iriam para a fila' : 'na fila de remoção';
  const lines = [
    `arquivos de mesa no bucket: ${report.listed}`,
    `órfãos (sem linha nem remoção pendente, de mais de 24 h): ${report.orphans.length}`,
    ...report.orphans.map((key) => `  ${key}`),
    `${verb}: ${dryRun ? report.orphans.length : report.enqueued}`,
  ];
  return `${lines.join('\n')}\n`;
}

// `pnpm db:remove-orphan-objects [--dry-run] [--yes]`: the table files left in the bucket without
// a row go to the removal queue, which the running server drains; running it again finds none.
try {
  const dryRun = flags.has('--dry-run');
  const service = new OrphanObjectsService({
    storage,
    assets: new AssetsDao(database.db),
    deletions: new StorageDeletionsDao(database.db),
    clock: new SystemClock(),
    chunkSize: CHUNK_SIZE,
  });
  const report = await service.run({ dryRun, confirmed: flags.has('--yes'), nodeEnv: env.nodeEnv });
  process.stdout.write(reportText(report, dryRun));
} finally {
  storage.destroy();
  await database.close();
}
