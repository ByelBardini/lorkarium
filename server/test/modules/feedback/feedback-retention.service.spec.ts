import { beforeEach, describe, expect, it } from 'vitest';
import { FeedbackRetentionService } from '../../../src/modules/feedback/feedback-retention.service';
import { ClockFake } from '../../support/auth-fakes';
import {
  FEEDBACK_NOW,
  FeedbackAttachmentsDaoFake,
  feedbackAttachmentPo,
} from '../../support/feedback-fakes';
import { StagedDeletionQueueFake } from '../../support/storage-deletions-fakes';

const HOUR = 60 * 60 * 1000;
const ago = (ms: number): Date => new Date(FEEDBACK_NOW.getTime() - ms);
const id = (n: number): string => `00000000-0000-4000-8000-00000000000${n}`;

let attachments: FeedbackAttachmentsDaoFake;
let deletions: StagedDeletionQueueFake;

function retention(batchSize = 500): FeedbackRetentionService {
  return new FeedbackRetentionService({
    transaction: (work) => deletions.around(() => work({ attachments, deletions })),
    clock: new ClockFake(FEEDBACK_NOW),
    batchSize,
  });
}

beforeEach(() => {
  deletions = new StagedDeletionQueueFake();
  attachments = new FeedbackAttachmentsDaoFake([
    feedbackAttachmentPo({ id: id(1), createdAt: ago(25 * HOUR) }),
    feedbackAttachmentPo({ id: id(2), createdAt: ago(23 * HOUR) }),
    feedbackAttachmentPo({ id: id(3), createdAt: ago(48 * HOUR), feedbackId: id(9) }),
  ]);
});

describe('FeedbackRetentionService', () => {
  it('a loose screenshot past a day leaves with its key queued; a younger one and a claimed one stay', async () => {
    expect(await retention().purge()).toEqual({ looseAttachments: 1 });

    expect(attachments.rows.map((row) => row.id)).toEqual([id(2), id(3)]);
    expect(deletions.committed).toEqual([`feedback/${id(1)}`]);
  });

  it('a full batch asks for another one until the table is clean', async () => {
    attachments.rows.push(feedbackAttachmentPo({ id: id(4), createdAt: ago(30 * HOUR) }));

    expect(await retention(1).purge()).toEqual({ looseAttachments: 2 });
    expect(deletions.committed).toEqual([`feedback/${id(1)}`, `feedback/${id(4)}`]);
  });
});
