import { describe, expect, it } from 'vitest';
import { SheetHolderService } from '../../../src/modules/sheets/sheet-holder.service';
import { SheetAssetReadPolicy } from '../../../src/modules/sheets/sheet-asset-read-policy.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import { SHEET_IMAGE_ID, SheetImagesHarness } from '../../support/sheet-assets-fakes';
import { KAEL_CHARACTER_ID, LYRA_SHEET_ID, QUELM_SHEET_ID } from '../../support/sheets-fakes';

const KAEL_SHEET_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function policyOf(harness: SheetImagesHarness): SheetAssetReadPolicy {
  return new SheetAssetReadPolicy(harness.work, new SheetHolderService());
}

function tied(harness: SheetImagesHarness, sheetId: string, campaignId = VHARN_ID): void {
  harness.sheetAssets.rows.push({ campaignId, sheetId, assetId: SHEET_IMAGE_ID });
}

describe('SheetAssetReadPolicy', () => {
  it.each([
    ['Ana, the master', ANA_ID],
    ['Bia, who controls Lyra', BIA_ID],
  ])("%s reads an image of Lyra's sheet", async (_who, userId) => {
    const harness = new SheetImagesHarness().withLyraSheet();
    tied(harness, LYRA_SHEET_ID);

    expect(await policyOf(harness).canRead(userId, VHARN_ID, SHEET_IMAGE_ID)).toBe(true);
  });

  it("Caio does not read an image of Lyra's sheet only for its controllers", async () => {
    const harness = new SheetImagesHarness().withLyraSheet();
    tied(harness, LYRA_SHEET_ID);

    expect(await policyOf(harness).canRead(CAIO_ID, VHARN_ID, SHEET_IMAGE_ID)).toBe(false);
  });

  it.each([
    ['Caio', CAIO_ID],
    ['Duda, a spectator', DUDA_ID],
  ])("%s reads an image of Lyra's table sheet", async (_who, userId) => {
    const harness = new SheetImagesHarness().withLyraSheet({ visibility: 'table' });
    tied(harness, LYRA_SHEET_ID);

    expect(await policyOf(harness).canRead(userId, VHARN_ID, SHEET_IMAGE_ID)).toBe(true);
  });

  it("an image of Lyra's sheet and of Kael's: Caio reads it through Kael's", async () => {
    const harness = new SheetImagesHarness().withLyraSheet();
    harness.withLyraSheet({ id: KAEL_SHEET_ID, characterId: KAEL_CHARACTER_ID });
    tied(harness, LYRA_SHEET_ID);
    tied(harness, KAEL_SHEET_ID);

    expect(await policyOf(harness).canRead(CAIO_ID, VHARN_ID, SHEET_IMAGE_ID)).toBe(true);
  });

  it('an image tied to no sheet is read by nobody, the master included', async () => {
    const harness = new SheetImagesHarness().withLyraSheet();

    expect(await policyOf(harness).canRead(ANA_ID, VHARN_ID, SHEET_IMAGE_ID)).toBe(false);
  });

  it('an image whose sheet is gone is read by nobody', async () => {
    const harness = new SheetImagesHarness();
    tied(harness, LYRA_SHEET_ID);

    expect(await policyOf(harness).canRead(ANA_ID, VHARN_ID, SHEET_IMAGE_ID)).toBe(false);
  });

  it("an image of Quelm's sheet is not read at Vharn, even by Vharn's master", async () => {
    const harness = new SheetImagesHarness();
    tied(harness, QUELM_SHEET_ID, QUELM_ID);

    expect(await policyOf(harness).canRead(ANA_ID, VHARN_ID, SHEET_IMAGE_ID)).toBe(false);
  });
});
