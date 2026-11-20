import { beforeEach, describe, expect, it } from 'vitest';
import { HttpProfileCardApi } from '@/services/profile-card-api';
import { HttpTransportFake } from '../support/http-transport-fake';
import { LYRA_CARD } from '../support/profile-card-fixtures';

const TABLE_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SHOT_ID = '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f';
const SHOT = { id: SHOT_ID, mimeType: 'image/webp', width: 800, height: 600, sizeBytes: 900 };

describe('HttpProfileCardApi', () => {
  let transport: HttpTransportFake;
  let api: HttpProfileCardApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpProfileCardApi(transport);
  });

  it('card reads GET /users/:userId/card into the card', async () => {
    transport.respondWith(200, { card: LYRA_CARD });
    expect(await api.card(LYRA_CARD.id)).toEqual({ ok: true, value: LYRA_CARD });
    expect(transport.requests).toEqual([
      { method: 'GET', path: `/users/${LYRA_CARD.id}/card`, body: undefined },
    ]);
  });

  it('card with a body outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, { card: { ...LYRA_CARD, email: 'lyra@x.com' } });
    expect(await api.card(LYRA_CARD.id)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it.each([
    [404, { kind: 'user_not_found' }],
    [401, { kind: 'unauthenticated' }],
    [500, { kind: 'unexpected' }],
  ] as const)('card answered %i fails as %o', async (status, failure) => {
    transport.respondWith(status, { code: 'X', message: 'x' });
    expect(await api.card(LYRA_CARD.id)).toEqual({ ok: false, failure });
  });

  it('card offline fails as offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.card(LYRA_CARD.id)).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('cardByUsername reads the typed @ without "@" and in lower case from /users/by-username/:username/card', async () => {
    transport.respondWith(200, { card: LYRA_CARD });
    expect(await api.cardByUsername(' @LyraValen ')).toEqual({ ok: true, value: LYRA_CARD });
    expect(transport.requests).toEqual([
      { method: 'GET', path: '/users/by-username/lyravalen/card', body: undefined },
    ]);
  });

  it.each(['a', 'lyra@lorkarium.dev', '', 'bia flor'])(
    'cardByUsername("%s") outside the @ format is user_not_found without a request',
    async (typed) => {
      expect(await api.cardByUsername(typed)).toEqual({
        ok: false,
        failure: { kind: 'user_not_found' },
      });
      expect(transport.requests).toEqual([]);
    },
  );

  it.each([
    [404, { kind: 'user_not_found' }],
    [400, { kind: 'user_not_found' }],
    [401, { kind: 'unauthenticated' }],
    [500, { kind: 'unexpected' }],
  ] as const)('cardByUsername answered %i fails as %o', async (status, failure) => {
    transport.respondWith(status, { code: 'X', message: 'x' });
    expect(await api.cardByUsername('lyravalen')).toEqual({ ok: false, failure });
  });

  it('cardByUsername refused 429 carries the retryAfterSeconds of the body', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 42 });
    expect(await api.cardByUsername('lyravalen')).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 42 },
    });
  });

  it('cardByUsername with a body outside the DTO is unexpected', async () => {
    transport.respondWith(200, { card: { ...LYRA_CARD, passwordHash: 'x' } });
    expect(await api.cardByUsername('lyravalen')).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });

  it('cardByUsername offline fails as offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.cardByUsername('lyravalen')).toEqual({
      ok: false,
      failure: { kind: 'offline' },
    });
  });

  it('vote PUTs the value to /users/:userId/reputation', async () => {
    transport.respondWith(204, null);
    expect(await api.vote(LYRA_CARD.id, -1)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([
      { method: 'PUT', path: `/users/${LYRA_CARD.id}/reputation`, body: { value: -1 } },
    ]);
  });

  it('vote refused REPUTATION_NOT_ALLOWED fails as reputation_not_allowed', async () => {
    transport.respondWith(403, { code: 'REPUTATION_NOT_ALLOWED', message: 'x' });
    expect(await api.vote(LYRA_CARD.id, 1)).toEqual({
      ok: false,
      failure: { kind: 'reputation_not_allowed' },
    });
  });

  it('removeVote DELETEs /users/:userId/reputation', async () => {
    transport.respondWith(204, null);
    expect(await api.removeVote(LYRA_CARD.id)).toEqual({ ok: true, value: null });
    expect(transport.requests[0]).toMatchObject({
      method: 'DELETE',
      path: `/users/${LYRA_CARD.id}/reputation`,
    });
  });

  it('report POSTs the reason and details to /users/:userId/reports', async () => {
    transport.respondWith(201, null);
    const report = { reason: 'spam', details: 'Links em toda mensagem' } as const;
    expect(await api.report(LYRA_CARD.id, report)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([
      { method: 'POST', path: `/users/${LYRA_CARD.id}/reports`, body: report },
    ]);
  });

  it('report refused REPORT_ALREADY_OPEN fails as report_already_open', async () => {
    transport.respondWith(409, { code: 'REPORT_ALREADY_OPEN', message: 'x' });
    expect(await api.report(LYRA_CARD.id, { reason: 'other' })).toEqual({
      ok: false,
      failure: { kind: 'report_already_open' },
    });
  });

  it('a vote or a report on a gone account fails as user_not_found', async () => {
    transport.respondWith(404, { code: 'REPUTATION_TARGET_NOT_FOUND', message: 'x' });
    transport.respondWith(404, { code: 'REPORT_TARGET_NOT_FOUND', message: 'x' });
    const gone = { ok: false, failure: { kind: 'user_not_found' } };
    expect(await api.vote(LYRA_CARD.id, 1)).toEqual(gone);
    expect(await api.report(LYRA_CARD.id, { reason: 'spam' })).toEqual(gone);
  });

  it('report sends the table and the screenshot ids as given', async () => {
    transport.respondWith(201, null);
    const report = {
      reason: 'harassment' as const,
      campaignId: TABLE_ID,
      attachmentIds: [SHOT_ID],
    };

    await api.report(LYRA_CARD.id, report);

    expect(transport.requests[0]?.body).toEqual(report);
  });

  it.each([
    ['CAMPAIGN_NOT_SHARED', 400, 'campaign_not_shared'],
    ['ATTACHMENT_NOT_FOUND', 404, 'attachment_not_found'],
  ] as const)('report refused %s (%i) fails as %s', async (code, status, kind) => {
    transport.respondWith(status, { code, message: 'x' });

    expect(await api.report(LYRA_CARD.id, { reason: 'spam' })).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('uploadReportAttachment POSTs the file as the raw body and answers the kept screenshot', async () => {
    transport.respondWith(201, { attachment: SHOT });
    const file = new Blob(['png'], { type: 'image/png' });

    expect(await api.uploadReportAttachment(file)).toEqual({ ok: true, value: SHOT });
    expect(transport.requests).toEqual([
      { method: 'POST', path: '/reports/attachments', body: file },
    ]);
  });

  it.each([
    ['ATTACHMENT_TOO_LARGE', 413, 'attachment_too_large'],
    ['UNSUPPORTED_IMAGE', 415, 'unsupported_image'],
    ['UNSUPPORTED_IMAGE', 422, 'unsupported_image'],
  ] as const)('uploadReportAttachment refused %s (%i) fails as %s', async (code, status, kind) => {
    transport.respondWith(status, { code, message: 'x' });

    expect(await api.uploadReportAttachment(new Blob(['x']))).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('uploadReportAttachment with a body outside the DTO is unexpected', async () => {
    transport.respondWith(201, { attachment: { ...SHOT, storageKey: 'reports/x' } });

    expect(await api.uploadReportAttachment(new Blob(['x']))).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });

  it('report refused 429 carries the Retry-After seconds', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x' }, { 'retry-after': '30' });
    expect(await api.report(LYRA_CARD.id, { reason: 'spam' })).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 30 },
    });
  });
});
