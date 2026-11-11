import { readEnv } from './config/env';
import { readProcessEnv } from './config/process-env';
import { createDatabase } from './database/database';
import { S3AssetStorage } from './infrastructure/asset-storage/s3-asset-storage';
import { SharpImageProcessor } from './infrastructure/image-processor/sharp-image-processor';
import { AssetsDao } from './modules/assets/assets.dao';
import {
  RecompressImagesService,
  type RecompressReport,
} from './modules/assets/recompress-images.service';

const env = readEnv(readProcessEnv());
const database = createDatabase(env.databaseUrl, env.database);
const storage = new S3AssetStorage(env.storage);
const flags = new Set(process.argv.slice(2));

function reportText(report: RecompressReport, dryRun: boolean): string {
  const verb = dryRun ? 'converteria' : 'convertidas';
  const saved = report.bytesBefore - report.bytesAfter;
  const lines = [
    `imagens PNG examinadas: ${report.examined}`,
    `${verb}: ${report.converted} (${report.bytesBefore} → ${report.bytesAfter} bytes, ${saved} a menos)`,
    `puladas: ${report.skipped}`,
    `falharam: ${report.failed.length}`,
    ...report.failed.map((failure) => `  ${failure.assetId}: ${failure.reason}`),
  ];
  return `${lines.join('\n')}\n`;
}

// `pnpm db:recompress-images [--dry-run] [--yes]`: the opaque PNG backgrounds, maps and library
// images become WebP under the same key; running it again converts nothing.
try {
  const dryRun = flags.has('--dry-run');
  const service = new RecompressImagesService({
    assets: new AssetsDao(database.db),
    storage,
    processor: new SharpImageProcessor(),
  });
  const report = await service.run({ dryRun, nodeEnv: env.nodeEnv, confirmed: flags.has('--yes') });
  process.stdout.write(reportText(report, dryRun));
  if (report.failed.length > 0) process.exitCode = 1;
} finally {
  storage.destroy();
  await database.close();
}
