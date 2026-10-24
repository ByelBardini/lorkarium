import { beforeEach, describe, expect, it } from 'vitest';
import { HttpCampaignsApi } from '@/services/campaigns-api';
import { detailOf, QUELM, VHARN } from '../support/campaigns-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';

const CREATE = {
  name: 'Os Sinos de Vharn',
  system: null,
  status: 'building',
  description: null,
  visibility: 'private',
} as const;

const RENAME = { name: 'Os Sinos Calados', password: null } as const;

describe('HttpCampaignsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpCampaignsApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpCampaignsApi(transport);
  });

  function apiError(code: string) {
    return { code, message: 'x' };
  }

  it('a 200 list yields the campaigns', async () => {
    transport.respondWith(200, { campaigns: [VHARN, QUELM] });
    expect(await api.list()).toEqual({ ok: true, value: [VHARN, QUELM] });
    expect(transport.requests).toEqual([{ method: 'GET', path: '/campaigns', body: undefined }]);
  });

  it('a 201 create posts the body and yields the detail', async () => {
    transport.respondWith(201, { campaign: detailOf(VHARN) });
    expect(await api.create(CREATE)).toEqual({ ok: true, value: detailOf(VHARN) });
    expect(transport.requests).toEqual([{ method: 'POST', path: '/campaigns', body: CREATE }]);
  });

  it('a 204 enter posts to the campaign path and yields ok', async () => {
    transport.respondWith(204, null);
    expect(await api.enter(VHARN.id)).toEqual({ ok: true, value: null });
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: `/campaigns/${VHARN.id}/enter`,
    });
  });

  it('a join posts the DTO body to /campaigns/join and yields the summary', async () => {
    transport.respondWith(200, { campaign: QUELM });
    expect(await api.join({ code: 'VHRN7K2Q', password: 'sino' })).toEqual({
      ok: true,
      value: QUELM,
    });
    expect(transport.requests).toEqual([
      { method: 'POST', path: '/campaigns/join', body: { code: 'VHRN7K2Q', password: 'sino' } },
    ]);
  });

  it('an update sends a PATCH with the changed fields and yields the stored detail', async () => {
    const renamed = detailOf(VHARN, { name: 'Os Sinos Calados', hasPassword: false });
    transport.respondWith(200, { campaign: renamed });
    expect(await api.update(VHARN.id, RENAME)).toEqual({ ok: true, value: renamed });
    expect(transport.requests).toEqual([
      { method: 'PATCH', path: `/campaigns/${VHARN.id}`, body: RENAME },
    ]);
  });

  it('a regenerateCode posts to the join-code path and yields the detail with the new code', async () => {
    const recoded = detailOf(VHARN, { joinCode: 'QWER5TYU' });
    transport.respondWith(200, { campaign: recoded });
    expect(await api.regenerateCode(VHARN.id)).toEqual({ ok: true, value: recoded });
    expect(transport.requests).toEqual([
      { method: 'POST', path: `/campaigns/${VHARN.id}/join-code`, body: undefined },
    ]);
  });

  it('a 204 remove sends a DELETE to the campaign path and yields ok', async () => {
    transport.respondWith(204, null);
    expect(await api.remove(VHARN.id)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([
      { method: 'DELETE', path: `/campaigns/${VHARN.id}`, body: undefined },
    ]);
  });

  it.each([
    ['update', () => api.update(VHARN.id, RENAME)],
    ['regenerateCode', () => api.regenerateCode(VHARN.id)],
    ['remove', () => api.remove(VHARN.id)],
  ] as const)('a 403 FORBIDDEN on %s (a player) becomes forbidden', async (_, run) => {
    transport.respondWith(403, apiError('FORBIDDEN'));
    expect(await run()).toEqual({ ok: false, failure: { kind: 'forbidden' } });
  });

  it.each([
    ['update', () => api.update(VHARN.id, RENAME)],
    ['regenerateCode', () => api.regenerateCode(VHARN.id)],
    ['remove', () => api.remove(VHARN.id)],
  ] as const)('a 403 CAMPAIGN_NOT_OPEN on %s (master offline) becomes not_open', async (_, run) => {
    transport.respondWith(403, apiError('CAMPAIGN_NOT_OPEN'));
    expect(await run()).toEqual({ ok: false, failure: { kind: 'not_open' } });
  });

  it.each([
    ['update', () => api.update(VHARN.id, RENAME)],
    ['regenerateCode', () => api.regenerateCode(VHARN.id)],
    ['remove', () => api.remove(VHARN.id)],
  ] as const)('a 404 on %s (not a member) becomes not_found', async (_, run) => {
    transport.respondWith(404, apiError('CAMPAIGN_NOT_FOUND'));
    expect(await run()).toEqual({ ok: false, failure: { kind: 'not_found' } });
  });

  it('a 400 update becomes invalid', async () => {
    transport.respondWith(400, apiError('INVALID_BODY'));
    expect(await api.update(VHARN.id, RENAME)).toEqual({ ok: false, failure: { kind: 'invalid' } });
  });

  it('a 429 regenerateCode becomes rate_limited with the seconds of Retry-After', async () => {
    transport.respondWith(429, apiError('RATE_LIMITED'), { 'retry-after': '12' });
    expect(await api.regenerateCode(VHARN.id)).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 12 },
    });
  });

  it('a network failure on remove becomes offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.remove(VHARN.id)).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('a 200 update whose body is outside the DTO becomes unexpected', async () => {
    transport.respondWith(200, { campaign: { ...detailOf(VHARN), status: 'Recrutando' } });
    expect(await api.update(VHARN.id, RENAME)).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });

  it('a 403 with an unknown code becomes unexpected', async () => {
    transport.respondWith(403, apiError('SOMETHING_ELSE'));
    expect(await api.remove(VHARN.id)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('a 200 body outside the DTO becomes unexpected', async () => {
    transport.respondWith(200, { campaigns: [{ ...VHARN, myRole: 'god' }] });
    expect(await api.list()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it.each([
    ['list', () => api.list()],
    ['detail', () => api.detail(VHARN.id)],
    ['enter', () => api.enter(VHARN.id)],
  ] as const)('a 401 on %s becomes unauthenticated', async (_, run) => {
    transport.respondWith(401, apiError('UNAUTHENTICATED'));
    expect(await run()).toEqual({ ok: false, failure: { kind: 'unauthenticated' } });
  });

  it('a 404 detail becomes not_found', async () => {
    transport.respondWith(404, apiError('CAMPAIGN_NOT_FOUND'));
    expect(await api.detail(VHARN.id)).toEqual({ ok: false, failure: { kind: 'not_found' } });
  });

  it('a 400 create becomes invalid', async () => {
    transport.respondWith(400, apiError('INVALID_BODY'));
    expect(await api.create(CREATE)).toEqual({ ok: false, failure: { kind: 'invalid' } });
  });

  it.each([
    ['CAMPAIGN_PASSWORD_REQUIRED', 'password_required'],
    ['CAMPAIGN_PASSWORD_INVALID', 'password_invalid'],
  ])('a 403 join with %s becomes %s', async (code, kind) => {
    transport.respondWith(403, apiError(code));
    expect(await api.join({ code: 'VHRN7K2Q' })).toEqual({ ok: false, failure: { kind } });
  });

  it('a 429 join becomes rate_limited with the seconds of Retry-After', async () => {
    transport.respondWith(429, apiError('RATE_LIMITED'), { 'retry-after': '30' });
    expect(await api.join({ code: 'VHRN7K2Q' })).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 30 },
    });
  });

  it('a network failure becomes offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.list()).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('a 500 becomes unexpected', async () => {
    transport.respondWith(500, apiError('INTERNAL_ERROR'));
    expect(await api.detail(VHARN.id)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});
