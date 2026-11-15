import { describe, expect, it } from 'vitest';
import { toRollParts } from '@/lib/dice-tray';
import { VHARN } from '../support/campaigns-api-fake';
import { ACERTO, BENCAO, biaRollAck } from '../support/dice-fixtures';
import { sheetBridgeHarness, type SheetBridgeSetup } from '../support/sheet-bridge-harness';

const SAVED = ['dice:saved'] as const;
const OTHER_ID = 'f0000000-0000-4000-8000-000000000009';

async function trayHarness(setup: SheetBridgeSetup = {}) {
  const harness = await sheetBridgeHarness(setup);
  harness.savedRolls.rolls.set(VHARN.id, [ACERTO, BENCAO]);
  return harness;
}

const add = (expression: string, label?: string) => ({
  type: 'dice.tray.add',
  requestId: '1',
  expression,
  ...(label === undefined ? {} : { label }),
});
const roll = { type: 'dice.tray.roll', requestId: '2' };
const list = { type: 'dice.saved.list', requestId: '3' };
const addSaved = (savedRollId: string) => ({
  type: 'dice.tray.addSaved',
  requestId: '4',
  savedRollId,
});

describe('dice.tray.add', () => {
  it('puts a piece "<template> · <label>" in the room’s tray and answers without a value', async () => {
    const { frameSends, tray, port } = await trayHarness();
    await frameSends(add('1d4+5', 'Bênção'));
    expect(tray.getState().choice.tray.pieces).toEqual([
      { id: 'piece-1', label: 'Ficha Tormenta · Bênção', expression: '1d4+5' },
    ]);
    expect(port.ofType('result')).toEqual([{ type: 'result', requestId: '1' }]);
  });

  it('without a label the piece is named after the template', async () => {
    const { frameSends, tray } = await trayHarness();
    await frameSends(add('+2'));
    expect(tray.getState().choice.tray.pieces[0]?.label).toBe('Ficha Tormenta');
  });

  it('an unreadable expression is INVALID_DICE_EXPRESSION citing it, nothing added', async () => {
    const { frameSends, tray, port } = await trayHarness();
    await frameSends(add('2d'));
    expect(port.ofType('error')).toEqual([
      expect.objectContaining({
        code: 'INVALID_DICE_EXPRESSION',
        message: expect.stringContaining("'2d'"),
      }),
    ]);
    expect(tray.getState().choice.tray.pieces).toEqual([]);
  });

  it('the 11th part is TRAY_FULL citing the ceiling', async () => {
    const { frameSends, tray, port, clock } = await trayHarness();
    for (let index = 0; index < 10; index += 1) {
      await frameSends(add('1d4'));
      clock.advance(1001);
    }
    await frameSends(add('1d4'));
    expect(port.ofType('error')).toEqual([
      expect.objectContaining({ code: 'TRAY_FULL', message: expect.stringContaining('10 parts') }),
    ]);
    expect(tray.getState().choice.tray.pieces).toHaveLength(10);
  });

  it('a read-only sheet still builds the viewer’s own roll (no canEdit asked)', async () => {
    const { frameSends, tray } = await trayHarness({ canEdit: false });
    await frameSends(add('1d4'));
    expect(tray.getState().choice.tray.pieces).toHaveLength(1);
  });

  it('a spectator has no tray: FORBIDDEN', async () => {
    const { frameSends, port } = await trayHarness({ withTray: false });
    await frameSends(add('1d4'));
    expect(port.ofType('error')).toEqual([expect.objectContaining({ code: 'FORBIDDEN' })]);
  });

  it('shares the pace of the rolls: the 11th dice.* request in 10 s is RATE_LIMITED', async () => {
    const { frameSends, port, tray } = await trayHarness();
    for (let index = 0; index < 5; index += 1) await frameSends(add('1d4'));
    for (let index = 0; index < 5; index += 1)
      await frameSends({ type: 'dice.roll', requestId: '9', expression: '1d6' });
    await frameSends(add('1d4'));
    expect(port.ofType('error')).toEqual([expect.objectContaining({ code: 'RATE_LIMITED' })]);
    expect(tray.getState().choice.tray.pieces).toHaveLength(5);
  });
});

