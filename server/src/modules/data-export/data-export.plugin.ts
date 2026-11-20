import { DATA_EXPORT_INTERVAL_HOURS, REPUTATION_MIN_VOTES } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import type { AssetStoragePort } from '../assets/asset-storage.port';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import { ReputationDao } from '../reputation/reputation.dao';
import { AccountExportDao } from './account-export.dao';
import type { ArchiveWriterPort } from './archive-writer.port';
import { CampaignExportDao } from './campaign-export.dao';
import { DataExportBo } from './data-export.bo';
import { dataExportRoutes } from './data-export.routes';
import { DataExportService } from './data-export.service';
import { ModerationExportDao } from './moderation-export.dao';

export type DataExportModuleOptions = Readonly<{
  db: Database;
  storage: Pick<AssetStoragePort, 'open'>;
  archives: ArchiveWriterPort;
  cipher: DataCipherPort;
  clock: ClockPort;
}>;

export type DataExportModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

const HOUR_MS = 60 * 60 * 1000;

/** Wires the export of an account's data: the three read DAOs, the rule of one per day, the
 *  service and the HTTP edge. Needs `app.authGuards`; the plugin's log takes the bad images.
 *
 *  Example: `await app.register(createDataExportModule(options).plugin, { prefix: '/api' })` */
export function createDataExportModule(options: DataExportModuleOptions): DataExportModule {
  const { db, storage, archives, cipher, clock } = options;
  return {
    plugin: async (app: FastifyInstance): Promise<void> => {
      const service = new DataExportService({
        accounts: new AccountExportDao(db),
        tables: new CampaignExportDao(db),
        moderation: new ModerationExportDao(db),
        reputation: new ReputationDao(db),
        storage,
        archives,
        cipher,
        clock,
        rule: new DataExportBo(DATA_EXPORT_INTERVAL_HOURS * HOUR_MS),
        minVotes: REPUTATION_MIN_VOTES,
        log: app.log,
      });
      await app.register(dataExportRoutes(service));
    },
  };
}
