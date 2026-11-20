import type {
  FeedbackPageDto,
  FeedbackRequestDto,
  ListFeedbackQueryDto,
  PublishFeedbackRequestDto,
  PublishFeedbackResponseDto,
} from '@lorkarium/contracts';
import { recipientOf } from '../account-security/security-mail.mapper';
import type { SecurityNoticesService } from '../account-security/security-notices.service';
import type { StorageDeletionsDao } from '../assets/storage-deletions.dao';
import type { DataCipherPort } from '../auth/data-cipher.port';
import type { UsersDao } from '../auth/users.dao';
import type { FeedbackAttachmentsDao } from './feedback-attachments.dao';
import type { FeedbackAttachmentPo } from './feedback-attachments.po';
import type { FeedbackEntryPo } from './feedback-entries.po';
import { feedbackPublishedMail } from './feedback-mail.mapper';
import { FeedbackBo } from './feedback.bo';
import type { FeedbackDao } from './feedback.dao';
import {
  FeedbackError,
  IssueTrackerNotConfiguredError,
  IssueTrackerUnavailableError,
} from './feedback.error';
import { issueLabelsOf, toFeedbackEntryDto, toNewFeedbackEntryPo } from './feedback.mapper';
import type { CreatedIssue, IssueTrackerPort } from './issue-tracker.port';

/** What sending and closing an entry read and write, in one transaction. */
export type FeedbackWriteScope = Readonly<{
  feedback: Pick<
    FeedbackDao,
    'lockSender' | 'waitingCountOf' | 'insert' | 'lockById' | 'deleteById'
  >;
  attachments: Pick<FeedbackAttachmentsDao, 'lockLooseOf' | 'claim' | 'storageKeysOf'>;
  deletions: Pick<StorageDeletionsDao, 'enqueue'>;
}>;

export type FeedbackTransactionRunner = <T>(
  work: (scope: FeedbackWriteScope) => Promise<T>,
) => Promise<T>;

export type FeedbackServiceDeps = Readonly<{
  transaction: FeedbackTransactionRunner;
  feedback: Pick<FeedbackDao, 'pageOf'>;
  attachments: Pick<FeedbackAttachmentsDao, 'listOf'>;
  tracker: IssueTrackerPort;
  /** The sender, read to send the issue's link. */
  accounts: Pick<UsersDao, 'findById'>;
  notices: Pick<SecurityNoticesService, 'send'>;
  cipher: DataCipherPort;
  appPublicUrl: string;
  /** `FEEDBACK_PAGE_SIZE` and `FEEDBACK_OPEN_LIMIT`, passed in. */
  pageSize: number;
  waitingLimit: number;
}>;

/** Bug reports and suggestions from the session's account, and the backoffice queue that
 *  publishes them as GitHub issues or archives them. Closing deletes the entry either way.
 *
 *  Example: `await service.submit(biaId, { content: { kind: 'bug', … }, platform: 'browser', appVersion })` */
export class FeedbackService {
  constructor(private readonly deps: FeedbackServiceDeps) {}

  /** Up to `waitingLimit` waiting per account, with the screenshots the sender sent first.
   *
   *  Example: `await service.submit(biaId, request) // throws FEEDBACK_OPEN_LIMIT past 10` */
  async submit(senderId: string, request: FeedbackRequestDto): Promise<void> {
    const attachmentIds = request.attachmentIds ?? [];
    await this.deps.transaction(async (scope) => {
      const sender = FeedbackBo.requireActiveSender(
        await scope.feedback.lockSender(senderId),
        senderId,
      );
      const waiting = await scope.feedback.waitingCountOf(senderId);
      FeedbackBo.requireWithinWaitingLimit(waiting, this.deps.waitingLimit, senderId);
      const loose = await scope.attachments.lockLooseOf(senderId, attachmentIds);
      FeedbackBo.requireClaimable(attachmentIds, loose);
      const entryId = await scope.feedback.insert(
        toNewFeedbackEntryPo(senderId, sender.username, request),
      );
      await scope.attachments.claim(entryId, attachmentIds);
    });
  }

  /** Example: `await service.list({ page: 1 }) // { entries, page, pageSize, total }` */
  async list(query: ListFeedbackQueryDto): Promise<FeedbackPageDto> {
    const { pageSize } = this.deps;
    const found = await this.deps.feedback.pageOf({
      limit: pageSize,
      offset: (query.page - 1) * pageSize,
    });
    const attachments = await this.deps.attachments.listOf(found.rows.map((row) => row.id));
    const entries = found.rows.map((row) =>
      toFeedbackEntryDto(row, attachmentsOf(row, attachments)),
    );
    return { entries, page: query.page, pageSize, total: found.total };
  }

