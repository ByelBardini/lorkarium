import { describe, expect, it } from 'vitest';
import { SheetImagesService } from '../../../src/modules/sheets/sheet-images.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { SHEET_IMAGE_ID, SheetImagesHarness } from '../../support/sheet-assets-fakes';
import { LYRA_SHEET_ID, QUELM_SHEET_ID } from '../../support/sheets-fakes';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

function serviceOf(harness: SheetImagesHarness): SheetImagesService {
  return new SheetImagesService(harness.imageDeps);
}

describe('SheetImagesService.upload', () => {
  it("Bia sends an image to Lyra's sheet: kept first, then tied to the sheet under the lock", async () => {
    const harness = new SheetImagesHarness().withLyraSheet();

    const asset = await serviceOf(harness).upload(harness.as(BIA_ID), LYRA_SHEET_ID, PNG);

    expect(asset.id).toBe(SHEET_IMAGE_ID);
    expect(harness.ingest.sent).toEqual([{ userId: BIA_ID, campaignId: VHARN_ID, bytes: PNG }]);
    expect(harness.journal).toEqual([
      'upload',
      'lock',
      `associate ${SHEET_IMAGE_ID} to ${LYRA_SHEET_ID}`,
    ]);
    expect(harness.sheetAssets.rows).toEqual([
      { campaignId: VHARN_ID, sheetId: LYRA_SHEET_ID, assetId: SHEET_IMAGE_ID },
    ]);
  });

  it('the master sends an image to a sheet nobody holds', async () => {
    const harness = new SheetImagesHarness().withLyraSheet({ characterId: null, tokenId: null });

    await serviceOf(harness).upload(harness.as(ANA_ID), LYRA_SHEET_ID, PNG);

    expect(harness.sheetAssets.rows).toHaveLength(1);
  });

  it("Caio only reads Lyra's table sheet: FORBIDDEN before anything is kept", async () => {
    const harness = new SheetImagesHarness().withLyraSheet({ visibility: 'table' });

    await expect(
      serviceOf(harness).upload(harness.as(CAIO_ID), LYRA_SHEET_ID, PNG),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(harness.journal).toEqual([]);
  });

  it.each([
    ['Caio, on a sheet only for its controllers', CAIO_ID],
    ['Duda, a spectator', DUDA_ID],
  ])('%s does not read it: SHEET_NOT_FOUND, nothing kept', async (_who, userId) => {
    const harness = new SheetImagesHarness().withLyraSheet();

    await expect(
      serviceOf(harness).upload(harness.as(userId), LYRA_SHEET_ID, PNG),
    ).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(harness.ingest.sent).toEqual([]);
  });

  it("Quelm's sheet asked at Vharn, even by its master, is SHEET_NOT_FOUND", async () => {
    const harness = new SheetImagesHarness();

    await expect(
      serviceOf(harness).upload(harness.as(ANA_ID), QUELM_SHEET_ID, PNG),
    ).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(harness.ingest.sent).toEqual([]);
  });

  it('the sheet deleted while the image was kept: refused under the lock, never tied', async () => {
    const harness = new SheetImagesHarness().withLyraSheet();
    harness.ingest.meanwhile = () => {
      harness.sheets.rows = harness.sheets.rows.filter((row) => row.id !== LYRA_SHEET_ID);
    };

    await expect(
      serviceOf(harness).upload(harness.as(BIA_ID), LYRA_SHEET_ID, PNG),
    ).rejects.toMatchObject({ code: 'SHEET_NOT_FOUND' });
    expect(harness.journal).toEqual(['upload', 'lock']);
    expect(harness.sheetAssets.rows).toEqual([]);
  });
});

describe('SheetImagesService.authorizeSender', () => {
  it('lets the controller through without keeping anything', async () => {
    const harness = new SheetImagesHarness().withLyraSheet();

    await serviceOf(harness).authorizeSender(harness.as(BIA_ID), LYRA_SHEET_ID);

    expect(harness.journal).toEqual([]);
  });

  it('refuses who only reads the sheet with FORBIDDEN', async () => {
    const harness = new SheetImagesHarness().withLyraSheet({ visibility: 'table' });

    await expect(
      serviceOf(harness).authorizeSender(harness.as(CAIO_ID), LYRA_SHEET_ID),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
