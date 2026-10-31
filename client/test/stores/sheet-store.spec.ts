import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { createSheetStore, type SheetStoreState } from '@/stores/sheet-store';
import { VHARN } from '../support/campaigns-api-fake';
import { InteractionClockFake } from '../support/interaction-clock-fake';
import { LYRA_SHEET_ID, lyraSheet, sheetResponse } from '../support/sheet-fixtures';
import { SheetsApiFake } from '../support/sheets-api-fake';

const OTHER_SHEET_ID = '8d9e0f1a-2b3c-4d4e-9f5a-6b7c8d9e0f1a';
const AT = '2026-10-31T12:00:00.000Z';

function changedAt(version: number, sheetId = LYRA_SHEET_ID) {
  return { campaignId: VHARN.id, sheetId, version, at: AT };
}

// The store's work after a timer or an answer runs on promises: let them all settle.
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('sheet store', () => {
  let api: SheetsApiFake;
  let clock: InteractionClockFake;
  let store: StoreApi<SheetStoreState>;
  let actionIds: number;

  beforeEach(() => {
    api = new SheetsApiFake();
    clock = new InteractionClockFake();
    actionIds = 0;
    store = createSheetStore({
      api,
      campaignId: VHARN.id,
      sheetId: LYRA_SHEET_ID,
      clock,
      newActionId: () => `00000000-0000-4000-8000-00000000000${++actionIds}`,
    });
  });

  async function loaded(): Promise<void> {
    await store.getState().load();
  }

  describe('reading', () => {
    it('a load shows the sheet, its template and its values', async () => {
      await loaded();
      const { status, template, values } = store.getState();
      expect({ status, name: template?.name, values }).toEqual({
        status: 'ready',
        name: 'Ficha Tormenta',
        values: { forca: 14 },
      });
    });

    it('a 404 on load leaves the sheet not_found, with nothing to show', async () => {
      api.detailResult = { ok: false, failure: { kind: 'not_found' } };
      await loaded();
      expect(store.getState()).toMatchObject({ status: 'not_found', sheet: null, template: null });
    });

    it('a first load offline is failed', async () => {
      api.detailResult = { ok: false, failure: { kind: 'offline' } };
      await loaded();
      expect(store.getState().status).toBe('failed');
    });

    it('sheet:changed with a newer version reads the sheet again', async () => {
      await loaded();
      api.response = sheetResponse(lyraSheet({ version: 2, values: { forca: 18 } }));
      store.getState().changed(changedAt(2));
      await settled();
      expect(store.getState().values).toEqual({ forca: 18 });
    });

    it.each([
      ['the same version', changedAt(1)],
      ['an older version', changedAt(0)],
      ['another sheet', changedAt(5, OTHER_SHEET_ID)],
      ['another table', { ...changedAt(5), campaignId: '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f' }],
    ])('sheet:changed of %s reads nothing', async (_, event) => {
      await loaded();
      store.getState().changed(event);
      await settled();
      expect(api.detailCalls).toBe(1);
    });

    it('a 404 on the re-read after sheet:changed takes the sheet down', async () => {
      await loaded();
      api.detailResult = { ok: false, failure: { kind: 'not_found' } };
      store.getState().changed(changedAt(2));
      await settled();
      expect(store.getState()).toMatchObject({ status: 'not_found', sheet: null, values: {} });
    });

    it('an answer that arrives after dispose puts nothing back', async () => {
      api.holdDetails = true;
      const loading = store.getState().load();
      store.getState().dispose();
      api.heldDetails[0]?.release();
      await loading;
      expect(store.getState()).toMatchObject({ status: 'loading', sheet: null });
    });
  });

  describe('writing values', () => {
    beforeEach(loaded);

    it('changes within 500 ms go in one patch, shown before it is sent', async () => {
      void store.getState().setValues({ forca: 16 });
      clock.advance(300);
      void store.getState().setValues({ destreza: 12 });
      expect(store.getState().values).toEqual({ forca: 16, destreza: 12 });
      clock.advance(199);
      expect(api.saves).toEqual([]);
      clock.advance(1);
      await settled();
      expect(api.saves.map((save) => save.changes)).toEqual([{ forca: 16, destreza: 12 }]);
    });

    it('a confirmed patch settles each change and adopts the new version', async () => {
      const outcome = store.getState().setValues({ forca: 16 });
      clock.advance(500);
      await expect(outcome).resolves.toEqual({ ok: true });
      expect(store.getState()).toMatchObject({ saveStatus: 'saved', sheet: { version: 2 } });
    });

    it('a null value removes the key from what is shown', () => {
      void store.getState().setValues({ forca: null });
      expect(store.getState().values).toEqual({});
    });

    it('a viewer who may not edit is refused with forbidden, and nothing is sent', async () => {
      api.response = sheetResponse(lyraSheet({ version: 2, canEdit: false }));
      store.getState().changed(changedAt(2));
      await settled();
      const outcome = await store.getState().setValues({ forca: 16 });
      clock.advance(500);
      await settled();
      expect({ outcome, saves: api.saves.length }).toEqual({
        outcome: { ok: false, failure: { kind: 'forbidden' } },
        saves: 0,
      });
    });

    it('changes made while a patch is in flight go in the next patch', async () => {
      api.holdSaves = true;
      void store.getState().setValues({ forca: 16 });
      clock.advance(500);
      void store.getState().setValues({ forca: 17 });
      clock.advance(500);
      expect(api.saves).toHaveLength(1);
      api.heldSaves[0]?.release();
      await settled();
      clock.advance(500);
      await settled();
      expect(api.saves.map((save) => save.changes)).toEqual([{ forca: 16 }, { forca: 17 }]);
    });

    it('an offline patch keeps its action id and goes again before the next change', async () => {
      api.saveResult = { ok: false, failure: { kind: 'offline' } };
      void store.getState().setValues({ forca: 16 });
      clock.advance(500);
      await settled();
      expect(store.getState()).toMatchObject({ saveStatus: 'offline', values: { forca: 16 } });
      api.saveResult = null;
      void store.getState().setValues({ destreza: 12 });
      clock.advance(500);
      await settled();
      clock.advance(500);
      await settled();
      expect(api.saves).toEqual([
        { actionId: '00000000-0000-4000-8000-000000000001', changes: { forca: 16 } },
        { actionId: '00000000-0000-4000-8000-000000000001', changes: { forca: 16 } },
        { actionId: '00000000-0000-4000-8000-000000000002', changes: { destreza: 12 } },
      ]);
    });

    it('a refused patch drops its changes and reads the sheet again', async () => {
      api.saveResult = { ok: false, failure: { kind: 'forbidden' } };
      const outcome = store.getState().setValues({ forca: 16 });
      clock.advance(500);
      await expect(outcome).resolves.toEqual({ ok: false, failure: { kind: 'forbidden' } });
      await settled();
      expect({ values: store.getState().values, reads: api.detailCalls }).toEqual({
        values: { forca: 14 },
        reads: 2,
      });
    });

    it('a 404 on the patch takes the sheet down', async () => {
      api.saveResult = { ok: false, failure: { kind: 'not_found' } };
      void store.getState().setValues({ forca: 16 });
      clock.advance(500);
      await settled();
      expect(store.getState()).toMatchObject({ status: 'not_found', sheet: null });
    });

    it('dispose sends the changes still waiting for their 500 ms', () => {
      void store.getState().setValues({ forca: 16 });
      store.getState().dispose();
      expect(api.saves.map((save) => save.changes)).toEqual([{ forca: 16 }]);
    });
  });
});
