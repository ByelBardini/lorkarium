import { describe, expect, it } from 'vitest';
import { SheetBarsService } from '../../../src/modules/sheets/sheet-bars.service';
import type { HolderBar, TokensService } from '../../../src/modules/tokens/tokens.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import {
  LYRA_ANCHOR_ID,
  LYRA_SHEET_ID,
  QUELM_SHEET_ID,
  SheetsHarness,
} from '../../support/sheets-fakes';
import { BRAM_ID, LYRA_PV_ID } from '../../support/tokens-factories';

/** Records each bar handed to the tokens service and answers version 7. */
class HolderBarsFake implements Pick<TokensService, 'adjustHolderBar'> {
  readonly calls: Array<Readonly<{ userId: string; campaignId: string; bar: HolderBar }>> = [];
  async adjustHolderBar(userId: string, campaignId: string, bar: HolderBar): Promise<number> {
    this.calls.push({ userId, campaignId, bar });
    return 7;
  }
}

const CHANGE = { op: 'add', amount: -7 } as const;

function serviceOf(harness: SheetsHarness, tokens: HolderBarsFake): SheetBarsService {
  return new SheetBarsService({ members: harness.members, sheets: harness.sheets, tokens });
}

describe('SheetBarsService', () => {
  it("Bia, through Lyra's sheet, takes 7 PV from the anchor in the cast", async () => {
    const harness = new SheetsHarness().withLyraSheet();
    const tokens = new HolderBarsFake();

    const version = await serviceOf(harness, tokens).adjustBar(BIA_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, barId: LYRA_PV_ID, change: CHANGE },
    });

    expect(version).toBe(7);
    expect(tokens.calls).toEqual([
      {
        userId: BIA_ID,
        campaignId: VHARN_ID,
        bar: { tokenId: LYRA_ANCHOR_ID, sceneId: null, barId: LYRA_PV_ID, change: CHANGE },
      },
    ]);
  });

  it('the sheet of an unlinked token adjusts it on its own grid', async () => {
    const harness = new SheetsHarness().withLyraSheet({ tokenId: BRAM_ID });
    const tokens = new HolderBarsFake();

    await serviceOf(harness, tokens).adjustBar(CAIO_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, barId: LYRA_PV_ID, change: CHANGE },
    });

    expect(tokens.calls[0]?.bar).toMatchObject({ tokenId: BRAM_ID, sceneId: VHARN_SCENE_ID });
  });

  it('Caio on a table sheet is FORBIDDEN and no bar is touched', async () => {
    const harness = new SheetsHarness().withLyraSheet({ visibility: 'table' });
    const tokens = new HolderBarsFake();

    const adjusting = serviceOf(harness, tokens).adjustBar(CAIO_ID, VHARN_ID, {
      ...{ sheetId: LYRA_SHEET_ID, barId: LYRA_PV_ID, change: CHANGE },
    });

    await expect(adjusting).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(tokens.calls).toEqual([]);
  });

  it('the sheet of Quelm at Vharn is SHEET_NOT_FOUND', async () => {
    const harness = new SheetsHarness();
    const tokens = new HolderBarsFake();

    const adjusting = serviceOf(harness, tokens).adjustBar(BIA_ID, VHARN_ID, {
      ...{ sheetId: QUELM_SHEET_ID, barId: LYRA_PV_ID, change: CHANGE },
    });

    await expect(adjusting).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(tokens.calls).toEqual([]);
  });

  it.each([
    ['Ana', 'SHEET_HAS_NO_TOKEN', ANA_ID],
    ['Bia', 'SHEET_NOT_FOUND', BIA_ID],
  ])(
    '%s through a sheet nobody holds gets %s and no bar is touched',
    async (_who, code, userId) => {
      const harness = new SheetsHarness().withLyraSheet({ tokenId: null });
      const tokens = new HolderBarsFake();

      const adjusting = serviceOf(harness, tokens).adjustBar(userId, VHARN_ID, {
        ...{ sheetId: LYRA_SHEET_ID, barId: LYRA_PV_ID, change: CHANGE },
      });

      await expect(adjusting).rejects.toMatchObject({ code });
      expect(tokens.calls).toEqual([]);
    },
  );
});
