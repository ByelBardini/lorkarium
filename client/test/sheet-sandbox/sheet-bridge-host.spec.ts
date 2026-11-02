import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import {
  createSheetBridgeHost,
  sheetRollLabelOf,
  type SheetBridgeHost,
} from '@/sheet-sandbox/sheet-bridge-host';
import { characterSource } from '@/sheet-sandbox/sheet-token-source';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { createSheetStore, type SheetStoreState } from '@/stores/sheet-store';
import { VHARN } from '../support/campaigns-api-fake';
import { charactersSynced, lyraCharacter } from '../support/character-fixtures';
import { DiceCommandsFake } from '../support/dice-commands-fake';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { SheetCommandsFake } from '../support/sheet-commands-fake';
import { LYRA_SHEET_ID, lyraSheet, sheetResponse } from '../support/sheet-fixtures';
import { SheetHostPortFake } from '../support/sheet-host-port-fake';
import { SheetsApiFake } from '../support/sheets-api-fake';
import { BIA_AT_TABLE, LYRA_ID, LYRA_PV_ID } from '../support/table-session-fixtures';

const PORTRAIT_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const PV_BAR_ID = LYRA_PV_ID;

const ADD_ONE = { op: 'add', amount: 1 } as const;

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('sheet bridge host', () => {
  let port: SheetHostPortFake;
  let api: SheetsApiFake;
  let clock: InteractionClockFake;
  let commands: SheetCommandsFake;
  let dice: DiceCommandsFake;
  let characters: StoreApi<CharactersStore>;
  let sheet: StoreApi<SheetStoreState>;
  let host: SheetBridgeHost;

  beforeEach(async () => {
    port = new SheetHostPortFake();
    api = new SheetsApiFake();
    clock = new InteractionClockFake();
    commands = new SheetCommandsFake();
    dice = new DiceCommandsFake();
    characters = createCharactersStore(VHARN.id, () => undefined);
    characters.getState().apply(charactersSynced(3, lyraCharacter()));
    sheet = createSheetStore({
      ...{ api, campaignId: VHARN.id, sheetId: LYRA_SHEET_ID, clock },
      newActionId: () => '00000000-0000-4000-8000-000000000001',
    });
    await sheet.getState().load();
    host = createSheetBridgeHost({
      ...{
        port,
        campaignId: VHARN.id,
        sheet,
        token: characterSource(characters, BIA_AT_TABLE.userId),
      },
      ...{ images: api, commands, dice, clock, diceAspect: () => 1.5 },
    });
  });

  async function frameSends(data: unknown): Promise<void> {
    port.fromFrame(data);
    await settled();
  }

  function anchorChanges(pv: number): void {
    const [first, ...rest] = lyraCharacter().bars;
    if (!first) throw new Error('lyraCharacter() lost its PV bar');
    const lyra = lyraCharacter({ bars: [{ ...first, current: pv }, ...rest] });
    characters.getState().apply(charactersSynced(4, lyra));
  }

  async function reloadWithCanEdit(canEdit: boolean): Promise<void> {
    api.response = sheetResponse(lyraSheet({ version: 2, canEdit }));
    sheet.getState().changed({
      campaignId: VHARN.id,
      sheetId: LYRA_SHEET_ID,
      version: 2,
      at: '2026-10-31T12:00:00.000Z',
    });
    await settled();
  }

  it('starts its port and, on ready, answers it and sends the state', async () => {
    await frameSends({ type: 'ready', requestId: '1' });
    expect(port.started).toBe(true);
    expect(port.ofType('result')).toEqual([{ type: 'result', requestId: '1' }]);
    expect(port.ofType('state')).toEqual([
      {
        type: 'state',
        token: { name: 'Lyra', image: null },
        bars: lyraCharacter().bars,
        values: { forca: 14 },
        canEdit: true,
      },
    ]);
  });

  it('sends no state before the frame is ready', async () => {
    anchorChanges(20);
    await settled();
    expect(port.ofType('state')).toEqual([]);
  });

  it('a source still without the token sends no state until the token arrives', async () => {
    characters.getState().apply(charactersSynced(4));
    await frameSends({ type: 'ready', requestId: '1' });
    const before = port.ofType('state').length;
    characters.getState().apply(charactersSynced(5, lyraCharacter()));
    expect({ before, after: port.ofType('state').map((state) => state.token?.name) }).toEqual({
      before: 0,
      after: ['Lyra'],
    });
  });

  it('the token image goes as bytes, and the state waits for them', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    api.images[PORTRAIT_ID] = { type: 'image/webp', bytes };
    characters.getState().apply(charactersSynced(4, lyraCharacter({ imageAssetId: PORTRAIT_ID })));
    await frameSends({ type: 'ready', requestId: '1' });
    const [state] = port.ofType('state');
    expect({
      count: port.ofType('state').length,
      image: state?.token?.image,
      reads: api.imageReads,
    }).toEqual({
      count: 1,
      image: { type: 'image/webp', bytes },
      reads: [PORTRAIT_ID],
    });
  });

  it('the state goes again when the token changes and when the values change', async () => {
    await frameSends({ type: 'ready', requestId: '1' });
    anchorChanges(18);
    await frameSends({ type: 'values.set', requestId: '2', changes: { forca: 16 } });
    const states = port.ofType('state');
    expect(states.map((state) => [state.bars[0]?.current, state.values.forca])).toEqual([
      [25, 14],
      [18, 14],
      [18, 16],
    ]);
  });

  it('a change that touches neither the token nor the values sends no state', async () => {
    await frameSends({ type: 'ready', requestId: '1' });
    sheet.setState({ saveStatus: 'refused' });
    expect(port.ofType('state')).toHaveLength(1);
  });

  it('values.set is gathered for 500 ms into one patch and answered once it is saved', async () => {
    await frameSends({ type: 'values.set', requestId: '2', changes: { forca: 16 } });
    await frameSends({ type: 'values.set', requestId: '3', changes: { destreza: 12 } });
    expect(port.ofType('result')).toEqual([]);
    clock.advance(500);
    await settled();
    expect({
      saves: api.saves.map((save) => save.changes),
      results: port.ofType('result'),
    }).toEqual({
      saves: [{ forca: 16, destreza: 12 }],
      results: [
        { type: 'result', requestId: '2' },
        { type: 'result', requestId: '3' },
      ],
    });
  });

  it('bars.adjust becomes sheet:adjustBar with the host sheet id', async () => {
    await frameSends({
      type: 'bars.adjust',
      requestId: '4',
      bar: PV_BAR_ID,
      change: { op: 'add', amount: -7 },
    });
    expect({ sent: commands.sent, results: port.ofType('result') }).toEqual({
      sent: [
        {
          campaignId: VHARN.id,
          sheetId: LYRA_SHEET_ID,
          barId: PV_BAR_ID,
          change: { op: 'add', amount: -7 },
        },
      ],
      results: [{ type: 'result', requestId: '4' }],
    });
  });

  it('bars.adjust by the label the token shows resolves to that bar id', async () => {
    await frameSends({
      type: 'bars.adjust',
      requestId: '4',
      bar: 'pv',
      change: { op: 'add', amount: -2 },
    });
    expect(commands.sent.map(({ barId }) => barId)).toEqual([PV_BAR_ID]);
  });

  it('bars.adjust naming no bar of the token is BAR_NOT_FOUND without a command', async () => {
    await frameSends({ type: 'bars.adjust', requestId: '4', bar: 'Mana', change: ADD_ONE });
    expect({ sent: commands.sent, error: port.ofType('error')[0]?.code }).toEqual({
      sent: [],
      error: 'BAR_NOT_FOUND',
    });
  });

  it('bars.adjust by a label two bars share is BAR_AMBIGUOUS without a command', async () => {
    const [pv, inspiration] = lyraCharacter().bars;
    if (!pv || !inspiration) throw new Error('lyraCharacter() lost its bars');
    const twins = [pv, { ...inspiration, label: 'PV' }];
    characters.getState().apply(charactersSynced(4, lyraCharacter({ bars: twins })));
    await frameSends({ type: 'bars.adjust', requestId: '4', bar: 'PV', change: ADD_ONE });
    expect({ sent: commands.sent, error: port.ofType('error')[0]?.code }).toEqual({
      sent: [],
      error: 'BAR_AMBIGUOUS',
    });
  });

  it('a refused bars.adjust hands the server code back to the frame', async () => {
    commands.answer = { ok: false, code: 'BAR_NOT_FOUND' };
    await frameSends({
      type: 'bars.adjust',
      requestId: '4',
      bar: PV_BAR_ID,
      change: { op: 'set', value: 3 },
    });
    expect(port.ofType('error')).toEqual([
      {
        type: 'error',
        requestId: '4',
        code: 'BAR_NOT_FOUND',
        message: 'bars.adjust refused with BAR_NOT_FOUND',
      },
    ]);
  });

  it('dice.roll becomes dice:roll labeled "<template> · <label>" in this window', async () => {
    await frameSends({ type: 'dice.roll', requestId: '5', expression: '1d20+5', label: 'Ataque' });
    expect(dice.sent).toEqual([
      {
        campaignId: VHARN.id,
        request: {
          label: 'Ficha Tormenta · Ataque',
          parts: [{ label: null, expression: '1d20+5' }],
          visibility: 'public',
          aspect: 1.5,
        },
      },
    ]);
    expect(port.ofType('result')).toEqual([{ type: 'result', requestId: '5' }]);
  });

  it('a notation the server refuses comes back with its code and message', async () => {
    dice.answer = {
      ok: false,
      failure: { kind: 'invalid_expression', message: 'Unknown die "d7"' },
    };
    await frameSends({ type: 'dice.roll', requestId: '5', expression: '1d7' });
    expect(port.ofType('error')).toEqual([
      {
        type: 'error',
        requestId: '5',
        code: 'INVALID_DICE_EXPRESSION',
        message: 'Unknown die "d7"',
      },
    ]);
  });

  it('an eleventh dice.roll in 10 s is RATE_LIMITED without a roll, and the window reopens', async () => {
    for (let index = 0; index < 11; index += 1) {
      await frameSends({ type: 'dice.roll', requestId: `r${index}`, expression: '1d20' });
    }
    const limited = port.ofType('error').map(({ requestId, code }) => ({ requestId, code }));
    expect({ rolls: dice.sent.length, limited }).toEqual({
      rolls: 10,
      limited: [{ requestId: 'r10', code: 'RATE_LIMITED' }],
    });
    clock.advance(10_000);
    await frameSends({ type: 'dice.roll', requestId: 'r11', expression: '1d20' });
    expect(dice.sent).toHaveLength(11);
  });

  it.each([
    ['an unknown type', { type: 'chat.send', requestId: '6' }, '6'],
    [
      'a frame that picks the token',
      {
        type: 'bars.adjust',
        requestId: '7',
        bar: PV_BAR_ID,
        change: { op: 'add', amount: 1 },
        tokenId: LYRA_ID,
      },
      '7',
    ],
    ['an unreadable request id', { type: 'ready', requestId: 'not an id!' }, null],
    ['a string', 'ready', null],
  ])('%s is answered INVALID_MESSAGE and sends no command', async (_, data, requestId) => {
    await frameSends(data);
    const [error] = port.ofType('error');
    expect({
      requestId: error?.requestId,
      code: error?.code,
      commands: commands.sent.length,
    }).toEqual({
      requestId,
      code: 'INVALID_MESSAGE',
      commands: 0,
    });
  });

  it('without canEdit, values.set and bars.adjust are refused FORBIDDEN in the host', async () => {
    await reloadWithCanEdit(false);
    await frameSends({ type: 'values.set', requestId: '8', changes: { forca: 16 } });
    await frameSends({
      type: 'bars.adjust',
      requestId: '9',
      bar: PV_BAR_ID,
      change: { op: 'add', amount: -1 },
    });
    clock.advance(500);
    await settled();
    const codes = port.ofType('error').map(({ requestId, code }) => [requestId, code]);
    expect({ codes, saves: api.saves.length, bars: commands.sent.length }).toEqual({
      codes: [
        ['8', 'FORBIDDEN'],
        ['9', 'FORBIDDEN'],
      ],
      saves: 0,
      bars: 0,
    });
  });

  it('after dispose the port is closed and the frame is no longer heard', async () => {
    host.dispose();
    await frameSends({ type: 'ready', requestId: '1' });
    expect({ closed: port.closed, sent: port.sent }).toEqual({ closed: true, sent: [] });
  });
});

