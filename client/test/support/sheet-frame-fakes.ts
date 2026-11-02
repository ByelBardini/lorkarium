import type {
  LorkariumSdk,
  SheetFrameConsole,
  SheetFrameErrorEvent,
  SheetFrameMessageEvent,
  SheetFrameRejectionEvent,
  SheetFrameScope,
  SheetSdkPort,
} from '@/sheet-sandbox/sheet-bridge-bootstrap';
import type { SheetChannel } from '@/sheet-sandbox/sheet-frame';

/** The frame's end of the `MessageChannel`: records what the SDK sends and lets the test play the
 *  host by `deliver(message)`.
 *
 *  Example: `port.deliver({ type: 'result', requestId: '1' })` */
export class SheetPortFake implements SheetSdkPort {
  readonly sent: unknown[] = [];
  started = false;
  private readonly listeners: Array<(event: { data: unknown }) => void> = [];

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.push(listener);
  }

  start(): void {
    this.started = true;
  }

  deliver(data: unknown): void {
    for (const listener of this.listeners) listener({ data });
  }
}

type ConsoleLevel = keyof SheetFrameConsole;

/** The frame's own `console`: records each call (level and arguments) the way the browser's
 *  devtools would show it, so the spec sees the original behavior survives the bootstrap.
 *
 *  Example: `frame.console.calls // [{ level: 'log', args: ['oi'] }]` */
export class FrameConsoleFake implements SheetFrameConsole {
  readonly calls: Array<{ level: ConsoleLevel; args: unknown[] }> = [];

  log(...args: unknown[]): void {
    this.calls.push({ level: 'log', args });
  }

  info(...args: unknown[]): void {
    this.calls.push({ level: 'info', args });
  }

  warn(...args: unknown[]): void {
    this.calls.push({ level: 'warn', args });
  }

  error(...args: unknown[]): void {
    this.calls.push({ level: 'error', args });
  }

  debug(...args: unknown[]): void {
    this.calls.push({ level: 'debug', args });
  }
}

type FrameListeners = {
  message: Array<(event: SheetFrameMessageEvent) => void>;
  error: Array<(event: SheetFrameErrorEvent) => void>;
  unhandledrejection: Array<(event: SheetFrameRejectionEvent) => void>;
};

/** Another window as the frame reads it across origins: only its `parent`, itself at the top.
 *
 *  Example: `new FrameWindowRefFake('room window') // a top-level window outside the frame` */
export class FrameWindowRefFake {
  readonly parent: unknown;

  constructor(
    readonly name: string,
    parent?: unknown,
  ) {
    this.parent = parent ?? this;
  }
}

/** The sandboxed frame's `window` as the bootstrap sees it: `parent`, its `console`, the timer,
 *  the `message`, `error` and `unhandledrejection` listeners and the global the SDK is defined on.
 *  The timer is the spec's own `setTimeout`, so `vi.useFakeTimers()` drives it.
 *
 *  Example: `frame.handOff(port) // the host's first-load port arrives` */
export class SheetFrameWindowFake implements SheetFrameScope {
  readonly parent = new FrameWindowRefFake('host window');
  readonly console = new FrameConsoleFake();
  private readonly listeners: FrameListeners = { message: [], error: [], unhandledrejection: [] };

  setTimeout(callback: () => void, delayMs: number): unknown {
    return globalThis.setTimeout(callback, delayMs);
  }

  addEventListener(type: 'message', listener: (event: SheetFrameMessageEvent) => void): void;
  addEventListener(type: 'error', listener: (event: SheetFrameErrorEvent) => void): void;
  addEventListener(
    type: 'unhandledrejection',
    listener: (event: SheetFrameRejectionEvent) => void,
  ): void;
  addEventListener(type: keyof FrameListeners, listener: unknown): void {
    (this.listeners[type] as unknown[]).push(listener);
  }

  dispatch(event: SheetFrameMessageEvent): void {
    for (const listener of this.listeners.message) listener(event);
  }

  /** An uncaught error reached the frame's `window`. */
  throwUncaught(event: SheetFrameErrorEvent): void {
    for (const listener of this.listeners.error) listener(event);
  }

  /** A promise was rejected with no handler. */
  rejectUnhandled(reason: unknown): void {
    for (const listener of this.listeners.unhandledrejection) listener({ reason });
  }

  handOff(port: SheetSdkPort, type = 'lorkarium:port'): void {
    this.dispatch({ source: this.parent, data: { type }, ports: [port] });
  }

  /** The SDK the bootstrap defined, read the way the author's code reads it. */
  get sdk(): LorkariumSdk {
    return (this as unknown as { lorkarium: LorkariumSdk }).lorkarium;
  }
}

/** One end of the host's channel in the component spec: only `close` is observed there. */
export class HostPortFake extends EventTarget {
  closed = false;
  readonly sent: unknown[] = [];

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  start(): void {}

  close(): void {
    this.closed = true;
  }
}

/** A `MessageChannel` the spec can look into: `created` lists every channel the frame opened.
 *
 *  Example: `<SheetFrame createChannel={channels.create} … />; channels.created[0].port2` */
export class SheetChannelsFake {
  readonly created: Array<{ port1: HostPortFake; port2: HostPortFake }> = [];

  readonly create = (): SheetChannel => {
    const channel = { port1: new HostPortFake(), port2: new HostPortFake() };
    this.created.push(channel);
    return channel as unknown as SheetChannel;
  };
}
