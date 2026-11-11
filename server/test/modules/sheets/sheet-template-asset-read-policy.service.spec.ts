import { describe, expect, it } from 'vitest';
import { SheetTemplateAssetReadPolicy } from '../../../src/modules/sheets/sheet-template-asset-read-policy.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CORMORANT_FONT_ID,
  SheetTemplateAssetsHarness,
} from '../../support/sheet-template-assets-fakes';
import { LYRA_SHEET_ID } from '../../support/sheets-fakes';

function policyOf(harness: SheetTemplateAssetsHarness): SheetTemplateAssetReadPolicy {
  return new SheetTemplateAssetReadPolicy(harness.readWork);
}

function usedByLyra(harness: SheetTemplateAssetsHarness, campaignId = VHARN_ID): void {
  harness.templateUses.uses.push({
    campaignId,
    assetId: CORMORANT_FONT_ID,
    sheetId: LYRA_SHEET_ID,
  });
}

describe('SheetTemplateAssetReadPolicy', () => {
  it('Ana, the master, reads a font of a template no sheet runs', async () => {
    const harness = new SheetTemplateAssetsHarness().withLyraSheet();

    expect(await policyOf(harness).canRead(ANA_ID, VHARN_ID, CORMORANT_FONT_ID)).toBe(true);
  });

  it("Bia, who controls Lyra, reads the font of the template of Lyra's sheet", async () => {
    const harness = new SheetTemplateAssetsHarness().withLyraSheet();
    usedByLyra(harness);

    expect(await policyOf(harness).canRead(BIA_ID, VHARN_ID, CORMORANT_FONT_ID)).toBe(true);
  });

  it('Caio, with no sheet of the template he may read, does not read its font', async () => {
    const harness = new SheetTemplateAssetsHarness().withLyraSheet();
    usedByLyra(harness);

    expect(await policyOf(harness).canRead(CAIO_ID, VHARN_ID, CORMORANT_FONT_ID)).toBe(false);
  });

  it.each([
    ['Caio', CAIO_ID],
    ['Duda, a spectator', DUDA_ID],
  ])("%s reads the font once Lyra's sheet is the table's", async (_who, userId) => {
    const harness = new SheetTemplateAssetsHarness().withLyraSheet({ visibility: 'table' });
    usedByLyra(harness);

    expect(await policyOf(harness).canRead(userId, VHARN_ID, CORMORANT_FONT_ID)).toBe(true);
  });

  it('Bia does not read a font no sheet of hers uses', async () => {
    const harness = new SheetTemplateAssetsHarness().withLyraSheet();

    expect(await policyOf(harness).canRead(BIA_ID, VHARN_ID, CORMORANT_FONT_ID)).toBe(false);
  });
});
