import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake, SheetPortFake } from '../support/sheet-frame-fakes';

const ASSET_ID = '5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b';
const LYRA = { name: 'Lyra', armorClass: 15, difficultyClass: null };
const STATE = {
  type: 'state',
  token: { name: 'Lyra', image: null },
  bars: [],
  values: {},
  canEdit: true,
  character: LYRA,
};

let frame: SheetFrameWindowFake;
let port: SheetPortFake;

function flushed(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function settled(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'resolved',
    (error: Error & { code?: string }) => `rejected ${error.code ?? error.name}: ${error.message}`,
  );
}

beforeEach(() => {
  frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  port = new SheetPortFake();
  frame.handOff(port);
});

describe('sheet bridge bootstrap: character', () => {
  it('character.get is null before the first state, then a copy of it', () => {
    const before = frame.sdk.character.get();
    port.deliver(STATE);
    const read = frame.sdk.character.get() as { armorClass: number } | null;
    if (read) read.armorClass = 99;
    expect({ before, after: frame.sdk.character.get() }).toEqual({ before: null, after: LYRA });
  });

  it('character.get is null on a sheet with no character', () => {
    port.deliver({ ...STATE, character: null });
    expect(frame.sdk.character.get()).toBeNull();
  });

  it('the state handed to onState carries the character', () => {
    const seen: unknown[] = [];
    frame.sdk.onState((state) => seen.push(state));
    port.deliver(STATE);
    expect(seen).toEqual([expect.objectContaining({ character: LYRA })]);
  });

  it('character.set sends only the changes, as a copy', () => {
    const changes = { armorClass: 14 };
    void frame.sdk.character.set(changes);
    changes.armorClass = 1;
    expect(port.sent).toEqual([
      { type: 'character.set', requestId: '1', changes: { armorClass: 14 } },
    ]);
  });

  it('character.set with NaN is refused before reaching the host', async () => {
    const outcome = await settled(frame.sdk.character.set({ armorClass: Number.NaN }));
    expect({ outcome, sent: port.sent }).toEqual({
      outcome: expect.stringMatching(/^rejected TypeError: .*finite/),
      sent: [],
    });
  });
});

describe('sheet bridge bootstrap: images', () => {
  it('character.setImage sends a fresh copy of the bytes with their type', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    void frame.sdk.character.setImage({ type: 'image/png', bytes });
    await flushed();
    bytes[0] = 9;
    const [message] = port.sent as Array<{ image: { type: string; bytes: ArrayBuffer } }>;
    expect({
      type: message?.image.type,
      bytes: [...new Uint8Array(message?.image.bytes ?? new ArrayBuffer(0))],
      isBuffer: Object.prototype.toString.call(message?.image.bytes),
    }).toEqual({ type: 'image/png', bytes: [1, 2, 3], isBuffer: '[object ArrayBuffer]' });
  });

  it('assets.upload reads a File or Blob by its own type and resolves the asset id', async () => {
    const upload = frame.sdk.assets.upload(
      new Blob([new Uint8Array([7, 7])], { type: 'image/webp' }),
    );
    await flushed();
    port.deliver({ type: 'result', requestId: '1', value: { assetId: ASSET_ID } });
    const [message] = port.sent as Array<{ type: string; image: { type: string } }>;
    expect({ sent: [message?.type, message?.image.type], answer: await upload }).toEqual({
      sent: ['assets.upload', 'image/webp'],
      answer: { assetId: ASSET_ID },
    });
  });

  it('an image that is not bytes is refused with a TypeError, sending nothing', async () => {
    const author = frame.sdk.assets.upload as (image: unknown) => Promise<unknown>;
    const outcome = await settled(author({ type: 'image/png', bytes: [1, 2] }));
    expect({ outcome, sent: port.sent }).toEqual({
      outcome: expect.stringMatching(/^rejected TypeError: .*ArrayBuffer/),
      sent: [],
    });
  });

  it('assets.read sends the id and resolves the type and the bytes', async () => {
    const reading = frame.sdk.assets.read(ASSET_ID);
    const bytes = new ArrayBuffer(2);
    port.deliver({ type: 'result', requestId: '1', value: { type: 'image/png', bytes } });
    expect({ sent: port.sent, answer: await reading }).toEqual({
      sent: [{ type: 'assets.read', requestId: '1', assetId: ASSET_ID }],
      answer: { type: 'image/png', bytes },
    });
  });

  it('a result with a value of another shape resolves undefined', async () => {
    const reading = frame.sdk.assets.read(ASSET_ID);
    port.deliver({ type: 'result', requestId: '1', value: { url: 'https://x' } });
    expect(await reading).toBeUndefined();
  });

  it('a refused upload rejects with the host code', async () => {
    const upload = frame.sdk.assets.upload({ type: 'image/png', bytes: new ArrayBuffer(1) });
    await flushed();
    port.deliver({ type: 'error', requestId: '1', code: 'PERMISSION_NOT_DECLARED', message: 'x' });
    expect(await settled(upload)).toBe('rejected PERMISSION_NOT_DECLARED: x');
  });
});

describe('sheet bridge bootstrap: bars.spend and values.patch', () => {
  it('bars.spend sends the costs as a copy', () => {
    const costs = [{ bar: 'MP', amount: 6 }];
    void frame.sdk.bars.spend(costs);
    costs[0]!.amount = 1;
    expect(port.sent).toEqual([
      { type: 'bars.spend', requestId: '1', costs: [{ bar: 'MP', amount: 6 }] },
    ]);
  });

  it('values.patch sends the path patches as a copy', () => {
    void frame.sdk.values.patch([{ path: ['hab', 'k3f9', 'efeito'], value: 'Cura' }]);
    expect(port.sent).toEqual([
      {
        type: 'values.patch',
        requestId: '1',
        patches: [{ path: ['hab', 'k3f9', 'efeito'], value: 'Cura' }],
      },
    ]);
  });

  it('the new parts of the SDK are frozen', () =>
    expect([Object.isFrozen(frame.sdk.character), Object.isFrozen(frame.sdk.assets)]).toEqual([
      true,
      true,
    ]));
});
