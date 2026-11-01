import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  readableHolderSheets,
  readableSheetSummaries,
  toSheetAccessBo,
  toSheetChangesPo,
  toSheetDto,
  toSheetReceiptDto,
  toValuesChange,
} from '../../../src/modules/sheets/sheets.mapper';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { ATO_1_ID } from '../../support/library-factories';
import { BRAM_ID } from '../../support/tokens-factories';
import { TORMENTA_ID } from '../../support/sheet-templates-fakes';
import {
  LYRA_SHEET_ID,
  SHEET_ACTION_ID,
  lyraPlace,
  sheetPo,
  tablePlaces,
} from '../../support/sheets-fakes';

const bia = new CampaignAccessBo({ campaignId: VHARN_ID, userId: BIA_ID, role: 'player' });
const caio = new CampaignAccessBo({ campaignId: VHARN_ID, userId: CAIO_ID, role: 'player' });
const LYRA = { character: lyraPlace() };

function placeOf(index: number) {
  const place = tablePlaces()[index];
  if (!place) throw new Error(`no place ${index}`);
  return { token: place };
}

describe('sheets mapper', () => {
  it('Bia gets the sheet of her Lyra with canEdit and without canManage; it names her, no token', () => {
    const rules = toSheetAccessBo(bia, sheetPo(), LYRA);

    expect(toSheetDto(sheetPo(), LYRA, rules)).toEqual({
      id: LYRA_SHEET_ID,
      name: 'Lyra',
      folderId: null,
      templateId: TORMENTA_ID,
      tokenId: null,
      memberId: BIA_ID,
      visibility: 'controllers',
      values: { forca: 14 },
      version: 4,
      canEdit: true,
      canManage: false,
    });
  });

  it("the token on the private Torre, out of the group, is out of Bia's sight", () => {
    expect(toSheetAccessBo(bia, sheetPo(), placeOf(2)).canRead()).toBe(false);
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

  it('a sheet of a character without a player names nobody, and only masters read it', () => {
    const ana = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
    const left = { character: lyraPlace({ userId: null, holderRole: null }) };
    const sheet = sheetPo({ visibility: 'table' });

    expect(toSheetDto(sheet, left, toSheetAccessBo(ana, sheet, left))).toMatchObject({
      ...{ tokenId: null, memberId: null, canEdit: true },
    });
    expect(toSheetAccessBo(caio, sheet, left).canRead()).toBe(false);
  });

  it('a sheet nobody holds has neither token nor member, and only masters read it', () => {
    const ana = new CampaignAccessBo({ campaignId: VHARN_ID, userId: ANA_ID, role: 'master' });
    const unheld = sheetPo({ characterId: null });

    expect(toSheetDto(unheld, null, toSheetAccessBo(ana, unheld, null))).toMatchObject({
      ...{ tokenId: null, memberId: null, canEdit: true, canManage: true },
    });
    expect(toSheetAccessBo(bia, unheld, null).canRead()).toBe(false);
  });

  it('the library lines: Caio reads the table sheets of Bram and of Lyra, with no values', () => {
    const bram = { characterId: null, tokenId: BRAM_ID, visibility: 'table' } as const;
    const sheets = [
      sheetPo(),
      sheetPo({ id: SHEET_ACTION_ID, ...bram, name: 'Bram' }),
      sheetPo({ id: ATO_1_ID, visibility: 'table', name: 'Diário' }),
      sheetPo({ id: TORMENTA_ID, characterId: null, name: 'Goblin' }),
    ];
    const places = { tokens: tablePlaces(), characters: [lyraPlace()] };

    const lines = readableSheetSummaries(caio, sheets, places);

    expect(lines).toEqual([
      {
        ...{ id: SHEET_ACTION_ID, name: 'Bram', folderId: null, templateId: TORMENTA_ID },
        ...{ tokenId: BRAM_ID, memberId: null, visibility: 'table', version: 4 },
      },
      {
        ...{ id: ATO_1_ID, name: 'Diário', folderId: null, templateId: TORMENTA_ID },
        ...{ tokenId: null, memberId: BIA_ID, visibility: 'table', version: 4 },
      },
    ]);
  });

  it('the sheets of one holder: Caio reads only the table one of Lyra', () => {
    const sheets = [sheetPo(), sheetPo({ id: ATO_1_ID, visibility: 'table', name: 'Diário' })];

    expect(readableHolderSheets(caio, sheets, LYRA).map(({ id }) => id)).toEqual([ATO_1_ID]);
    expect(readableHolderSheets(bia, sheets, LYRA)).toHaveLength(2);
  });

  it('a manage write changes only what was sent; holder null takes token and character away', () => {
    const actionId = SHEET_ACTION_ID;

    expect(toSheetChangesPo({ actionId, name: 'Lyra II', folderId: ATO_1_ID }, null)).toEqual({
      name: 'Lyra II',
      folderId: ATO_1_ID,
    });
    expect(toSheetChangesPo({ actionId, holder: null }, null)).toEqual({
      tokenId: null,
      characterId: null,
    });
    expect(toSheetChangesPo({ actionId, holder: { tokenId: BRAM_ID } }, placeOf(1))).toEqual({
      tokenId: BRAM_ID,
      characterId: null,
    });
    expect(toSheetChangesPo({ actionId, holder: { memberId: BIA_ID } }, LYRA)).toEqual({
      tokenId: null,
      characterId: LYRA_CHARACTER_ID,
    });
  });
});
