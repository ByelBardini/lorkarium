import type { SheetTemplateAssetDto, SheetTemplateAssetMimeTypeDto } from '@lorkarium/contracts';
import type {
  SheetTemplateAssetReadDaos,
  SheetTemplateAssetReadWork,
} from '../../src/modules/sheets/sheet-template-asset-read-policy.service';
import type { SheetTemplateAssetsDeps } from '../../src/modules/sheets/sheet-template-assets.service';
import { SheetImagesHarness } from './sheet-assets-fakes';

export const CORMORANT_FONT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

type TemplateAssetUses = SheetTemplateAssetReadDaos['templates'];

/** Which sheets of each table run a template declaring each asset, set by the spec. */
export class TemplateAssetUsesFake implements TemplateAssetUses {
  readonly uses: Readonly<{ campaignId: string; assetId: string; sheetId: string }>[] = [];

  async sheetIdsUsingAsset(campaignId: string, assetId: string): Promise<string[]> {
    return this.uses
      .filter((use) => use.campaignId === campaignId && use.assetId === assetId)
      .map(({ sheetId }) => sheetId);
  }
}

type TemplateAssetIngest = SheetTemplateAssetsDeps['assets'];

/** The assets service as the template assets see it: records each send and answers
 *  `CORMORANT_FONT_ID` with the type sent. */
export class TemplateAssetIngestFake implements TemplateAssetIngest {
  readonly sent: Readonly<{
    userId: string;
    campaignId: string;
    mimeType: SheetTemplateAssetMimeTypeDto;
  }>[] = [];

  async uploadSheetTemplateAsset(
    userId: string,
    campaignId: string,
    file: Readonly<{ bytes: Uint8Array; mimeType: SheetTemplateAssetMimeTypeDto }>,
  ): Promise<SheetTemplateAssetDto> {
    this.sent.push({ userId, campaignId, mimeType: file.mimeType });
    return { id: CORMORANT_FONT_ID, mimeType: file.mimeType, sizeBytes: file.bytes.byteLength };
  }
}

/** The sheet images harness (Vharn with Ana, Bia, Caio, Duda; Lyra's sheet on demand) plus which
 *  sheets use each template asset, as the DAOs of one snapshot. */
export class SheetTemplateAssetsHarness extends SheetImagesHarness {
  readonly templateUses = new TemplateAssetUsesFake();
  readonly readDaos: SheetTemplateAssetReadDaos = {
    ...this.imageDaos,
    templates: this.templateUses,
  };
  readonly readWork: SheetTemplateAssetReadWork = (work) => work(this.readDaos);
}
