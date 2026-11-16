import type { AdminBadgeDto, BadgeDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpBadgesAdminApi } from '@/services/badges-admin-api';
import { HttpTransportFake } from '../support/http-transport-fake';

const VETERAN: AdminBadgeDto = {
  id: '7d0c1f5e-2b3a-4c4d-8e5f-6a7b8c9d0e1f',
  name: 'Veterano',
  description: 'Jogou 100 sessões',
  imageId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  position: 0,
  holders: 12,
};
const VETERAN_CARD: BadgeDto = {
  id: VETERAN.id,
  name: VETERAN.name,
  description: VETERAN.description,
  imageId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
};
const BADGE_PATH = `/admin/badges/${VETERAN.id}`;

describe('HttpBadgesAdminApi', () => {
  let transport: HttpTransportFake;
  let api: HttpBadgesAdminApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpBadgesAdminApi(transport);
  });

  function refuse(status: number, code: string): void {
    transport.respondWith(status, { code, message: 'x' });
  }

  it('catalog reads GET /admin/badges and yields the badges in order', async () => {
    transport.respondWith(200, { badges: [VETERAN] });
    expect(await api.catalog()).toEqual({ ok: true, value: [VETERAN] });
    expect(transport.requests[0]).toEqual({
      method: 'GET',
      path: '/admin/badges',
      body: undefined,
    });
  });

  it.each([
    [
      'create',
      () => api.create({ name: 'Veterano', description: 'Jogou 100 sessões' }),
      'POST',
      '/admin/badges',
      { name: 'Veterano', description: 'Jogou 100 sessões' },
    ],
    [
      'update',
      () => api.update(VETERAN.id, { description: 'Jogou 200 sessões' }),
      'PATCH',
      BADGE_PATH,
      { description: 'Jogou 200 sessões' },
    ],
  ] as const)('%s goes %s %s and yields the badge', async (_, send, method, path, body) => {
    transport.respondWith(200, { badge: VETERAN });
    expect(await send()).toEqual({ ok: true, value: VETERAN });
    expect(transport.requests[0]).toEqual({ method, path, body });
  });

  it('uploadImage PUTs the file itself with the 1:1 rectangle in the query', async () => {
    const file = new Blob(['png'], { type: 'image/png' });
    transport.respondWith(200, { badge: VETERAN });
    const crop = { x: 10, y: 5, width: 50, height: 50 };
    expect(await api.uploadImage(VETERAN.id, file, crop)).toEqual({ ok: true, value: VETERAN });
    expect(transport.requests[0]).toEqual({
      method: 'PUT',
      path: `${BADGE_PATH}/image?cropX=10&cropY=5&cropW=50&cropH=50`,
      body: file,
    });
  });

  it('reorder PUTs every id to /admin/badges/order and yields the new order', async () => {
    transport.respondWith(200, { badges: [VETERAN] });
    expect(await api.reorder([VETERAN.id])).toEqual({ ok: true, value: [VETERAN] });
    expect(transport.requests[0]).toEqual({
      method: 'PUT',
      path: '/admin/badges/order',
      body: { badgeIds: [VETERAN.id] },
    });
  });

  it('remove DELETEs the badge and yields nothing on 204', async () => {
    transport.respondWith(204, undefined);
    expect(await api.remove(VETERAN.id)).toEqual({ ok: true, value: null });
    expect(transport.requests[0]).toEqual({ method: 'DELETE', path: BADGE_PATH, body: undefined });
  });

  it('grantsOf reads the ids an account holds', async () => {
    transport.respondWith(200, { badgeIds: [VETERAN.id] });
    expect(await api.grantsOf('u-1')).toEqual({ ok: true, value: [VETERAN.id] });
    expect(transport.requests[0]).toEqual({
      method: 'GET',
      path: '/admin/users/u-1/badges',
      body: undefined,
    });
  });

  it('grant PUTs the full set (an empty one takes every badge away)', async () => {
    transport.respondWith(200, { badges: [] });
    expect(await api.grant('u-1', [])).toEqual({ ok: true, value: [] });
    expect(transport.requests[0]).toEqual({
      method: 'PUT',
      path: '/admin/users/u-1/badges',
      body: { badgeIds: [] },
    });
  });

  it('grant yields the account badges the server confirmed', async () => {
    transport.respondWith(200, { badges: [VETERAN_CARD] });
    expect(await api.grant('u-1', [VETERAN.id])).toEqual({ ok: true, value: [VETERAN_CARD] });
  });

  it.each([
    [409, 'BADGE_NAME_TAKEN', 'name_taken'],
    [404, 'BADGE_NOT_FOUND', 'not_found'],
    [403, 'FORBIDDEN_ROLE', 'forbidden'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [400, 'VALIDATION_FAILED', 'invalid'],
  ] as const)('a write answered %i %s fails as %s', async (status, code, kind) => {
    refuse(status, code);
    expect(await api.create({ name: 'Veterano', description: 'x' })).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('reorder answered 409 BADGE_ORDER_STALE fails as order_stale', async () => {
    refuse(409, 'BADGE_ORDER_STALE');
    expect(await api.reorder([VETERAN.id])).toEqual({
      ok: false,
      failure: { kind: 'order_stale' },
    });
  });

  it.each([
    [409, 'BADGE_WITHOUT_IMAGE', 'badge_without_image'],
    [404, 'USER_NOT_FOUND', 'not_found'],
    [404, 'BADGE_NOT_FOUND', 'not_found'],
  ] as const)('grant answered %i %s fails as %s', async (status, code, kind) => {
    refuse(status, code);
    expect(await api.grant('u-1', [VETERAN.id])).toEqual({ ok: false, failure: { kind } });
  });

  it.each([
    [413, 'BADGE_IMAGE_TOO_LARGE', 'image_too_large'],
    [413, 'FST_ERR_CTP_BODY_TOO_LARGE', 'image_too_large'],
    [415, 'FST_ERR_CTP_INVALID_MEDIA_TYPE', 'unsupported_image'],
    [422, 'UNSUPPORTED_IMAGE', 'unsupported_image'],
  ] as const)('uploadImage answered %i %s fails as %s', async (status, code, kind) => {
    refuse(status, code);
    const file = new Blob(['x'], { type: 'image/png' });
    const crop = { x: 0, y: 0, width: 100, height: 100 };
    expect(await api.uploadImage(VETERAN.id, file, crop)).toEqual({
      ok: false,
      failure: { kind },
    });
  });

  it('a 429 fails as rate_limited with the seconds to wait', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x' }, { 'retry-after': '30' });
    expect(await api.remove(VETERAN.id)).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 30 },
    });
  });

  it('a dropped network fails as offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.catalog()).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('a 200 body outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, { badges: [{ ...VETERAN, holders: -1 }] });
    expect(await api.catalog()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('a granted badge without an image in the answer is unexpected', async () => {
    transport.respondWith(200, { badges: [{ ...VETERAN_CARD, imageId: null }] });
    expect(await api.grant('u-1', [VETERAN.id])).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });
});
