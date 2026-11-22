// @vitest-environment jsdom
import { getClient } from '@sentry/browser';
import { describe, expect, it } from 'vitest';
import { ApiLoadError } from '@/app/shell/api-loader';
import {
  createSentryClientErrorSink,
  ERROR_REPORT_TUNNEL,
} from '@/error-reports/sentry-client-error-sink';
import { createClientErrorGate } from '@/lib/client-error-gate';
import { SentryBrowserTransportFake } from '../support/sentry-browser-transport-fake';
import { allowDispatchedWindowErrors } from '../support/dispatched-window-errors';

const SETTINGS = {
  dsn: 'https://abc@o1.ingest.de.sentry.io/123',
  environment: 'production',
  release: '80352806',
};
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36';
const DESKTOP = `${BROWSER} Edg/140.0 LorkariumDesktop/1.4.2 LorkariumTitleBar/1`;

function sinkWith(userAgent = BROWSER, maxPerPage = 10) {
  const transport = new SentryBrowserTransportFake();
  const gate = createClientErrorGate({ maxPerPage });
  const sink = createSentryClientErrorSink({
    settings: SETTINGS,
    gate,
    userAgent,
    transport: transport.factory,
  });
  return { sink, transport, gate };
}

async function flushed(): Promise<void> {
  await getClient()?.flush(2000);
}

describe('createSentryClientErrorSink', () => {
  allowDispatchedWindowErrors();

  it('a captured error is one event through the tunnel, with its origin and without user', async () => {
    const { sink, transport } = sinkWith();
    sink.capture(new Error('x'), { source: 'route', routePattern: '/campaigns/:campaignId' });
    await flushed();
    expect(transport.urls).toEqual([ERROR_REPORT_TUNNEL]);
    const [event, ...others] = transport.events;
    expect(others).toEqual([]);
    expect(event?.tags).toMatchObject({ runtime: 'browser', source: 'route' });
    expect(event?.extra).toMatchObject({ routePattern: '/campaigns/:campaignId' });
    expect(event).toMatchObject({ environment: 'production', release: '80352806' });
    expect(event?.user).toBeUndefined();
  });

  it('inside the desktop shell the runtime is desktop, with the shell version', async () => {
    const { sink, transport } = sinkWith(DESKTOP);
    sink.capture(new Error('x'), { source: 'render' });
    await flushed();
    expect(transport.events[0]?.tags).toMatchObject({
      runtime: 'desktop',
      desktop_version: '1.4.2',
    });
  });

  it('a real bug the SDK catches on the window is sent', async () => {
    const { transport } = sinkWith();
    const error = new TypeError('token is undefined');
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));
    await flushed();
    expect(transport.events.map((event) => event.exception?.values?.[0]?.value)).toEqual([
      'token is undefined',
    ]);
  });

  it('a window error the SDK catches passes the same gate: an ApiLoadError sends nothing', async () => {
    const { transport } = sinkWith();
    const error = new ApiLoadError('unexpected');
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));
    await flushed();
    expect(transport.events).toEqual([]);
  });

  it('the 11th error of the page sends nothing', async () => {
    const { transport, gate } = sinkWith();
    for (let index = 0; index < 10; index += 1) gate.admits(new Error(`spent ${index}`));
    const error = new Error('eleventh');
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }));
    await flushed();
    expect(transport.events).toEqual([]);
  });

  it('a console line before the error is not a breadcrumb of it', async () => {
    const { sink, transport } = sinkWith();
    console.log('segredo');
    sink.capture(new Error('x'), { source: 'route' });
    await flushed();
    expect(JSON.stringify(transport.events)).not.toContain('segredo');
  });
});
