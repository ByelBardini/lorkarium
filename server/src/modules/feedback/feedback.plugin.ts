import { randomUUID } from 'node:crypto';
import {
  FEEDBACK_OPEN_LIMIT,
  FEEDBACK_PAGE_SIZE,
  SCREENSHOT_MAX_BYTES,
} from '@lorkarium/contracts';
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
import { FeedbackAttachmentsDao } from './feedback-attachments.dao';
import { FeedbackAttachmentsService } from './feedback-attachments.service';
import { FeedbackRetentionService } from './feedback-retention.service';
import { FeedbackDao } from './feedback.dao';
import { feedbackRoutes } from './feedback.routes';
import { FeedbackService } from './feedback.service';
import type { IssueTrackerPort } from './issue-tracker.port';

// A screenshot of a whole screen stays readable at the library image's side.
const FEEDBACK_ATTACHMENT_MAX_SIDE = 4096;
const RETENTION_BATCH_SIZE = 500;

export type FeedbackModuleOptions = Readonly<{
  db: Database;
  storage: AssetStoragePort;
  processor: ImageProcessorPort;
  /** Where a published entry becomes an issue (the GitHub App, or the unconfigured one). */
  tracker: IssueTrackerPort;
  /** Best-effort mail to the sender with the issue's link. */
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  appPublicUrl: string;
}>;

export type FeedbackModule = Readonly<{ plugin: (app: FastifyInstance) => Promise<void> }>;

/** Wires the feedback: DAOs, services and the HTTP edge (the sender's routes and the backoffice
 *  queue). Needs `app.authGuards`.
 *
 *  Example: `await app.register(createFeedbackModule({ db, storage, processor, tracker, … }).plugin, { prefix: '/api' })` */
export function createFeedbackModule(options: FeedbackModuleOptions): FeedbackModule {
  const { db } = options;
  const feedback = new FeedbackService({
    transaction: (work) =>
      runInTransaction(db, (tx) =>
        work({
          feedback: new FeedbackDao(tx),
          attachments: new FeedbackAttachmentsDao(tx),
          deletions: new StorageDeletionsDao(tx),
        }),
      ),
    feedback: new FeedbackDao(db),
    attachments: new FeedbackAttachmentsDao(db),
    tracker: options.tracker,
    accounts: new UsersDao(db),
    notices: options.notices,
    cipher: options.cipher,
    appPublicUrl: options.appPublicUrl,
    pageSize: FEEDBACK_PAGE_SIZE,
    waitingLimit: FEEDBACK_OPEN_LIMIT,
  });
  return { plugin: feedbackRoutes({ feedback, attachments: attachmentsServiceOf(options) }) };
}

function attachmentsServiceOf(options: FeedbackModuleOptions): FeedbackAttachmentsService {
  const { db } = options;
  return new FeedbackAttachmentsService({
    transaction: (work) => runInTransaction(db, (tx) => work(new FeedbackAttachmentsDao(tx))),
    attachments: new FeedbackAttachmentsDao(db),
    storage: options.storage,
    processor: options.processor,
    newId: randomUUID,
    limits: { maxBytes: SCREENSHOT_MAX_BYTES, maxSide: FEEDBACK_ATTACHMENT_MAX_SIDE },
  });
}

/** The feedback's retention for the hourly cleanup: loose screenshots after a day, their objects
 *  through the bucket queue.
 *
 *  Example: `await createFeedbackRetention(db, clock).purge()` */
export function createFeedbackRetention(db: Database, clock: ClockPort): FeedbackRetentionService {
  return new FeedbackRetentionService({
    transaction: (work) =>
      runInTransaction(db, (tx) =>
        work({
          attachments: new FeedbackAttachmentsDao(tx),
          deletions: new StorageDeletionsDao(tx),
        }),
      ),
    clock,
    batchSize: RETENTION_BATCH_SIZE,
  });
}
