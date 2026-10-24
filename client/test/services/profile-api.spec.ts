import { beforeEach, describe, expect, it } from 'vitest';
import { HttpProfileApi } from '@/services/profile-api';
import { HttpTransportFake } from '../support/http-transport-fake';
import { ANA_PROFILE } from '../support/profile-api-fake';

describe('HttpProfileApi', () => {
  let transport: HttpTransportFake;
  let api: HttpProfileApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpProfileApi(transport);
  });

  it('get reads GET /account/profile into the profile', async () => {
    transport.respondWith(200, { profile: ANA_PROFILE });
    expect(await api.get()).toEqual({ ok: true, value: ANA_PROFILE });
    expect(transport.requests).toEqual([
      { method: 'GET', path: '/account/profile', body: undefined },
    ]);
  });

  it('get with a body outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, { profile: { ...ANA_PROFILE, color: 'pink' } });
    expect(await api.get()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it.each([
    [401, { kind: 'unauthenticated' }],
    [500, { kind: 'unexpected' }],
  ] as const)('get answered %i fails as %o', async (status, failure) => {
    transport.respondWith(status, { code: 'X', message: 'x' });
    expect(await api.get()).toEqual({ ok: false, failure });
  });

  it('get offline fails as offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.get()).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('update PATCHes only the fields sent and yields the profile the server answers', async () => {
    const saved = { ...ANA_PROFILE, name: 'Aninha' };
    transport.respondWith(200, { profile: saved });
    expect(await api.update({ name: 'Aninha' })).toEqual({ ok: true, value: saved });
    expect(transport.requests).toEqual([
      { method: 'PATCH', path: '/account/profile', body: { name: 'Aninha' } },
    ]);
  });

  it('update refused 429 carries the Retry-After seconds', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x' }, { 'retry-after': '12' });
    expect(await api.update({ bio: null })).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 12 },
    });
  });

  it('update refused 400 is invalid', async () => {
    transport.respondWith(400, { code: 'INVALID_BODY', message: 'x' });
    expect(await api.update({ name: 'x' })).toEqual({ ok: false, failure: { kind: 'invalid' } });
  });

  it('uploadAvatar PUTs the file itself to /account/avatar', async () => {
    const file = new File([new Uint8Array([1])], 'eu.png', { type: 'image/png' });
    transport.respondWith(200, { profile: ANA_PROFILE });
    await api.uploadAvatar(file);
    expect(transport.requests).toEqual([{ method: 'PUT', path: '/account/avatar', body: file }]);
  });

  it.each([
    [413, { code: 'AVATAR_TOO_LARGE', message: 'x' }, 'avatar_too_large'],
    [413, null, 'avatar_too_large'],
    [415, { code: 'UNSUPPORTED_IMAGE', message: 'x' }, 'unsupported_image'],
    [422, null, 'unsupported_image'],
  ] as const)('uploadAvatar answered %i with %o fails as %s', async (status, body, kind) => {
    transport.respondWith(status, body);
    expect(await api.uploadAvatar(new Blob(['x'], { type: 'image/png' }))).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('removeAvatar DELETEs /account/avatar and yields the profile without photo', async () => {
    transport.respondWith(200, { profile: ANA_PROFILE });
    expect(await api.removeAvatar()).toEqual({ ok: true, value: ANA_PROFILE });
    expect(transport.requests[0]).toMatchObject({ method: 'DELETE', path: '/account/avatar' });
  });
});