describe('dice.tray.roll', () => {
  it('rolls the tray with its "Quem vê", empties it and answers each part once the dice settle', async () => {
    const harness = await trayHarness();
    const { frameSends, tray, dice, port, clock } = harness;
    tray.getState().setChoice({ ...tray.getState().choice, secret: true });
    await frameSends(add('1d20', 'Acerto'));
    await frameSends(add('1d4+5', 'Bênção'));
    dice.answer = biaRollAck({
      parts: [
        {
          label: 'Ficha Tormenta · Acerto',
          expression: '1d20',
          total: 17,
          dice: [{ sides: 20, value: 17, status: 'kept', model: [0] }],
        },
        {
          label: 'Ficha Tormenta · Bênção',
          expression: '1d4+5',
          total: 8,
          dice: [{ sides: 4, value: 3, status: 'kept', model: [1] }],
        },
      ],
      total: 25,
      settlesInMs: 1500,
    });
    await frameSends(roll);
    expect(dice.sent).toEqual([
      {
        campaignId: VHARN.id,
        request: {
          label: null,
          parts: [
            { label: 'Ficha Tormenta · Acerto', expression: '1d20' },
            { label: 'Ficha Tormenta · Bênção', expression: '1d4+5' },
          ],
          visibility: 'masters',
          aspect: 1,
        },
      },
    ]);
    expect(toRollParts(tray.getState().choice.tray, 'normal')).toBeNull();
    expect(tray.getState().choice.secret).toBe(true);
    clock.advance(1499);
    expect(port.ofType('result').filter((result) => result.requestId === '2')).toEqual([]);
    clock.advance(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(port.ofType('result').at(-1)).toEqual({
      type: 'result',
      requestId: '2',
      value: {
        total: 25,
        parts: [
          {
            label: 'Ficha Tormenta · Acerto',
            expression: '1d20',
            total: 17,
            dice: [{ sides: 20, value: 17, status: 'kept' }],
          },
          {
            label: 'Ficha Tormenta · Bênção',
            expression: '1d4+5',
            total: 8,
            dice: [{ sides: 4, value: 3, status: 'kept' }],
          },
        ],
      },
    });
  });

  it('the mode chosen in the tab applies (advantage on the first d20)', async () => {
    const { frameSends, tray, dice } = await trayHarness();
    await frameSends(add('1d20', 'Acerto'));
    tray.getState().chooseMode('advantage');
    await frameSends(roll);
    expect(dice.sent[0]?.request.parts).toEqual([
      { label: 'Ficha Tormenta · Acerto', expression: '2d20kh1' },
    ]);
  });

  it('an empty tray is TRAY_EMPTY and sends no command', async () => {
    const { frameSends, dice, port } = await trayHarness();
    await frameSends(roll);
    expect(port.ofType('error')).toEqual([
      {
        type: 'error',
        requestId: '2',
        code: 'TRAY_EMPTY',
        message: 'dice.tray.roll needs at least one part in the tray; got an empty tray',
      },
    ]);
    expect(dice.sent).toEqual([]);
  });

  it('a refused roll keeps the tray', async () => {
    const { frameSends, tray, dice, port } = await trayHarness();
    dice.answer = { ok: false, failure: { kind: 'offline' } };
    await frameSends(add('1d20'));
    await frameSends(roll);
    expect(port.ofType('error')).toEqual([expect.objectContaining({ code: 'OFFLINE' })]);
    expect(tray.getState().choice.tray.pieces).toHaveLength(1);
  });
});

describe('dice.saved.list and dice.tray.addSaved', () => {
  it('lists the viewer’s saved rolls with dice:saved', async () => {
    const { frameSends, port } = await trayHarness({ permissions: SAVED });
    await frameSends(list);
    expect(port.ofType('result')).toEqual([
      { type: 'result', requestId: '3', value: { rolls: [ACERTO, BENCAO] } },
    ]);
  });

  it('without dice:saved the list is PERMISSION_NOT_DECLARED and nothing is asked', async () => {
    const { frameSends, port, savedRolls } = await trayHarness();
    await frameSends(list);
    expect(port.ofType('error')).toEqual([
      expect.objectContaining({
        code: 'PERMISSION_NOT_DECLARED',
        message: 'dice.saved.list needs permission dice:saved in the manifest',
      }),
    ]);
    expect(savedRolls.answers.callsOf('list')).toEqual([]);
  });

  it('a list that fails to load answers its kind', async () => {
    const { frameSends, port, savedRolls } = await trayHarness({ permissions: SAVED });
    savedRolls.answers.answer('list', { ok: false, failure: { kind: 'offline' } });
    await frameSends(list);
    expect(port.ofType('error')).toEqual([expect.objectContaining({ code: 'OFFLINE' })]);
  });

  it('addSaved copies the saved roll’s parts into the tray', async () => {
    const { frameSends, tray } = await trayHarness({ permissions: SAVED });
    await frameSends(addSaved(ACERTO.id));
    expect(tray.getState().choice.tray.pieces).toEqual([
      { id: 'piece-1', label: 'Acerto', expression: '1d20+5' },
    ]);
  });

  it('a saved roll that is not the viewer’s is SAVED_ROLL_NOT_FOUND citing the id', async () => {
    const { frameSends, port, tray } = await trayHarness({ permissions: SAVED });
    await frameSends(addSaved(OTHER_ID));
    expect(port.ofType('error')).toEqual([
      expect.objectContaining({
        code: 'SAVED_ROLL_NOT_FOUND',
        message: expect.stringContaining(OTHER_ID),
      }),
    ]);
    expect(tray.getState().choice.tray.pieces).toEqual([]);
  });
});
