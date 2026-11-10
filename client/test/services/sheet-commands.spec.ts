import { describe, expect, it } from 'vitest';
import { RealtimeSheetCommands } from '@/services/sheet-commands';
import { VHARN } from '../support/campaigns-api-fake';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { LYRA_SHEET_ID, SHEET_ACTION_ID } from '../support/sheet-fixtures';

const PV_BAR_ID = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

function adjusted(answer: (transport: RealtimeTransportFake) => void) {
  const transport = new RealtimeTransportFake();
  const commands = new RealtimeSheetCommands(transport, () => SHEET_ACTION_ID);
  const result = commands.adjustBar(VHARN.id, LYRA_SHEET_ID, PV_BAR_ID, { op: 'add', amount: -7 });
  answer(transport);
  return { transport, result };
}

describe('RealtimeSheetCommands.adjustBar', () => {
  it('emits sheet:adjustBar with the sheet and no token, and answers the version', async () => {
    const { transport, result } = adjusted((t) =>
      t.answerAck({ ok: true, version: 9 }, 'sheet:adjustBar'),
    );
    expect(await result).toEqual({ ok: true, version: 9 });
    expect(transport.sent).toEqual([
      {
        event: 'sheet:adjustBar',
        payload: {
          actionId: SHEET_ACTION_ID,
          campaignId: VHARN.id,
          sheetId: LYRA_SHEET_ID,
          barId: PV_BAR_ID,
          change: { op: 'add', amount: -7 },
        },
      },
    ]);
  });

  it('a refusal hands back the server code and message as they came', async () => {
    const refusal = { ok: false, error: { code: 'BAR_NOT_FOUND', message: 'no bar' } };
    const { result } = adjusted((t) => t.answerAck(refusal, 'sheet:adjustBar'));
    expect(await result).toEqual({ ok: false, code: 'BAR_NOT_FOUND', message: 'no bar' });
  });

  it('an ack outside the DTO is UNEXPECTED', async () => {
    const { result } = adjusted((t) => t.answerAck({ ok: 'yes' }, 'sheet:adjustBar'));
    expect(await result).toEqual({ ok: false, code: 'UNEXPECTED' });
  });

  it('no ack in time is OFFLINE', async () => {
    const { result } = adjusted((t) => t.timeOutAck('sheet:adjustBar'));
    expect(await result).toEqual({ ok: false, code: 'OFFLINE' });
  });
});

const MP_BAR_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const COSTS = [
  { barId: PV_BAR_ID, amount: 6 },
  { barId: MP_BAR_ID, amount: 2 },
];

function spent(answer: (transport: RealtimeTransportFake) => void) {
  const transport = new RealtimeTransportFake();
  const commands = new RealtimeSheetCommands(transport, () => SHEET_ACTION_ID);
  const result = commands.spendBars(VHARN.id, LYRA_SHEET_ID, COSTS);
  answer(transport);
  return { transport, result };
}

describe('RealtimeSheetCommands.spendBars', () => {
  it('emits one sheet:spendBars with every cost and no token, and answers the version', async () => {
    const { transport, result } = spent((t) =>
      t.answerAck({ ok: true, version: 11 }, 'sheet:spendBars'),
    );
    expect(await result).toEqual({ ok: true, version: 11 });
    expect(transport.sent).toEqual([
      {
        event: 'sheet:spendBars',
        payload: {
          actionId: SHEET_ACTION_ID,
          campaignId: VHARN.id,
          sheetId: LYRA_SHEET_ID,
          costs: COSTS,
        },
      },
    ]);
  });

  it('INSUFFICIENT_BAR comes back with the message citing the bar short', async () => {
    const message = 'Bar "MP" has 1; expected at least 2';
    const refusal = { ok: false, error: { code: 'INSUFFICIENT_BAR', message } };
    const { result } = spent((t) => t.answerAck(refusal, 'sheet:spendBars'));
    expect(await result).toEqual({ ok: false, code: 'INSUFFICIENT_BAR', message });
  });

  it('an ack outside the DTO is UNEXPECTED', async () => {
    const { result } = spent((t) => t.answerAck({ ok: true }, 'sheet:spendBars'));
    expect(await result).toEqual({ ok: false, code: 'UNEXPECTED' });
  });

  it('no ack in time is OFFLINE', async () => {
    const { result } = spent((t) => t.timeOutAck('sheet:spendBars'));
    expect(await result).toEqual({ ok: false, code: 'OFFLINE' });
  });
});
