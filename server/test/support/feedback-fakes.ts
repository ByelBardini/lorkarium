import type { FeedbackAttachmentsDao } from '../../src/modules/feedback/feedback-attachments.dao';
import type {
  FeedbackAttachmentPo,
  NewFeedbackAttachmentPo,
} from '../../src/modules/feedback/feedback-attachments.po';
import type {
  FeedbackEntryPo,
  NewFeedbackEntryPo,
} from '../../src/modules/feedback/feedback-entries.po';
import type {
  FeedbackDao,
  FeedbackPage,
  FeedbackPageQuery,
  FeedbackSender,
} from '../../src/modules/feedback/feedback.dao';
import type {
  FeedbackRetentionOutcome,
  FeedbackRetentionService,
} from '../../src/modules/feedback/feedback-retention.service';
import type { FeedbackWriteScope } from '../../src/modules/feedback/feedback.service';
import { IssueTrackerUnavailableError } from '../../src/modules/feedback/feedback.error';
import type {
  CreatedIssue,
  IssueTrackerPort,
  NewIssue,
} from '../../src/modules/feedback/issue-tracker.port';
import { StagedDeletionQueueFake } from './storage-deletions-fakes';

export const FEEDBACK_NOW = new Date('2026-11-19T12:00:00Z');

/** One waiting bug of `senderId`, created at `FEEDBACK_NOW` unless told.
 *
 *  Example: `feedbackEntryPo({ id: entryId, senderId: biaId })` */
export function feedbackEntryPo(overrides: Partial<FeedbackEntryPo> = {}): FeedbackEntryPo {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    senderId: '00000000-0000-4000-8000-000000000b1a',
    senderUsername: 'bia',
    kind: 'bug',
    steps: '1. Abri a mesa\n2. Arrastei o token',
    expected: 'O token andar',
    actual: 'O token voltou para a casa de antes',
    problem: null,
    idea: null,
    alternatives: null,
    platform: 'browser',
    appVersion: 'Chrome 142',
    createdAt: FEEDBACK_NOW,
    ...overrides,
  };
}

/** One screenshot row, loose and sent by `uploadedBy`, created at `FEEDBACK_NOW` unless told. */
export function feedbackAttachmentPo(
  overrides: Partial<FeedbackAttachmentPo> = {},
): FeedbackAttachmentPo {
  const id = overrides.id ?? '00000000-0000-4000-8000-0000000000f1';
  return {
    id,
    feedbackId: null,
    uploadedBy: '00000000-0000-4000-8000-000000000b1a',
    storageKey: `feedback/${id}`,
    mimeType: 'image/webp',
    sizeBytes: 900,
    width: 800,
    height: 600,
    createdAt: FEEDBACK_NOW,
    ...overrides,
  };
}

type FakeFeedbackDao = Pick<
  FeedbackDao,
  'lockSender' | 'waitingCountOf' | 'insert' | 'pageOf' | 'lockById' | 'deleteById'
>;

/** The `feedback_entries` table in memory; `senders` gives each id its @ and suspension (an id
 *  missing there does not exist). */
export class FeedbackDaoFake implements FakeFeedbackDao {
  readonly rows: FeedbackEntryPo[] = [];

  constructor(private readonly senders: Readonly<Record<string, FeedbackSender>> = {}) {}

  async lockSender(userId: string): Promise<FeedbackSender | undefined> {
    return this.senders[userId];
  }

  async waitingCountOf(senderId: string): Promise<number> {
    return this.rows.filter((row) => row.senderId === senderId).length;
  }

  async insert(entry: NewFeedbackEntryPo): Promise<string> {
    const id = `00000000-0000-4000-8000-${String(this.rows.length + 1).padStart(12, '0')}`;
    this.rows.push(feedbackEntryPo({ ...nullSections(), ...entry, id }));
    return id;
  }

  async pageOf(query: FeedbackPageQuery): Promise<FeedbackPage> {
    return {
      rows: this.rows.slice(query.offset, query.offset + query.limit),
      total: this.rows.length,
    };
  }

  async lockById(id: string): Promise<FeedbackEntryPo | undefined> {
    return this.rows.find((row) => row.id === id);
  }

  async deleteById(id: string): Promise<void> {
    const kept = this.rows.filter((row) => row.id !== id);
    this.rows.splice(0, this.rows.length, ...kept);
  }
}

function nullSections(): Partial<FeedbackEntryPo> {
  return {
    steps: null,
    expected: null,
    actual: null,
    problem: null,
    idea: null,
    alternatives: null,
  };
}

type FakeAttachmentsDao = Pick<
  FeedbackAttachmentsDao,
  | 'insert'
  | 'lockLooseOf'
  | 'claim'
  | 'listOf'
  | 'findInEntry'
  | 'storageKeysOf'
  | 'deleteLooseBefore'
>;

/** The `feedback_attachments` table in memory; deleting an entry drops its rows (the cascade)
 *  through `dropEntry`. */
export class FeedbackAttachmentsDaoFake implements FakeAttachmentsDao {
  readonly rows: FeedbackAttachmentPo[];

