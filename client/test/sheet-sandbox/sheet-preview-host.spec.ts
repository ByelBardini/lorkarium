import { describe, expect, it } from 'vitest';
import { SHEET_PREVIEW_BAR_ID, createSheetPreviewHost } from '@/sheet-sandbox/sheet-preview-host';
import { SheetHostPortFake } from '../support/sheet-host-port-fake';

function readyPreview(): SheetHostPortFake {
  const port = new SheetHostPortFake();
  createSheetPreviewHost(port);
  port.fromFrame({ type: 'ready', requestId: '1' });
  return port;
}

describe('sheet preview host', () => {
  it('answers ready with the sample state: token "Exemplo", PV 20/20, editable', () => {
    const port = readyPreview();
    expect(port.ofType('result')).toEqual([{ type: 'result', requestId: '1' }]);
    const [state] = port.ofType('state');
    expect(state?.token).toEqual({ name: 'Exemplo', image: null });
    expect(state?.bars).toEqual([
      expect.objectContaining({ id: SHEET_PREVIEW_BAR_ID, label: 'PV', current: 20, max: 20 }),
    ]);
    expect(state?.canEdit).toBe(true);
    expect(state?.values).toEqual({});
  });

  it('no state goes out before ready', () => {
    const port = new SheetHostPortFake();
    createSheetPreviewHost(port);
    port.fromFrame({ type: 'values.set', requestId: '1', changes: { forca: 16 } });
    expect(port.ofType('state')).toEqual([]);
    expect(port.started).toBe(true);
  });

  it('values.set keeps the values here and sends the new state (null removes a key)', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'values.set', requestId: '2', changes: { forca: 16, notas: 'x' } });
    port.fromFrame({ type: 'values.set', requestId: '3', changes: { notas: null } });
    expect(port.ofType('state').at(-1)?.values).toEqual({ forca: 16 });
    expect(port.ofType('result').map(({ requestId }) => requestId)).toEqual(['1', '2', '3']);
  });

  it('bars.adjust moves the sample bar by the game-core rule, named by its id', () => {
    const port = readyPreview();
    const change = { op: 'add', amount: -5 };
    port.fromFrame({ type: 'bars.adjust', requestId: '2', bar: SHEET_PREVIEW_BAR_ID, change });
    expect(port.ofType('state').at(-1)?.bars[0]?.current).toBe(15);
  });

  it('bars.adjust finds the sample bar by its label, with no case', () => {
    const port = readyPreview();
    port.fromFrame({
      type: 'bars.adjust',
      requestId: '2',
      bar: 'pv',
      change: { op: 'set', value: 3 },
    });
    expect(port.ofType('state').at(-1)?.bars[0]?.current).toBe(3);
  });

  it('bars.adjust on another bar is BAR_NOT_FOUND and leaves the bar', () => {
    const port = readyPreview();
    port.fromFrame({
      type: 'bars.adjust',
      requestId: '2',
      bar: 'Mana',
      change: { op: 'set', value: 1 },
    });
    expect(port.ofType('error')).toEqual([
      expect.objectContaining({ requestId: '2', code: 'BAR_NOT_FOUND' }),
    ]);
    expect(port.ofType('state')).toHaveLength(1);
  });

  it('the new state goes before the result, so the frame reads it when the promise settles', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'values.set', requestId: '2', changes: { forca: 16 } });
    expect(port.sent.slice(-2).map(({ type }) => type)).toEqual(['state', 'result']);
  });

  it('dice.roll is never rolled: an error says it is a preview', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'dice.roll', requestId: '2', expression: '1d20+5' });
    const [error] = port.ofType('error');
    expect(error).toMatchObject({ requestId: '2', code: 'PREVIEW_ONLY' });
    expect(error?.message).toMatch(/Prévia/);
  });

  it('a message outside the DTO is INVALID_MESSAGE with the readable requestId', () => {
    const port = readyPreview();
    port.fromFrame({ type: 'ready', requestId: '2', tokenId: 'x' });
    port.fromFrame('not an object');
    expect(port.ofType('error').map(({ requestId, code }) => [requestId, code])).toEqual([
      ['2', 'INVALID_MESSAGE'],
      [null, 'INVALID_MESSAGE'],
    ]);
  });

  it('a console line goes to onConsole and the frame gets no answer', () => {
    const port = new SheetHostPortFake();
    const lines: unknown[] = [];
    createSheetPreviewHost(port, { onConsole: (line) => lines.push(line), now: () => 0 });
    port.fromFrame({ type: 'ready', requestId: '1' });
    const answered = port.sent.length;
    const line = { type: 'console', level: 'error', message: 'pv is not defined', at: [] };
    port.fromFrame(line);
    expect({ lines, sent: port.sent.slice(answered) }).toEqual({ lines: [line], sent: [] });
  });

  it('a console line past the contract is refused like any other message', () => {
    const port = new SheetHostPortFake();
    const lines: unknown[] = [];
    createSheetPreviewHost(port, { onConsole: (line) => lines.push(line) });
    port.fromFrame({ type: 'console', level: 'log', message: 'x'.repeat(2001), at: [] });
    expect(lines).toEqual([]);
    expect(port.ofType('error')[0]).toMatchObject({ requestId: null, code: 'INVALID_MESSAGE' });
  });

  it('dispose stops listening and closes the port', () => {
    const port = new SheetHostPortFake();
    createSheetPreviewHost(port).dispose();
    port.fromFrame({ type: 'ready', requestId: '1' });
    expect(port.sent).toEqual([]);
    expect(port.closed).toBe(true);
  });
});
