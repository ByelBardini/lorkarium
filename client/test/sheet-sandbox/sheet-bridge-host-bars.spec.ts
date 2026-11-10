import { describe, expect, it } from 'vitest';
import { VHARN } from '../support/campaigns-api-fake';
import { charactersSynced, lyraCharacter } from '../support/character-fixtures';
import { LYRA_SHEET_ID } from '../support/sheet-fixtures';
import { sheetBridgeHarness, type SheetBridgeHarness } from '../support/sheet-bridge-harness';
import { LYRA_PV_ID } from '../support/table-session-fixtures';

const spend = (costs: unknown) => ({ type: 'bars.spend', requestId: '4', costs });

function codesOf(harness: SheetBridgeHarness): string[] {
  return harness.port.ofType('error').map(({ code }) => code);
}

describe('sheet bridge host: bars.spend', () => {
  it('resolves every name to its bar id and sends one sheet:spendBars', async () => {
    const harness = await sheetBridgeHarness();
    const [, inspiration] = lyraCharacter().bars;
    await harness.frameSends(
      spend([
        { bar: 'pv', amount: 3 },
        { bar: inspiration?.label ?? '', amount: 1 },
      ]),
    );
    expect({ spends: harness.commands.spends, results: harness.port.ofType('result') }).toEqual({
      spends: [
        {
          campaignId: VHARN.id,
          sheetId: LYRA_SHEET_ID,
          costs: [
            { barId: LYRA_PV_ID, amount: 3 },
            { barId: inspiration?.id, amount: 1 },
          ],
        },
      ],
      results: [{ type: 'result', requestId: '4' }],
    });
  });

  it('a name that matches no bar is BAR_NOT_FOUND and nothing is sent', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends(
      spend([
        { bar: 'PV', amount: 3 },
        { bar: 'Mana', amount: 2 },
      ]),
    );
    expect({ codes: codesOf(harness), spends: harness.commands.spends }).toEqual({
      codes: ['BAR_NOT_FOUND'],
      spends: [],
    });
  });

  it("INSUFFICIENT_BAR comes back with the server's message", async () => {
    const harness = await sheetBridgeHarness();
    const message = 'bar "PV" has 2; expected at least 3';
    harness.commands.answer = { ok: false, code: 'INSUFFICIENT_BAR', message };
    await harness.frameSends(spend([{ bar: 'PV', amount: 3 }]));
    expect(harness.port.ofType('error')).toEqual([
      { type: 'error', requestId: '4', code: 'INSUFFICIENT_BAR', message },
    ]);
  });

  it('without canEdit is FORBIDDEN with no command', async () => {
    const harness = await sheetBridgeHarness({ canEdit: false });
    await harness.frameSends(spend([{ bar: 'PV', amount: 1 }]));
    expect({ codes: codesOf(harness), spends: harness.commands.spends }).toEqual({
      codes: ['FORBIDDEN'],
      spends: [],
    });
  });

  it('a sheet with no holder is NO_TOKEN, and a holder still loading too', async () => {
    const spare = await sheetBridgeHarness({ tokenOf: () => null });
    const loading = await sheetBridgeHarness();
    loading.characters.getState().apply(charactersSynced(4));
    await spare.frameSends(spend([{ bar: 'PV', amount: 1 }]));
    await loading.frameSends(spend([{ bar: 'PV', amount: 1 }]));
    expect([codesOf(spare), codesOf(loading)]).toEqual([['NO_TOKEN'], ['NO_TOKEN']]);
  });
});
