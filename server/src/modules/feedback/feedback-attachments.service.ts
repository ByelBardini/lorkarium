import type { ScreenshotDto } from '@lorkarium/contracts';
import type { AssetStoragePort, StoredObject } from '../assets/asset-storage.port';
import type { ImageProcessorPort } from '../assets/image-processor.port';
import {
  keptScreenshotOf,
  screenshotDtoOf,
  type ScreenshotLimits,
  type ScreenshotRefusals,
} from '../assets/screenshot-upload';
import type { FeedbackAttachmentsDao } from './feedback-attachments.dao';
import type { FeedbackAttachmentPo } from './feedback-attachments.po';
import { FeedbackAttachmentTooLargeError, FeedbackError } from './feedback.error';
import { toNewFeedbackAttachmentPo } from './feedback.mapper';

const REFUSALS: ScreenshotRefusals = {
  tooLarge: (maxBytes, sizeBytes) => new FeedbackAttachmentTooLargeError(maxBytes, sizeBytes),
  unsupported: (detail) => new FeedbackError('UNSUPPORTED_IMAGE', detail),
};

export type FeedbackAttachmentWriteRunner = <T>(
  work: (attachments: Pick<FeedbackAttachmentsDao, 'insert'>) => Promise<T>,
) => Promise<T>;

export type FeedbackAttachmentsServiceDeps = Readonly<{
  transaction: FeedbackAttachmentWriteRunner;
  attachments: Pick<FeedbackAttachmentsDao, 'findInEntry'>;
  storage: Pick<AssetStoragePort, 'put' | 'open'>;
  processor: ImageProcessorPort;
  newId: () => string;
  limits: ScreenshotLimits;
}>;

/** A screenshot as the backoffice reads it: the bytes and the kept type. */
export type OpenedFeedbackAttachment = StoredObject &
  Readonly<{ mimeType: FeedbackAttachmentPo['mimeType'] }>;

/** The screenshots of the feedback entries: the sender sends each one alone before the entry, and
 *  only the backoffice reads them back. They never go to GitHub.
 *
 *  Example: `const { id } = await attachments.upload(biaId, bytes)` */
export class FeedbackAttachmentsService {
  constructor(private readonly deps: FeedbackAttachmentsServiceDeps) {}

  /** Normalized before it is kept; the row and the object are written together, so a failed put
   *  leaves no row.
   *
   *  Example: `await attachments.upload(biaId, png) // { id, mimeType: 'image/webp', … }` */
  async upload(uploaderId: string, bytes: Uint8Array): Promise<ScreenshotDto> {
    const { processor, limits } = this.deps;
    const kept = await keptScreenshotOf(bytes, { processor, limits }, REFUSALS);
    const row = toNewFeedbackAttachmentPo({ attachmentId: this.deps.newId(), uploaderId, kept });
    const inserted = await this.deps.transaction(async (attachments) => {
      const written = await attachments.insert(row);
      await this.deps.storage.put(written.storageKey, kept.image.bytes, kept.mimeType);
      return written;
    });
    return screenshotDtoOf(inserted);
  }

  /** A screenshot of that entry; one of another entry, a loose one and an object gone from the
   *  bucket all answer the same ATTACHMENT_NOT_FOUND.
   *
   *  Example: `await attachments.open(entryId, shotId) // { body, size, contentType, mimeType }` */
  async open(feedbackId: string, attachmentId: string): Promise<OpenedFeedbackAttachment> {
    const row = await this.deps.attachments.findInEntry(feedbackId, attachmentId);
    const stored = row ? await this.deps.storage.open(row.storageKey) : null;
    if (row && stored) return { ...stored, mimeType: row.mimeType };
    throw new FeedbackError(
      'ATTACHMENT_NOT_FOUND',
      `screenshot ${attachmentId} of feedback ${feedbackId} not found: expected one kept with it`,
    );
  }
}
