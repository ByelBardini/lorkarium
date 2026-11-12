import { beforeEach, describe, expect, it } from 'vitest';
import { HttpAccountPlanApi } from '@/services/account-plan-api';
import { accountPlanOf } from '../support/account-plan-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';

describe('HttpAccountPlanApi', () => {
  let transport: HttpTransportFake;
  let api: HttpAccountPlanApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpAccountPlanApi(transport);
  });

  it('get reads GET /account/plan, whose body is the plan itself', async () => {
    const plan = accountPlanOf('free', { campaignsOwned: 1, storageMegabytes: 40 });
    transport.respondWith(200, plan);
    expect(await api.get()).toEqual({ ok: true, value: plan });
    expect(transport.requests).toEqual([{ method: 'GET', path: '/account/plan', body: undefined }]);
  });

  it('get with a body outside the DTO is unexpected, never trusted', async () => {
    const plan = accountPlanOf('free');
    transport.respondWith(200, { ...plan, usage: { ...plan.usage, campaignsOwned: -1 } });
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
});
