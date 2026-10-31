/** The frame's end of the host's `MessageChannel` (a `MessagePort` inside the frame). */
export interface SheetSdkPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  start(): void;
}

/** A `message` event on the frame's `window`, reduced to what the bootstrap reads. */
export interface SheetFrameMessageEvent {
  readonly source: unknown;
  readonly data: unknown;
  readonly ports: readonly SheetSdkPort[];
}

/** The frame's `console`: the bootstrap wraps these five, keeping what each one did. */
export interface SheetFrameConsole {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/** A script error that reached the frame's `window` (an `ErrorEvent`). */
export interface SheetFrameErrorEvent {
  readonly message?: unknown;
  readonly lineno?: unknown;
  readonly colno?: unknown;
  readonly error?: unknown;
}

/** A promise rejected with no handler (a `PromiseRejectionEvent`). */
export interface SheetFrameRejectionEvent {
  readonly reason?: unknown;
}

/** The sandboxed frame's `window` as the bootstrap sees it. Structural, with no DOM type, so the
 *  e2e (Node types only) can import the builder that embeds this file. */
export interface SheetFrameScope {
  readonly parent: unknown;
  readonly console: SheetFrameConsole;
  setTimeout(callback: () => void, delayMs: number): unknown;
  addEventListener(type: 'message', listener: (event: SheetFrameMessageEvent) => void): void;
  addEventListener(type: 'error', listener: (event: SheetFrameErrorEvent) => void): void;
  addEventListener(
    type: 'unhandledrejection',
    listener: (event: SheetFrameRejectionEvent) => void,
  ): void;
}

/** How much of the frame's console reaches the host: each line cut to `messageLength`, at most
 *  `lines` per `windowMs` (the rest counted and reported as one `console.dropped`), and up to
 *  `positions` srcdoc positions of an error's stack. Mirrors the `sheetFrameMessageDto` limits
 *  by hand (this file imports nothing); the spec holds them to the contract. */
export const SHEET_CONSOLE_FRAME_LIMITS = {
  messageLength: 2000,
  lines: 20,
  windowMs: 1000,
  positions: 8,
} as const;
export type SheetConsoleFrameLimits = typeof SHEET_CONSOLE_FRAME_LIMITS;

// Mirrors barChangeDto by hand: this file is serialized into the frame and imports nothing.
export type SheetBarChange =
  | { readonly op: 'add'; readonly amount: number }
  | { readonly op: 'set' | 'max'; readonly value: number };

export interface SheetDiceRequest {
  readonly expression: string;
  readonly label?: string;
  readonly visibility?: string;
}

/** One bar of the token as the frame gets it (a `tokenBarDto`, with more fields than these). */
export interface SheetFrameBar {
  readonly id: string;
  readonly label: string;
  readonly current: number;
  readonly max: number;
  readonly [field: string]: unknown;
}

/** `window.lorkarium`, the only door from the author's code to the table. Every request settles
 *  when the host answers `result` (resolves) or `error` (rejects with `code` and `message`).
 *  `get`, `all` and `list` read copies of the last `state` and never ask the host. */
export interface LorkariumSdk {
  ready(): Promise<undefined>;
  onState(listener: (state: unknown) => void): () => void;
  readonly bars: {
    adjust(bar: string, change: SheetBarChange): Promise<undefined>;
    list(): SheetFrameBar[];
    get(bar: string): SheetFrameBar | undefined;
  };
  readonly dice: { roll(request: SheetDiceRequest): Promise<undefined> };
  readonly values: {
    set(changes: Record<string, unknown>): Promise<undefined>;
    get(key: string): unknown;
    all(): Record<string, unknown>;
  };
}

/** The `type` of the window message that carries the port on the frame's first `load`. */
export const SHEET_PORT_HANDOFF = 'lorkarium:port';

interface PendingRequest {
  resolve(value: undefined): void;
  reject(error: Error): void;
}

interface FrameState {
  token: unknown;
  bars: unknown;
  values: unknown;
  canEdit: unknown;
}

interface HostAnswer {
  type?: unknown;
  requestId?: unknown;
  code?: unknown;
  message?: unknown;
  token?: unknown;
  bars?: unknown;
  values?: unknown;
  canEdit?: unknown;
}

// Serialized by `toString` into the srcdoc, so it may reference nothing outside its own body (the
// spec runs the serialized text to prove it). One closure instead of 4–20 line functions at the
// top: the module's other functions do not exist inside the frame. JSON, freeze, the console, the
// timer and the clock are captured before the author's code runs, so replacing those globals
// cannot bend the SDK. The bar lookup repeats `resolveSheetBar`'s rule for the same reason; the
// host's copy is the one that counts.
function installLorkariumSdk(scope: SheetFrameScope, limits: SheetConsoleFrameLimits): void {
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  const isFiniteNumber = Number.isFinite;
  const freeze = Object.freeze;
  const now = Date.now;
  const later = scope.setTimeout.bind(scope);
  const frameConsole = scope.console;
  const hasOwn = Object.prototype.hasOwnProperty;
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const originals: Partial<Record<string, (...args: unknown[]) => void>> = Object.create(null);
  const lineWindow = { start: -Infinity, lines: 0, dropped: 0, flushing: false };
  const pending: Record<string, PendingRequest> = Object.create(null);
  const queued: object[] = [];
  const stateListeners: Array<(state: unknown) => void> = [];
  let port: SheetSdkPort | null = null;
  let lastState: { state: FrameState } | null = null;
  let requestCount = 0;

  function finiteOnly(key: string, value: unknown): unknown {
    if (typeof value === 'number' && !isFiniteNumber(value))
      throw new TypeError(`lorkarium: ${key || 'value'} is ${value}; expected a finite number`);
    return value;
  }

  function snapshot(value: unknown): Record<string, unknown> {
    const text = stringify(value, finiteOnly);
    if (typeof text !== 'string' || text[0] !== '{')
      throw new TypeError(
        `lorkarium: received ${typeof value}; expected a plain object of JSON values`,
      );
    return parse(text) as Record<string, unknown>;
  }

  function send(message: object): void {
    if (port === null) queued[queued.length] = message;
    else port.postMessage(message);
  }

  function request(type: string, fieldsOf: () => object): Promise<undefined> {
    return new Promise<undefined>((resolve, reject) => {
      const body = snapshot(fieldsOf());
      requestCount += 1;
      const requestId = `${requestCount}`;
      pending[requestId] = { resolve, reject };
      send({ ...body, type, requestId });
    });
  }

  function settle(answer: HostAnswer, ok: boolean): void {
    const id = answer.requestId;
    if (typeof id !== 'string' || !(id in pending)) return;
    const entry = pending[id] as PendingRequest;
    delete pending[id];
    if (ok) return entry.resolve(undefined);
    const message = typeof answer.message === 'string' ? answer.message : 'request failed';
    entry.reject(codedError(typeof answer.code === 'string' ? answer.code : 'UNKNOWN', message));
  }

  function codedError(code: string, message: string): Error {
    return Object.defineProperty(new Error(message), 'code', { value: code });
  }

  function copyOf<T>(value: T): T {
    return value === undefined ? value : (parse(stringify(value)) as T);
  }

  function valueOf(key: string): unknown {
    const values = lastState === null ? null : lastState.state.values;
    if (typeof values !== 'object' || values === null || !hasOwn.call(values, key))
      return undefined;
    return copyOf((values as Record<string, unknown>)[key]);
  }

  function allValues(): Record<string, unknown> {
    const values = lastState === null ? null : lastState.state.values;
    return typeof values === 'object' && values !== null
      ? copyOf(values as Record<string, unknown>)
      : {};
  }

  function currentBars(): SheetFrameBar[] {
    const bars = lastState === null ? null : lastState.state.bars;
    return Array.isArray(bars) ? (bars as SheetFrameBar[]) : [];
  }

  function labelKey(label: unknown): string {
    if (typeof label !== 'string') return '';
    return label.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  }

  function findBar(reference: string): SheetFrameBar | undefined {
    const bars = currentBars();
    const exact = bars.filter((bar) => bar.id === reference);
    if (exact.length > 0) return copyOf(exact[0]);
    const key = labelKey(reference);
    const named = bars.filter((bar) => labelKey(bar.label) === key);
    if (named.length > 1)
      throw codedError(
        'BAR_AMBIGUOUS',
        `lorkarium: bar "${reference}" matches ${named.length} bars; use the bar's id`,
      );
    return named.length === 1 ? copyOf(named[0]) : undefined;
  }

  function notify(listener: (state: unknown) => void, state: unknown): void {
    try {
      listener(state);
    } catch (error) {
      logged('error', ['lorkarium: an onState listener threw', error]);
    }
  }

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

  function wrapConsole(): void {
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

  function publishState(answer: HostAnswer): void {
    const state: FrameState = {
      token: answer.token,
      bars: answer.bars,
      values: answer.values,
      canEdit: answer.canEdit,
    };
    lastState = { state };
    const listeners = stateListeners.slice();
    for (let index = 0; index < listeners.length; index += 1) notify(listeners[index]!, state);
  }

  function onHostMessage(event: { data: unknown }): void {
    const answer = event.data as HostAnswer | null;
    if (typeof answer !== 'object' || answer === null) return;
    if (answer.type === 'state') return publishState(answer);
    if (answer.type === 'result' || answer.type === 'error')
      settle(answer, answer.type === 'result');
  }

  function onWindowMessage(event: SheetFrameMessageEvent): void {
    const data = event.data as { type?: unknown } | null;
    if (port !== null || event.source !== scope.parent || event.ports.length !== 1) return;
    if (typeof data !== 'object' || data === null || data.type !== 'lorkarium:port') return;
    port = event.ports[0] as SheetSdkPort;
    port.addEventListener('message', onHostMessage);
    port.start();
    const waiting = queued.splice(0, queued.length);
    for (let index = 0; index < waiting.length; index += 1) port.postMessage(waiting[index]!);
  }

  function onState(listener: (state: unknown) => void): () => void {
    stateListeners[stateListeners.length] = listener;
    if (lastState !== null) notify(listener, lastState.state);
    return () => {
      const at = stateListeners.indexOf(listener);
      if (at >= 0) stateListeners.splice(at, 1);
    };
  }

  function rollOf(roll: SheetDiceRequest): object {
    return { expression: roll.expression, label: roll.label, visibility: roll.visibility };
  }

  const sdk: LorkariumSdk = freeze({
    ready: () => request('ready', () => ({})),
    onState,
    bars: freeze({
      adjust: (bar: string, change: SheetBarChange) =>
        request('bars.adjust', () => ({ bar, change })),
      list: () => copyOf(currentBars()),
      get: (bar: string) => findBar(bar),
    }),
    dice: freeze({ roll: (roll: SheetDiceRequest) => request('dice.roll', () => rollOf(roll)) }),
    values: freeze({
      set: (changes: Record<string, unknown>) =>
        request('values.set', () => ({ changes: snapshot(changes) })),
      get: (key: string) => valueOf(key),
      all: () => allValues(),
    }),
  });
  Object.defineProperty(scope, 'lorkarium', { value: sdk, enumerable: true });
  scope.addEventListener('message', onWindowMessage);
  scope.addEventListener('error', onScriptError);
  scope.addEventListener('unhandledrejection', onRejection);
  wrapConsole();
}

/** The script the srcdoc runs before any author code: defines `window.lorkarium`, waits for the
 *  host's port and sends the frame's console (and uncaught errors) to the host.
 *
 *  Example: `<script>${SHEET_BRIDGE_BOOTSTRAP}</script>` */
export const SHEET_BRIDGE_BOOTSTRAP = `'use strict';(${installLorkariumSdk.toString()})(window, ${JSON.stringify(SHEET_CONSOLE_FRAME_LIMITS)});`;