  /** Deletes the entry and queues its screenshots' objects; the sender is not told.
   *
   *  Example: `await service.archive(entryId) // throws FEEDBACK_NOT_FOUND if already closed` */
  async archive(entryId: string): Promise<void> {
    await this.deps.transaction(async (scope) => {
      FeedbackBo.requireWaiting(await scope.feedback.lockById(entryId), entryId);
      await closeEntry(scope, entryId);
    });
  }

  /** Opens the issue with the admin's text (mentions made inert), then deletes the entry in the
   *  same transaction and mails the link to the sender (best-effort). A tracker that fails
   *  leaves the entry waiting.
   *
   *  Example: `await service.publish(entryId, { title, body }) // { issueUrl, issueNumber: 42 }` */
  async publish(
    entryId: string,
    request: PublishFeedbackRequestDto,
  ): Promise<PublishFeedbackResponseDto> {
    const opened: { issue: CreatedIssue | null } = { issue: null };
    const entry = await this.deps
      .transaction(async (scope) => {
        const waiting = FeedbackBo.requireWaiting(await scope.feedback.lockById(entryId), entryId);
        opened.issue = await this.openIssue(waiting, request);
        await closeEntry(scope, entryId);
        return waiting;
      })
      .catch((error: unknown) => orphanAware(error, opened.issue, entryId));
    const issue = requireOpened(opened.issue, entryId);
    await this.tellSender(entry, issue);
    return { issueUrl: issue.url, issueNumber: issue.number };
  }

  private async openIssue(
    entry: FeedbackEntryPo,
    request: PublishFeedbackRequestDto,
  ): Promise<CreatedIssue> {
    const body = FeedbackBo.inertMentionsOf(request.body);
    const issue = { title: request.title, body, labels: issueLabelsOf(entry.kind) };
    try {
      return await this.deps.tracker.create(issue);
    } catch (error) {
      throw trackerRefusalOf(error, entry.id);
    }
  }

  // A sender whose account is gone took the entry with it (cascade), so the row always has one;
  // a lookup that finds nothing just sends nothing.
  private async tellSender(entry: FeedbackEntryPo, issue: CreatedIssue): Promise<void> {
    const row = await this.deps.accounts.findById(entry.senderId);
    if (!row) return;
    const person = recipientOf(row, this.deps.cipher);
    const mail = feedbackPublishedMail({
      person,
      sentAt: entry.createdAt,
      issueUrl: issue.url,
      issueNumber: issue.number,
      publicUrl: this.deps.appPublicUrl,
    });
    await this.deps.notices.send(mail);
  }
}

async function closeEntry(scope: FeedbackWriteScope, entryId: string): Promise<void> {
  await scope.deletions.enqueue(await scope.attachments.storageKeysOf(entryId));
  await scope.feedback.deleteById(entryId);
}

function trackerRefusalOf(error: unknown, entryId: string): Error {
  if (error instanceof IssueTrackerNotConfiguredError) {
    return new FeedbackError(
      'ISSUE_TRACKER_NOT_CONFIGURED',
      `${error.message} (feedback ${entryId})`,
    );
  }
  if (error instanceof IssueTrackerUnavailableError) {
    return new FeedbackError('ISSUE_TRACKER_UNAVAILABLE', `${error.message} (feedback ${entryId})`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

// The issue exists but the entry could not be deleted: the message carries its link to the log,
// so the admin archives the entry instead of publishing it twice.
function orphanAware(error: unknown, issue: CreatedIssue | null, entryId: string): never {
  if (issue === null) throw error;
  throw new Error(`issue ${issue.url} was opened but feedback ${entryId} stayed in the queue`, {
    cause: error,
  });
}

function requireOpened(issue: CreatedIssue | null, entryId: string): CreatedIssue {
  if (issue !== null) return issue;
  throw new Error(`feedback ${entryId} was closed without an issue: expected one opened`);
}

function attachmentsOf(
  row: FeedbackEntryPo,
  attachments: readonly FeedbackAttachmentPo[],
): FeedbackAttachmentPo[] {
  return attachments.filter((attachment) => attachment.feedbackId === row.id);
}
