import { describe, expect, it } from 'vitest';
import { SHEET_BAR_CREATION_RATE } from '@/sheet-sandbox/sheet-bridge-host';
import { VHARN } from '../support/campaigns-api-fake';
import { LYRA_SHEET_ID } from '../support/sheet-fixtures';
import { sheetBridgeHarness, type SheetBridgeHarness } from '../support/sheet-bridge-harness';

const FOLEGO_ID = '00000000-0000-4000-8000-0000000000f0';
const create = (bar: unknown, requestId = '5') => ({ type: 'bars.create', requestId, bar });

function codesOf(harness: SheetBridgeHarness): string[] {
  return harness.port.ofType('error').map(({ code }) => code);
}

function declared(canEdit = true): Promise<SheetBridgeHarness> {
  return sheetBridgeHarness({ permissions: ['character:bars'], canEdit });
}

describe('sheet bridge host: bars.create', () => {
  it('sends the bar to the sheet route, gold by default, and answers its id', async () => {
    const harness = await declared();
    harness.api.createBarResult = { ok: true, value: { barId: FOLEGO_ID, created: true } };

    await harness.frameSends(create({ label: 'Fôlego', max: 6 }));

    expect(harness.api.barCreations).toEqual([
      {
        campaignId: VHARN.id,
        sheetId: LYRA_SHEET_ID,
        input: { bar: { label: 'Fôlego', max: 6, color: 'gold' } },
      },
    ]);
    expect(harness.port.ofType('result')).toEqual([
      { type: 'result', requestId: '5', value: { barId: FOLEGO_ID, created: true } },
    ]);
  });

  it('a bar already there answers created false', async () => {
    const harness = await declared();
    harness.api.createBarResult = { ok: true, value: { barId: FOLEGO_ID, created: false } };

    await harness.frameSends(create({ label: 'Fôlego', max: 6 }));

    expect(harness.port.ofType('result')[0]?.value).toEqual({ barId: FOLEGO_ID, created: false });
  });

  it('a template without character:bars is PERMISSION_NOT_DECLARED and nothing is sent', async () => {
    const harness = await sheetBridgeHarness();

    await harness.frameSends(create({ label: 'Fôlego', max: 6 }));

    expect(harness.port.ofType('error')).toEqual([
      {
        type: 'error',
        requestId: '5',
        code: 'PERMISSION_NOT_DECLARED',
        message: 'bars.create needs permission character:bars in the manifest',
      },
    ]);
    expect(harness.api.barCreations).toEqual([]);
  });

  it('a read-only sheet is FORBIDDEN and nothing is sent', async () => {
    const harness = await declared(false);

    await harness.frameSends(create({ label: 'Fôlego', max: 6 }));

    expect({ codes: codesOf(harness), sent: harness.api.barCreations }).toEqual({
      codes: ['FORBIDDEN'],
      sent: [],
    });
  });

  it("a server refusal comes back with the server's code and message", async () => {
    const harness = await declared();
    const message = 'Bar "Fôlego" does not fit: the holder has 8 bars; expected fewer than 8';
    harness.api.createBarResult = {
      ok: false,
      failure: { kind: 'unexpected' },
      refusal: { code: 'BAR_LIMIT', message },
    };

    await harness.frameSends(create({ label: 'Fôlego', max: 6 }));

    expect(harness.port.ofType('error')).toEqual([
      { type: 'error', requestId: '5', code: 'BAR_LIMIT', message },
    ]);
  });

  it('offline, with no body from the server, is OFFLINE', async () => {
    const harness = await declared();
    harness.api.createBarResult = { ok: false, failure: { kind: 'offline' }, refusal: null };

    await harness.frameSends(create({ label: 'Fôlego', max: 6 }));

    expect(codesOf(harness)).toEqual(['OFFLINE']);
  });

  it(`more than ${SHEET_BAR_CREATION_RATE.limit} in the window is RATE_LIMITED, sending none`, async () => {
    const harness = await declared();
    for (let index = 0; index <= SHEET_BAR_CREATION_RATE.limit; index += 1)
      await harness.frameSends(create({ label: `B${index}`, max: 1 }, String(index)));

    expect(harness.api.barCreations).toHaveLength(SHEET_BAR_CREATION_RATE.limit);
    expect(codesOf(harness)).toEqual(['RATE_LIMITED']);
  });

  it('a hex color is INVALID_MESSAGE and nothing is sent', async () => {
    const harness = await declared();

    await harness.frameSends(create({ label: 'Fôlego', max: 6, color: '#ff0000' }));

    expect({ codes: codesOf(harness), sent: harness.api.barCreations }).toEqual({
      codes: ['INVALID_MESSAGE'],
      sent: [],
    });
  });
});
