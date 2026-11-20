import { beforeEach, describe, expect, it } from 'vitest';
import { HttpSanctionsApi } from '@/services/sanctions-api';
import { TEST_NOW } from '../support/app-dependencies';
import { HttpTransportFake } from '../support/http-transport-fake';
import { biaWarning } from '../support/sanctions-api-fake';
import { bia } from '../support/user-admin-api-fake';

const BIA = bia(TEST_NOW);
const WARNING = biaWarning(TEST_NOW);
const BODY = { kind: 'warning', rule: 'spam', statement: 'Mandou propaganda.' } as const;

describe('HttpSanctionsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpSanctionsApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpSanctionsApi(transport);
  });

  it('issue POSTs the measure and answers it with the account', async () => {
    transport.respondWith(201, { sanction: WARNING, user: BIA });

    expect(await api.issue(BIA.id, BODY)).toEqual({
      ok: true,
      value: { sanction: WARNING, user: BIA },
    });
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: `/admin/users/${BIA.id}/sanctions`,
      body: BODY,
    });
  });

  it('a ban is 201 too: the account suspended and the date of its deletion', async () => {
    const ban = { ...WARNING, kind: 'ban', deletionDueAt: '2026-12-05T12:00:00.000Z' } as const;
    const suspended = { ...BIA, status: 'suspended' } as const;
    transport.respondWith(201, { sanction: ban, user: suspended });

    expect(await api.issue(BIA.id, { ...BODY, kind: 'ban' })).toEqual({
      ok: true,
      value: { sanction: ban, user: suspended },
    });
  });

  it('a body the DTO refuses never leaves: invalid', async () => {
    const bad = { ...BODY, kind: 'warning', until: '2026-12-01T00:00:00.000Z' } as const;

    expect(await api.issue(BIA.id, bad)).toEqual({ ok: false, failure: { kind: 'invalid' } });
    expect(transport.requests).toEqual([]);
  });

  it('history reads GET …/sanctions as the list', async () => {
    transport.respondWith(200, { sanctions: [WARNING] });

    expect(await api.history(BIA.id)).toEqual({ ok: true, value: [WARNING] });
    expect(transport.requests[0]).toMatchObject({
      method: 'GET',
      path: `/admin/users/${BIA.id}/sanctions`,
    });
  });

  it('recordAppeal PUTs the step to the measure', async () => {
    transport.respondWith(200, { sanction: WARNING, user: BIA });

    await api.recordAppeal(WARNING.id, { outcome: 'received' });

    expect(transport.requests[0]).toEqual({
      method: 'PUT',
      path: `/admin/sanctions/${WARNING.id}/appeal`,
      body: { outcome: 'received' },
    });
  });

  it('an answer off the DTO is unexpected', async () => {
    transport.respondWith(201, { sanction: { ...WARNING, kind: 'kick' }, user: BIA });

    expect(await api.issue(BIA.id, BODY)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it.each([
    [409, { code: 'ALREADY_SUSPENDED' }, { kind: 'already_suspended' }],
    [400, { code: 'SANCTION_UNTIL_PAST' }, { kind: 'sanction_until_past' }],
    [409, { code: 'TARGET_IS_ADMIN' }, { kind: 'target_is_admin' }],
    [409, { code: 'APPEAL_ALREADY_DECIDED' }, { kind: 'appeal_already_decided' }],
    [404, { code: 'SANCTION_REPORT_NOT_FOUND' }, { kind: 'not_found' }],
    [409, { code: 'SELF_ACTION' }, { kind: 'self_action' }],
    [403, { code: 'FORBIDDEN_ROLE' }, { kind: 'forbidden' }],
  ] as const)('a %i %o fails as %o', async (status, body, failure) => {
    transport.respondWith(status, { message: 'x', ...body });

    expect(await api.issue(BIA.id, BODY)).toEqual({ ok: false, failure });
  });
});
