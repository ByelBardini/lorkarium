import { beforeEach, describe, expect, it } from 'vitest';
import { HttpFeedbackApi } from '@/services/feedback-api';
import { BUG_REQUEST, FEEDBACK_SHOT } from '../support/feedback-fixtures';
import { HttpTransportFake } from '../support/http-transport-fake';

describe('HttpFeedbackApi', () => {
  let transport: HttpTransportFake;
  let api: HttpFeedbackApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpFeedbackApi(transport);
  });

  it('send POSTs /feedback with the request as it passed the DTO', async () => {
    transport.respondWith(201, null);

    expect(await api.send(BUG_REQUEST)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([{ method: 'POST', path: '/feedback', body: BUG_REQUEST }]);
  });

  it('send refuses a request outside the DTO before sending anything', async () => {
    await expect(api.send({ ...BUG_REQUEST, appVersion: '   ' })).rejects.toThrow();
    expect(transport.requests).toEqual([]);
  });

  it.each([
    [409, 'FEEDBACK_OPEN_LIMIT', { kind: 'open_limit' }],
    [404, 'ATTACHMENT_NOT_FOUND', { kind: 'attachment_not_found' }],
    [401, 'UNAUTHENTICATED', { kind: 'unauthenticated' }],
  ] as const)('send answered %i %s fails as %o', async (status, code, failure) => {
    transport.respondWith(status, { code, message: 'x' });

    expect(await api.send(BUG_REQUEST)).toEqual({ ok: false, failure });
  });

  it('send refused 429 carries the Retry-After seconds', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x' }, { 'retry-after': '600' });

    expect(await api.send(BUG_REQUEST)).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 600 },
    });
  });

  it('uploadAttachment POSTs the raw file and answers the kept screenshot', async () => {
    transport.respondWith(201, { attachment: FEEDBACK_SHOT });
    const file = new Blob(['png'], { type: 'image/png' });

    expect(await api.uploadAttachment(file)).toEqual({ ok: true, value: FEEDBACK_SHOT });
    expect(transport.requests).toEqual([
      { method: 'POST', path: '/feedback/attachments', body: file },
    ]);
  });

  it.each([
    ['ATTACHMENT_TOO_LARGE', 413, 'attachment_too_large'],
    ['UNSUPPORTED_IMAGE', 422, 'unsupported_image'],
  ] as const)('uploadAttachment refused %s (%i) fails as %s', async (code, status, kind) => {
    transport.respondWith(status, { code, message: 'x' });

    expect(await api.uploadAttachment(new Blob(['x']))).toEqual({ ok: false, failure: { kind } });
  });
});
