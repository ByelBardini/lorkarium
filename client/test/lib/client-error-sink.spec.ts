// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createClientErrorGate } from '@/lib/client-error-gate';
import { createBufferedClientErrorSink, type ClientErrorContext } from '@/lib/client-error-sink';
import { ClientErrorSinkFake } from '../support/client-error-sink-fake';
import { allowDispatchedWindowErrors } from '../support/dispatched-window-errors';

function buffered(maxPerPage = 10) {
  const gate = createClientErrorGate({ maxPerPage });
  return createBufferedClientErrorSink({ gate, maxBuffered: 10, scope: window });
}

const ROUTE: ClientErrorContext = { source: 'route', routePattern: '/campaigns/:campaignId' };

describe('createBufferedClientErrorSink', () => {
  allowDispatchedWindowErrors();

  it('hands the errors caught before the SDK to the real sink, in order', () => {
    const { sink, attach } = buffered();
    const errors = [new Error('a'), new Error('b'), new Error('c')];
    for (const error of errors) sink.capture(error, ROUTE);
    const real = new ClientErrorSinkFake();
    attach(real);
    expect(real.captured.map(([error]) => error)).toEqual(errors);
  });

  it('keeps at most 10 while waiting', () => {
    const { sink, attach } = buffered(20);
    for (let index = 0; index < 12; index += 1) sink.capture(new Error(`e${index}`), ROUTE);
    const real = new ClientErrorSinkFake();
    attach(real);
    expect(real.captured).toHaveLength(10);
  });

  it('after attach it captures straight away', () => {
    const { sink, attach } = buffered();
    const real = new ClientErrorSinkFake();
    attach(real);
    sink.capture(new Error('late'), ROUTE);
    expect(real.captured).toEqual([[new Error('late'), ROUTE]]);
  });

  it('a window error before attach is buffered; after attach the listener is gone', () => {
    const { attach } = buffered();
    const early = new Error('early');
    window.dispatchEvent(new ErrorEvent('error', { error: early, message: 'early' }));
    const real = new ClientErrorSinkFake();
    attach(real);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('late'), message: 'late' }));
    expect(real.captured).toEqual([[early, { source: 'window' }]]);
  });

  it('an expected failure never reaches the buffer', () => {
    const { sink, attach } = buffered();
    sink.capture(new TypeError('Failed to fetch'), ROUTE);
    const real = new ClientErrorSinkFake();
    attach(real);
    expect(real.captured).toEqual([]);
  });
});
