import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP, SHEET_PORT_HANDOFF } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import {
  FrameWindowRefFake,
  SheetFrameWindowFake,
  SheetPortFake,
} from '../support/sheet-frame-fakes';

const PV_BAR = '6f1d2c4e-8a1b-4c3d-9e2f-0a1b2c3d4e5f';
const LYRA_STATE = {
  type: 'state',
  token: { name: 'Lyra', image: null },
  bars: [],
  values: { forca: 16 },
  canEdit: true,
};

// Runs the exact text the srcdoc embeds, with the fake as its `window`: a reference to anything
// outside the bootstrap's own function would fail here as it would inside the frame.
function bootFrame(): SheetFrameWindowFake {
  const frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  return frame;
}

// The author's JS has no types: these calls pass what TypeScript would refuse.
function asAuthorCalls(
  method: (input: never) => Promise<undefined>,
): (input: unknown) => Promise<undefined> {
  return method as (input: unknown) => Promise<undefined>;
}

async function settled(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'resolved',
    (error: Error & { code?: string }) => `rejected ${error.code ?? error.name}: ${error.message}`,
  );
}

let frame: SheetFrameWindowFake;
let port: SheetPortFake;

beforeEach(() => {
  frame = bootFrame();
  port = new SheetPortFake();
});

describe('sheet bridge bootstrap: the port', () => {
  it('takes the port of the first handoff from the parent and starts it', () => {
    frame.handOff(port);
    void frame.sdk.ready();
    expect(port.started).toBe(true);
    expect(port.sent).toEqual([{ type: 'ready', requestId: '1' }]);
  });

  it('the handoff type the host sends is the one the bootstrap accepts', () => {
    frame.handOff(port, SHEET_PORT_HANDOFF);
    void frame.sdk.ready();
    expect(port.sent).toHaveLength(1);
  });

  it('queues requests made before the port arrives and sends them in order', () => {
    void frame.sdk.ready();
    void frame.sdk.values.set({ forca: 17 });
    frame.handOff(port);
    expect(port.sent).toEqual([
      { type: 'ready', requestId: '1' },
      { type: 'values.set', requestId: '2', changes: { forca: 17 } },
    ]);
  });

  // The sheet's own window draws the frame by the room's portal: the room's window posts the port.
  it('takes the port handed off by a window outside the frame that is not its parent', () => {
    frame.dispatch({
      source: new FrameWindowRefFake('room window'),
      data: { type: SHEET_PORT_HANDOFF },
      ports: [port],
    });
    void frame.sdk.ready();
    expect(port.sent).toEqual([{ type: 'ready', requestId: '1' }]);
  });

  it.each([
    ['something that is not a window', () => ({ name: 'author popup' })],
    ['the frame itself', () => frame],
    ['a frame nested inside the sheet', () => new FrameWindowRefFake('nested', frame)],
  ])('ignores a port offered by %s', (_case, sourceOf) => {
    frame.dispatch({ source: sourceOf(), data: { type: SHEET_PORT_HANDOFF }, ports: [port] });
    void frame.sdk.ready();
    expect(port.sent).toEqual([]);
  });

  it.each([
    ['another type', { type: 'state' }, 1],
    ['a string body', SHEET_PORT_HANDOFF, 1],
    ['no port', { type: SHEET_PORT_HANDOFF }, 0],
  ])('ignores a parent message with %s', (_case, data, portCount) => {
    frame.dispatch({ source: frame.parent, data, ports: portCount ? [port] : [] });
    void frame.sdk.ready();
    expect(port.sent).toEqual([]);
  });

  it('keeps the first port when a second handoff arrives', () => {
    const intruder = new SheetPortFake();
    frame.handOff(port);
    frame.handOff(intruder);
    void frame.sdk.ready();
    expect(port.sent).toHaveLength(1);
    expect(intruder.sent).toEqual([]);
  });
});

