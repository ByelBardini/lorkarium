import { beforeEach, describe, expect, it } from 'vitest';
import { HttpUserAdminApi } from '@/services/user-admin-api';
import { TEST_NOW } from '../support/app-dependencies';
import { HttpTransportFake } from '../support/http-transport-fake';
import { bia, marinaInvited } from '../support/user-admin-api-fake';

const BIA = bia(TEST_NOW);
const MARINA = marinaInvited(TEST_NOW);

describe('HttpUserAdminApi', () => {
  let transport: HttpTransportFake;
  let api: HttpUserAdminApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpUserAdminApi(transport);
  });

  function refuse(status: number, body: object): void {
    transport.respondWith(status, { message: 'x', ...body });
  }

  it('directory reads GET /admin/users', async () => {
    transport.respondWith(200, { users: [BIA], invitations: [MARINA] });
    expect(await api.directory()).toEqual({
      ok: true,
      value: { users: [BIA], invitations: [MARINA] },
    });
    expect(transport.requests[0]).toMatchObject({ method: 'GET', path: '/admin/users' });
  });

  it.each([
    [
      'invite',
      () => api.invite({ email: 'm@x.com', role: 'user' }),
      'POST',
      '/admin/invitations',
      { email: 'm@x.com', role: 'user' },
    ],
    [
      'resendInvitation',
      () => api.resendInvitation('inv-1'),
      'POST',
      '/admin/invitations/inv-1/resend',
      undefined,
    ],
    [
      'changeRole',
      () => api.changeRole('u-1', 'admin'),
      'PATCH',
      '/admin/users/u-1',
      { role: 'admin' },
    ],
    ['suspend', () => api.suspend('u-1'), 'POST', '/admin/users/u-1/suspend', undefined],
    ['reactivate', () => api.reactivate('u-1'), 'POST', '/admin/users/u-1/reactivate', undefined],
    [
      'sendPasswordLink',
      () => api.sendPasswordLink('u-1'),
      'POST',
      '/admin/users/u-1/password-reset',
      undefined,
    ],
    [
      'deletionCheck',
      () => api.deletionCheck('u-1'),
      'GET',
      '/admin/users/u-1/deletion-check',
      undefined,
    ],
  ] as const)('%s goes %s %s', async (_, send, method, path, body) => {
    transport.respondWith(200, {});
    await send();
    expect(transport.requests[0]).toEqual({ method, path, body });
  });

  it.each([
    ['cancelInvitation', () => api.cancelInvitation('inv-1'), '/admin/invitations/inv-1'],
    ['deleteUser', () => api.deleteUser('u-1'), '/admin/users/u-1'],
  ] as const)('%s DELETEs %s and a 204 is done', async (_, send, path) => {
    transport.respondWith(204, null);
    expect(await send()).toEqual({ ok: true, value: null });
    expect(transport.requests[0]).toMatchObject({ method: 'DELETE', path });
  });

  it.each([
    [401, { code: 'UNAUTHENTICATED' }, { kind: 'unauthenticated' }],
    [403, { code: 'FORBIDDEN_ROLE' }, { kind: 'forbidden' }],
    [409, { code: 'SELF_ACTION' }, { kind: 'self_action' }],
    [409, { code: 'EMAIL_TAKEN' }, { kind: 'email_taken' }],
    [409, { code: 'ACCOUNT_SUSPENDED' }, { kind: 'account_suspended' }],
    [404, { code: 'USER_NOT_FOUND' }, { kind: 'not_found' }],
    [400, { code: 'INVALID_BODY' }, { kind: 'invalid' }],
    [
      429,
      { code: 'RATE_LIMITED', retryAfterSeconds: 42 },
      { kind: 'rate_limited', retryAfterSeconds: 42 },
    ],
  ] as const)('a %i %o fails as %o', async (status, body, failure) => {
    refuse(status, body);
    expect(await api.suspend('u-1')).toEqual({ ok: false, failure });
  });

  it('OWNS_SHARED_CAMPAIGNS carries the blocking tables', async () => {
    const blockingCampaigns = [
      { id: '0f0e0d0c-0b0a-4909-8807-060504030201', name: 'Vharn', otherMembers: 3 },
    ];
    refuse(409, { code: 'OWNS_SHARED_CAMPAIGNS', blockingCampaigns });
    expect(await api.deleteUser('u-1')).toEqual({
      ok: false,
      failure: { kind: 'owns_shared_campaigns', blockingCampaigns },
    });
  });

  it('ALREADY_INVITED carries the pending invitation id', async () => {
    refuse(409, { code: 'ALREADY_INVITED', invitationId: MARINA.id });
    expect(await api.invite({ email: 'marina@exemplo.com', role: 'user' })).toEqual({
      ok: false,
      failure: { kind: 'already_invited', invitationId: MARINA.id },
    });
  });

  it('offline fails as offline and a body outside the DTO as unexpected', async () => {
    transport.failWithNetworkDown();
    expect(await api.directory()).toEqual({ ok: false, failure: { kind: 'offline' } });
    transport.respondWith(200, { users: 'nope' });
    expect(await api.directory()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('mailSamples reads GET /admin/mail-samples', async () => {
    const samples = [
      { id: 'invitation', name: 'Convite', subject: 'Lucas convidou você para o Lorkarium' },
    ];
    transport.respondWith(200, { samples });
    expect(await api.mailSamples()).toEqual({ ok: true, value: samples });
    expect(transport.requests[0]).toMatchObject({ method: 'GET', path: '/admin/mail-samples' });
  });

  it('sendMailSample POSTs the address to the sample and a 502 fails as mail_delivery_failed', async () => {
    transport.respondWith(200, { subject: 'Convite', to: 'eu@x.com' });
    expect(await api.sendMailSample('invitation', 'eu@x.com')).toEqual({
      ok: true,
      value: { subject: 'Convite', to: 'eu@x.com' },
    });
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: '/admin/mail-samples/invitation/send',
      body: { to: 'eu@x.com' },
    });
    refuse(502, { code: 'MAIL_DELIVERY_FAILED' });
    expect(await api.sendMailSample('invitation', 'eu@x.com')).toEqual({
      ok: false,
      failure: { kind: 'mail_delivery_failed' },
    });
  });
});
