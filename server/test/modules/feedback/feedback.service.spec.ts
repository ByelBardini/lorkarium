import type { FeedbackRequestDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import { FeedbackService } from '../../../src/modules/feedback/feedback.service';
import { IssueTrackerNotConfiguredError } from '../../../src/modules/feedback/feedback.error';
import { MailerFake } from '../../support/account-security-fakes';
import { userPo } from '../../support/auth-factories';
import { DataCipherFake } from '../../support/auth-fakes';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';
import {
  FeedbackAttachmentsDaoFake,
  FeedbackDaoFake,
  FeedbackTransactionFake,
  IssueTrackerFake,
  feedbackAttachmentPo,
  feedbackEntryPo,
} from '../../support/feedback-fakes';
import { ReportersFake } from '../../support/reports-fakes';

const SHOT_A = '00000000-0000-4000-8000-0000000000a1';
const SHOT_B = '00000000-0000-4000-8000-0000000000a2';
const SENDERS = {
  [BIA_ID]: { username: 'bia', suspended: false },
  [CAIO_ID]: { username: 'caio', suspended: true },
};
const BUG: FeedbackRequestDto = {
  content: { kind: 'bug', steps: 'Abri a mesa', expected: 'Andar', actual: 'Voltou' },
  platform: 'browser',
  appVersion: 'Chrome 142',
};
const PUBLISH = { title: '[bug] Voltou', body: 'Obrigado @bia, veja `@caio`' };

let feedback: FeedbackDaoFake;
let attachments: FeedbackAttachmentsDaoFake;
let transaction: FeedbackTransactionFake;
let tracker: IssueTrackerFake;
let mailer: MailerFake;
let mailFailures: string[];
let service: FeedbackService;

beforeEach(() => {
  feedback = new FeedbackDaoFake(SENDERS);
  attachments = new FeedbackAttachmentsDaoFake([
    feedbackAttachmentPo({ id: SHOT_A, uploadedBy: BIA_ID }),
    feedbackAttachmentPo({ id: SHOT_B, uploadedBy: CAIO_ID }),
  ]);
  transaction = new FeedbackTransactionFake(feedback, attachments);
  tracker = new IssueTrackerFake();
  mailer = new MailerFake();
  mailFailures = [];
  service = new FeedbackService({
    transaction: (work) => transaction.run(work),
    feedback,
    attachments,
    tracker,
    accounts: new ReportersFake([userPo({ id: BIA_ID, name: 'Bia', email: 'bia@mesa.com' })]),
    notices: new SecurityNoticesService(mailer, (_error, subject) => mailFailures.push(subject)),
    cipher: new DataCipherFake(),
    appPublicUrl: 'https://app.lorkarium.test',
    pageSize: 2,
    waitingLimit: 3,
  });
});

async function waitingOf(senderId = BIA_ID): Promise<string> {
  const row = feedbackEntryPo({
    id: `00000000-0000-4000-8000-00000000e${feedback.rows.length}00`,
    senderId,
  });
  feedback.rows.push(row);
  return row.id;
}

describe('FeedbackService.submit', () => {
  it('keeps the sections with the @ of now and claims the screenshots the sender sent', async () => {
    await service.submit(BIA_ID, { ...BUG, attachmentIds: [SHOT_A] });

    expect(feedback.rows).toMatchObject([
      { senderId: BIA_ID, senderUsername: 'bia', actual: 'Voltou' },
    ]);
    expect(attachments.rows.find((row) => row.id === SHOT_A)?.feedbackId).toBe(
      feedback.rows[0]?.id,
    );
  });

  it('a suspended account is FEEDBACK_FORBIDDEN and nothing is kept', async () => {
    await expect(service.submit(CAIO_ID, BUG)).rejects.toMatchObject({
      code: 'FEEDBACK_FORBIDDEN',
    });
    expect(feedback.rows).toEqual([]);
  });

  it('the limit-th waiting entry passes and one more is FEEDBACK_OPEN_LIMIT', async () => {
    await service.submit(BIA_ID, BUG);
    await service.submit(BIA_ID, BUG);
    await service.submit(BIA_ID, BUG);

    await expect(service.submit(BIA_ID, BUG)).rejects.toMatchObject({
      code: 'FEEDBACK_OPEN_LIMIT',
    });
    expect(feedback.rows).toHaveLength(3);
  });

  it("someone else's screenshot is ATTACHMENT_NOT_FOUND and the entry is not kept", async () => {
    await expect(
      service.submit(BIA_ID, { ...BUG, attachmentIds: [SHOT_A, SHOT_B] }),
    ).rejects.toMatchObject({
      code: 'ATTACHMENT_NOT_FOUND',
    });
    expect(feedback.rows).toEqual([]);
    expect(attachments.rows.every((row) => row.feedbackId === null)).toBe(true);
  });
});

describe('FeedbackService.list', () => {
  it('a page of the queue, oldest first, each with its own screenshots and the total', async () => {
    const first = await waitingOf();
    await waitingOf(CAIO_ID);
    await waitingOf();
    await attachments.claim(first, [SHOT_A]);

    const page = await service.list({ page: 1 });

    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(page.entries.map((entry) => entry.attachments.length)).toEqual([1, 0]);
    expect((await service.list({ page: 2 })).entries).toHaveLength(1);
  });
});

describe('FeedbackService.archive', () => {
  it("deletes the entry, queues its screenshots' objects and mails nobody", async () => {
    const entryId = await waitingOf();
    await attachments.claim(entryId, [SHOT_A]);

    await service.archive(entryId);

    expect(feedback.rows).toEqual([]);
    expect(attachments.rows.map((row) => row.id)).toEqual([SHOT_B]);
    expect(transaction.deletions.committed).toEqual([`feedback/${SHOT_A}`]);
    expect(mailer.sent).toEqual([]);
  });

  it('an entry already closed is FEEDBACK_NOT_FOUND', async () => {
    await expect(service.archive(feedbackEntryPo().id)).rejects.toMatchObject({
      code: 'FEEDBACK_NOT_FOUND',
    });
  });
});

describe('FeedbackService.publish', () => {
  it("opens the issue with the admin's text, mentions made inert, then closes the entry and mails the link", async () => {
    const entryId = await waitingOf();
    await attachments.claim(entryId, [SHOT_A]);

    const published = await service.publish(entryId, PUBLISH);

    expect(published).toEqual({
      issueUrl: 'https://github.com/ByelBardini/lorkarium/issues/42',
      issueNumber: 42,
    });
    expect(tracker.created).toEqual([
      {
        title: '[bug] Voltou',
        body: 'Obrigado @<!-- -->bia, veja `@caio`',
        labels: ['bug', 'via-app'],
      },
    ]);
    expect(feedback.rows).toEqual([]);
    expect(transaction.deletions.committed).toEqual([`feedback/${SHOT_A}`]);
    const mail = mailer.to('bia@mesa.com');
    expect(mail.map((sent) => sent.subject)).toEqual(['Seu relato virou a issue #42']);
    expect(mail[0]?.text).toContain('https://github.com/ByelBardini/lorkarium/issues/42');
  });

  it('a suggestion is labelled enhancement', async () => {
    feedback.rows.push(
      feedbackEntryPo({
        kind: 'suggestion',
        problem: 'p',
        idea: 'i',
        steps: null,
        expected: null,
        actual: null,
      }),
    );

    await service.publish(feedbackEntryPo().id, PUBLISH);

    expect(tracker.created[0]?.labels).toEqual(['enhancement', 'via-app']);
  });

  it('GitHub failing is ISSUE_TRACKER_UNAVAILABLE and the entry keeps waiting with its screenshots', async () => {
    const entryId = await waitingOf();
    await attachments.claim(entryId, [SHOT_A]);
    tracker.failAsUnavailable();

    await expect(service.publish(entryId, PUBLISH)).rejects.toMatchObject({
      code: 'ISSUE_TRACKER_UNAVAILABLE',
      message: expect.stringContaining(entryId),
    });
    expect(feedback.rows.map((row) => row.id)).toEqual([entryId]);
    expect(transaction.deletions.committed).toEqual([]);
    expect(mailer.sent).toEqual([]);
  });

  it('a server without the tracker set up is ISSUE_TRACKER_NOT_CONFIGURED', async () => {
    const entryId = await waitingOf();
    tracker.failure = new IssueTrackerNotConfiguredError();

    await expect(service.publish(entryId, PUBLISH)).rejects.toMatchObject({
      code: 'ISSUE_TRACKER_NOT_CONFIGURED',
    });
  });

  it('an entry already closed is FEEDBACK_NOT_FOUND and GitHub is never asked', async () => {
    await expect(service.publish(feedbackEntryPo().id, PUBLISH)).rejects.toMatchObject({
      code: 'FEEDBACK_NOT_FOUND',
    });
    expect(tracker.created).toEqual([]);
  });

  it('a mail that fails does not undo the publication', async () => {
    const entryId = await waitingOf();
    mailer.failWith = new Error('SMTP down');

    await expect(service.publish(entryId, PUBLISH)).resolves.toMatchObject({ issueNumber: 42 });
    expect(feedback.rows).toEqual([]);
    expect(mailFailures).toEqual(['Seu relato virou a issue #42']);
  });

  it('an issue opened whose entry could not be closed carries the issue link in the error', async () => {
    const entryId = await waitingOf();
    feedback.deleteById = () => Promise.reject(new Error('connection lost'));

    await expect(service.publish(entryId, PUBLISH)).rejects.toThrow(
      `issue https://github.com/ByelBardini/lorkarium/issues/42 was opened but feedback ${entryId} stayed in the queue`,
    );
  });
});
