import { beforeEach, describe, expect, it } from 'vitest';
import { HttpBroadcastsApi } from '@/services/broadcasts-api';
import { mailBroadcast } from '../support/broadcasts-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';

const NOTICE = {
  segment: { plan: 'lenda' } as const,
  subject: 'Os preços mudam em 30 dias',
  title: 'Novos preços',
  paragraphs: ['A partir de janeiro a Lenda custa R$ 29,90.'],
};
const ID = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f';

describe('HttpBroadcastsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpBroadcastsApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpBroadcastsApi(transport);
  });

  it('list reads GET /admin/broadcasts into the notices', async () => {
    const broadcast = mailBroadcast({ total: 1300, sent: 1240, failed: 3 });
    transport.respondWith(200, { broadcasts: [broadcast] });
    expect(await api.list()).toEqual({ ok: true, value: [broadcast] });
    expect(transport.requests[0]).toMatchObject({ method: 'GET', path: '/admin/broadcasts' });
  });

  it('audience posts the segment and returns the count', async () => {
    transport.respondWith(200, { audience: 40 });
    expect(await api.audience({ plan: 'lenda' })).toEqual({ ok: true, value: 40 });
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: '/admin/broadcasts/audience',
      body: { segment: { plan: 'lenda' } },
    });
  });

  it('create trims the texts before sending them', async () => {
    transport.respondWith(201, { broadcast: mailBroadcast(), audience: 40 });
    await api.create({ ...NOTICE, subject: '  Os preços mudam em 30 dias ' });
    expect(transport.requests[0]?.body).toEqual(NOTICE);
  });

  it('create refuses a button that is not https before sending anything', async () => {
    const button = { label: 'Ver', href: 'http://lorkarium.com.br' };
    await expect(api.create({ ...NOTICE, button })).rejects.toThrow();
    expect(transport.requests).toEqual([]);
  });

  it('rewrite sends PUT /admin/broadcasts/:id with the whole text', async () => {
    transport.respondWith(200, { broadcast: mailBroadcast(), audience: 40 });
    await api.rewrite(ID, NOTICE);
    expect(transport.requests[0]).toEqual({
      method: 'PUT',
      path: `/admin/broadcasts/${ID}`,
      body: NOTICE,
    });
  });

  it('sendTest posts …/test and returns where it went', async () => {
    transport.respondWith(200, { broadcast: mailBroadcast(), to: 'fernanda@mesa.com' });
    const result = await api.sendTest(ID);
    expect(result.ok && result.value.to).toBe('fernanda@mesa.com');
    expect(transport.requests[0]?.path).toBe(`/admin/broadcasts/${ID}/test`);
  });

  it('confirm posts the typed total and returns the confirmed notice', async () => {
    const confirmed = mailBroadcast({ total: 40, confirmedAt: '2026-11-19T13:00:00.000Z' });
    transport.respondWith(200, { broadcast: confirmed });
    expect(await api.confirm(ID, 40)).toEqual({ ok: true, value: confirmed });
    expect(transport.requests[0]?.body).toEqual({ total: 40 });
  });

  it.each([
    [409, 'CONFIRMATION_MISMATCH', { kind: 'confirmation_mismatch' }],
    [409, 'TEST_REQUIRED', { kind: 'test_required' }],
    [409, 'ALREADY_CONFIRMED', { kind: 'already_confirmed' }],
    [403, 'TWO_FACTOR_REQUIRED', { kind: 'two_factor_required' }],
    [403, 'FORBIDDEN_ROLE', { kind: 'forbidden' }],
    [401, 'UNAUTHENTICATED', { kind: 'unauthenticated' }],
    [404, 'BROADCAST_NOT_FOUND', { kind: 'not_found' }],
  ] as const)('confirm answered %i %s fails as %o', async (status, code, failure) => {
    transport.respondWith(status, { code, message: 'x' });
    expect(await api.confirm(ID, 40)).toEqual({ ok: false, failure });
  });

  it('a test the SMTP refuses (502) fails as mail_delivery_failed', async () => {
    transport.respondWith(502, { code: 'MAIL_DELIVERY_FAILED', message: 'x' });
    expect(await api.sendTest(ID)).toEqual({
      ok: false,
      failure: { kind: 'mail_delivery_failed' },
    });
  });

  it('a 429 carries the wait from Retry-After', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x' }, { 'retry-after': '42' });
    expect(await api.sendTest(ID)).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 42 },
    });
  });

  it('a body outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, { audience: -1 });
    expect(await api.audience('all')).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('the network down is offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.list()).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});
