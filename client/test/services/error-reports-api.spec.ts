import { beforeEach, describe, expect, it } from 'vitest';
import { HttpErrorReportsApi } from '@/services/error-reports-api';
import { HttpTransportFake } from '../support/http-transport-fake';

const SETTINGS = {
  dsn: 'https://abc@o1.ingest.de.sentry.io/123',
  environment: 'production',
  release: '80352806',
};

describe('HttpErrorReportsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpErrorReportsApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpErrorReportsApi(transport);
  });

  it('settings reads GET /error-reports/settings', async () => {
    transport.respondWith(200, SETTINGS);
    expect(await api.settings()).toEqual(SETTINGS);
    expect(transport.requests).toEqual([
      { method: 'GET', path: '/error-reports/settings', body: undefined },
    ]);
  });

  it('settings without a DSN is null: no SDK is loaded', async () => {
    transport.respondWith(200, { dsn: null, environment: 'production', release: null });
    expect(await api.settings()).toBeNull();
  });

  it.each([
    ['a 500', (fake: HttpTransportFake) => fake.respondWith(500, { code: 'X', message: 'x' })],
    ['the network down', (fake: HttpTransportFake) => fake.failWithNetworkDown()],
    ['a body outside the DTO', (fake: HttpTransportFake) => fake.respondWith(200, { dsn: 1 })],
  ])('settings with %s is null and the app goes on', async (_case, answer) => {
    answer(transport);
    expect(await api.settings()).toBeNull();
  });

  it('triggerServerTest posts the test and reads the 500 as the expected outcome', async () => {
    transport.respondWith(500, { code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
    expect(await api.triggerServerTest()).toBe('server-error');
    expect(transport.requests).toEqual([
      { method: 'POST', path: '/admin/error-reports/test', body: undefined },
    ]);
  });

  it.each([403, 200])('triggerServerTest answered %i is unexpected', async (status) => {
    transport.respondWith(status, { code: 'FORBIDDEN_ROLE', message: 'x' });
    expect(await api.triggerServerTest()).toBe('unexpected');
  });

  it('triggerServerTest offline is offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.triggerServerTest()).toBe('offline');
  });
});
