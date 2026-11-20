import { randomUUID } from 'node:crypto';
import { USER_REPORT_ATTACHMENT_MAX_BYTES, USER_REPORTS_PAGE_SIZE } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../../database/database';
import { runInTransaction } from '../../database/transaction';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import type { AssetStoragePort } from '../assets/asset-storage.port';
import type { ImageProcessorPort } from '../assets/image-processor.port';
import { StorageDeletionsDao } from '../assets/storage-deletions.dao';
import type { ClockPort } from '../auth/clock.port';
import type { DataCipherPort } from '../auth/data-cipher.port';
import { UsersDao } from '../auth/users.dao';
import { ReportAttachmentsDao } from './report-attachments.dao';
import { ReportAttachmentsService } from './report-attachments.service';
import { ReportRetentionService } from './report-retention.service';
import { ReportsDao } from './reports.dao';
import { reportsRoutes } from './reports.routes';
import { ReportsService } from './reports.service';

// A screenshot of a whole screen stays readable at the library image's side.
const REPORT_ATTACHMENT_MAX_SIDE = 4096;
const RETENTION_BATCH_SIZE = 500;

export type ReportsModuleOptions = Readonly<{
  db: Database;
  storage: AssetStoragePort;
  processor: ImageProcessorPort;
  /** Best-effort mail to the reporter when the report is closed. */
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  appPublicUrl: string;
}>;

export type ReportsModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the reports: DAOs, services and the HTTP edge (the reporter's routes and the backoffice
 *  queue). Needs `app.authGuards`.
 *
 *  Example: `await app.register(createReportsModule({ db, storage, processor, … }).plugin, { prefix: '/api' })` */
export function createReportsModule(options: ReportsModuleOptions): ReportsModule {
  const { db } = options;
  const reports = new ReportsService({
    transaction: (work) =>
      runInTransaction(db, (tx) =>
        work({ reports: new ReportsDao(tx), attachments: new ReportAttachmentsDao(tx) }),
      ),
    reports: new ReportsDao(db),
    attachments: new ReportAttachmentsDao(db),
    accounts: new UsersDao(db),
    notices: options.notices,
    cipher: options.cipher,
    appPublicUrl: options.appPublicUrl,
    pageSize: USER_REPORTS_PAGE_SIZE,
  });
  return { plugin: reportsRoutes({ reports, attachments: attachmentsServiceOf(options) }) };
}

function attachmentsServiceOf(options: ReportsModuleOptions): ReportAttachmentsService {
  const { db } = options;
  return new ReportAttachmentsService({
    transaction: (work) => runInTransaction(db, (tx) => work(new ReportAttachmentsDao(tx))),
    attachments: new ReportAttachmentsDao(db),
    storage: options.storage,
    processor: options.processor,
    newId: randomUUID,
    limits: { maxBytes: USER_REPORT_ATTACHMENT_MAX_BYTES, maxSide: REPORT_ATTACHMENT_MAX_SIDE },
  });
}

/** The reports' retention for the hourly cleanup: closed reports after 6 months, loose
 *  screenshots after a day; their objects leave through the bucket queue.
 *
 *  Example: `await createReportRetention(db, clock).purge()` */
export function createReportRetention(db: Database, clock: ClockPort): ReportRetentionService {
  return new ReportRetentionService({
    transaction: (work) =>
      runInTransaction(db, (tx) =>
        work({
          reports: new ReportsDao(tx),
          attachments: new ReportAttachmentsDao(tx),
          deletions: new StorageDeletionsDao(tx),
        }),
      ),
    clock,
    batchSize: RETENTION_BATCH_SIZE,
  });
}
