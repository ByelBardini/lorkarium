import { describe, expect, it } from 'vitest';
import { SHEET_VIEW_RATE } from '@/sheet-sandbox/sheet-bridge-host';
import { createSheetViewStore, sheetViewSlotOf } from '@/stores/sheet-view-store';
import { VHARN } from '../support/campaigns-api-fake';
import { GOBLIN_SHEET_ID, LYRA_SHEET_ID } from '../support/sheet-fixtures';
import { sheetBridgeHarness, type SheetBridgeHarness } from '../support/sheet-bridge-harness';

const viewSet = (requestId: string, value: unknown) => ({ type: 'view.set', requestId, value });

function lyraSlot(views = createSheetViewStore()) {
  return sheetViewSlotOf(views, VHARN.id, LYRA_SHEET_ID);
}

function lastViewSent(harness: SheetBridgeHarness): unknown {
  const states = harness.port.ofType('state');
  return states[states.length - 1]?.view;
}

describe('sheet bridge host: view.set', () => {
  it('the first state of a sheet nobody kept a view of carries view null', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends({ type: 'ready', requestId: '1' });
    expect(lastViewSent(harness)).toBeNull();
  });

  it('is answered with a bare result, kept in the slot, with no new state and no network', async () => {
    const view = lyraSlot();
    const harness = await sheetBridgeHarness({ view });
    await harness.frameSends({ type: 'ready', requestId: '1' });
    const detailCalls = harness.api.detailCalls;
    await harness.frameSends(viewSet('2', { aba: 'origem' }));
    harness.clock.advance(1000);
    expect({
      kept: view.current(),
      results: harness.port.ofType('result'),
      states: harness.port.ofType('state').length,
      network: [harness.api.saves, harness.api.detailCalls - detailCalls, harness.commands.sent],
    }).toEqual({
      kept: { aba: 'origem' },
      results: [
        { type: 'result', requestId: '1' },
        { type: 'result', requestId: '2' },
      ],
      states: 1,
      network: [[], 0, []],
    });
  });

  it('a remounted frame of the same sheet gets the kept view in its first state', async () => {
    const views = createSheetViewStore();
    const first = await sheetBridgeHarness({ view: lyraSlot(views) });
    await first.frameSends({ type: 'ready', requestId: '1' });
    await first.frameSends(viewSet('2', { aba: 'origem', rolagem: 320 }));
    first.host.dispose();
    const again = await sheetBridgeHarness({ view: lyraSlot(views) });
    await again.frameSends({ type: 'ready', requestId: '1' });
    expect(lastViewSent(again)).toEqual({ aba: 'origem', rolagem: 320 });
  });

  it('another sheet of the same viewer does not see it', async () => {
    const views = createSheetViewStore();
    const lyra = await sheetBridgeHarness({ view: lyraSlot(views) });
    await lyra.frameSends(viewSet('1', { aba: 'origem' }));
    const goblin = await sheetBridgeHarness({
      view: sheetViewSlotOf(views, VHARN.id, GOBLIN_SHEET_ID),
    });
    await goblin.frameSends({ type: 'ready', requestId: '1' });
    expect(lastViewSent(goblin)).toBeNull();
  });

  it('the next state for another reason carries the kept view', async () => {
    const harness = await sheetBridgeHarness();
    await harness.frameSends({ type: 'ready', requestId: '1' });
    await harness.frameSends(viewSet('2', 'origem'));
    await harness.frameSends({ type: 'values.set', requestId: '3', changes: { forca: 16 } });
    expect(lastViewSent(harness)).toBe('origem');
  });

  it('a read-only sheet keeps the view of who looks too', async () => {
    const view = lyraSlot();
    const harness = await sheetBridgeHarness({ canEdit: false, view });
    await harness.frameSends(viewSet('1', { aba: 'perfil' }));
    expect({ errors: harness.port.ofType('error'), kept: view.current() }).toEqual({
      errors: [],
      kept: { aba: 'perfil' },
    });
  });

  it('null forgets the kept view', async () => {
    const view = lyraSlot();
    const harness = await sheetBridgeHarness({ view });
    await harness.frameSends(viewSet('1', { aba: 'origem' }));
    await harness.frameSends(viewSet('2', null));
    expect(view.current()).toBeNull();
  });

  it('a view past 4096 bytes is INVALID_MESSAGE and the slot keeps the last one', async () => {
    const view = lyraSlot();
    const harness = await sheetBridgeHarness({ view });
    await harness.frameSends(viewSet('1', 'perfil'));
    await harness.frameSends(viewSet('2', 'a'.repeat(4096)));
    expect({
      codes: harness.port.ofType('error').map(({ code }) => code),
      kept: view.current(),
    }).toEqual({ codes: ['INVALID_MESSAGE'], kept: 'perfil' });
  });

  it('past 60 in 10 s is RATE_LIMITED until the window moves on', async () => {
    const view = lyraSlot();
    const harness = await sheetBridgeHarness({ view });
    expect(SHEET_VIEW_RATE).toEqual({ limit: 60, windowMs: 10_000 });
    for (let at = 1; at <= 60; at += 1) await harness.frameSends(viewSet(`${at}`, at));
    await harness.frameSends(viewSet('61', 61));
    const refused = { codes: harness.port.ofType('error').map(({ code }) => code) };
    harness.clock.advance(10_000);
    await harness.frameSends(viewSet('62', 62));
    expect({ ...refused, kept: view.current() }).toEqual({ codes: ['RATE_LIMITED'], kept: 62 });
  });
});