describe('sheet bridge host for a sheet with no token', () => {
  it('sends token null and no bars, and refuses bars.adjust NO_TOKEN', async () => {
    const port = new SheetHostPortFake();
    const api = new SheetsApiFake();
    const clock = new InteractionClockFake();
    const commands = new SheetCommandsFake();
    const sheet = createSheetStore({
      ...{ api, campaignId: VHARN.id, sheetId: LYRA_SHEET_ID, clock },
      newActionId: () => '00000000-0000-4000-8000-000000000001',
    });
    await sheet.getState().load();
    createSheetBridgeHost({
      ...{ port, campaignId: VHARN.id, sheet, token: null, images: api, commands },
      ...{ dice: new DiceCommandsFake(), clock, diceAspect: () => 1 },
    });
    port.fromFrame({ type: 'ready', requestId: '1' });
    port.fromFrame({ type: 'bars.adjust', requestId: '2', bar: 'PV', change: ADD_ONE });
    await settled();
    const [state] = port.ofType('state');
    expect({
      token: state?.token,
      bars: state?.bars,
      error: port.ofType('error')[0]?.code,
      sent: commands.sent,
    }).toEqual({ token: null, bars: [], error: 'NO_TOKEN', sent: [] });
  });
});

describe('sheet bridge host: the console', () => {
  const line = { type: 'console', level: 'warn', message: 'cuidado', at: [] };

  async function bridgeWith(onConsole?: (message: unknown) => void) {
    const port = new SheetHostPortFake();
    const api = new SheetsApiFake();
    const clock = new InteractionClockFake();
    const sheet = createSheetStore({
      ...{ api, campaignId: VHARN.id, sheetId: LYRA_SHEET_ID, clock },
      newActionId: () => '00000000-0000-4000-8000-000000000001',
    });
    await sheet.getState().load();
    createSheetBridgeHost({
      ...{ port, campaignId: VHARN.id, sheet, token: null, images: api, onConsole },
      ...{ commands: new SheetCommandsFake(), dice: new DiceCommandsFake(), clock },
      diceAspect: () => 1,
    });
    return port;
  }

  it('a console line goes to onConsole with no answer to the frame', async () => {
    const lines: unknown[] = [];
    const port = await bridgeWith((message) => lines.push(message));
    port.fromFrame(line);
    await settled();
    expect({ lines, sent: port.sent }).toEqual({ lines: [line], sent: [] });
  });

  it('with no onConsole (a player) the line is dropped, still unanswered', async () => {
    const port = await bridgeWith();
    port.fromFrame(line);
    await settled();
    expect(port.sent).toEqual([]);
  });
});

describe('sheetRollLabelOf', () => {
  it('a roll without its own label carries the template name', () => {
    expect(sheetRollLabelOf('Ficha Tormenta', undefined)).toBe('Ficha Tormenta');
  });

  it('a label past 40 characters is cut to 40 with an ellipsis', () => {
    const label = sheetRollLabelOf('Ficha Tormenta de Arton', 'Ataque com espada longa');
    expect({ label, length: label.length }).toEqual({
      label: 'Ficha Tormenta de Arton · Ataque com es…',
      length: 40,
    });
  });
});
