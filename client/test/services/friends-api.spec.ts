import { beforeEach, describe, expect, it } from 'vitest';
import { HttpFriendsApi } from '@/services/friends-api';
import { BIA, RUI_BLOCKED, friendsOverview } from '../support/friends-fixtures';
import { HttpTransportFake } from '../support/http-transport-fake';

function apiError(code: string): object {
  return { code, message: 'x' };
}

describe('HttpFriendsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpFriendsApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpFriendsApi(transport);
  });

  it('overview gets /friends and yields the four lists', async () => {
    transport.respondWith(200, friendsOverview());
    expect(await api.overview()).toEqual({ ok: true, value: friendsOverview() });
    expect(transport.requests).toEqual([{ method: 'GET', path: '/friends', body: undefined }]);
  });

  it('an overview outside the DTO (an e-mail in a profile) is unexpected', async () => {
    transport.respondWith(
      200,
      friendsOverview({ friends: [{ ...BIA, email: 'b@x.com' } as never] }),
    );
    expect(await api.overview()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('sendRequest posts the typed @ and yields the outcome', async () => {
    transport.respondWith(200, { outcome: 'accepted' });
    expect(await api.sendRequest('@Bia')).toEqual({ ok: true, value: 'accepted' });
    expect(transport.requests).toEqual([
      { method: 'POST', path: '/friends/requests', body: { username: '@Bia' } },
    ]);
  });

  it('acceptRequest posts to the request of that user and yields the new friend', async () => {
    transport.respondWith(200, BIA);
    expect(await api.acceptRequest(BIA.userId)).toEqual({ ok: true, value: BIA });
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: `/friends/requests/${BIA.userId}/accept`,
    });
  });

  it.each([
    ['dropRequest', `/friends/requests/${BIA.userId}`],
    ['removeFriend', `/friends/${BIA.userId}`],
    ['unblock', `/blocks/${BIA.userId}`],
  ] as const)('%s deletes %s and yields null on 204', async (method, path) => {
    transport.respondWith(204, undefined);
    expect(await api[method](BIA.userId)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([{ method: 'DELETE', path, body: undefined }]);
  });

  it('block posts the target and yields the blocked account', async () => {
    transport.respondWith(201, RUI_BLOCKED);
    expect(await api.block({ username: 'rui' })).toEqual({ ok: true, value: RUI_BLOCKED });
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: '/blocks',
      body: { username: 'rui' },
    });
  });

  it.each([
    [404, 'USER_NOT_FOUND', { kind: 'user_not_found' }],
    [409, 'ALREADY_FRIENDS', { kind: 'already_friends' }],
    [409, 'REQUEST_ALREADY_SENT', { kind: 'request_already_sent' }],
    [409, 'REQUEST_TO_SELF', { kind: 'request_to_self' }],
    [409, 'USER_BLOCKED_BY_YOU', { kind: 'user_blocked_by_you' }],
    [403, 'FRIEND_LIMIT', { kind: 'friend_limit', limit: 200 }],
    [403, 'OUTGOING_REQUEST_LIMIT', { kind: 'outgoing_request_limit', limit: 50 }],
  ])('sendRequest refused %i %s fails as %o', async (status, code, failure) => {
    transport.respondWith(status, apiError(code));
    expect(await api.sendRequest('bia')).toEqual({ ok: false, failure });
  });

  it.each([
    ['acceptRequest', 404, 'REQUEST_NOT_FOUND', { kind: 'request_not_found' }],
    ['removeFriend', 404, 'FRIEND_NOT_FOUND', { kind: 'friend_not_found' }],
    ['unblock', 404, 'BLOCK_NOT_FOUND', { kind: 'block_not_found' }],
  ] as const)('%s refused %i %s fails as %o', async (method, status, code, failure) => {
    transport.respondWith(status, apiError(code));
    expect(await api[method](BIA.userId)).toEqual({ ok: false, failure });
  });

  it.each([
    [409, 'ALREADY_BLOCKED', { kind: 'already_blocked' }],
    [403, 'BLOCK_LIMIT', { kind: 'block_limit', limit: 200 }],
  ])('block refused %i %s fails as %o', async (status, code, failure) => {
    transport.respondWith(status, apiError(code));
    expect(await api.block({ userId: BIA.userId })).toEqual({ ok: false, failure });
  });

  it.each([
    [400, { kind: 'invalid' }],
    [401, { kind: 'unauthenticated' }],
    [500, { kind: 'unexpected' }],
  ])('a refusal %i without a known code falls to the status as %o', async (status, failure) => {
    transport.respondWith(status, {});
    expect(await api.overview()).toEqual({ ok: false, failure });
  });

  it('a network failure is offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.removeFriend(BIA.userId)).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});
