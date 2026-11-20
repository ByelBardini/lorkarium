import { beforeEach, describe, expect, it } from 'vitest';
import { ReportRetentionService } from '../../../src/modules/reports/report-retention.service';
import { ClockFake } from '../../support/auth-fakes';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';
import {
  REPORTS_NOW,
  ReportAttachmentsDaoFake,
  ReportsDaoFake,
  ReportsTransactionFake,
  reportAttachmentPo,
} from '../../support/reports-fakes';
import { StorageDeletionQueueFake } from '../../support/storage-deletions-fakes';

const ACCOUNTS = {
  [BIA_ID]: { username: 'bia', name: 'Bia', suspended: false },
  [CAIO_ID]: { username: 'caio', name: 'Caio', suspended: false },
};
// REPORTS_NOW is 19/11/2026 12:00 UTC: the closed cut is 19/05/2026 12:00 and the loose one 18/11.
const SEVEN_MONTHS_AGO = new Date('2026-04-19T12:00:00Z');
const FIVE_MONTHS_AGO = new Date('2026-06-19T12:00:00Z');
const TWO_DAYS_AGO = new Date('2026-11-17T12:00:00Z');
const AN_HOUR_AGO = new Date('2026-11-19T11:00:00Z');

let reports: ReportsDaoFake;
let attachments: ReportAttachmentsDaoFake;
let deletions: StorageDeletionQueueFake;

function retentionOver(batchSize = 500): ReportRetentionService {
  const transaction = new ReportsTransactionFake(reports, attachments);
  return new ReportRetentionService({
    transaction: (work) => transaction.run(() => work({ reports, attachments, deletions })),
    clock: new ClockFake(REPORTS_NOW),
    batchSize,
  });
}

async function reportClosedAt(resolvedAt: Date, reporterId = BIA_ID): Promise<string> {
  const targetId = reporterId === BIA_ID ? CAIO_ID : BIA_ID;
  const id = await reports.insertOpen({
    reporterId,
    targetId,
    reporterUsername: 'x',
    targetUsername: 'y',
    targetName: 'Y',
    reason: 'spam',
  });
  Object.assign(
    reports.rows.find((row) => row.id === id)!,
    { status: 'resolved', resolvedAt },
  );
  return id!;
}

beforeEach(() => {
  reports = new ReportsDaoFake(ACCOUNTS);
  attachments = new ReportAttachmentsDaoFake();
  deletions = new StorageDeletionQueueFake();
});

describe('ReportRetentionService.purge', () => {
  it('a report closed over 6 months ago leaves and its screenshots go to the bucket queue', async () => {
    const old = await reportClosedAt(SEVEN_MONTHS_AGO);
    const recent = await reportClosedAt(FIVE_MONTHS_AGO, CAIO_ID);
    attachments.rows.push(
      reportAttachmentPo({ id: '00000000-0000-4000-8000-0000000000e1', reportId: old }),
    );

    const outcome = await retentionOver().purge();

    expect(outcome.reports).toBe(1);
    expect(reports.rows.map((row) => row.id)).toEqual([recent]);
    expect(deletions.keys()).toEqual(['reports/00000000-0000-4000-8000-0000000000e1']);
  });

  it('an open report never leaves, however old', async () => {
    reports.createdAt = SEVEN_MONTHS_AGO;
    await reports.insertOpen({
      reporterId: BIA_ID,
      targetId: CAIO_ID,
      reporterUsername: 'bia',
      targetUsername: 'caio',
      targetName: 'Caio',
      reason: 'spam',
    });

    await retentionOver().purge();

    expect(reports.rows).toHaveLength(1);
  });

  it('a loose screenshot over a day old leaves through the queue; a newer one stays', async () => {
    const old = reportAttachmentPo({
      id: '00000000-0000-4000-8000-0000000000e2',
      createdAt: TWO_DAYS_AGO,
    });
    const fresh = reportAttachmentPo({
      id: '00000000-0000-4000-8000-0000000000e3',
      createdAt: AN_HOUR_AGO,
    });
    attachments.rows.push(old, fresh);

    const outcome = await retentionOver().purge();

    expect(outcome.looseAttachments).toBe(1);
    expect(attachments.rows.map((row) => row.id)).toEqual([fresh.id]);
    expect(deletions.keys()).toEqual([old.storageKey]);
  });

  it('a full batch asks for another until nothing is left', async () => {
    await reportClosedAt(SEVEN_MONTHS_AGO);
    await reportClosedAt(SEVEN_MONTHS_AGO, CAIO_ID);
    await reportClosedAt(SEVEN_MONTHS_AGO);

    const outcome = await retentionOver(2).purge();

    expect(outcome.reports).toBe(3);
    expect(reports.rows).toEqual([]);
  });
});
