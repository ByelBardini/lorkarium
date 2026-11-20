import { beforeEach, describe, expect, it } from 'vitest';
import { HttpFeedbackAdminApi } from '@/services/feedback-admin-api';
import { TOKEN_BUG } from '../support/feedback-fixtures';
import { HttpTransportFake } from '../support/http-transport-fake';

const PUBLISHED = {
  issueUrl: 'https://github.com/ByelBardini/lorkarium/issues/42',
  issueNumber: 42,
};
const EDITED = { title: '[bug] Token volta', body: 'Revisado' };

describe('HttpFeedbackAdminApi', () => {
  let transport: HttpTransportFake;
  let api: HttpFeedbackAdminApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpFeedbackAdminApi(transport);
  });

  it('list reads GET /admin/feedback with the page into the page', async () => {
    const page = { entries: [TOKEN_BUG], page: 2, pageSize: 50, total: 51 };
    transport.respondWith(200, page);

    expect(await api.list({ page: 2 })).toEqual({ ok: true, value: page });
    expect(transport.requests).toEqual([
      { method: 'GET', path: '/admin/feedback?page=2', body: undefined },
    ]);
  });

  it('list with an entry outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, {
      entries: [{ ...TOKEN_BUG, email: 'bia@mesa.com' }],
      page: 1,
      pageSize: 50,
      total: 1,
    });

    expect(await api.list({ page: 1 })).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('publish POSTs the edited title and body and answers the issue', async () => {
    transport.respondWith(200, PUBLISHED);

    expect(await api.publish(TOKEN_BUG.id, EDITED)).toEqual({ ok: true, value: PUBLISHED });
    expect(transport.requests).toEqual([
      { method: 'POST', path: `/admin/feedback/${TOKEN_BUG.id}/publish`, body: EDITED },
    ]);
  });

  it('publish refuses an empty title before sending anything', async () => {
    await expect(api.publish(TOKEN_BUG.id, { title: ' ', body: 'x' })).rejects.toThrow();
    expect(transport.requests).toEqual([]);
  });

  it.each([
    [502, 'ISSUE_TRACKER_UNAVAILABLE', { kind: 'issue_tracker_unavailable' }],
    [503, 'ISSUE_TRACKER_NOT_CONFIGURED', { kind: 'issue_tracker_not_configured' }],
    [404, 'FEEDBACK_NOT_FOUND', { kind: 'not_found' }],
    [403, 'FORBIDDEN_ROLE', { kind: 'forbidden' }],
  ] as const)('publish answered %i %s fails as %o', async (status, code, failure) => {
    transport.respondWith(status, { code, message: 'x' });

    expect(await api.publish(TOKEN_BUG.id, EDITED)).toEqual({ ok: false, failure });
  });

  it('archive POSTs /archive and answers nothing', async () => {
    transport.respondWith(204, null);

    expect(await api.archive(TOKEN_BUG.id)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([
      { method: 'POST', path: `/admin/feedback/${TOKEN_BUG.id}/archive`, body: undefined },
    ]);
  });
});
