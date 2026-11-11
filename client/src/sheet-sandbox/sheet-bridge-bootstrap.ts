// Relative on purpose, as in sheet-srcdoc.ts: the e2e imports this chain from outside the client.
import {
  SHEET_FRAME_BINDINGS_SOURCE,
  type SheetBindingScope,
  type SheetFrameBindingsFactory,
  type SheetFrameLists,
} from './sheet-frame-bindings';
import { SHEET_FRAME_CONSOLE_SOURCE, type SheetFrameConsoleFactory } from './sheet-frame-console';
import { SHEET_HTML_SANITIZER_SOURCE, type SheetHtmlSanitizer } from './sheet-html-sanitizer';
import type {
  SheetBarChange,
  SheetDiceRequest,
  SheetFrameDocument,
  SheetFrameDocumentTab,
  SheetFrameDocumentTabContent,
  SheetFrameImage,
  SheetFrameRoll,
  SheetFrameRolledDie,
  SheetImageInput,
} from './sheet-sdk-shapes';

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

/** One bar of the token as the frame gets it (a `tokenBarDto`, with more fields than these). */
export interface SheetFrameBar {
  readonly id: string;
  readonly label: string;
  readonly current: number;
  readonly max: number;
  readonly [field: string]: unknown;
}

/** The character that holds the sheet, as the last `state` had it. */
export interface SheetFrameCharacter {
  readonly name: string;
  readonly armorClass: number | null;
  readonly difficultyClass: number | null;
}

/** `window.lorkarium`, the only door from the author's code to the table. Every request settles
 *  when the host answers `result` (resolves) or `error` (rejects with `code` and `message`).
 *  `get`, `all` and `list` read copies of the last `state` and never ask the host. */
export interface LorkariumSdk {
  ready(): Promise<undefined>;
  onState(listener: (state: unknown) => void): () => void;
  readonly bars: {
    adjust(bar: string, change: SheetBarChange): Promise<undefined>;
    /** Every cost or none (`INSUFFICIENT_BAR`), from the current value only. */
    spend(costs: ReadonlyArray<{ bar: string; amount: number }>): Promise<undefined>;
    /** Creates on the holder a bar it lacks, full (permission `character:bars`); one already
     *  there under that label resolves with its id and `created: false`. */
    create(bar: {
      label: string;
      max: number;
      color?: string;
    }): Promise<{ barId: string; created: boolean }>;
    list(): SheetFrameBar[];
    get(bar: string): SheetFrameBar | undefined;
  };
  /** Resolves with the roll once its dice settle on the table. */
  readonly dice: { roll(request: SheetDiceRequest): Promise<SheetFrameRoll> };
  readonly values: {
    set(changes: Record<string, unknown>): Promise<undefined>;
    /** Replaces only the value at each path of keys (`null` removes it). */
    patch(patches: ReadonlyArray<{ path: string[]; value: unknown }>): Promise<undefined>;
    get(key: string): unknown;
    all(): Record<string, unknown>;
  };
  readonly character: {
    get(): SheetFrameCharacter | null;
    set(changes: { armorClass?: number; difficultyClass?: number }): Promise<undefined>;
    setImage(image: SheetImageInput): Promise<undefined>;
  };
  readonly assets: {
    upload(image: SheetImageInput): Promise<{ assetId: string }>;
    read(assetId: string): Promise<SheetFrameImage>;
  };
  /** The table's public documents (manifest permission `documents:read`): the same for every
   *  viewer, read on demand (nothing is pushed when a document changes). */
  readonly documents: {
    list(): Promise<SheetFrameDocument[]>;
    tabs(documentId: string): Promise<SheetFrameDocumentTab[]>;
    readTab(documentId: string, tabId: string): Promise<SheetFrameDocumentTabContent>;
  };
  /** Clean html of a rich text before showing it: formatting stays, anything that runs or loads
   *  goes. Synchronous, no host request. */
  readonly html: { sanitize(html: string): string };
  /** Repeated sections under a value path, each item at a stable 8-character id. */
  readonly lists: SheetFrameLists;
}

/** The `type` of the window message that carries the port on the frame's first `load`. */
export const SHEET_PORT_HANDOFF = 'lorkarium:port';

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface FrameState {
  token: unknown;
  bars: unknown;
  values: unknown;
  canEdit: unknown;
  character: unknown;
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
  character?: unknown;
  value?: unknown;
}

