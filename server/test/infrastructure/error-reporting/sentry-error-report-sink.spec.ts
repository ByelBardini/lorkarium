import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import { SentryErrorReportSink } from '../../../src/infrastructure/error-reporting/sentry-error-report-sink';
import type { ErrorReport } from '../../../src/modules/error-reports/error-report-sink.port';
import { unexpectedErrorOf } from '../../../src/modules/error-reports/unexpected-error.mapper';
import { SentryTransportFake } from '../../support/sentry-transport-fake';

const CONFIG = {
  dsn: 'https://abc@o1.ingest.de.sentry.io/123',
  environment: 'staging',
  release: '80352806',
};

function reportOf(args: readonly unknown[], bindings: Record<string, unknown> = {}): ErrorReport {
  return { ...unexpectedErrorOf(args, bindings), fingerprint: 'f', suppressed: 0 };
}

async function sentEvents(report: ErrorReport) {
  const transport = new SentryTransportFake();
  const sink = new SentryErrorReportSink({ config: CONFIG, transport: transport.factory });
  sink.capture(report);
  expect(await sink.flush(2000)).toBe(true);
  return transport.events;
}

describe('SentryErrorReportSink.capture', () => {
  it('an error becomes one event with its frames, the account, the runtime and the release', async () => {
    const bindings = { userId: 'u-1', username: 'bia', route: '/api/x/:id', method: 'GET' };
    const [event, ...others] = await sentEvents(
      reportOf([{ err: new TypeError('x is undefined') }, 'unexpected'], bindings),
    );
    expect(others).toEqual([]);
    const exception = event?.exception?.values?.[0];
    expect(exception).toMatchObject({ type: 'TypeError', value: 'x is undefined' });
    expect(exception?.stacktrace?.frames?.length).toBeGreaterThan(0);
    expect(event?.user).toEqual({ id: 'u-1', username: 'bia' });
    expect(event?.tags).toMatchObject({ runtime: 'server', route: '/api/x/:id', method: 'GET' });
    expect(event).toMatchObject({ environment: 'staging', release: '80352806' });
  });

  it('a pg cause under a Drizzle error is a second, linked exception', async () => {
    const cause = new Error('connection terminated');
    const failed = new DrizzleQueryError('select 1', [], cause);
    const [event] = await sentEvents(reportOf([{ err: failed }, 'unexpected']));
    expect(event?.exception?.values?.map((value) => value.value)).toEqual([
      'connection terminated',
      'Failed query: select 1',
    ]);
  });

  it('a log line without an error is an error-level message with the fields as extra', async () => {
    const [event] = await sentEvents(reportOf([{ lost: 3 }, 'access log lines lost on close']));
    expect(event).toMatchObject({ level: 'error', message: 'access log lines lost on close' });
    expect(event?.extra).toMatchObject({ lost: 3 });
  });

  it('nothing personal leaves: no IP, request, host name nor query params', async () => {
    const failed = new DrizzleQueryError('select "id"', ['bia@x.com'], undefined);
    const [event] = await sentEvents(reportOf([{ err: failed, params: ['bia@x.com'] }, 'z']));
    expect(event?.user?.ip_address).toBeUndefined();
    expect(event).not.toHaveProperty('request');
    expect(event).not.toHaveProperty('server_name');
    expect(event?.extra).not.toHaveProperty('params');
    expect(JSON.stringify(event)).not.toContain('bia@x.com');
  });

  it('the count the throttle silenced goes along', async () => {
    const report = { ...reportOf([new Error('boom')]), suppressed: 3 };
    const [event] = await sentEvents(report);
    expect(event?.extra).toMatchObject({ suppressed: 3 });
  });
});
