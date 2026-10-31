import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  readableSheetSummaries,
  toSheetAccessBo,
  toSheetChangesPo,
  toSheetDto,
  toSheetReceiptDto,
  toValuesChange,
} from '../../../src/modules/sheets/sheets.mapper';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { ATO_1_ID } from '../../support/library-factories';
import { BRAM_ID } from '../../support/tokens-factories';
import { TORMENTA_ID } from '../../support/sheet-templates-fakes';
import {
  LYRA_ANCHOR_ID,
  LYRA_SHEET_ID,
  SHEET_ACTION_ID,
  sheetPo,
  tablePlaces,
} from '../../support/sheets-fakes';

const bia = new CampaignAccessBo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' });

function placeOf(index: number) {
  const place = tablePlaces()[index];
  if (!place) throw new Error(`no place ${index}`);
  return place;
}

describe('sheets mapper', () => {
  it('Bia gets the sheet of her Lyra with canEdit and without canManage', () => {
    const rules = toSheetAccessBo(bia, sheetPo(), placeOf(0));

    expect(toSheetDto(sheetPo(), placeOf(0), rules)).toEqual({
      id: LYRA_SHEET_ID,
      name: 'Lyra',
      folderId: null,
      templateId: TORMENTA_ID,
      tokenId: LYRA_ANCHOR_ID,
      memberId: BIA_ID,
      visibility: 'controllers',
      values: { forca: 14 },
      version: 4,
      canEdit: true,
      canManage: false,
    });
  });

  it("the token on the private Torre, out of the group, is out of Bia's sight", () => {
    expect(toSheetAccessBo(bia, sheetPo(), placeOf(3)).canRead()).toBe(false);
  });

  it('the receipt carries the sheet, its version and the operation, no values', () => {
    expect(toSheetReceiptDto(SHEET_ACTION_ID, sheetPo(), 'values')).toEqual({
      actionId: SHEET_ACTION_ID,
      sheetId: LYRA_SHEET_ID,
      version: 4,
      operation: 'values',
    });
  });

  it('a patch splits into the keys set and the keys null removes', () => {
    expect(toValuesChange({ forca: 16, pericias: { furtividade: true }, notas: null })).toEqual({
      set: { forca: 16, pericias: { furtividade: true } },
      removed: ['notas'],
    });
  });

  it('a sheet nobody holds has neither token nor member, and only masters read it', () => {
    const ana = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
    const unheld = sheetPo({ tokenId: null });

    expect(toSheetDto(unheld, null, toSheetAccessBo(ana, unheld, null))).toMatchObject({
      ...{ tokenId: null, memberId: null, canEdit: true, canManage: true },
    });
    expect(toSheetAccessBo(bia, unheld, null).canRead()).toBe(false);
  });

  it('the library lines: Caio reads only the table sheet of Bram, with no values', () => {
    const caio = new CampaignAccessBo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' });
    const sheets = [
      sheetPo(),
      sheetPo({ id: SHEET_ACTION_ID, tokenId: BRAM_ID, visibility: 'table', name: 'Bram' }),
      sheetPo({ id: TORMENTA_ID, tokenId: null, name: 'Goblin' }),
    ];

    const lines = readableSheetSummaries(caio, sheets, tablePlaces());

    expect(lines).toEqual([
      {
        ...{ id: SHEET_ACTION_ID, name: 'Bram', folderId: null, templateId: TORMENTA_ID },
        ...{ tokenId: BRAM_ID, memberId: null, visibility: 'table', version: 4 },
      },
    ]);
  });

  it('a manage write changes only what was sent; holder null takes the token away', () => {
    const actionId = SHEET_ACTION_ID;

    expect(toSheetChangesPo({ actionId, name: 'Lyra II', folderId: ATO_1_ID }, null)).toEqual({
      name: 'Lyra II',
      folderId: ATO_1_ID,
    });
    expect(toSheetChangesPo({ actionId, holder: null }, null)).toEqual({ tokenId: null });
    expect(toSheetChangesPo({ actionId, holder: { tokenId: BRAM_ID } }, placeOf(2))).toEqual({
      tokenId: BRAM_ID,
    });
  });
});
