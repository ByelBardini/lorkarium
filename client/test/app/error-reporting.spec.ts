// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { startErrorReporting } from '@/app/error-reporting';
import type { ErrorReportsApi, ErrorReportingSettings } from '@/services/error-reports-api';
import { ClientErrorSinkFake } from '../support/client-error-sink-fake';

const SETTINGS: ErrorReportingSettings = {
  dsn: 'https://abc@o1.ingest.de.sentry.io/123',
  environment: 'production',
  release: null,
};

/** Answers the settings it was given; counts the server tests it was asked for. */
class ErrorReportsApiFake implements ErrorReportsApi {
  constructor(private readonly answer: ErrorReportingSettings | null) {}

  settings(): Promise<ErrorReportingSettings | null> {
    return Promise.resolve(this.answer);
  }

  triggerServerTest(): Promise<'server-error'> {
    return Promise.resolve('server-error');
  }
}

async function settled(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

describe('startErrorReporting', () => {
  it('with a DSN, what was caught before the SDK reaches it once it loads', async () => {
    const real = new ClientErrorSinkFake();
    let loads = 0;
    const errors = startErrorReporting({
      api: new ErrorReportsApiFake(SETTINGS),
      userAgent: 'x',
      scope: window,
      loadSentry: () => {
        loads += 1;
        return Promise.resolve(() => real);
      },
    });
    errors.capture(new Error('early'), { source: 'render' });
    await settled();
    expect(loads).toBe(1);
    expect(real.captured).toEqual([[new Error('early'), { source: 'render' }]]);
  });

  it('without a DSN the SDK is never loaded', async () => {
    let loads = 0;
    const errors = startErrorReporting({
      api: new ErrorReportsApiFake(null),
      userAgent: 'x',
      scope: window,
      loadSentry: () => {
        loads += 1;
        return Promise.reject(new Error('should not load'));
      },
    });
    errors.capture(new Error('x'), { source: 'route' });
    await settled();
    expect(loads).toBe(0);
  });

  it('an SDK chunk that fails to load stops listening to the window and reports nothing', async () => {
    const scope = new WindowListenersFake();
    const errors = startErrorReporting({
      api: new ErrorReportsApiFake(SETTINGS),
      userAgent: 'x',
      scope,
      loadSentry: () =>
        Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    });
    await settled();
    errors.capture(new Error('x'), { source: 'route' });
    expect(scope.listening).toEqual([]);
  });
});

/** The window events listened to right now, by name. */
class WindowListenersFake {
  listening: string[] = [];

  addEventListener(type: string): void {
    this.listening.push(type);
  }

  removeEventListener(type: string): void {
    this.listening = this.listening.filter((each) => each !== type);
  }
}
