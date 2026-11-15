import { beforeEach, describe, expect, it } from 'vitest';
import { HttpUserReportsApi } from '@/services/user-reports-api';
import { HttpTransportFake } from '../support/http-transport-fake';
import { SPAM_REPORT } from '../support/user-reports-fixtures';

describe('HttpUserReportsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpUserReportsApi;
  const PAGE = { reports: [SPAM_REPORT], page: 2, pageSize: 50, total: 51 };

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpUserReportsApi(transport);
  });

  it('list reads GET /admin/reports with the status and the page into the page', async () => {
    transport.respondWith(200, PAGE);
    expect(await api.list({ status: 'resolved', page: 2 })).toEqual({ ok: true, value: PAGE });
    expect(transport.requests).toEqual([
      { method: 'GET', path: '/admin/reports?status=resolved&page=2', body: undefined },
    ]);
  });

  it('list with a body outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, { ...PAGE, reports: [{ ...SPAM_REPORT, email: 'x@x.com' }] });
    expect(await api.list({ status: 'open', page: 1 })).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });

  it('list refuses a page outside the query DTO before sending anything', async () => {
    await expect(api.list({ status: 'open', page: 0 })).rejects.toThrow();
    expect(transport.requests).toEqual([]);
  });

  it.each([
    [401, 'X', { kind: 'unauthenticated' }],
    [403, 'FORBIDDEN_ROLE', { kind: 'forbidden' }],
  ] as const)('list answered %i fails as %o', async (status, code, failure) => {
    transport.respondWith(status, { code, message: 'x' });
    expect(await api.list({ status: 'open', page: 1 })).toEqual({ ok: false, failure });
  });

  it('resolve sends PATCH /admin/reports/:id { status } and returns the closed report', async () => {
    const closed = {
      ...SPAM_REPORT,
      status: 'dismissed',
      resolvedAt: SPAM_REPORT.createdAt,
      resolvedBy: 'lucas',
    };
    transport.respondWith(200, { report: closed });
    expect(await api.resolve(SPAM_REPORT.id, { status: 'dismissed' })).toEqual({
      ok: true,
      value: closed,
    });
    expect(transport.requests).toEqual([
      { method: 'PATCH', path: `/admin/reports/${SPAM_REPORT.id}`, body: { status: 'dismissed' } },
    ]);
  });

  it('resolve of a report already closed fails as not_found', async () => {
    transport.respondWith(404, { code: 'REPORT_NOT_FOUND', message: 'x' });
    expect(await api.resolve(SPAM_REPORT.id, { status: 'resolved' })).toEqual({
      ok: false,
      failure: { kind: 'not_found' },
    });
  });

  it('resolve offline fails as offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.resolve(SPAM_REPORT.id, { status: 'resolved' })).toEqual({
      ok: false,
      failure: { kind: 'offline' },
    });
  });
});
