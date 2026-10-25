import { describe, expect, it } from 'vitest';
import {
  batchKeyOf,
  bootKeyOf,
  httpAccessRecordOf,
  realtimeAccessRecordOf,
  ROUTE_MAX_LENGTH,
  type HttpAccessFacts,
} from '../../../src/modules/access-log/access-log.bo';

const ANA_ID = '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01';

function answered(overrides: Partial<HttpAccessFacts> = {}): HttpAccessFacts {
  return {
    at: new Date('2026-10-25T03:04:05.678Z'),
    ip: '203.0.113.7',
    userId: ANA_ID,
    method: 'GET',
    routePattern: '/api/campaigns/:campaignId',
    url: '/api/campaigns/9b1f?tab=scenes',
    status: 200,
    ...overrides,
  };
}

describe('httpAccessRecordOf', () => {
  it('keeps the UTC time, the IP, the account, the method, the declared route and the status', () => {
    expect(httpAccessRecordOf(answered())).toStrictEqual({
      kind: 'http',
      at: '2026-10-25T03:04:05.678Z',
      ip: '203.0.113.7',
      userId: ANA_ID,
      method: 'GET',
      route: '/api/campaigns/:campaignId',
      status: 200,
    });
  });

  it('an anonymous request is kept with no account', () => {
    const record = httpAccessRecordOf(answered({ userId: null, routePattern: '/api/auth/login' }));

    expect(record).toMatchObject({ userId: null, route: '/api/auth/login' });
  });

  it('the health check the container polls is not a person using the app: no line', () => {
    expect(httpAccessRecordOf(answered({ routePattern: '/api/health' }))).toBeNull();
  });

  it('with no route matched the path is kept without the query string', () => {
    const facts = answered({ routePattern: undefined, url: '/campaigns/9b1f?code=XYZ' });

    expect(httpAccessRecordOf(facts)?.route).toBe('/campaigns/9b1f');
  });

  it(`a path no route matched is cut at ${ROUTE_MAX_LENGTH} characters`, () => {
    const facts = answered({
      routePattern: undefined,
      url: `/${'x'.repeat(ROUTE_MAX_LENGTH * 2)}`,
    });

    expect(httpAccessRecordOf(facts)?.route).toHaveLength(ROUTE_MAX_LENGTH);
  });
});

describe('realtimeAccessRecordOf', () => {
  it('keeps the kind, the UTC time, the IP and the account of the connection', () => {
    const facts = { at: new Date('2026-10-25T03:04:05Z'), ip: '2001:db8::7', userId: ANA_ID };

    expect(realtimeAccessRecordOf('realtime-disconnect', facts)).toStrictEqual({
      kind: 'realtime-disconnect',
      at: '2026-10-25T03:04:05.000Z',
      ip: '2001:db8::7',
      userId: ANA_ID,
    });
  });
});

describe('batchKeyOf', () => {
  it('files the batch under the UTC day and time of its first line, the boot and the sequence', () => {
    expect(batchKeyOf('2026-10-25T03:04:05.678Z', 'a1b2c3d4', 7)).toBe(
      'access-log/2026/10/25/030405Z-a1b2c3d4-7.jsonl.gz',
    );
  });

  it('two boots flushing in the same second (a rolling update) never share a key', () => {
    const at = '2026-10-25T03:04:05.000Z';

    expect(batchKeyOf(at, 'a1b2c3d4', 0)).not.toBe(batchKeyOf(at, 'e5f6a7b8', 0));
  });
});

describe('bootKeyOf', () => {
  it('files the boot marker apart from the batches, under the UTC day and time of the boot', () => {
    // 22:30 in Brasília is already the next day in UTC.
    const at = new Date('2026-10-24T22:30:00-03:00');

    expect(bootKeyOf(at, 'a1b2c3d4')).toBe('access-log/boots/2026/10/25/013000Z-a1b2c3d4.jsonl.gz');
  });
});
