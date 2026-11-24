import { SHEET_VIEW_MAX_BYTES } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SHEET_FRAME_VIEW_MAX_BYTES } from '@/sheet-sandbox/sheet-frame-view';
import { SheetFrameWindowFake, SheetPortFake } from '../support/sheet-frame-fakes';

let frame: SheetFrameWindowFake;
let port: SheetPortFake;

// The exact text the srcdoc embeds, run with the fake as its `window`.
beforeEach(() => {
  frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  port = new SheetPortFake();
  frame.handOff(port);
});

function stateWith(view: unknown): Record<string, unknown> {
  return { type: 'state', token: null, bars: [], values: {}, canEdit: true, character: null, view };
}

describe('sheet bridge bootstrap: lorkarium.view', () => {
  it('the frame cap is the contract cap', () =>
    expect(SHEET_FRAME_VIEW_MAX_BYTES).toBe(SHEET_VIEW_MAX_BYTES));

  it('get before the first state is null', () => expect(frame.sdk.view.get()).toBeNull());

  it('get reads the view of the state, as a copy', () => {
    port.deliver(stateWith({ aba: 'origem' }));
    const view = frame.sdk.view.get() as { aba: string };
    view.aba = 'perfil';
    expect(frame.sdk.view.get()).toEqual({ aba: 'origem' });
  });

  it('set sends view.set with a JSON copy and get has it at once, before any answer', () => {
    const value = { aba: 'origem', rolagem: 120 };
    void frame.sdk.view.set(value);
    value.aba = 'perfil';
    expect({ sent: port.sent, got: frame.sdk.view.get() }).toEqual({
      sent: [{ type: 'view.set', requestId: '1', value: { aba: 'origem', rolagem: 120 } }],
      got: { aba: 'origem', rolagem: 120 },
    });
  });

  it('set resolves with nothing once the host keeps it', async () => {
    const kept = frame.sdk.view.set('origem');
    port.deliver({ type: 'result', requestId: '1' });
    await expect(kept).resolves.toBeUndefined();
  });

  it('set(null) clears it', () => {
    port.deliver(stateWith('origem'));
    void frame.sdk.view.set(null);
    expect(frame.sdk.view.get()).toBeNull();
  });

  it('a state still in flight when the frame set its view does not take the view back', () => {
    void frame.sdk.view.set('origem');
    port.deliver(stateWith(null));
    expect(frame.sdk.view.get()).toBe('origem');
  });

  it('a view past 4096 bytes is refused with a TypeError citing its size, sending nothing', async () => {
    await expect(frame.sdk.view.set('a'.repeat(4095))).rejects.toThrow(
      new TypeError('lorkarium: view has 4097 bytes of JSON; expected at most 4096'),
    );
    expect({ sent: port.sent, got: frame.sdk.view.get() }).toEqual({ sent: [], got: null });
  });

  it('counts the bytes in UTF-8, as the contract does', async () => {
    await expect(frame.sdk.view.set('ç'.repeat(2048))).rejects.toThrow('view has 4098 bytes');
    expect(port.sent).toEqual([]);
  });

  it('exactly 4096 bytes go', () => {
    void frame.sdk.view.set('a'.repeat(4094));
    expect(port.sent).toHaveLength(1);
  });

  it.each([
    ['NaN', Number.NaN],
    ['a function', () => 1],
    ['undefined', undefined],
  ])('%s is refused with a TypeError, sending nothing', async (_name, value) => {
    await expect(frame.sdk.view.set(value)).rejects.toBeInstanceOf(TypeError);
    expect(port.sent).toEqual([]);
  });

  it('a view the host refuses goes back to the one before', async () => {
    port.deliver(stateWith('perfil'));
    const refused = frame.sdk.view.set('origem');
    port.deliver({ type: 'error', requestId: '1', code: 'RATE_LIMITED', message: 'More than 60' });
    await expect(refused).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(frame.sdk.view.get()).toBe('perfil');
  });

  it('the view object is frozen', () => expect(Object.isFrozen(frame.sdk.view)).toBe(true));
});