  constructor(rows: FeedbackAttachmentPo[] = []) {
    this.rows = [...rows];
  }

  async insert(attachment: NewFeedbackAttachmentPo): Promise<FeedbackAttachmentPo> {
    const row = feedbackAttachmentPo({ ...attachment, feedbackId: attachment.feedbackId ?? null });
    this.rows.push(row);
    return row;
  }

  async lockLooseOf(uploaderId: string, ids: readonly string[]): Promise<string[]> {
    return this.rows
      .filter((row) => ids.includes(row.id) && row.uploadedBy === uploaderId && !row.feedbackId)
      .map((row) => row.id);
  }

  async claim(feedbackId: string, ids: readonly string[]): Promise<void> {
    for (const row of this.rows) if (ids.includes(row.id)) row.feedbackId = feedbackId;
  }

  async listOf(feedbackIds: readonly string[]): Promise<FeedbackAttachmentPo[]> {
    return this.rows.filter(
      (row) => row.feedbackId !== null && feedbackIds.includes(row.feedbackId),
    );
  }

  async findInEntry(feedbackId: string, id: string): Promise<FeedbackAttachmentPo | undefined> {
    return this.rows.find((row) => row.id === id && row.feedbackId === feedbackId);
  }

  async storageKeysOf(feedbackId: string): Promise<string[]> {
    return (await this.listOf([feedbackId])).map((row) => row.storageKey);
  }

  async deleteLooseBefore(cut: Date, limit: number): Promise<string[]> {
    const gone = this.rows
      .filter((row) => row.feedbackId === null && row.createdAt < cut)
      .slice(0, limit);
    this.splice(this.rows.filter((row) => !gone.includes(row)));
    return gone.map((row) => row.storageKey);
  }

  dropEntry(feedbackId: string): void {
    this.splice(this.rows.filter((row) => row.feedbackId !== feedbackId));
  }

  private splice(kept: FeedbackAttachmentPo[]): void {
    this.rows.splice(0, this.rows.length, ...kept);
  }
}

/** Runs the work over the fakes as one transaction: a throw puts every row back, and the queue's
 *  keys reach `deletions.committed` only when it resolves. Deleting an entry takes its shots. */
export class FeedbackTransactionFake {
  opened = 0;
  readonly deletions = new StagedDeletionQueueFake();

  constructor(
    private readonly feedback: FeedbackDaoFake,
    private readonly attachments: FeedbackAttachmentsDaoFake,
  ) {}

  run<T>(work: (scope: FeedbackWriteScope) => Promise<T>): Promise<T> {
    this.opened += 1;
    const entries = this.feedback.rows.map((row) => ({ ...row }));
    const shots = this.attachments.rows.map((row) => ({ ...row }));
    return this.deletions
      .around(() => work(this.scope()))
      .catch((error: unknown) => {
        this.feedback.rows.splice(0, this.feedback.rows.length, ...entries);
        this.attachments.rows.splice(0, this.attachments.rows.length, ...shots);
        throw error;
      });
  }

  private scope(): FeedbackWriteScope {
    const { feedback, attachments, deletions } = this;
    const deleteById = async (id: string): Promise<void> => {
      await feedback.deleteById(id);
      attachments.dropEntry(id);
    };
    return {
      feedback: {
        lockSender: (id) => feedback.lockSender(id),
        waitingCountOf: (id) => feedback.waitingCountOf(id),
        insert: (row) => feedback.insert(row),
        lockById: (id) => feedback.lockById(id),
        deleteById,
      },
      attachments,
      deletions,
    };
  }
}

/** Opens issues numbered from 42 and keeps each one asked; `failure` makes the next ones throw. */
export class IssueTrackerFake implements IssueTrackerPort {
  readonly created: NewIssue[] = [];
  failure: Error | null = null;
  private next = 42;

  async create(issue: NewIssue): Promise<CreatedIssue> {
    if (this.failure) throw this.failure;
    this.created.push(issue);
    const number = this.next++;
    return { url: `https://github.com/ByelBardini/lorkarium/issues/${number}`, number };
  }

  /** The next ones fail as GitHub answering 502. */
  failAsUnavailable(): void {
    this.failure = new IssueTrackerUnavailableError('GitHub answered 502');
  }
}

/** The feedback's retention as the hourly cleanup sees it: counts the purges, or fails. */
export class FeedbackRetentionFake implements Pick<FeedbackRetentionService, 'purge'> {
  purges = 0;
  failure: Error | null = null;

  async purge(): Promise<FeedbackRetentionOutcome> {
    if (this.failure) throw this.failure;
    this.purges += 1;
    return { looseAttachments: 0 };
  }
}

/** The feedback screenshot keys of each account, as the account deletion reads them. */
export class FeedbackShotKeysFake implements Pick<FeedbackAttachmentsDao, 'storageKeysOfUploader'> {
  readonly keys = new Map<string, string[]>();

  async storageKeysOfUploader(uploaderId: string): Promise<string[]> {
    return this.keys.get(uploaderId) ?? [];
  }
}
