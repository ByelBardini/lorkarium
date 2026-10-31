import {
  SHEET_CONSOLE_MESSAGE_MAX_LENGTH,
  SHEET_CONSOLE_POSITIONS_MAX,
  sheetFrameMessageDto,
} from '@lorkarium/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SHEET_BRIDGE_BOOTSTRAP,
  SHEET_CONSOLE_FRAME_LIMITS,
} from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake, SheetPortFake } from '../support/sheet-frame-fakes';

// Runs the exact text the srcdoc embeds, with the fake as its `window`.
function bootFrame(): SheetFrameWindowFake {
  const frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  return frame;
}

let frame: SheetFrameWindowFake;
let port: SheetPortFake;

function consoleLines(): unknown[] {
  return port.sent.filter((message) => (message as { type: string }).type.startsWith('console'));
}

function lastLine(): { level: string; message: string; at: unknown[] } {
  return consoleLines().at(-1) as { level: string; message: string; at: unknown[] };
}

beforeEach(() => {
  vi.useFakeTimers();
  frame = bootFrame();
  port = new SheetPortFake();
  frame.handOff(port);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sheet bridge bootstrap: the console', () => {
  it('a console.log still logs in the frame and reaches the host as text', () => {
    frame.console.log('Força', 14, { forca: 14 });
    expect(frame.console.calls).toEqual([{ level: 'log', args: ['Força', 14, { forca: 14 }] }]);
    expect(consoleLines()).toEqual([
      { type: 'console', level: 'log', message: 'Força 14 {"forca":14}', at: [] },
    ]);
  });

  it.each(['log', 'info', 'warn', 'error', 'debug'] as const)('keeps the %s level', (level) => {
    frame.console[level]('oi');
    expect(lastLine().level).toBe(level);
  });

  it('a console line sent before the port waits for it', () => {
    const early = bootFrame();
    early.console.warn('cedo');
    const later = new SheetPortFake();
    early.handOff(later);
    expect(later.sent).toEqual([{ type: 'console', level: 'warn', message: 'cedo', at: [] }]);
  });

  it('turns what cannot cross the port into text: cycle, function, node, bigint, symbol', () => {
    const cycle: Record<string, unknown> = { nome: 'Lyra' };
    cycle['self'] = cycle;
    function rolar(): void {}
    frame.console.log(cycle, rolar, document.createElement('div'), 10n, Symbol('pv'), undefined);
    expect(lastLine().message).toBe(
      '{"nome":"Lyra","self":"[circular]"} [function rolar] <div> 10n Symbol(pv) undefined',
    );
  });

  it('a value whose getter throws becomes "[unreadable value]" and the author code goes on', () => {
    const hostile = {
      get boom(): never {
        throw new Error('getter');
      },
    };
    expect(() => frame.console.log(hostile, 'depois')).not.toThrow();
    expect(lastLine().message).toBe('[unreadable value] depois');
  });

  it('an Error is its name, its SDK code when it has one, and its message', () => {
    const refused = Object.defineProperty(new Error('Prévia do editor'), 'code', {
      value: 'PREVIEW_ONLY',
    });
    frame.console.error(new TypeError('x is undefined'), refused);
    expect(lastLine().message).toBe(
      'TypeError: x is undefined Error PREVIEW_ONLY: Prévia do editor',
    );
  });

  it('a long line is cut to the limit with an ellipsis and still fits the contract', () => {
    frame.console.log('x'.repeat(SHEET_CONSOLE_FRAME_LIMITS.messageLength + 50));
    const line = lastLine();
    expect(line.message).toHaveLength(SHEET_CONSOLE_FRAME_LIMITS.messageLength);
    expect(line.message.endsWith('…')).toBe(true);
    expect(sheetFrameMessageDto.safeParse(line).success).toBe(true);
  });

  it('the frame limits are the contract limits', () => {
    expect(SHEET_CONSOLE_FRAME_LIMITS.messageLength).toBe(SHEET_CONSOLE_MESSAGE_MAX_LENGTH);
    expect(SHEET_CONSOLE_FRAME_LIMITS.positions).toBe(SHEET_CONSOLE_POSITIONS_MAX);
  });

  it('the srcdoc positions of an error stack go along, top first, up to the limit', () => {
    const error = new Error('falhou');
    const frames = Array.from({ length: 10 }, (_, at) => `    at f (about:srcdoc:${40 + at}:7)`);
    error.stack = ['Error: falhou', '    at g (blob:x:1:1)', ...frames].join('\n');
    frame.console.error(error);
    expect(lastLine().at).toEqual(
      Array.from({ length: SHEET_CONSOLE_POSITIONS_MAX }, (_, at) => ({
        line: 40 + at,
        column: 7,
      })),
    );
  });
});

describe('sheet bridge bootstrap: the console rate', () => {
  const { lines, windowMs } = SHEET_CONSOLE_FRAME_LIMITS;

  it('a console.log loop sends the limit per window and then one count of the rest', () => {
    for (let at = 0; at < lines + 5; at += 1) frame.console.log(`linha ${at}`);
    expect(consoleLines()).toHaveLength(lines);
    expect(frame.console.calls).toHaveLength(lines + 5);
    vi.advanceTimersByTime(windowMs);
    expect(consoleLines().at(-1)).toEqual({ type: 'console.dropped', count: 5 });
  });

  it('the count goes before the first line of the next window, and only once', () => {
    for (let at = 0; at < lines + 2; at += 1) frame.console.log('laço');
    vi.setSystemTime(Date.now() + windowMs);
    frame.console.log('depois');
    vi.advanceTimersByTime(windowMs);
    expect(consoleLines().slice(lines)).toEqual([
      { type: 'console.dropped', count: 2 },
      { type: 'console', level: 'log', message: 'depois', at: [] },
    ]);
  });
});

describe('sheet bridge bootstrap: uncaught errors', () => {
  it('an error thrown in a click listener reaches the host with its line and column', () => {
    const error = new ReferenceError('pv is not defined');
    error.stack =
      'ReferenceError: pv is not defined\n    at HTMLButtonElement.<anonymous> (about:srcdoc:57:11)';
    frame.throwUncaught({
      message: 'Uncaught ReferenceError: pv is not defined',
      lineno: 57,
      colno: 11,
      error,
    });
    expect(lastLine()).toEqual({
      type: 'console',
      level: 'error',
      message: 'Uncaught ReferenceError: pv is not defined',
      at: [
        { line: 57, column: 11 },
        { line: 57, column: 11 },
      ],
    });
  });

  it('an error event with no message and no line still says what was thrown', () => {
    frame.throwUncaught({ message: '', lineno: 0, error: 'texto' });
    expect(lastLine()).toMatchObject({ message: 'texto', at: [] });
  });

  it('a refusal of the SDK nobody caught says its code', async () => {
    const roll = frame.sdk.dice.roll({ expression: '1d20' });
    port.deliver({ type: 'error', requestId: '1', code: 'PREVIEW_ONLY', message: 'Prévia' });
    const reason = await roll.catch((error: unknown) => error);
    frame.rejectUnhandled(reason);
    expect(lastLine()).toMatchObject({
      level: 'error',
      message: 'Uncaught (in promise) Error PREVIEW_ONLY: Prévia',
    });
  });

  it('every line the frame sends is a valid frame message', () => {
    frame.console.log({ a: [1, 2, { b: null }] });
    frame.throwUncaught({ message: 'Uncaught x', lineno: 3, colno: -1 });
    frame.rejectUnhandled(undefined);
    for (const line of consoleLines())
      expect(sheetFrameMessageDto.safeParse(line).success, JSON.stringify(line)).toBe(true);
  });
});