// Serialized by `toString` into the srcdoc, so it may reference nothing outside its own body (the
// spec runs the serialized text to prove it). One closure instead of 4–20 line functions at the
// top: the module's other functions do not exist inside the frame. JSON, freeze, the console, the
// timer and the clock are captured before the author's code runs, so replacing those globals
// cannot bend the SDK. The bar lookup repeats `resolveSheetBar`'s rule for the same reason; the
// host's copy is the one that counts.
function installLorkariumSdk(
  scope: SheetFrameScope,
  limits: SheetConsoleFrameLimits,
  sanitizeHtml: SheetHtmlSanitizer,
  createConsole: SheetFrameConsoleFactory,
  createBindings: SheetFrameBindingsFactory,
): void {
  const parse = JSON.parse;
  const stringify = JSON.stringify;
  const isFiniteNumber = Number.isFinite;
  const freeze = Object.freeze;
  const hasOwn = Object.prototype.hasOwnProperty;
  const toTag = Object.prototype.toString;
  const isView = ArrayBuffer.isView;
  const isArray = Array.isArray;
  const isInteger = Number.isInteger;
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

  const frameConsole = createConsole(scope, limits, send);

  function sent<T>(body: object, type: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      requestCount += 1;
      const requestId = `${requestCount}`;
      pending[requestId] = { resolve: resolve as (value: unknown) => void, reject };
      send({ ...body, type, requestId });
    });
  }

  function request<T = undefined>(type: string, fieldsOf: () => object): Promise<T> {
    try {
      return sent<T>(snapshot(fieldsOf()), type);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // Bytes cannot go through the JSON copy: a fresh ArrayBuffer is cloned to the host instead.
  async function bytesOf(image: SheetImageInput): Promise<{ type: string; bytes: ArrayBuffer }> {
    const input = image as { type?: unknown; bytes?: unknown; arrayBuffer?: unknown } | null;
    if (typeof input !== 'object' || input === null || typeof input.type !== 'string')
      throw new TypeError('lorkarium: image is not a File, a Blob or { type, bytes }');
    const { type, bytes } = input;
    if (typeof input.arrayBuffer === 'function')
      return { type, bytes: await (image as Blob).arrayBuffer() };
    if (toTag.call(bytes) === '[object ArrayBuffer]')
      return { type, bytes: (bytes as ArrayBuffer).slice(0) };
    if (!isView(bytes)) throw new TypeError('lorkarium: image.bytes is not an ArrayBuffer');
    const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type, bytes: view.slice().buffer };
  }

  async function imageRequest<T>(type: string, image: SheetImageInput): Promise<T> {
    return sent<T>({ image: await bytesOf(image) }, type);
  }

  // Only the shapes a `result` may carry reach the author, as fresh objects.
  function resultValueOf(value: unknown): unknown {
    const found = value as { assetId?: unknown; type?: unknown; bytes?: unknown } | null;
    if (typeof found !== 'object' || found === null) return undefined;
    if (typeof found.assetId === 'string') return freeze({ assetId: found.assetId });
    const { barId, created } = found as { barId?: unknown; created?: unknown };
    if (typeof barId === 'string' && typeof created === 'boolean')
      return freeze({ barId, created });
    if (typeof found.type === 'string' && toTag.call(found.bytes) === '[object ArrayBuffer]')
      return freeze({ type: found.type, bytes: found.bytes });
    return rollValueOf(found) ?? documentValueOf(found);
  }

  // A document read comes unwrapped (the list, the tabs or the tab), as a JSON copy of its own.
  function documentValueOf(found: object): unknown {
    const { documents, tabs, tab } = found as {
      documents?: unknown;
      tabs?: unknown;
      tab?: unknown;
    };
    if (isArray(documents)) return parse(stringify(documents));
    if (isArray(tabs)) return parse(stringify(tabs));
    if (typeof tab === 'object' && tab !== null) return parse(stringify(tab));
    return undefined;
  }

  function rollValueOf(found: object): SheetFrameRoll | undefined {
    const { expression, total, dice } = found as {
      expression?: unknown;
      total?: unknown;
      dice?: unknown;
    };
    if (typeof expression !== 'string' || !isInteger(total) || !isArray(dice)) return undefined;
    const kept = dice.map(rolledDieOf);
    if (kept.some((die) => die === null)) return undefined;
    return freeze({
      expression,
      total: total as number,
      dice: freeze(kept as SheetFrameRolledDie[]),
    });
  }

  function rolledDieOf(die: unknown): SheetFrameRolledDie | null {
    const found = die as { sides?: unknown; value?: unknown; status?: unknown; success?: unknown };
    if (typeof found !== 'object' || found === null) return null;
    const { sides, value, status, success } = found;
    if (!isInteger(sides) || !isInteger(value) || typeof status !== 'string') return null;
    const counted = { sides: sides as number, value: value as number, status };
    return freeze(typeof success === 'boolean' ? { ...counted, success } : counted);
  }

  function settle(answer: HostAnswer, ok: boolean): void {
    const id = answer.requestId;
    if (typeof id !== 'string' || !(id in pending)) return;
    const entry = pending[id] as PendingRequest;
    delete pending[id];
    if (ok) return entry.resolve(resultValueOf(answer.value));
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

  function currentCharacter(): SheetFrameCharacter | null {
    const character = lastState === null ? null : lastState.state.character;
    return typeof character === 'object' && character !== null
      ? copyOf(character as SheetFrameCharacter)
      : null;
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
      frameConsole.logged('error', ['lorkarium: an onState listener threw', error]);
    }
  }

  function publishState(answer: HostAnswer): void {
    const state: FrameState = {
      token: answer.token,
      bars: answer.bars,
      values: answer.values,
      canEdit: answer.canEdit,
      character: answer.character,
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

  // `event.source` is the window that called `postMessage`, not the frame's `parent`: in the
  // sheet's own window the room's window posts the port through its portal. Any window outside
  // the frame may hand it off; the frame itself (or one inside it) never, or the author's code
  // could fake the host. The walk stops at the top window (its `parent` is itself).
  function isOutsideFrame(source: unknown): boolean {
    let current = source as { parent?: unknown } | null;
    for (let depth = 0; depth < 64; depth += 1) {
      if (typeof current !== 'object' || current === null || current === scope) return false;
      if (current.parent === current) return true;
      current = current.parent as { parent?: unknown } | null;
    }
    return false;
  }

  function onWindowMessage(event: SheetFrameMessageEvent): void {
    const data = event.data as { type?: unknown } | null;
    if (port !== null || !isOutsideFrame(event.source) || event.ports.length !== 1) return;
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

  function patchValues(patches: ReadonlyArray<{ path: string[]; value: unknown }>) {
    return request('values.patch', () => ({ patches: snapshot({ patches }).patches }));
  }

  function roll(dice: SheetDiceRequest): Promise<SheetFrameRoll> {
    return request<SheetFrameRoll>('dice.roll', () => rollOf(dice));
  }

  // `data-lk`, `data-lk-roll` and the lists ride on the same requests the author has.
  const bindings = createBindings(scope as unknown as SheetBindingScope, {
    onState,
    patch: patchValues,
    roll,
    sanitize: sanitizeHtml,
    report: (...args: unknown[]) => frameConsole.logged('error', args),
  });

  const sdk: LorkariumSdk = freeze({
    ready: () => request('ready', () => ({})),
    onState,
    bars: freeze({
      adjust: (bar: string, change: SheetBarChange) =>
        request('bars.adjust', () => ({ bar, change })),
      spend: (costs: ReadonlyArray<{ bar: string; amount: number }>) =>
        request('bars.spend', () => ({ costs: snapshot({ costs }).costs })),
      create: (bar: { label: string; max: number; color?: string }) =>
        request<{ barId: string; created: boolean }>('bars.create', () => ({ bar })),
      list: () => copyOf(currentBars()),
      get: (bar: string) => findBar(bar),
    }),
    dice: freeze({ roll }),
    values: freeze({
      set: (changes: Record<string, unknown>) =>
        request('values.set', () => ({ changes: snapshot(changes) })),
      patch: patchValues,
      get: (key: string) => valueOf(key),
      all: () => allValues(),
    }),
    html: freeze({ sanitize: (html: string) => sanitizeHtml(html) }),
    lists: freeze(bindings.lists),
    character: freeze({
      get: () => currentCharacter(),
      set: (changes: { armorClass?: number; difficultyClass?: number }) =>
        request('character.set', () => ({ changes: snapshot(changes) })),
      setImage: (image: SheetImageInput) => imageRequest<undefined>('character.setImage', image),
    }),
    assets: freeze({
      upload: (image: SheetImageInput) => imageRequest<{ assetId: string }>('assets.upload', image),
      read: (assetId: string) => request<SheetFrameImage>('assets.read', () => ({ assetId })),
    }),
    documents: freeze({
      list: () => request<SheetFrameDocument[]>('documents.list', () => ({})),
      tabs: (documentId: string) =>
        request<SheetFrameDocumentTab[]>('documents.tabs', () => ({ documentId })),
      readTab: (documentId: string, tabId: string) =>
        request<SheetFrameDocumentTabContent>('documents.readTab', () => ({ documentId, tabId })),
    }),
  });
  Object.defineProperty(scope, 'lorkarium', { value: sdk, enumerable: true });
  scope.addEventListener('message', onWindowMessage);
  scope.addEventListener('error', frameConsole.onScriptError);
  scope.addEventListener('unhandledrejection', frameConsole.onRejection);
  frameConsole.wrap();
}

/** The script the srcdoc runs before any author code: defines `window.lorkarium`, waits for the
 *  host's port and sends the frame's console (and uncaught errors) to the host.
 *
 *  Example: `<script>${SHEET_BRIDGE_BOOTSTRAP}</script>` */
export const SHEET_BRIDGE_BOOTSTRAP = `'use strict';(${installLorkariumSdk.toString()})(window, ${JSON.stringify(SHEET_CONSOLE_FRAME_LIMITS)}, (${SHEET_HTML_SANITIZER_SOURCE})(window.DOMParser), ${SHEET_FRAME_CONSOLE_SOURCE}, ${SHEET_FRAME_BINDINGS_SOURCE});`;
