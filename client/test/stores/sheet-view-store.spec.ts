import { describe, expect, it } from 'vitest';
import {
  createSheetViewStore,
  localSheetViewSlot,
  sheetViewSlotOf,
} from '@/stores/sheet-view-store';
import { VHARN } from '../support/campaigns-api-fake';
import { GOBLIN_SHEET_ID, LYRA_SHEET_ID } from '../support/sheet-fixtures';

const OTHER_CAMPAIGN_ID = '00000000-0000-4000-8000-0000000000ff';

describe('sheet view store', () => {
  it('a sheet nobody kept a view of answers null', () => {
    const views = createSheetViewStore();
    expect(sheetViewSlotOf(views, VHARN.id, LYRA_SHEET_ID).current()).toBeNull();
  });

  it('a slot made again for the same table and sheet reads what the first one kept', () => {
    const views = createSheetViewStore();
    sheetViewSlotOf(views, VHARN.id, LYRA_SHEET_ID).remember({ aba: 'origem' });
    expect(sheetViewSlotOf(views, VHARN.id, LYRA_SHEET_ID).current()).toEqual({ aba: 'origem' });
  });

  it('another sheet of the same table does not see it', () => {
    const views = createSheetViewStore();
    sheetViewSlotOf(views, VHARN.id, LYRA_SHEET_ID).remember({ aba: 'origem' });
    expect(sheetViewSlotOf(views, VHARN.id, GOBLIN_SHEET_ID).current()).toBeNull();
  });

  it('the same sheet id at another table does not see it', () => {
    const views = createSheetViewStore();
    sheetViewSlotOf(views, VHARN.id, LYRA_SHEET_ID).remember({ aba: 'origem' });
    expect(sheetViewSlotOf(views, OTHER_CAMPAIGN_ID, LYRA_SHEET_ID).current()).toBeNull();
  });

  it('remembering null forgets the view', () => {
    const views = createSheetViewStore();
    const slot = sheetViewSlotOf(views, VHARN.id, LYRA_SHEET_ID);
    slot.remember('origem');
    slot.remember(null);
    expect({ current: slot.current(), kept: views.getState().views }).toEqual({
      current: null,
      kept: {},
    });
  });

  it('clear forgets every sheet (the session ended)', () => {
    const views = createSheetViewStore();
    sheetViewSlotOf(views, VHARN.id, LYRA_SHEET_ID).remember(1);
    sheetViewSlotOf(views, VHARN.id, GOBLIN_SHEET_ID).remember(2);
    views.getState().clear();
    expect(views.getState().views).toEqual({});
  });

  it('a local slot keeps the last view only for itself', () => {
    const first = localSheetViewSlot();
    first.remember({ rolagem: 40 });
    expect({ first: first.current(), second: localSheetViewSlot().current() }).toEqual({
      first: { rolagem: 40 },
      second: null,
    });
  });
});
