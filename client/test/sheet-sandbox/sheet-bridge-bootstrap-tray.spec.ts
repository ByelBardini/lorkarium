import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake, SheetPortFake } from '../support/sheet-frame-fakes';

const SAVED_ROLL_ID = '00000000-0000-4000-8000-000000000003';
const ACERTO = {
  id: SAVED_ROLL_ID,
  name: 'Acerto',
  folderId: null,
  parts: [{ label: null, expression: '1d20+5' }],
};

let frame: SheetFrameWindowFake;
let port: SheetPortFake;

// The exact text the srcdoc embeds, run with the fake as its `window`.
beforeEach(() => {
  frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  port = new SheetPortFake();
  frame.handOff(port);
});

describe('sheet bridge bootstrap: the room’s tray', () => {
  it('tray.add, tray.addSaved and tray.roll send their requests', () => {
    void frame.sdk.dice.tray.add({ expression: '1d4', label: 'Bênção' });
    void frame.sdk.dice.tray.addSaved(SAVED_ROLL_ID);
    void frame.sdk.dice.tray.roll();
    expect(port.sent).toEqual([
      { type: 'dice.tray.add', requestId: '1', expression: '1d4', label: 'Bênção' },
      { type: 'dice.tray.addSaved', requestId: '2', savedRollId: SAVED_ROLL_ID },
      { type: 'dice.tray.roll', requestId: '3' },
    ]);
  });

  it('tray.add resolves with nothing once the host takes it', async () => {
    const added = frame.sdk.dice.tray.add({ expression: '1d4' });
    port.deliver({ type: 'result', requestId: '1' });
    await expect(added).resolves.toBeUndefined();
  });

  it('tray.roll resolves with the total and each labeled part', async () => {
    const rolled = frame.sdk.dice.tray.roll();
    const value = {
      total: 25,
      parts: [
        {
          label: 'Acerto',
          expression: '1d20',
          total: 17,
          dice: [{ sides: 20, value: 17, status: 'kept' }],
        },
        { label: null, expression: '+8', total: 8, dice: [] },
      ],
    };
    port.deliver({ type: 'result', requestId: '1', value });
    await expect(rolled).resolves.toEqual(value);
  });

  it('saved.list resolves with the rolls, unwrapped', async () => {
    const listed = frame.sdk.dice.saved.list();
    port.deliver({ type: 'result', requestId: '1', value: { rolls: [ACERTO] } });
    await expect(listed).resolves.toEqual([ACERTO]);
  });

  it('a refusal rejects with its code', async () => {
    const rolled = frame.sdk.dice.tray.roll();
    port.deliver({ type: 'error', requestId: '1', code: 'TRAY_EMPTY', message: 'empty' });
    await expect(rolled).rejects.toMatchObject({ code: 'TRAY_EMPTY' });
  });
});
