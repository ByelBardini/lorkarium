import { beforeEach, describe, expect, it } from 'vitest';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import { ReportsService } from '../../../src/modules/reports/reports.service';
import { MailerFake } from '../../support/account-security-fakes';
import { userPo } from '../../support/auth-factories';
import { DataCipherFake } from '../../support/auth-fakes';
import { BIA_ID, CAIO_ID, DUDA_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  ReportAttachmentsDaoFake,
  ReportersFake,
  ReportsDaoFake,
  ReportsTransactionFake,
  reportAttachmentPo,
} from '../../support/reports-fakes';

const GONE_ID = '00000000-0000-4000-8000-000000000000';
const SHOT_A = '00000000-0000-4000-8000-0000000000a1';
const SHOT_B = '00000000-0000-4000-8000-0000000000a2';
const ROOT = { id: DUDA_ID, role: 'admin' } as const;
const ACCOUNTS = {
  [BIA_ID]: { username: 'bia', name: 'Bia', suspended: false },
  [CAIO_ID]: { username: 'caio', name: 'Caio Rola', suspended: false },
  [DUDA_ID]: { username: 'root', name: 'Root', suspended: false },
};
const TABLES = [
  { id: VHARN_ID, name: 'Os Sinos de Vharn', players: [BIA_ID, CAIO_ID] },
  { id: QUELM_ID, name: 'Quelm', players: [CAIO_ID] },
];

let reports: ReportsDaoFake;
let attachments: ReportAttachmentsDaoFake;
let mailer: MailerFake;
let mailFailures: string[];
let service: ReportsService;

function serviceOver(pageSize = 50): ReportsService {
  const transaction = new ReportsTransactionFake(reports, attachments);
  const reporters = new ReportersFake([userPo({ id: BIA_ID, name: 'Bia', email: 'bia@mesa.com' })]);
  return new ReportsService({
    transaction: (work) => transaction.run(() => work({ reports, attachments })),
    reports,
    attachments,
    accounts: reporters,
    notices: new SecurityNoticesService(mailer, (_error, subject) => mailFailures.push(subject)),
    cipher: new DataCipherFake(),
    appPublicUrl: 'https://app.lorkarium.test',
    pageSize,
  });
}

beforeEach(() => {
  reports = new ReportsDaoFake(ACCOUNTS, TABLES);
  attachments = new ReportAttachmentsDaoFake([
    reportAttachmentPo({ id: SHOT_A, uploadedBy: BIA_ID }),
    reportAttachmentPo({ id: SHOT_B, uploadedBy: BIA_ID }),
  ]);
  mailer = new MailerFake();
  mailFailures = [];
  service = serviceOver();
});

describe('ReportsService.report', () => {
  it('keeps the reason, details absent as null, and the @ and names of the time', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    expect(reports.rows).toMatchObject([
      {
        reason: 'spam',
        details: null,
        status: 'open',
        reporterUsername: 'bia',
        targetUsername: 'caio',
        targetName: 'Caio Rola',
        campaignId: null,
        campaignName: null,
      },
    ]);
  });

  it('a table both play is kept with its name', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'harassment', campaignId: VHARN_ID });

    expect(reports.rows).toMatchObject([
      { campaignId: VHARN_ID, campaignName: 'Os Sinos de Vharn' },
    ]);
  });

  it('a table only the reported account plays is CAMPAIGN_NOT_SHARED and nothing is kept', async () => {
    const request = { reason: 'harassment', campaignId: QUELM_ID } as const;

    await expect(service.report(BIA_ID, CAIO_ID, request)).rejects.toMatchObject({
      code: 'CAMPAIGN_NOT_SHARED',
    });
    expect(reports.rows).toEqual([]);
  });

  it("the reporter's loose screenshots are claimed by the new report", async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam', attachmentIds: [SHOT_A, SHOT_B] });

    const [kept] = reports.rows;
    expect(attachments.rows.map((row) => row.reportId)).toEqual([kept!.id, kept!.id]);
  });

  it("someone else's screenshot is ATTACHMENT_NOT_FOUND and nothing is claimed nor kept", async () => {
    attachments.rows.push(reportAttachmentPo({ id: GONE_ID, uploadedBy: CAIO_ID }));

    const request = { reason: 'spam' as const, attachmentIds: [SHOT_A, GONE_ID] };
    await expect(service.report(BIA_ID, CAIO_ID, request)).rejects.toMatchObject({
      code: 'ATTACHMENT_NOT_FOUND',
    });
    expect(reports.rows).toEqual([]);
    expect(attachments.rows.every((row) => row.reportId === null)).toBe(true);
  });

  it('a screenshot already claimed by an earlier report is ATTACHMENT_NOT_FOUND', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam', attachmentIds: [SHOT_A] });
    await service.resolve(ROOT, reports.rows[0]!.id, { status: 'resolved' });

    const again = service.report(BIA_ID, CAIO_ID, { reason: 'spam', attachmentIds: [SHOT_A] });

    await expect(again).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
  });

  it('a second open report on the same account is REPORT_ALREADY_OPEN and claims nothing', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    const second = service.report(BIA_ID, CAIO_ID, { reason: 'other', attachmentIds: [SHOT_A] });

    await expect(second).rejects.toMatchObject({ code: 'REPORT_ALREADY_OPEN' });
    expect(attachments.rows[0]!.reportId).toBeNull();
  });

  it('an unknown account is REPORT_TARGET_NOT_FOUND and nothing is kept', async () => {
    await expect(service.report(BIA_ID, GONE_ID, { reason: 'spam' })).rejects.toMatchObject({
      code: 'REPORT_TARGET_NOT_FOUND',
    });
    expect(reports.rows).toEqual([]);
  });
});