describe('sheet bridge bootstrap: requests', () => {
  beforeEach(() => frame.handOff(port));

  it('bars.adjust sends the bar id and the change, never a token', () => {
    void frame.sdk.bars.adjust(PV_BAR, { op: 'add', amount: -5 });
    expect(port.sent).toEqual([
      { type: 'bars.adjust', requestId: '1', bar: PV_BAR, change: { op: 'add', amount: -5 } },
    ]);
  });

  it('bars.adjust sends a bar name as given, for the host to resolve', () => {
    void frame.sdk.bars.adjust('PV', { op: 'set', value: 12 });
    expect(port.sent).toEqual([
      { type: 'bars.adjust', requestId: '1', bar: 'PV', change: { op: 'set', value: 12 } },
    ]);
  });

  it('dice.roll sends the expression, label and visibility', () => {
    void frame.sdk.dice.roll({ expression: '1d20+5', label: 'Ataque', visibility: 'public' });
    expect(port.sent).toEqual([
      {
        type: 'dice.roll',
        requestId: '1',
        expression: '1d20+5',
        label: 'Ataque',
        visibility: 'public',
      },
    ]);
  });

  it('dice.roll leaves out the fields the author did not give', () => {
    void frame.sdk.dice.roll({ expression: '2d6' });
    expect(port.sent).toEqual([{ type: 'dice.roll', requestId: '1', expression: '2d6' }]);
  });

  it('dice.roll sends no field outside the request shape', () => {
    void asAuthorCalls(frame.sdk.dice.roll)({
      expression: '2d6',
      tokenId: 'quelm',
      type: 'values.set',
    });
    expect(port.sent).toEqual([{ type: 'dice.roll', requestId: '1', expression: '2d6' }]);
  });

  it('resolves each request by its own requestId, in any order', async () => {
    const first = settled(frame.sdk.values.set({ forca: 16 }));
    const second = frame.sdk.ready();
    let firstDone = false;
    void first.then(() => (firstDone = true));
    port.deliver({ type: 'result', requestId: '2' });
    await second;
    expect(firstDone).toBe(false);
    port.deliver({ type: 'result', requestId: '1' });
    expect(await first).toBe('resolved');
  });

  it('rejects with the code and message of the host error', async () => {
    const roll = settled(frame.sdk.dice.roll({ expression: '1d20' }));
    port.deliver({
      type: 'error',
      requestId: '1',
      code: 'RATE_LIMITED',
      message: 'Too many rolls',
    });
    expect(await roll).toBe('rejected RATE_LIMITED: Too many rolls');
  });

  it('a second answer to the same requestId changes nothing', async () => {
    const write = settled(frame.sdk.values.set({ forca: 16 }));
    port.deliver({ type: 'result', requestId: '1' });
    port.deliver({ type: 'error', requestId: '1', code: 'FORBIDDEN', message: 'late' });
    expect(await write).toBe('resolved');
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('values.set with %s is refused before reaching the host', async (_case, value) => {
    const outcome = await settled(frame.sdk.values.set({ forca: value }));
    expect(outcome).toMatch(/^rejected TypeError: .*finite/);
    expect(port.sent).toEqual([]);
  });

  it('values.set with a value JSON cannot carry is refused before reaching the host', async () => {
    const outcome = await settled(asAuthorCalls(frame.sdk.values.set)(() => 16));
    expect(outcome).toMatch(/^rejected TypeError: /);
    expect(port.sent).toEqual([]);
  });

  it('sends a copy, so a later change by the author does not reach the host', () => {
    const changes = { pericias: { furtividade: true } };
    void frame.sdk.values.set(changes);
    changes.pericias.furtividade = false;
    expect(port.sent).toEqual([
      { type: 'values.set', requestId: '1', changes: { pericias: { furtividade: true } } },
    ]);
  });
});

describe('sheet bridge bootstrap: state', () => {
  beforeEach(() => frame.handOff(port));

  it('hands the state to every listener, without the message type', () => {
    const seen: unknown[] = [];
    frame.sdk.onState((state) => seen.push(state));
    port.deliver(LYRA_STATE);
    expect(seen).toEqual([
      { token: { name: 'Lyra', image: null }, bars: [], values: { forca: 16 }, canEdit: true },
    ]);
  });

  it('a listener added later gets the last state at once', () => {
    port.deliver(LYRA_STATE);
    const seen: unknown[] = [];
    frame.sdk.onState((state) => seen.push(state));
    expect(seen).toHaveLength(1);
  });

  it('stops calling a listener after it unsubscribes', () => {
    const seen: unknown[] = [];
    const stop = frame.sdk.onState((state) => seen.push(state));
    port.deliver(LYRA_STATE);
    stop();
    port.deliver(LYRA_STATE);
    expect(seen).toHaveLength(1);
  });

  it('a listener that throws is logged and does not keep the next one from the state', () => {
    frame.handOff(port);
    const seen: unknown[] = [];
    const bug = new Error('author bug');
    frame.sdk.onState(() => {
      throw bug;
    });
    frame.sdk.onState((state) => seen.push(state));
    port.deliver(LYRA_STATE);
    expect(seen).toHaveLength(1);
    expect(frame.console.calls).toEqual([
      { level: 'error', args: ['lorkarium: an onState listener threw', bug] },
    ]);
    expect(port.sent).toContainEqual({
      type: 'console',
      level: 'error',
      message: 'lorkarium: an onState listener threw Error: author bug',
      at: [],
    });
  });

  it.each([
    ['an unknown type', { type: 'token:moved', requestId: '1' }],
    ['a string', '{"type":"result","requestId":"1"}'],
    ['null', null],
  ])('ignores a host message that is %s', async (_case, message) => {
    const seen: unknown[] = [];
    frame.sdk.onState((state) => seen.push(state));
    const ready = settled(frame.sdk.ready());
    let done = false;
    void ready.then(() => (done = true));
    port.deliver(message);
    await Promise.resolve();
    expect(seen).toEqual([]);
    expect(done).toBe(false);
  });
});

const PV = { id: PV_BAR, position: 0, label: 'PV', current: 18, max: 20, color: 'ember' };
const INSPIRATION = { ...PV, id: '7a2e3d5f-9b2c-4d4e-8f3a-1b2c3d4e5f60', label: 'Inspiração' };

function deliverState(bars: unknown[], values: Record<string, unknown> = {}): void {
  port.deliver({ ...LYRA_STATE, bars, values });
}

describe('sheet bridge bootstrap: reading the last state', () => {
  beforeEach(() => frame.handOff(port));

  it('before any state, values and bars are empty', () => {
    expect({
      get: frame.sdk.values.get('forca'),
      all: frame.sdk.values.all(),
      list: frame.sdk.bars.list(),
      bar: frame.sdk.bars.get('PV'),
    }).toEqual({ get: undefined, all: {}, list: [], bar: undefined });
  });

  it('values.get reads a key of the last state, and undefined without it', () => {
    deliverState([], { forca: 16, inventario: { ouro: 3 } });
    expect([
      frame.sdk.values.get('forca'),
      frame.sdk.values.get('inventario'),
      frame.sdk.values.get('destreza'),
      frame.sdk.values.get('toString'),
    ]).toEqual([16, { ouro: 3 }, undefined, undefined]);
  });

  it('values.get and values.all hand copies: changing them does not change the next read', () => {
    deliverState([], { inventario: { ouro: 3 } });
    (frame.sdk.values.get('inventario') as { ouro: number }).ouro = 99;
    frame.sdk.values.all().inventario = null;
    expect(frame.sdk.values.all()).toEqual({ inventario: { ouro: 3 } });
  });

  it('values follow the newest state', () => {
    deliverState([], { forca: 16 });
    deliverState([], { forca: 17 });
    expect(frame.sdk.values.get('forca')).toBe(17);
  });

  it('bars.list hands a copy of the bars of the last state', () => {
    deliverState([PV, INSPIRATION]);
    const list = frame.sdk.bars.list();
    list.pop();
    expect(frame.sdk.bars.list()).toEqual([PV, INSPIRATION]);
  });

  it('bars.get finds a bar by id, or by label with no case, accents or edge spaces', () => {
    deliverState([PV, INSPIRATION]);
    expect([
      frame.sdk.bars.get(INSPIRATION.id)?.label,
      frame.sdk.bars.get('pv')?.current,
      frame.sdk.bars.get(' INSPIRACAO ')?.id,
      frame.sdk.bars.get('Mana'),
    ]).toEqual(['Inspiração', 18, INSPIRATION.id, undefined]);
  });

  it('bars.get throws BAR_AMBIGUOUS when two bars share the name', () => {
    deliverState([PV, { ...INSPIRATION, label: 'pv' }]);
    let thrown: unknown;
    try {
      frame.sdk.bars.get('PV');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: 'BAR_AMBIGUOUS',
      message: expect.stringMatching(/2 bars/),
    });
    expect(frame.sdk.bars.get(PV_BAR)?.label).toBe('PV');
  });

  it('a sheet with no token has a null token and no bars', () => {
    const seen: unknown[] = [];
    frame.sdk.onState((state) => seen.push(state));
    port.deliver({ ...LYRA_STATE, token: null, bars: [] });
    expect({ token: (seen[0] as { token: unknown }).token, bars: frame.sdk.bars.list() }).toEqual({
      token: null,
      bars: [],
    });
  });
});

describe('sheet bridge bootstrap: protection', () => {
  const originalStringify = JSON.stringify;
  afterEach(() => {
    JSON.stringify = originalStringify;
  });

  it('the author cannot replace window.lorkarium', () => {
    const sdk = frame.sdk;
    expect(() => Object.assign(frame, { lorkarium: {} })).toThrow(TypeError);
    expect(frame.sdk).toBe(sdk);
  });

  it('the author cannot replace a method of the SDK', () => {
    expect(() => Object.assign(frame.sdk.dice, { roll: () => undefined })).toThrow(TypeError);
    expect(() => Object.assign(frame.sdk.values, { get: () => 1 })).toThrow(TypeError);
    expect(() => Object.assign(frame.sdk.bars, { get: () => undefined })).toThrow(TypeError);
    expect(Object.isFrozen(frame.sdk)).toBe(true);
  });

  it('keeps the JSON it captured even if the author replaces JSON.stringify', () => {
    frame.handOff(port);
    JSON.stringify = () => '{"changes":{"forca":99}}';
    void frame.sdk.values.set({ forca: 16 });
    expect(port.sent).toEqual([{ type: 'values.set', requestId: '1', changes: { forca: 16 } }]);
  });
});
