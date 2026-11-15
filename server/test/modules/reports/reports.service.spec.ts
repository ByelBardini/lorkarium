import { describe, expect, it } from 'vitest';
import { ReportsService } from '../../../src/modules/reports/reports.service';
import { BIA_ID, CAIO_ID, DUDA_ID } from '../../support/campaigns-factories';
import { ActiveAccountsFake } from '../../support/reputation-fakes';
import { ReportsDaoFake } from '../../support/reports-fakes';

const GONE_ID = '00000000-0000-4000-8000-000000000000';
const ROOT = { id: DUDA_ID, role: 'admin' } as const;

function serviceOver(pageSize = 50): { service: ReportsService; reports: ReportsDaoFake } {
  const reports = new ReportsDaoFake({ [BIA_ID]: 'bia', [CAIO_ID]: 'caio', [DUDA_ID]: 'root' });
  const accounts = new ActiveAccountsFake([BIA_ID, CAIO_ID, DUDA_ID]);
  return { reports, service: new ReportsService({ reports, accounts, pageSize }) };
}

describe('ReportsService.report', () => {
  it('keeps the reason and details absent as null', async () => {
    const { service, reports } = serviceOver();

    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    expect(reports.rows).toMatchObject([{ reason: 'spam', details: null, status: 'open' }]);
  });

  it('a second open report on the same account is REPORT_ALREADY_OPEN', async () => {
    const { service } = serviceOver();
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    await expect(service.report(BIA_ID, CAIO_ID, { reason: 'other' })).rejects.toMatchObject({
      code: 'REPORT_ALREADY_OPEN',
    });
  });

  it('an unknown or suspended account is REPORT_TARGET_NOT_FOUND and nothing is kept', async () => {
    const { service, reports } = serviceOver();

    await expect(service.report(BIA_ID, GONE_ID, { reason: 'spam' })).rejects.toMatchObject({
      code: 'REPORT_TARGET_NOT_FOUND',
    });
    expect(reports.rows).toEqual([]);
  });
});

describe('ReportsService.list', () => {
  it('the second page skips the first and carries the total', async () => {
    const { service } = serviceOver(1);
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });
    await service.report(CAIO_ID, BIA_ID, { reason: 'cheating' });

    const page = await service.list({ status: 'open', page: 2 });

    expect(page).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(page.reports.map((report) => report.reporter.username)).toEqual(['caio']);
  });
});

describe('ReportsService.resolve', () => {
  it("closing records the admin's @ and the date", async () => {
    const { service, reports } = serviceOver();
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });
    const [open] = reports.rows;

    const closed = await service.resolve(ROOT, open!.id, { status: 'dismissed' });

    expect(closed).toMatchObject({ status: 'dismissed', resolvedBy: 'root' });
    expect(closed.resolvedAt).not.toBeNull();
  });

  it('after closing, the same pair may report again', async () => {
    const { service, reports } = serviceOver();
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });
    await service.resolve(ROOT, reports.rows[0]!.id, { status: 'resolved' });

    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    expect(reports.rows.map((row) => row.status)).toEqual(['resolved', 'open']);
  });

  it('a report already closed is REPORT_NOT_FOUND', async () => {
    const { service, reports } = serviceOver();
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });
    const id = reports.rows[0]!.id;
    await service.resolve(ROOT, id, { status: 'resolved' });

    await expect(service.resolve(ROOT, id, { status: 'dismissed' })).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    });
  });

  it('a non-admin never reaches the DAO', async () => {
    const { service, reports } = serviceOver();
    await service.report(BIA_ID, CAIO_ID, { reason: 'spam' });

    await expect(
      service.resolve({ id: CAIO_ID, role: 'user' }, reports.rows[0]!.id, { status: 'resolved' }),
    ).rejects.toMatchObject({ code: 'REPORT_FORBIDDEN' });
    expect(reports.rows[0]!.status).toBe('open');
  });
});
