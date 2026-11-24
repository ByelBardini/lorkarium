import { describe, expect, it } from 'vitest';
import { createSheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { localSheetViewSlot, type SheetViewSlot } from '@/stores/sheet-view-store';
import { SheetHostPortFake } from '../support/sheet-host-port-fake';

const viewSet = (requestId: string, value: unknown) => ({ type: 'view.set', requestId, value });

function readyPreview(view?: SheetViewSlot, now: () => number = () => 0) {
  const port = new SheetHostPortFake();
  createSheetPreviewHost(port, { view, now });
  port.fromFrame({ type: 'ready', requestId: '1' });
  return port;
}

describe('sheet preview host: view.set', () => {
  it('the first state carries view null', () =>
    expect(readyPreview().ofType('state').at(-1)?.view).toBeNull());

  it('answers a bare result with no new state', () => {
    const port = readyPreview();
    port.fromFrame(viewSet('2', { aba: 'origem' }));
    expect({ result: port.ofType('result').at(-1), states: port.ofType('state').length }).toEqual({
      result: { type: 'result', requestId: '2' },
      states: 1,
    });
  });

  it('a new frame on the same slot ("Rodar de novo") starts from the kept view', () => {
    const view = localSheetViewSlot();
    readyPreview(view).fromFrame(viewSet('2', { aba: 'origem' }));
    expect(readyPreview(view).ofType('state').at(-1)?.view).toEqual({ aba: 'origem' });
  });

  it('a new preview with no slot of its own starts with none', () => {
    readyPreview().fromFrame(viewSet('2', { aba: 'origem' }));
    expect(readyPreview().ofType('state').at(-1)?.view).toBeNull();
  });

  it('past 60 in 10 s is RATE_LIMITED, as in the room', () => {
    const view = localSheetViewSlot();
    const port = readyPreview(view);
    for (let at = 1; at <= 61; at += 1) port.fromFrame(viewSet(`${at + 1}`, at));
    expect({ codes: port.ofType('error').map(({ code }) => code), kept: view.current() }).toEqual({
      codes: ['RATE_LIMITED'],
      kept: 60,
    });
  });
});