describe('ReportsService.list', () => {
  it('the second page skips the first and carries the total', async () => {
    service = serviceOver(1);
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });
    await service.report(CAIO_ID, BIA_ID, { reason: 'cheating' });

    const page = await service.list({ status: 'open', page: 2 });

    expect(page).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(page.reports.map((report) => report.reporter.username)).toEqual(['caio']);
  });

  it('each report carries only its own screenshots', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam', attachmentIds: [SHOT_B] });
    await service.report(CAIO_ID, BIA_ID, { reason: 'cheating' });

    const page = await service.list({ status: 'open', page: 1 });

    expect(page.reports.map((report) => report.attachments.map((shot) => shot.id))).toEqual([
      [SHOT_B],
      [],
    ]);
  });
});

describe('ReportsService.resolve', () => {
  it("closing records the admin's @, the date and the note", async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    const closed = await service.resolve(ROOT, reports.rows[0]!.id, {
      status: 'dismissed',
      note: 'no proof',
    });

    expect(closed).toMatchObject({
      status: 'dismissed',
      resolvedBy: 'root',
      adminNote: 'no proof',
    });
    expect(closed.resolvedAt).not.toBeNull();
  });

  it('closing mails the reporter that it was looked at, without the measure', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'harassment' });

    await service.resolve(ROOT, reports.rows[0]!.id, { status: 'resolved', note: 'suspended' });

    const [mail] = mailer.to('bia@mesa.com');
    expect(mail?.subject).toBe('Sua denúncia foi analisada');
    expect(mail?.text).not.toMatch(/suspended|resolvid|arquivad|@caio/i);
  });

  it('a reporter whose account is gone is not mailed and the report still closes', async () => {
    await service.report(CAIO_ID, BIA_ID, { reason: 'spam' });

    const closed = await service.resolve(ROOT, reports.rows[0]!.id, { status: 'resolved' });

    expect(closed.status).toBe('resolved');
    expect(mailer.sent).toEqual([]);
  });

  it('a mail that fails is reported and the report stays closed', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });
    mailer.failWith = new Error('smtp down');

    const closed = await service.resolve(ROOT, reports.rows[0]!.id, { status: 'resolved' });

    expect(closed.status).toBe('resolved');
    expect(reports.rows[0]!.status).toBe('resolved');
    expect(mailFailures).toEqual(['Sua denúncia foi analisada']);
  });

  it('after closing, the same pair may report again', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });
    await service.resolve(ROOT, reports.rows[0]!.id, { status: 'resolved' });

    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    expect(reports.rows.map((row) => row.status)).toEqual(['resolved', 'open']);
  });

  it('a report already closed is REPORT_NOT_FOUND and mails nobody again', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });
    const id = reports.rows[0]!.id;
    await service.resolve(ROOT, id, { status: 'resolved' });

    await expect(service.resolve(ROOT, id, { status: 'dismissed' })).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    });
    expect(mailer.sent).toHaveLength(1);
  });

  it('a non-admin never reaches the DAO', async () => {
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    await expect(
      service.resolve({ id: CAIO_ID, role: 'user' }, reports.rows[0]!.id, { status: 'resolved' }),
    ).rejects.toMatchObject({ code: 'REPORT_FORBIDDEN' });
    expect(reports.rows[0]!.status).toBe('open');
  });
});
