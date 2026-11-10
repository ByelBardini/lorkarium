import type {
  SheetConsoleFrameLimits,
  SheetFrameErrorEvent,
  SheetFrameRejectionEvent,
  SheetFrameScope,
} from './sheet-bridge-bootstrap';

/** The frame's console as the bootstrap drives it: `logged` writes a line (to the original
 *  console and to the host), the two handlers take the window's uncaught errors and `wrap`
 *  replaces `console.log/info/warn/error/debug`. */
export interface SheetFrameConsoleCapture {
  logged(level: string, args: unknown[]): void;
  onScriptError(event: SheetFrameErrorEvent): void;
  onRejection(event: SheetFrameRejectionEvent): void;
  wrap(): void;
}

/** Builds the capture over `send` (the SDK's queue to the port). */
export type SheetFrameConsoleFactory = (
  scope: SheetFrameScope,
  limits: SheetConsoleFrameLimits,
  send: (message: object) => void,
) => SheetFrameConsoleCapture;

// Serialized by `toString` into the srcdoc, like the bootstrap: it may reference nothing outside
// its own body. Out of the bootstrap only so that file stays under 500 lines. JSON, the console,
// the timer and the clock are captured when the bootstrap calls it, before the author's code.
function createFrameConsole(
  scope: SheetFrameScope,
  limits: SheetConsoleFrameLimits,
  send: (message: object) => void,
): SheetFrameConsoleCapture {
  const stringify = JSON.stringify;
  const now = Date.now;
  const later = scope.setTimeout.bind(scope);
  const frameConsole = scope.console;
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const originals: Partial<Record<string, (...args: unknown[]) => void>> = Object.create(null);
  const lineWindow = { start: -Infinity, lines: 0, dropped: 0, flushing: false };

  function flushDropped(): void {
    lineWindow.flushing = false;
    if (lineWindow.dropped === 0) return;
    send({ type: 'console.dropped', count: lineWindow.dropped });
    lineWindow.dropped = 0;
  }

  // A fixed window: a `console.log` loop sends `lines` per window and one count of the rest.
  function admitLine(): boolean {
    const at = now();
    if (at - lineWindow.start >= limits.windowMs) {
      flushDropped();
      lineWindow.start = at;
      lineWindow.lines = 0;
    }
    if (lineWindow.lines < limits.lines) {
      lineWindow.lines += 1;
      return true;
    }
    lineWindow.dropped += 1;
    if (!lineWindow.flushing) {
      lineWindow.flushing = true;
      later(flushDropped, lineWindow.start + limits.windowMs - at);
    }
    return false;
  }

  function errorTextOf(error: Error): string {
    const code = (error as { code?: unknown }).code;
    const name = typeof code === 'string' ? `${error.name} ${code}` : error.name;
    return `${name}: ${error.message}`;
  }

  // Whatever the author logs becomes plain text here: a cycle, a throwing getter, a Proxy or a
  // DOM node never reach `postMessage`, which would throw or clone too much.
  function plainOf(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'symbol') return String(value);
    if (typeof value !== 'object' || value === null) return value;
    if (value instanceof Error) return errorTextOf(value);
    const node = value as { nodeType?: unknown; nodeName?: unknown };
    if (typeof node.nodeType === 'number' && typeof node.nodeName === 'string')
      return `<${node.nodeName.toLowerCase()}>`;
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value;
  }

  function textOf(value: unknown): string {
    try {
      if (typeof value === 'string') return value;
      const root = plainOf(value, new WeakSet());
      if (typeof root !== 'object' || root === null) return String(root);
      const seen = new WeakSet<object>();
      const text: unknown = stringify(value, (_key, inner: unknown) => plainOf(inner, seen));
      return typeof text === 'string' ? text : '[object]';
    } catch {
      return '[unreadable value]';
    }
  }

  function cut(text: string): string {
    if (text.length <= limits.messageLength) return text;
    return `${text.slice(0, limits.messageLength - 1)}…`;
  }

  function positionsOf(error: unknown): Array<{ line: number; column: number }> {
    const found: Array<{ line: number; column: number }> = [];
    try {
      const stack = (error as { stack?: unknown } | null | undefined)?.stack;
      if (typeof stack !== 'string') return found;
      const pattern = /about:srcdoc:(\d+):(\d+)/g;
      let match = pattern.exec(stack);
      while (match && found.length < limits.positions) {
        found[found.length] = { line: Number(match[1]), column: Number(match[2]) };
        match = pattern.exec(stack);
      }
    } catch {
      // A stack that cannot be read has no position.
    }
    return found.filter((position) => position.line >= 1);
  }

  function report(level: string, message: string, at: Array<{ line: number; column: number }>) {
    if (!admitLine()) return;
    send({ type: 'console', level, message: cut(message), at: at.slice(0, limits.positions) });
  }

  function logged(level: string, args: unknown[]): void {
    const original = originals[level];
    if (original) original.apply(frameConsole, args);
    try {
      const error = args.find((arg) => arg instanceof Error);
      report(level, args.map(textOf).join(' '), positionsOf(error));
    } catch {
      // The console never breaks the author's code.
    }
  }

  function wrap(): void {
    const methods = frameConsole as unknown as Record<string, unknown>;
    for (let index = 0; index < levels.length; index += 1) {
      const level = levels[index]!;
      const original = methods[level];
      if (typeof original !== 'function') continue;
      originals[level] = original as (...args: unknown[]) => void;
      methods[level] = (...args: unknown[]) => logged(level, args);
    }
  }

  function scriptPositionOf(event: SheetFrameErrorEvent): Array<{ line: number; column: number }> {
    const { lineno, colno } = event;
    if (typeof lineno !== 'number' || !(lineno >= 1)) return [];
    return [{ line: lineno, column: typeof colno === 'number' && colno >= 0 ? colno : 0 }];
  }

  function onScriptError(event: SheetFrameErrorEvent): void {
    const said = event.message;
    const message = typeof said === 'string' && said !== '' ? said : textOf(event.error);
    report('error', message, scriptPositionOf(event).concat(positionsOf(event.error)));
  }

  function onRejection(event: SheetFrameRejectionEvent): void {
    report('error', `Uncaught (in promise) ${textOf(event.reason)}`, positionsOf(event.reason));
  }

  return { logged, onScriptError, onRejection, wrap };
}

/** The text of `createFrameConsole`, for the bootstrap to embed and call. */
export const SHEET_FRAME_CONSOLE_SOURCE: string = createFrameConsole.toString();
